from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.integrations import (
    HealthDataActivityResponse,
    HealthDataBodyResponse,
    HealthDataSummaryResponse,
    IntegrationCallbackResponse,
    IntegrationConnectRequest,
    IntegrationConnectResponse,
    IntegrationDisconnectResponse,
    IntegrationsListResponse,
    IntegrationSyncRequest,
    IntegrationSyncResponse,
)
from services.health_integrations import (
    HealthIntegrationError,
    begin_integration_connect,
    complete_integration_callback,
    disconnect_integration,
    fetch_health_data_activity,
    fetch_health_data_body,
    fetch_health_data_summary,
    list_integrations,
    sync_integration,
)
from services.supabase_meals import SupabaseServiceError, authenticate_user, extract_bearer_token

router = APIRouter(tags=["integrations"])


def _sanitize_supabase_error(exc: SupabaseServiceError, *, fallback_message: str) -> tuple[int, str]:
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 422:
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message


def _sanitize_integration_error(exc: HealthIntegrationError, *, fallback_message: str) -> tuple[int, str]:
    normalized = exc.message.lower()
    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 409:
        return 409, exc.message
    if exc.status_code == 422:
        if "unsupported provider" in normalized:
            return 422, "Unsupported provider. Use fitbit, apple_health, google_fit, or health_connect."
        if "state" in normalized:
            return 422, "Integration session expired. Please reconnect and try again."
        return 422, exc.message
    if exc.status_code == 503:
        return 503, "Integration provider setup is not configured yet."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, exc.message or fallback_message


@router.get("/integrations", response_model=IntegrationsListResponse)
async def get_integrations(
    authorization: Annotated[str | None, Header()] = None,
) -> IntegrationsListResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await list_integrations(
            access_token,
            user_id=str(user.get("id") or ""),
        )
        return IntegrationsListResponse.model_validate(payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to load integrations right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load integrations right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Integrations endpoint returned an invalid response.") from exc


@router.post("/integrations/{provider}/connect", response_model=IntegrationConnectResponse)
async def post_integration_connect(
    provider: str,
    payload: IntegrationConnectRequest | None = None,
    authorization: Annotated[str | None, Header()] = None,
) -> IntegrationConnectResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        response_payload = await begin_integration_connect(
            access_token,
            user_id=str(user.get("id") or ""),
            provider=provider,
            redirect_to=payload.redirect_to if payload else None,
        )
        return IntegrationConnectResponse.model_validate(response_payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to start integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to start integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Integration connect returned an invalid response.") from exc


@router.get("/integrations/{provider}/callback", response_model=IntegrationCallbackResponse)
async def get_integration_callback(
    provider: str,
    code: str | None = Query(default=None),
    state: str | None = Query(default=None),
    error: str | None = Query(default=None),
    error_description: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> IntegrationCallbackResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        response_payload = await complete_integration_callback(
            access_token,
            user_id=str(user.get("id") or ""),
            provider=provider,
            code=code,
            state=state,
            error=error,
            error_description=error_description,
        )
        return IntegrationCallbackResponse.model_validate(response_payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to complete integration callback right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to complete integration callback right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Integration callback returned an invalid response.") from exc


@router.post("/integrations/{provider}/disconnect", response_model=IntegrationDisconnectResponse)
async def post_integration_disconnect(
    provider: str,
    authorization: Annotated[str | None, Header()] = None,
) -> IntegrationDisconnectResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        response_payload = await disconnect_integration(
            access_token,
            user_id=str(user.get("id") or ""),
            provider=provider,
        )
        return IntegrationDisconnectResponse.model_validate(response_payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to disconnect integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to disconnect integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Integration disconnect returned an invalid response.") from exc


@router.post("/integrations/{provider}/sync", response_model=IntegrationSyncResponse)
async def post_integration_sync(
    provider: str,
    payload: IntegrationSyncRequest | None = None,
    authorization: Annotated[str | None, Header()] = None,
) -> IntegrationSyncResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        response_payload = await sync_integration(
            access_token,
            user_id=str(user.get("id") or ""),
            provider=provider,
            days=payload.days if payload else None,
        )
        return IntegrationSyncResponse.model_validate(response_payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to sync integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to sync integration right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Integration sync returned an invalid response.") from exc


@router.get("/health-data/summary", response_model=HealthDataSummaryResponse)
async def get_health_data_summary(
    date: str | None = Query(default=None),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> HealthDataSummaryResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_health_data_summary(
            access_token,
            user_id=str(user.get("id") or ""),
            requested_date=date,
            timezone_name=timezone,
        )
        return HealthDataSummaryResponse.model_validate(payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to load health summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load health summary right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Health summary returned an invalid response.") from exc


@router.get("/health-data/activity", response_model=HealthDataActivityResponse)
async def get_health_data_activity(
    days: int = Query(default=14, ge=1, le=31),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> HealthDataActivityResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_health_data_activity(
            access_token,
            user_id=str(user.get("id") or ""),
            days=days,
            timezone_name=timezone,
        )
        return HealthDataActivityResponse.model_validate(payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to load health activity right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load health activity right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Health activity returned an invalid response.") from exc


@router.get("/health-data/body", response_model=HealthDataBodyResponse)
async def get_health_data_body(
    days: int = Query(default=30, ge=1, le=90),
    timezone: str | None = Query(default=None),
    authorization: Annotated[str | None, Header()] = None,
) -> HealthDataBodyResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_health_data_body(
            access_token,
            user_id=str(user.get("id") or ""),
            days=days,
            timezone_name=timezone,
        )
        return HealthDataBodyResponse.model_validate(payload)
    except HealthIntegrationError as exc:
        status_code, detail = _sanitize_integration_error(
            exc,
            fallback_message="Unable to load body metrics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to load body metrics right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(status_code=502, detail="Body metrics returned an invalid response.") from exc
