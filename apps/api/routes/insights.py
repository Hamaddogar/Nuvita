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
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid today insights response from persistence layer: {exc.errors()}",
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
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Invalid weekly insights response from persistence layer: {exc.errors()}",
        ) from exc
