from __future__ import annotations

import base64
import binascii
import json
import os
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Request, UploadFile
from openai import AsyncOpenAI, OpenAIError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, model_validator
from routes.analytics import router as analytics_router
from routes.foods import router as foods_router
from routes.integrations import router as integrations_router
from routes.insights import router as insights_router
from routes.meals import router as meals_router
from routes.wellness import router as wellness_router
from starlette.datastructures import UploadFile as StarletteUploadFile
API_DIR = Path(__file__).resolve().parent
load_dotenv(dotenv_path=API_DIR / ".env")
load_dotenv()

app = FastAPI(title="AI Diet API", version="0.2.0")
app.include_router(meals_router)
app.include_router(insights_router)
app.include_router(foods_router)
app.include_router(wellness_router)
app.include_router(analytics_router)
app.include_router(integrations_router)

ALLOWED_IMAGE_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
MAX_IMAGE_SIZE_BYTES = 8 * 1024 * 1024
OPENAI_VISION_MODEL = os.getenv("OPENAI_VISION_MODEL", "gpt-4.1-mini")
USDA_SEARCH_URL = "https://api.nal.usda.gov/fdc/v1/foods/search"
DEFAULT_TIMEOUT_SECONDS = 20.0

# JSON schema used to force strict structured output from the model.
OPENAI_ANALYSIS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "foods": {
            "type": "array",
            "items": {
                "type": "object",
                "additionalProperties": False,
                "properties": {
                    "name": {"type": "string"},
                    "quantity_estimate": {"type": ["string", "null"]},
                    "estimated_grams": {"type": ["number", "null"]},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "nutrition_estimate": {
                        "type": "object",
                        "additionalProperties": False,
                        "properties": {
                            "calories": {"type": ["number", "null"]},
                            "protein_g": {"type": ["number", "null"]},
                            "carbs_g": {"type": ["number", "null"]},
                            "fat_g": {"type": ["number", "null"]},
                        },
                        "required": ["calories", "protein_g", "carbs_g", "fat_g"],
                    },
                },
                "required": [
                    "name",
                    "quantity_estimate",
                    "estimated_grams",
                    "confidence",
                    "nutrition_estimate",
                ],
            },
        },
        "notes": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["foods", "notes"],
}

_openai_client: AsyncOpenAI | None = None


class AnalyzeImageJSONPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")
    image_url: str | None = None
    image_base64: str | None = None
    user_portion_description: str | None = Field(default=None, max_length=400)

    @model_validator(mode="after")
    def validate_image_source(self) -> "AnalyzeImageJSONPayload":
        has_image_url = bool(self.image_url and self.image_url.strip())
        has_image_base64 = bool(self.image_base64 and self.image_base64.strip())
        if has_image_url and has_image_base64:
            raise ValueError("Provide either image_base64 or image_url, not both.")
        return self


class NutritionEstimate(BaseModel):
    calories: float | None = Field(default=None, ge=0)
    protein_g: float | None = Field(default=None, ge=0)
    carbs_g: float | None = Field(default=None, ge=0)
    fat_g: float | None = Field(default=None, ge=0)


class OpenAIDetectedFood(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    quantity_estimate: str | None = None
    estimated_grams: float | None = Field(default=None, gt=0, le=5000)
    confidence: float = Field(default=0.6, ge=0, le=1)
    nutrition_estimate: NutritionEstimate | None = None


class OpenAIAnalysisResult(BaseModel):
    foods: list[OpenAIDetectedFood]
    notes: list[str] = Field(default_factory=list)


class USDAMatch(BaseModel):
    fdc_id: str | int
    description: str


class DetectedFoodResponse(BaseModel):
    name: str
    quantity_estimate: str | None = None
    estimated_grams: float | None = None
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: float
    usda_match: USDAMatch | None = None


class TotalNutritionResponse(BaseModel):
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float


class AnalyzeImageResponse(BaseModel):
    success: bool
    detected_foods: list[DetectedFoodResponse]
    total: TotalNutritionResponse
    notes: list[str] = Field(default_factory=list)


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "service": "ai-diet-api"}

