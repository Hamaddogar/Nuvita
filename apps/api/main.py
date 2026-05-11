from fastapi import FastAPI
from pydantic import BaseModel


app = FastAPI(title="AI Diet API", version="0.1.0")


class AnalyzeImageRequest(BaseModel):
    image_url: str | None = None
    image_base64: str | None = None
    user_portion_description: str | None = None


@app.get("/health")
def health_check() -> dict:
    return {"status": "ok", "service": "ai-diet-api"}


@app.post("/analyze-image")
def analyze_image(payload: AnalyzeImageRequest) -> dict:
    return {
        "status": "placeholder",
        "message": "AI analysis is not implemented yet.",
        "input_received": payload.model_dump(),
        "estimated_nutrition": {
            "calories": None,
            "protein_g": None,
            "carbs_g": None,
            "fat_g": None,
            "fiber_g": None,
            "sugar_g": None,
            "sodium_mg": None,
        },
    }
