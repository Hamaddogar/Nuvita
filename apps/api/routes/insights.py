from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.insights import AIInsightsTodayResponse, AIInsightsWeeklyResponse
from services.ai_insights import fetch_ai_insights_today, fetch_ai_insights_weekly
from services.supabase_meals import (
    SupabaseServiceError,
    authenticate_user,
    extract_bearer_token,
)

router = APIRouter(tags=["ai-insights"])


def _sanitize_supabase_error(exc: SupabaseServiceError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()

    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."

    if exc.status_code == 422 and "date must be in yyyy-mm-dd format" in normalized:
        return 422, "date must be in YYYY-MM-DD format."

    if exc.status_code >= 500:
        return 502, fallback_message

    if exc.status_code == 422:
        return 422, "Request data is invalid. Please review your input and try again."

    return exc.status_code, fallback_message


@router.get("/ai-insights/today", response_model=AIInsightsTodayResponse)
async def get_ai_insights_today(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> AIInsightsTodayResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_ai_insights_today(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
        )
        return AIInsightsTodayResponse.model_validate(payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load today insights right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Today insights service returned an invalid response.",
        ) from exc


@router.get("/ai-insights/weekly", response_model=AIInsightsWeeklyResponse)
async def get_ai_insights_weekly(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> AIInsightsWeeklyResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_ai_insights_weekly(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
        )
        return AIInsightsWeeklyResponse.model_validate(payload)
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load weekly insights right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Weekly insights service returned an invalid response.",
        ) from exc