def _format_payload_validation_error(exc: ValidationError) -> str:
    messages: list[str] = []
    for issue in exc.errors():
        message = issue.get("msg")
        location = issue.get("loc")
        if not isinstance(message, str) or not message.strip():
            continue
        if isinstance(location, tuple) and location:
            formatted_location = ".".join(str(part) for part in location if str(part).strip())
            if formatted_location:
                messages.append(f"{formatted_location}: {message.strip()}")
                continue
        messages.append(message.strip())

    if messages:
        return "; ".join(dict.fromkeys(messages))
    return "Invalid JSON payload. Provide image_base64 or image_url."


def _round_macro(value: float) -> float:
    return round(max(0.0, float(value)), 2)


def _parse_image_mime_from_bytes(image_bytes: bytes) -> str | None:
    if image_bytes.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if image_bytes.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if image_bytes.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if image_bytes.startswith(b"RIFF") and image_bytes[8:12] == b"WEBP":
        return "image/webp"
    return None


def _validate_and_normalize_image(image_bytes: bytes, declared_mime: str | None) -> str:
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Image is empty.")

    if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Image is too large. Max size is {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB.",
        )

    normalized_declared_mime = (
        declared_mime.split(";")[0].strip().lower() if declared_mime else None
    )
    detected_mime = _parse_image_mime_from_bytes(image_bytes)
    mime_type = detected_mime or normalized_declared_mime

    if mime_type not in ALLOWED_IMAGE_MIME_TYPES:
        allowed = ", ".join(sorted(ALLOWED_IMAGE_MIME_TYPES))
        raise HTTPException(
            status_code=400,
            detail=f"Invalid image type. Allowed types: {allowed}.",
        )

    return mime_type


def _decode_base64_image(image_base64: str) -> tuple[bytes, str]:
    candidate = image_base64.strip()
    declared_mime: str | None = None

    if candidate.startswith("data:"):
        if "," not in candidate:
            raise HTTPException(status_code=400, detail="Invalid data URL image format.")
        header, candidate = candidate.split(",", 1)
        mime_segment = header[5:].split(";")[0].strip().lower()
        declared_mime = mime_segment or None

    try:
        image_bytes = base64.b64decode(candidate, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise HTTPException(
            status_code=400,
            detail="image_base64 is not valid base64-encoded image data.",
        ) from exc

    mime_type = _validate_and_normalize_image(image_bytes, declared_mime)
    return image_bytes, mime_type


async def _extract_image_from_upload(
    image: UploadFile | StarletteUploadFile,
) -> tuple[bytes, str]:
    image_bytes = await image.read()
    mime_type = _validate_and_normalize_image(image_bytes, image.content_type)
    return image_bytes, mime_type


async def _extract_image_from_url(image_url: str) -> tuple[bytes, str]:
    parsed = urlparse(image_url)
    if parsed.scheme not in {"http", "https"}:
        raise HTTPException(status_code=400, detail="image_url must use http or https.")

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.get(image_url)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=400,
            detail="Unable to download image from image_url.",
        ) from exc

    mime_type = _validate_and_normalize_image(
        response.content,
        response.headers.get("content-type"),
    )
    return response.content, mime_type


def _extract_json_from_model_output(raw_text: str) -> dict[str, Any]:
    text = raw_text.strip()
    if text.startswith("```"):
        lines = text.splitlines()
        if lines and lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip() == "```":
            lines = lines[:-1]
        text = "\n".join(lines).strip()

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("AI analysis returned an invalid response format.") from exc


def _get_openai_client() -> AsyncOpenAI:
    global _openai_client
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("AI analysis service is not configured.")

    if _openai_client is None:
        _openai_client = AsyncOpenAI(api_key=api_key)
    return _openai_client


