from __future__ import annotations

from typing import Annotated, Literal

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.analytics import (
    AnalyticsAchievementsResponse,
    AnalyticsMonthlyResponse,
    AnalyticsStreaksResponse,
    AnalyticsSummaryResponse,
    AnalyticsWeeklyResponse,
)
from services.advanced_analytics import (
    AnalyticsServiceError,
    fetch_analytics_achievements,
    fetch_analytics_monthly,
    fetch_analytics_streaks,
    fetch_analytics_summary,
    fetch_analytics_weekly,
)
from services.supabase_meals import SupabaseServiceError, authenticate_user, extract_bearer_token

router = APIRouter(tags=["analytics"])


def _sanitize_supabase_error(exc: SupabaseServiceError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 422:
        if "date must be in yyyy-mm-dd format" in normalized:
            return 422, "date must be in YYYY-MM-DD format."
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message


def _sanitize_analytics_error(exc: AnalyticsServiceError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 422:
        if "unit" in normalized:
            return 422, "unit must be kg or lb."
        if "date" in normalized:
            return 422, "date must be in YYYY-MM-DD format."
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message


@router.get("/analytics/weekly", response_model=AnalyticsWeeklyResponse)
async def get_analytics_weekly(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    unit: Literal["kg", "lb"] = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> AnalyticsWeeklyResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_analytics_weekly(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
            unit=unit,
        )
        return AnalyticsWeeklyResponse.model_validate(payload)
    except AnalyticsServiceError as exc:
        status_code, detail = _sanitize_analytics_error(
            exc,
            fallback_message="Unable to load weekly analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load weekly analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Weekly analytics returned an invalid response.") from exc


@router.get("/analytics/monthly", response_model=AnalyticsMonthlyResponse)
async def get_analytics_monthly(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    unit: Literal["kg", "lb"] = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> AnalyticsMonthlyResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_analytics_monthly(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
            unit=unit,
        )
        return AnalyticsMonthlyResponse.model_validate(payload)
    except AnalyticsServiceError as exc:
        status_code, detail = _sanitize_analytics_error(
            exc,
            fallback_message="Unable to load monthly analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load monthly analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Monthly analytics returned an invalid response.") from exc


@router.get("/analytics/streaks", response_model=AnalyticsStreaksResponse)
async def get_analytics_streaks(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> AnalyticsStreaksResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_analytics_streaks(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
        )
        return AnalyticsStreaksResponse.model_validate(payload)
    except AnalyticsServiceError as exc:
        status_code, detail = _sanitize_analytics_error(
            exc,
            fallback_message="Unable to load streak analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load streak analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Streak analytics returned an invalid response.") from exc


@router.get("/analytics/achievements", response_model=AnalyticsAchievementsResponse)
async def get_analytics_achievements(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    unit: Literal["kg", "lb"] = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> AnalyticsAchievementsResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_analytics_achievements(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
            unit=unit,
        )
        return AnalyticsAchievementsResponse.model_validate(payload)
    except AnalyticsServiceError as exc:
        status_code, detail = _sanitize_analytics_error(
            exc,
            fallback_message="Unable to load achievement analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load achievement analytics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Achievement analytics returned an invalid response.") from exc


@router.get("/analytics/summary", response_model=AnalyticsSummaryResponse)
async def get_analytics_summary(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    unit: Literal["kg", "lb"] = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> AnalyticsSummaryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_analytics_summary(
            access_token,
            requested_date=date,
            timezone_name=timezone,
            user_id=str(user.get("id") or ""),
            unit=unit,
        )
        return AnalyticsSummaryResponse.model_validate(payload)
    except AnalyticsServiceError as exc:
        status_code, detail = _sanitize_analytics_error(
            exc,
            fallback_message="Unable to load analytics smart summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load analytics smart summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Analytics summary returned an invalid response.") from exc
