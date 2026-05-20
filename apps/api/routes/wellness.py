from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.wellness import (
    WaterGoalResponse,
    WaterGoalUpdateRequest,
    WaterHistoryResponse,
    WaterLogCreateRequest,
    WaterLogMutationResponse,
    WaterLogUpdateRequest,
    WaterTodayResponse,
    WeightGoalResponse,
    WeightGoalUpdateRequest,
    WeightHistoryResponse,
    WeightLogCreateRequest,
    WeightLogMutationResponse,
    WeightSummaryResponse,
)
from services.supabase_meals import SupabaseServiceError, authenticate_user, extract_bearer_token
from services.wellness_tracking import (
    WellnessTrackingError,
    create_water_log,
    create_weight_log,
    delete_water_log,
    fetch_water_history,
    fetch_water_today,
    fetch_weight_history,
    fetch_weight_summary,
    update_water_goal,
    update_water_log,
    update_weight_goal,
)

router = APIRouter(tags=["wellness"])


def _sanitize_supabase_error(exc: SupabaseServiceError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 422:
        if "authorization" in normalized or "bearer" in normalized:
            return 401, "Authentication required. Please sign in again."
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message


def _sanitize_wellness_error(exc: WellnessTrackingError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 404:
        if "weight log" in normalized:
            return 404, "Weight log not found."
        if "water log" in normalized:
            return 404, "Water log not found."
        return 404, "Requested record was not found."
    if exc.status_code == 409:
        return 409, exc.message
    if exc.status_code == 422:
        if "water amount" in normalized:
            return 422, "Water amount must be between 50 and 3000 ml."
        if "weight must be between" in normalized:
            return 422, "Weight value is outside supported range."
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message


@router.get("/water-logs/today", response_model=WaterTodayResponse)
async def get_water_today(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> WaterTodayResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_water_today(
            access_token,
            user_id=str(user.get("id") or ""),
            date=date,
            timezone_name=timezone,
        )
        return WaterTodayResponse.model_validate(payload)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to load hydration summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load hydration summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Hydration service returned an invalid response.") from exc


@router.get("/water-logs/history", response_model=WaterHistoryResponse)
async def get_water_history(
    days: int = Query(default=14, ge=1, le=90),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> WaterHistoryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_water_history(
            access_token,
            user_id=str(user.get("id") or ""),
            days=days,
            timezone_name=timezone,
        )
        return WaterHistoryResponse.model_validate(payload)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to load hydration history right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load hydration history right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Hydration history returned an invalid response.") from exc


@router.post("/water-logs", response_model=WaterLogMutationResponse)
async def post_water_log(
    payload: WaterLogCreateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> WaterLogMutationResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        created = await create_water_log(
            access_token,
            user_id=str(user.get("id") or ""),
            amount_ml=payload.amount_ml,
            logged_at=payload.logged_at,
        )
        return WaterLogMutationResponse.model_validate(created)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to save water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to save water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Water log service returned an invalid response.") from exc


@router.patch("/water-logs/{log_id}", response_model=WaterLogMutationResponse)
async def patch_water_log(
    log_id: str,
    payload: WaterLogUpdateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> WaterLogMutationResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        updated = await update_water_log(
            access_token,
            user_id=str(user.get("id") or ""),
            log_id=log_id,
            amount_ml=payload.amount_ml,
            logged_at=payload.logged_at,
        )
        return WaterLogMutationResponse.model_validate(updated)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to update water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to update water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Water log service returned an invalid response.") from exc


@router.delete("/water-logs/{log_id}", response_model=WaterTodayResponse)
async def remove_water_log(
    log_id: str,
    authorization: Annotated[str | None, Header()] = None,
) -> WaterTodayResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await delete_water_log(
            access_token,
            user_id=str(user.get("id") or ""),
            log_id=log_id,
        )
        return WaterTodayResponse.model_validate(payload)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to delete water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to delete water log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Water deletion returned an invalid response.") from exc


@router.put("/water-logs/goal", response_model=WaterGoalResponse)
async def put_water_goal(
    payload: WaterGoalUpdateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> WaterGoalResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        updated = await update_water_goal(
            access_token,
            user_id=str(user.get("id") or ""),
            target_ml=payload.target_ml,
        )
        return WaterGoalResponse.model_validate(updated)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to update hydration goal right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to update hydration goal right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Hydration goal update returned an invalid response.") from exc


@router.post("/weight-logs", response_model=WeightLogMutationResponse)
async def post_weight_log(
    payload: WeightLogCreateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> WeightLogMutationResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        created = await create_weight_log(
            access_token,
            user_id=str(user.get("id") or ""),
            weight=payload.weight,
            unit=payload.unit,
            notes=payload.notes,
            logged_at=payload.logged_at,
        )
        return WeightLogMutationResponse.model_validate(created)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to save weight log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to save weight log right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Weight log service returned an invalid response.") from exc


@router.get("/weight-logs/history", response_model=WeightHistoryResponse)
async def get_weight_history(
    days: int = Query(default=90, ge=7, le=365),
    timezone: str | None = Query(default=None),
    unit: str | None = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> WeightHistoryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_weight_history(
            access_token,
            user_id=str(user.get("id") or ""),
            days=days,
            timezone_name=timezone,
            unit=unit,
        )
        return WeightHistoryResponse.model_validate(payload)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to load weight history right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load weight history right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Weight history service returned an invalid response.") from exc


@router.get("/weight-summary", response_model=WeightSummaryResponse)
async def get_weight_summary(
    timezone: str | None = Query(default=None),
    unit: str | None = Query(default="kg"),
    authorization: Annotated[str | None, Header()] = None,
) -> WeightSummaryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_weight_summary(
            access_token,
            user_id=str(user.get("id") or ""),
            timezone_name=timezone,
            unit=unit,
        )
        return WeightSummaryResponse.model_validate(payload)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to load weight summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load weight summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Weight summary service returned an invalid response.") from exc


@router.put("/weight-logs/goal", response_model=WeightGoalResponse)
async def put_weight_goal(
    payload: WeightGoalUpdateRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> WeightGoalResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        updated = await update_weight_goal(
            access_token,
            user_id=str(user.get("id") or ""),
            target_weight=payload.target_weight,
            unit=payload.unit,
        )
        return WeightGoalResponse.model_validate(updated)
    except WellnessTrackingError as exc:
        status_code, detail = _sanitize_wellness_error(
            exc,
            fallback_message="Unable to update weight goal right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to update weight goal right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Weight goal update returned an invalid response.") from exc