async def analyze_image_with_openai(
    image_bytes: bytes,
    mime_type: str,
    user_portion_description: str | None,
) -> OpenAIAnalysisResult:
    client = _get_openai_client()
    image_data_url = f"data:{mime_type};base64,{base64.b64encode(image_bytes).decode('utf-8')}"

    portion_hint = (
        user_portion_description.strip()
        if user_portion_description and user_portion_description.strip()
        else "No extra portion hint was provided by the user."
    )

    system_prompt = (
        "You are a nutrition analysis assistant. "
        "Analyze food visible in the image and return strict JSON only. "
        "Detect each major food item, estimate portion text, estimate grams, "
        "and estimate calories/protein/carbs/fat for each item. "
        "Keep estimates conservative and realistic."
    )
    user_prompt = (
        f"User portion hint: {portion_hint}\n"
        "Return JSON with fields: foods[], notes[]. "
        "foods[].nutrition_estimate must include calories, protein_g, carbs_g, fat_g."
    )

    try:
        response = await client.responses.create(
            model=OPENAI_VISION_MODEL,
            input=[
                {
                    "role": "system",
                    "content": [{"type": "input_text", "text": system_prompt}],
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "input_text", "text": user_prompt},
                        {"type": "input_image", "image_url": image_data_url},
                    ],
                },
            ],
            text={
                "format": {
                    "type": "json_schema",
                    "name": "food_image_analysis",
                    "schema": OPENAI_ANALYSIS_SCHEMA,
                    "strict": True,
                }
            },
            max_output_tokens=1400,
        )
    except OpenAIError as exc:
        raise RuntimeError("AI analysis service is temporarily unavailable.") from exc

    raw_text = (response.output_text or "").strip()
    if not raw_text:
        raise ValueError("AI analysis returned an empty response.")

    parsed = _extract_json_from_model_output(raw_text)

    try:
        return OpenAIAnalysisResult.model_validate(parsed)
    except ValidationError as exc:
        raise ValueError("AI analysis response schema validation failed.") from exc


def _extract_usda_macros(food: dict[str, Any]) -> dict[str, float | None]:
    macros: dict[str, float | None] = {
        "calories": None,
        "protein_g": None,
        "carbs_g": None,
        "fat_g": None,
    }

    for nutrient in food.get("foodNutrients") or []:
        nutrient_info = nutrient.get("nutrient") or {}
        nutrient_name = (
            nutrient.get("nutrientName")
            or nutrient.get("name")
            or nutrient_info.get("name")
            or ""
        ).lower()
        nutrient_number = str(
            nutrient.get("nutrientNumber")
            or nutrient.get("number")
            or nutrient_info.get("number")
            or ""
        )

        raw_value = nutrient.get("value")
        if raw_value is None:
            raw_value = nutrient.get("amount")

        if raw_value is None:
            continue

        try:
            value = float(raw_value)
        except (TypeError, ValueError):
            continue

        if nutrient_number in {"1008", "208"} or "energy" in nutrient_name:
            macros["calories"] = value
        elif nutrient_number == "203" or "protein" in nutrient_name:
            macros["protein_g"] = value
        elif nutrient_number == "205" or "carbohydrate" in nutrient_name:
            macros["carbs_g"] = value
        elif nutrient_number == "204" or "total lipid" in nutrient_name or nutrient_name == "fat":
            macros["fat_g"] = value

    return macros


def _select_best_usda_match(food_name: str, foods: list[dict[str, Any]]) -> dict[str, Any] | None:
    query_tokens = {token for token in food_name.lower().split() if token}
    best_candidate: dict[str, Any] | None = None
    best_score = -1

    for food in foods:
        nutrients = _extract_usda_macros(food)
        nutrient_fields = sum(1 for value in nutrients.values() if value is not None)
        if nutrient_fields == 0:
            continue

        description = str(food.get("description") or "")
        description_lower = description.lower()
        overlap = sum(1 for token in query_tokens if token in description_lower)
        score = (overlap * 3) + nutrient_fields

        if score > best_score:
            best_score = score
            best_candidate = {
                "fdc_id": food.get("fdcId"),
                "description": description,
                "data_type": food.get("dataType"),
                "serving_size": food.get("servingSize"),
                "serving_size_unit": food.get("servingSizeUnit"),
                "nutrients": nutrients,
            }

    return best_candidate


