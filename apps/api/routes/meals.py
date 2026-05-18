from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.meals import (
    DailySummaryResponse,
    MealCreateRequest,
    MealCreateResponse,
    MealDetailResponse,
    MealHistoryResponse,
)
from services.supabase_meals import (
    SupabaseServiceError,
    authenticate_user,
    create_meal_via_rpc,
    extract_bearer_token,
    fetch_daily_summary,
    fetch_meal_detail,
    fetch_meal_history,
)

router = APIRouter(tags=["meals"])


def _sanitize_supabase_error(exc: SupabaseServiceError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()

    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."

    if exc.status_code == 404:
        return 404, "Meal not found."

    if exc.status_code == 422:
        if "date must be in yyyy-mm-dd format" in normalized:
            return 422, "date must be in YYYY-MM-DD format."
        if "meal_id is required" in normalized:
            return 422, "meal_id is required."
        return 422, "Request data is invalid. Please review your input and try again."

    if exc.status_code == 503:
        return 503, "Meal saving is temporarily unavailable. Please try again shortly."

    if exc.status_code >= 500:
        return 502, fallback_message

    return exc.status_code, fallback_message


@router.get("/daily-summary", response_model=DailySummaryResponse)
async def get_daily_summary(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> DailySummaryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        summary_payload = await fetch_daily_summary(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
        )
        return DailySummaryResponse.model_validate(summary_payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load daily summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Daily summary service returned an invalid response.",
        ) from exc


@router.get("/meal-history", response_model=MealHistoryResponse)
async def get_meal_history(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> MealHistoryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        history_payload = await fetch_meal_history(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
        )
        return MealHistoryResponse.model_validate(history_payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load meal history right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Meal history service returned an invalid response.",
        ) from exc


@router.get("/meals/{meal_id}", response_model=MealDetailResponse)
async def get_meal_detail(
    meal_id: str,
    authorization: Annotated[str | None, Header()] = None,
) -> MealDetailResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        detail_payload = await fetch_meal_detail(
            access_token,
            meal_id=meal_id,
            user_id=str(user.get("id") or ""),
        )
        return MealDetailResponse.model_validate(detail_payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load meal details right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Meal detail service returned an invalid response.",
        ) from exc


@router.post("/meals", response_model=MealCreateResponse)
async def create_meal(
    payload: MealCreateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> MealCreateResponse:
    try:
        access_token = extract_bearer_token(authorization)
        await authenticate_user(access_token)
        saved_payload = await create_meal_via_rpc(access_token, payload)
        return MealCreateResponse.model_validate(saved_payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to save meal right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Meal save service returned an invalid response.",
        ) from exc