async def lookup_usda_food(food_name: str) -> dict[str, Any] | None:
    api_key = os.getenv("USDA_API_KEY")
    if not api_key:
        raise RuntimeError("Nutrition reference service is not configured.")

    payload = {"query": food_name, "pageSize": 8}
    params = {"api_key": api_key}

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.post(USDA_SEARCH_URL, params=params, json=payload)
            response.raise_for_status()
    except httpx.HTTPError as exc:
        raise RuntimeError("Nutrition reference lookup is temporarily unavailable.") from exc

    foods = (response.json() or {}).get("foods") or []
    if not foods:
        return None

    return _select_best_usda_match(food_name, foods)


def normalize_nutrients(
    nutrients: dict[str, float | None],
    estimated_grams: float | None,
    data_type: str | None,
    serving_size: float | None,
    serving_size_unit: str | None,
) -> dict[str, float]:
    normalized = {key: _round_macro(value or 0) for key, value in nutrients.items()}

    if not estimated_grams or estimated_grams <= 0:
        return normalized

    multiplier = estimated_grams / 100.0
    unit = (serving_size_unit or "").lower()
    is_gram_like = unit in {"g", "gram", "grams"}
    if (
        (data_type or "").lower() == "branded"
        and serving_size
        and serving_size > 0
        and is_gram_like
    ):
        multiplier = estimated_grams / serving_size

    return {key: _round_macro(value * multiplier) for key, value in normalized.items()}


def _normalize_openai_estimate(estimate: NutritionEstimate | None) -> dict[str, float]:
    if estimate is None:
        return {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}
    return {
        "calories": _round_macro(estimate.calories or 0),
        "protein_g": _round_macro(estimate.protein_g or 0),
        "carbs_g": _round_macro(estimate.carbs_g or 0),
        "fat_g": _round_macro(estimate.fat_g or 0),
    }


def _dedupe_notes(notes: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for note in notes:
        cleaned = note.strip()
        if not cleaned or cleaned in seen:
            continue
        seen.add(cleaned)
        deduped.append(cleaned)
    return deduped


async def _extract_request_image(
    request: Request,
) -> tuple[bytes, str, str | None]:
    content_type = (request.headers.get("content-type") or "").lower()

    if content_type.startswith("application/json"):
        try:
            payload_data = await request.json()
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="Invalid JSON request body.") from exc

        try:
            payload = AnalyzeImageJSONPayload.model_validate(payload_data)
        except ValidationError as exc:
            raise HTTPException(status_code=422, detail=_format_payload_validation_error(exc)) from exc

        if payload.image_base64:
            image_bytes, mime_type = _decode_base64_image(payload.image_base64)
            return image_bytes, mime_type, payload.user_portion_description

        if payload.image_url:
            image_bytes, mime_type = await _extract_image_from_url(payload.image_url)
            return image_bytes, mime_type, payload.user_portion_description

        raise HTTPException(
            status_code=400,
            detail="Provide image_base64 or image_url in JSON requests.",
        )
    try:
        form_data = await request.form()
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid multipart/form-data request.",
        ) from exc

    image = form_data.get("image")
    image_base64_form = form_data.get("image_base64")
    user_portion_description_form = form_data.get("user_portion_description")
    portion_hint = (
        user_portion_description_form.strip()
        if isinstance(user_portion_description_form, str)
        else None
    )

    if isinstance(image, (UploadFile, StarletteUploadFile)):
        image_bytes, mime_type = await _extract_image_from_upload(image)
        return image_bytes, mime_type, portion_hint

    if isinstance(image_base64_form, str) and image_base64_form.strip():
        image_bytes, mime_type = _decode_base64_image(image_base64_form)
        return image_bytes, mime_type, portion_hint

    raise HTTPException(
        status_code=400,
        detail="Missing image. Send multipart field 'image' or provide image_base64.",
    )


@app.post("/analyze-image", response_model=AnalyzeImageResponse)
async def analyze_image(request: Request) -> AnalyzeImageResponse:
    image_bytes, mime_type, portion_hint = await _extract_request_image(request=request)

    try:
        ai_analysis = await analyze_image_with_openai(
            image_bytes=image_bytes,
            mime_type=mime_type,
            user_portion_description=portion_hint,
        )
    except RuntimeError as exc:
        detail = str(exc).lower()
        if "not configured" in detail:
            raise HTTPException(
                status_code=503,
                detail="AI analysis service is not configured.",
            ) from exc
        raise HTTPException(
            status_code=502,
            detail="AI analysis service is temporarily unavailable.",
        ) from exc
    except ValueError:
        raise HTTPException(
            status_code=502,
            detail="AI analysis service returned an invalid response. Please retry.",
        )

    if not ai_analysis.foods:
        raise HTTPException(status_code=422, detail="No food detected in the provided image.")

    notes = list(ai_analysis.notes)
    detected_foods: list[DetectedFoodResponse] = []
    total = {"calories": 0.0, "protein_g": 0.0, "carbs_g": 0.0, "fat_g": 0.0}

    for ai_food in ai_analysis.foods:
        final_nutrients = _normalize_openai_estimate(ai_food.nutrition_estimate)
        final_confidence = _round_macro(ai_food.confidence)
        usda_match_payload: USDAMatch | None = None

        try:
            usda_match = await lookup_usda_food(ai_food.name)
        except RuntimeError:
            notes.append(
                f"Nutrition reference data was unavailable for '{ai_food.name}'. Used AI estimate."
            )
            usda_match = None

        if usda_match:
            usda_nutrients = normalize_nutrients(
                nutrients=usda_match["nutrients"],
                estimated_grams=ai_food.estimated_grams,
                data_type=usda_match.get("data_type"),
                serving_size=usda_match.get("serving_size"),
                serving_size_unit=usda_match.get("serving_size_unit"),
            )
            usda_has_data = any(value > 0 for value in usda_nutrients.values())

            if usda_has_data:
                final_nutrients = usda_nutrients
                usda_match_payload = USDAMatch(
                    fdc_id=str(usda_match.get("fdc_id") or ""),
                    description=str(usda_match.get("description") or ai_food.name),
                )
                final_confidence = _round_macro(max(ai_food.confidence, 0.7))

                if ai_food.estimated_grams is None:
                    notes.append(
                        f"Used USDA reference values for '{ai_food.name}' without portion scaling."
                    )
            else:
                notes.append(
                    f"USDA match for '{ai_food.name}' did not include usable macros; used AI estimate."
                )
                final_confidence = _round_macro(min(ai_food.confidence, 0.45))
        else:
            notes.append(
                f"No reliable USDA match for '{ai_food.name}'. Used OpenAI nutrition estimate."
            )
            final_confidence = _round_macro(min(ai_food.confidence, 0.45))

        detected_food = DetectedFoodResponse(
            name=ai_food.name,
            quantity_estimate=ai_food.quantity_estimate,
            estimated_grams=_round_macro(ai_food.estimated_grams)
            if ai_food.estimated_grams
            else None,
            calories=final_nutrients["calories"],
            protein_g=final_nutrients["protein_g"],
            carbs_g=final_nutrients["carbs_g"],
            fat_g=final_nutrients["fat_g"],
            confidence=final_confidence,
            usda_match=usda_match_payload,
        )
        detected_foods.append(detected_food)

        total["calories"] += detected_food.calories
        total["protein_g"] += detected_food.protein_g
        total["carbs_g"] += detected_food.carbs_g
        total["fat_g"] += detected_food.fat_g

    if not detected_foods:
        raise HTTPException(status_code=422, detail="No valid food analysis could be produced.")

    notes.append("Nutrition is estimated and should be confirmed by the user.")
    response = AnalyzeImageResponse(
        success=True,
        detected_foods=detected_foods,
        total=TotalNutritionResponse(
            calories=_round_macro(total["calories"]),
            protein_g=_round_macro(total["protein_g"]),
            carbs_g=_round_macro(total["carbs_g"]),
            fat_g=_round_macro(total["fat_g"]),
        ),
        notes=_dedupe_notes(notes),
    )
    return response
