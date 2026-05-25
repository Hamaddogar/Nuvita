from __future__ import annotations

import base64
import os
import secrets
from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import date as DateType, datetime, time, timedelta, timezone
from typing import Any, Literal
from urllib.parse import urlencode

import httpx

from services.supabase_meals import (
    _build_user_headers,
    _coerce_non_negative_number,
    _extract_supabase_error,
    _format_utc,
    _normalize_user_id,
    _resolve_target_date,
    _resolve_timezone,
    _round_number,
    _supabase_base_url,
    _supabase_get,
)

DEFAULT_TIMEOUT_SECONDS = 20.0
DEFAULT_SYNC_DAYS = 7
MAX_SYNC_DAYS = 31
MAX_ACTIVITY_DAYS = 31
MAX_BODY_DAYS = 90
OAUTH_STATE_TTL_MINUTES = 10
TOKEN_EXPIRY_SKEW_SECONDS = 120

FITBIT_AUTHORIZATION_URL = "https://www.fitbit.com/oauth2/authorize"
FITBIT_TOKEN_URL = "https://api.fitbit.com/oauth2/token"
FITBIT_REVOKE_URL = "https://api.fitbit.com/oauth2/revoke"
FITBIT_ACTIVITY_DAY_URL = "https://api.fitbit.com/1/user/-/activities/date/{date}.json"
FITBIT_WEIGHT_RANGE_URL = "https://api.fitbit.com/1/user/-/body/log/weight/date/{start}/{end}.json"
FITBIT_FAT_RANGE_URL = "https://api.fitbit.com/1/user/-/body/log/fat/date/{start}/{end}.json"

FITBIT_SCOPES = [
    "activity",
    "heartrate",
    "sleep",
    "weight",
    "profile",
]

ProviderName = Literal["fitbit", "apple_health", "google_fit", "health_connect"]
IntegrationStatus = Literal[
    "disconnected",
    "connecting",
    "connected",
    "syncing",
    "sync_success",
    "sync_error",
    "permission_required",
    "native_required",
]

_SUPPORTED_PROVIDERS: tuple[ProviderName, ...] = ("fitbit", "apple_health", "google_fit", "health_connect")
_NATIVE_ONLY_PROVIDERS: set[ProviderName] = {"apple_health", "google_fit", "health_connect"}
_UNSET = object()

_PROVIDER_CATALOG: dict[ProviderName, dict[str, Any]] = {
    "fitbit": {
        "display_name": "Fitbit",
        "supports_web_oauth": True,
        "requires_native_app": False,
        "default_status": "disconnected",
        "data_types": [
            "steps",
            "active_calories",
            "distance",
            "exercise_minutes",
            "workouts",
            "weight",
            "body_fat",
            "sleep_duration",
            "resting_heart_rate",
        ],
        "message": "Connect Fitbit to sync activity and body metrics into Nuvita.",
    },
    "apple_health": {
        "display_name": "Apple Health",
        "supports_web_oauth": False,
        "requires_native_app": True,
        "default_status": "native_required",
        "data_types": ["steps", "active_calories", "workouts", "weight", "sleep_duration", "resting_heart_rate"],
        "message": "Apple Health sync requires native iOS app support. Web setup is not yet available.",
    },
    "google_fit": {
        "display_name": "Google Fit",
        "supports_web_oauth": False,
        "requires_native_app": True,
        "default_status": "native_required",
        "data_types": ["steps", "active_calories", "distance", "workouts", "weight"],
        "message": "Google Fit sync is planned through native Android health integrations.",
    },
    "health_connect": {
        "display_name": "Health Connect",
        "supports_web_oauth": False,
        "requires_native_app": True,
        "default_status": "native_required",
        "data_types": ["steps", "active_calories", "workouts", "weight", "sleep_duration"],
        "message": "Health Connect requires native Android support and is not available in web-only mode yet.",
    },
}


@dataclass(slots=True)
class HealthIntegrationError(Exception):
    status_code: int
    message: str


def _safe_int(value: Any, fallback: int = 0) -> int:
    try:
        return int(float(value))
    except (TypeError, ValueError):
        return fallback


def _safe_float(value: Any, fallback: float = 0.0) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return fallback


def _safe_str(value: Any, fallback: str = "") -> str:
    if isinstance(value, str):
        cleaned = value.strip()
        if cleaned:
            return cleaned
    return fallback


def _parse_iso_datetime(value: Any) -> datetime | None:
    if not isinstance(value, str):
        return None
    cleaned = value.strip()
    if not cleaned:
        return None
    if cleaned.endswith("Z"):
        cleaned = f"{cleaned[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(cleaned)
    except ValueError:
        return None
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _truncate_error(message: str, max_length: int = 320) -> str:
    cleaned = " ".join(message.split()).strip()
    if not cleaned:
        return "Unknown health integration error."
    if len(cleaned) <= max_length:
        return cleaned
    return cleaned[: max_length - 1].rstrip() + "…"


def _utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _normalize_provider(provider: str) -> ProviderName:
    normalized = provider.strip().lower()
    if normalized not in _SUPPORTED_PROVIDERS:
        raise HealthIntegrationError(
            status_code=422,
            message="Unsupported provider. Use fitbit, apple_health, google_fit, or health_connect.",
        )
    return normalized  # type: ignore[return-value]


def _normalize_days(days: int | None, *, default_value: int, max_value: int) -> int:
    if days is None:
        return default_value
    return max(1, min(max_value, int(days)))


def _health_token_encryption_key() -> str:
    key = _safe_str(os.getenv("HEALTH_TOKEN_ENCRYPTION_KEY"))
    if not key:
        key = _safe_str(os.getenv("SUPABASE_ENCRYPTION_KEY"))
    if not key:
        raise HealthIntegrationError(
            status_code=503,
            message="Health token encryption is not configured. Set HEALTH_TOKEN_ENCRYPTION_KEY.",
        )
    if len(key) < 16:
        raise HealthIntegrationError(
            status_code=503,
            message="HEALTH_TOKEN_ENCRYPTION_KEY must be at least 16 characters.",
        )
    return key


def _fitbit_client_id() -> str:
    value = _safe_str(os.getenv("FITBIT_CLIENT_ID"))
    if not value:
        raise HealthIntegrationError(
            status_code=503,
            message="Fitbit integration is not configured. Missing FITBIT_CLIENT_ID.",
        )
    return value


def _fitbit_client_secret() -> str:
    value = _safe_str(os.getenv("FITBIT_CLIENT_SECRET"))
    if not value:
        raise HealthIntegrationError(
            status_code=503,
            message="Fitbit integration is not configured. Missing FITBIT_CLIENT_SECRET.",
        )
    return value


def _fitbit_redirect_uri() -> str:
    value = _safe_str(os.getenv("FITBIT_REDIRECT_URI"))
    if not value:
        raise HealthIntegrationError(
            status_code=503,
            message="Fitbit integration is not configured. Missing FITBIT_REDIRECT_URI.",
        )
    return value


def _supabase_url(path: str) -> str:
    normalized_path = path if path.startswith("/") else f"/{path}"
    return f"{_supabase_base_url()}{normalized_path}"


def _parse_response_json(response: httpx.Response) -> Any:
    try:
        return response.json()
    except ValueError:
        return None


async def _supabase_request(
    access_token: str,
    *,
    method: str,
    path: str,
    payload: dict[str, Any] | list[dict[str, Any]] | None = None,
    params: list[tuple[str, str]] | None = None,
    extra_headers: dict[str, str] | None = None,
) -> Any:
    headers = _build_user_headers(access_token)
    if payload is not None:
        headers["Content-Type"] = "application/json"
    if extra_headers:
        headers.update(extra_headers)

    try:
        async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
            response = await client.request(
                method=method,
                url=_supabase_url(path),
                headers=headers,
                json=payload,
                params=params,
            )
    except httpx.HTTPError as exc:
        raise HealthIntegrationError(status_code=502, message="Supabase request failed.") from exc

    parsed = _parse_response_json(response)
    if response.status_code >= 400:
        detail = _extract_supabase_error(parsed) or "Supabase rejected health integration request."
        if response.status_code in {401, 403}:
            raise HealthIntegrationError(status_code=401, message=detail)
        if response.status_code in {400, 404, 409, 410, 422}:
            raise HealthIntegrationError(status_code=422, message=detail)
        raise HealthIntegrationError(status_code=502, message=detail)

    return parsed


async def _supabase_rpc(access_token: str, *, function_name: str, payload: dict[str, Any]) -> Any:
    return await _supabase_request(
        access_token,
        method="POST",
        path=f"/rest/v1/rpc/{function_name}",
        payload=payload,
        extra_headers={"Prefer": "return=representation"},
    )


async def _upsert_integration_row(
    access_token: str,
    *,
    user_id: str,
    provider: ProviderName,
    status: IntegrationStatus,
    connected_at: str | None | object = _UNSET,
    last_synced_at: str | None | object = _UNSET,
    last_error: str | None | object = _UNSET,
    scopes: list[str] | object = _UNSET,
    provider_user_id: str | None | object = _UNSET,
    metadata: dict[str, Any] | object = _UNSET,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "user_id": user_id,
        "provider": provider,
        "status": status,
    }
    if connected_at is not _UNSET:
        payload["connected_at"] = connected_at
    if last_synced_at is not _UNSET:
        payload["last_synced_at"] = last_synced_at
    if last_error is not _UNSET:
        payload["last_error"] = last_error
    if scopes is not _UNSET:
        payload["scopes"] = scopes
    if provider_user_id is not _UNSET:
        payload["provider_user_id"] = provider_user_id
    if metadata is not _UNSET:
        payload["metadata"] = metadata

    parsed = await _supabase_request(
        access_token,
        method="POST",
        path="/rest/v1/health_integrations",
        payload=payload,
        params=[("on_conflict", "user_id,provider")],
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict):
        return parsed[0]
    raise HealthIntegrationError(status_code=502, message="Unable to update integration status.")


async def _clear_integration_tokens(
    access_token: str,
    *,
    user_id: str,
    provider: ProviderName,
) -> dict[str, Any]:
    payload = await _supabase_request(
        access_token,
        method="PATCH",
        path="/rest/v1/health_integrations",
        payload={
            "status": "disconnected",
            "access_token_encrypted": None,
            "refresh_token_encrypted": None,
            "token_expires_at": None,
            "last_error": None,
            "last_synced_at": None,
            "metadata": {},
            "scopes": [],
        },
        params=[
            ("user_id", f"eq.{user_id}"),
            ("provider", f"eq.{provider}"),
        ],
        extra_headers={"Prefer": "return=representation"},
    )
    if isinstance(payload, list) and payload and isinstance(payload[0], dict):
        return payload[0]
    return await _upsert_integration_row(
        access_token,
        user_id=user_id,
        provider=provider,
        status="disconnected",
        last_error=None,
        metadata={},
        scopes=[],
    )


async def _fetch_integration_rows(access_token: str, *, user_id: str) -> list[dict[str, Any]]:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_integrations",
        params=[
            (
                "select",
                "id,user_id,provider,provider_user_id,status,scopes,connected_at,last_synced_at,last_error,metadata,token_expires_at",
            ),
            ("user_id", f"eq.{user_id}"),
            ("limit", "20"),
        ],
    )
    if not isinstance(payload, list):
        raise HealthIntegrationError(status_code=502, message="Invalid integrations response from database.")
    return [row for row in payload if isinstance(row, dict)]


async def _fetch_integration_row(
    access_token: str,
    *,
    user_id: str,
    provider: ProviderName,
) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_integrations",
        params=[
            (
                "select",
                "id,user_id,provider,provider_user_id,status,scopes,connected_at,last_synced_at,last_error,metadata,token_expires_at",
            ),
            ("user_id", f"eq.{user_id}"),
            ("provider", f"eq.{provider}"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list):
        raise HealthIntegrationError(status_code=502, message="Invalid integration response from database.")
    if not payload:
        return None
    candidate = payload[0]
    if not isinstance(candidate, dict):
        return None
    return candidate


async def _insert_oauth_state(
    access_token: str,
    *,
    user_id: str,
    provider: ProviderName,
    state_token: str,
    redirect_to: str | None,
) -> str:
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=OAUTH_STATE_TTL_MINUTES)
    await _supabase_request(
        access_token,
        method="POST",
        path="/rest/v1/health_oauth_states",
        payload={
            "user_id": user_id,
            "provider": provider,
            "state_token": state_token,
            "redirect_to": redirect_to,
            "expires_at": _format_utc(expires_at),
        },
        extra_headers={"Prefer": "return=representation"},
    )
    return _format_utc(expires_at)


async def _fetch_oauth_state(
    access_token: str,
    *,
    user_id: str,
    provider: ProviderName,
    state_token: str,
) -> dict[str, Any] | None:
    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_oauth_states",
        params=[
            ("select", "id,user_id,provider,state_token,redirect_to,expires_at,consumed_at"),
            ("user_id", f"eq.{user_id}"),
            ("provider", f"eq.{provider}"),
            ("state_token", f"eq.{state_token}"),
            ("limit", "1"),
        ],
    )
    if not isinstance(payload, list) or not payload:
        return None
    row = payload[0]
    if not isinstance(row, dict):
        return None
    return row


async def _consume_oauth_state(access_token: str, *, state_id: str, user_id: str, provider: ProviderName) -> None:
    await _supabase_request(
        access_token,
        method="PATCH",
        path="/rest/v1/health_oauth_states",
        payload={"consumed_at": _utc_now_iso()},
        params=[
            ("id", f"eq.{state_id}"),
            ("user_id", f"eq.{user_id}"),
            ("provider", f"eq.{provider}"),
            ("consumed_at", "is.null"),
        ],
        extra_headers={"Prefer": "return=representation"},
    )


async def _read_provider_tokens(access_token: str, *, provider: ProviderName) -> dict[str, Any]:
    payload = await _supabase_rpc(
        access_token,
        function_name="get_health_integration_tokens",
        payload={
            "p_provider": provider,
            "p_encryption_key": _health_token_encryption_key(),
        },
    )
    if not isinstance(payload, dict):
        raise HealthIntegrationError(status_code=502, message="Invalid token payload from database.")
    return payload


async def _store_provider_tokens(
    access_token: str,
    *,
    provider: ProviderName,
    status: IntegrationStatus,
    provider_user_id: str | None,
    access_token_value: str | None,
    refresh_token_value: str | None,
    token_expires_at: datetime | None,
    scopes: list[str],
    connected_at: datetime | None,
    metadata: dict[str, Any],
) -> dict[str, Any]:
    payload = await _supabase_rpc(
        access_token,
        function_name="upsert_health_integration_tokens",
        payload={
            "p_provider": provider,
            "p_status": status,
            "p_provider_user_id": provider_user_id,
            "p_access_token": access_token_value,
            "p_refresh_token": refresh_token_value,
            "p_token_expires_at": _format_utc(token_expires_at) if token_expires_at else None,
            "p_scopes": scopes,
            "p_connected_at": _format_utc(connected_at) if connected_at else _utc_now_iso(),
            "p_last_error": "",
            "p_metadata": metadata,
            "p_encryption_key": _health_token_encryption_key(),
        },
    )
    if not isinstance(payload, dict):
        raise HealthIntegrationError(status_code=502, message="Failed to store encrypted integration tokens.")
    return payload


async def _upsert_activity_logs(access_token: str, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    payload = await _supabase_request(
        access_token,
        method="POST",
        path="/rest/v1/health_activity_logs",
        payload=rows,
        params=[("on_conflict", "user_id,provider,source_record_id")],
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    if isinstance(payload, list):
        return len(payload)
    return len(rows)


async def _upsert_body_logs(access_token: str, rows: list[dict[str, Any]]) -> int:
    if not rows:
        return 0
    payload = await _supabase_request(
        access_token,
        method="POST",
        path="/rest/v1/health_body_logs",
        payload=rows,
        params=[("on_conflict", "user_id,provider,source_record_id")],
        extra_headers={"Prefer": "resolution=merge-duplicates,return=representation"},
    )
    if isinstance(payload, list):
        return len(payload)
    return len(rows)


def _safe_scope_list(scope_value: Any) -> list[str]:
    if isinstance(scope_value, str):
        return [part.strip() for part in scope_value.split() if part.strip()]
    if isinstance(scope_value, list):
        normalized: list[str] = []
        for item in scope_value:
            if isinstance(item, str) and item.strip():
                normalized.append(item.strip())
        return normalized
    return []


def _fitbit_basic_auth_header() -> str:
    raw = f"{_fitbit_client_id()}:{_fitbit_client_secret()}".encode("utf-8")
    return base64.b64encode(raw).decode("utf-8")


def _parse_fitbit_datetime(default_date: DateType, value: str) -> datetime | None:
    cleaned = value.strip()
    if not cleaned:
        return None
    if "T" in cleaned:
        parsed = _parse_iso_datetime(cleaned)
        if parsed:
            return parsed
    if ":" in cleaned:
        pieces = cleaned.split(":")
        try:
            hour = int(pieces[0])
            minute = int(pieces[1]) if len(pieces) > 1 else 0
            second = int(pieces[2]) if len(pieces) > 2 else 0
        except ValueError:
            return None
        local = datetime.combine(default_date, time(hour=hour, minute=minute, second=second), tzinfo=timezone.utc)
        return local.astimezone(timezone.utc)
    return None


def _token_expires_soon(expires_at: Any) -> bool:
    parsed = _parse_iso_datetime(expires_at) if isinstance(expires_at, str) else None
    if isinstance(expires_at, datetime):
        parsed = expires_at.astimezone(timezone.utc)
    if parsed is None:
        return False
    threshold = datetime.now(timezone.utc) + timedelta(seconds=TOKEN_EXPIRY_SKEW_SECONDS)
    return parsed <= threshold


def _distance_to_meters(distance_value: Any) -> float:
    distance = _safe_float(distance_value, 0.0)
    if distance <= 0:
        return 0.0
    return _round_number(distance * 1000.0)


def _extract_daily_workout_window(target_date: DateType, activities: list[dict[str, Any]]) -> tuple[str | None, str | None]:
    starts: list[datetime] = []
    ends: list[datetime] = []
    for item in activities:
        start_raw = _safe_str(item.get("startTime"))
        if not start_raw:
            continue
        start_dt = _parse_fitbit_datetime(target_date, start_raw)
        if not start_dt:
            continue
        starts.append(start_dt)
        duration_ms = _safe_float(item.get("duration"), 0.0)
        if duration_ms > 0:
            ends.append(start_dt + timedelta(milliseconds=duration_ms))
    if not starts:
        return None, None
    started_at = _format_utc(min(starts))
    ended_at = _format_utc(max(ends if ends else starts))
    return started_at, ended_at


class HealthProviderAdapter(ABC):
    provider: ProviderName

    @abstractmethod
    async def connect(self, *, access_token: str, user_id: str, redirect_to: str | None) -> dict[str, Any]:
        pass

    @abstractmethod
    async def handle_callback(
        self,
        *,
        access_token: str,
        user_id: str,
        code: str | None,
        state: str | None,
        error: str | None,
        error_description: str | None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    async def refresh_token(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        pass

    @abstractmethod
    async def sync_activity(self, *, access_token: str, user_id: str, days: int) -> int:
        pass

    @abstractmethod
    async def sync_body(self, *, access_token: str, user_id: str, days: int) -> int:
        pass

    @abstractmethod
    async def disconnect(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        pass

    @abstractmethod
    def normalize_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        pass


class NativePlaceholderAdapter(HealthProviderAdapter):
    def __init__(self, provider: ProviderName) -> None:
        self.provider = provider

    async def connect(self, *, access_token: str, user_id: str, redirect_to: str | None) -> dict[str, Any]:
        catalog = _PROVIDER_CATALOG[self.provider]
        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="native_required",
            last_error=None,
            metadata={"platform": "native_required"},
        )
        return {
            "success": True,
            "provider": self.provider,
            "status": "native_required",
            "authorization_url": None,
            "message": catalog["message"],
            "state_expires_at": None,
        }

    async def handle_callback(
        self,
        *,
        access_token: str,
        user_id: str,
        code: str | None,
        state: str | None,
        error: str | None,
        error_description: str | None,
    ) -> dict[str, Any]:
        raise HealthIntegrationError(
            status_code=422,
            message="This integration requires native mobile app support and cannot complete web OAuth yet.",
        )

    async def refresh_token(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        raise HealthIntegrationError(
            status_code=422,
            message="Token refresh is unavailable because this integration requires native app support.",
        )

    async def sync_activity(self, *, access_token: str, user_id: str, days: int) -> int:
        return 0

    async def sync_body(self, *, access_token: str, user_id: str, days: int) -> int:
        return 0

    async def disconnect(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="disconnected",
            last_error=None,
            metadata={},
        )
        return {
            "success": True,
            "provider": self.provider,
            "status": "disconnected",
            "message": "Integration disconnected.",
        }

    def normalize_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        return payload


class FitbitAdapter(HealthProviderAdapter):
    provider: ProviderName = "fitbit"

    async def connect(self, *, access_token: str, user_id: str, redirect_to: str | None) -> dict[str, Any]:
        state_token = secrets.token_urlsafe(32)
        state_expires_at = await _insert_oauth_state(
            access_token,
            user_id=user_id,
            provider=self.provider,
            state_token=state_token,
            redirect_to=redirect_to,
        )

        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="connecting",
            last_error=None,
            metadata={"oauth_stage": "awaiting_callback"},
        )

        params = urlencode(
            {
                "response_type": "code",
                "client_id": _fitbit_client_id(),
                "scope": " ".join(FITBIT_SCOPES),
                "redirect_uri": _fitbit_redirect_uri(),
                "state": state_token,
                "expires_in": "604800",
            }
        )
        authorization_url = f"{FITBIT_AUTHORIZATION_URL}?{params}"
        return {
            "success": True,
            "provider": self.provider,
            "status": "connecting",
            "authorization_url": authorization_url,
            "message": "Continue in Fitbit to authorize data sharing.",
            "state_expires_at": state_expires_at,
        }

    async def handle_callback(
        self,
        *,
        access_token: str,
        user_id: str,
        code: str | None,
        state: str | None,
        error: str | None,
        error_description: str | None,
    ) -> dict[str, Any]:
        if error:
            message = "Connection cancelled." if error == "access_denied" else "Unable to complete Fitbit connection."
            if error_description and error_description.strip():
                message = f"{message} {error_description.strip()}"
            await _upsert_integration_row(
                access_token,
                user_id=user_id,
                provider=self.provider,
                status="permission_required",
                last_error=_truncate_error(message),
            )
            raise HealthIntegrationError(status_code=409, message=message)

        code_value = _safe_str(code)
        state_value = _safe_str(state)
        if not code_value or not state_value:
            raise HealthIntegrationError(status_code=422, message="Missing Fitbit callback code or state.")

        state_row = await _fetch_oauth_state(
            access_token,
            user_id=user_id,
            provider=self.provider,
            state_token=state_value,
        )
        if not state_row:
            raise HealthIntegrationError(status_code=422, message="Invalid or expired connection state.")

        if state_row.get("consumed_at") is not None:
            raise HealthIntegrationError(status_code=409, message="This Fitbit connection state has already been used.")

        expires_at = _parse_iso_datetime(state_row.get("expires_at"))
        if not expires_at or expires_at <= datetime.now(timezone.utc):
            raise HealthIntegrationError(status_code=422, message="Fitbit connection state expired. Please reconnect.")

        state_id = _safe_str(state_row.get("id"))
        if not state_id:
            raise HealthIntegrationError(status_code=422, message="Invalid Fitbit connection state.")
        await _consume_oauth_state(access_token, state_id=state_id, user_id=user_id, provider=self.provider)

        token_details = await self._exchange_code(access_token, user_id=user_id, code=code_value)
        connected_at = datetime.now(timezone.utc)
        await _store_provider_tokens(
            access_token,
            provider=self.provider,
            status="connected",
            provider_user_id=token_details.get("provider_user_id"),
            access_token_value=token_details.get("access_token"),
            refresh_token_value=token_details.get("refresh_token"),
            token_expires_at=token_details.get("token_expires_at"),
            scopes=token_details.get("scopes", []),
            connected_at=connected_at,
            metadata={
                "token_type": token_details.get("token_type"),
                "oauth_provider": "fitbit",
                "oauth_connected_at": _format_utc(connected_at),
            },
        )

        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="connected",
            connected_at=_format_utc(connected_at),
            last_error=None,
            scopes=token_details.get("scopes", []),
            provider_user_id=token_details.get("provider_user_id"),
            metadata={"oauth_stage": "connected"},
        )

        synced_counts = await self._sync_all(access_token=access_token, user_id=user_id, days=DEFAULT_SYNC_DAYS)
        synced_at = _utc_now_iso()
        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="sync_success",
            last_synced_at=synced_at,
            last_error=None,
            metadata={"oauth_stage": "connected", "last_sync_source": "callback"},
        )

        return {
            "success": True,
            "provider": self.provider,
            "status": "sync_success",
            "message": "Fitbit connected and initial sync completed.",
            "synced_counts": synced_counts,
            "last_synced_at": synced_at,
        }

    async def refresh_token(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        token_bundle = await _read_provider_tokens(access_token, provider=self.provider)
        if not bool(token_bundle.get("found")):
            raise HealthIntegrationError(
                status_code=409,
                message="Fitbit is not connected. Connect Fitbit before syncing.",
            )

        refresh_token_value = _safe_str(token_bundle.get("refresh_token"))
        if not refresh_token_value:
            raise HealthIntegrationError(
                status_code=409,
                message="Fitbit refresh token is unavailable. Please reconnect Fitbit.",
            )

        headers = {
            "Authorization": f"Basic {_fitbit_basic_auth_header()}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        form_payload = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token_value,
        }
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
                response = await client.post(FITBIT_TOKEN_URL, headers=headers, data=form_payload)
        except httpx.HTTPError as exc:
            raise HealthIntegrationError(status_code=502, message="Failed to refresh Fitbit session.") from exc

        parsed = _parse_response_json(response)
        if response.status_code >= 400:
            detail = _extract_supabase_error(parsed) or "Fitbit rejected token refresh."
            raise HealthIntegrationError(status_code=409, message=detail)
        if not isinstance(parsed, dict):
            raise HealthIntegrationError(status_code=502, message="Invalid Fitbit token refresh response.")

        token_details = self._parse_token_payload(parsed)
        await _store_provider_tokens(
            access_token,
            provider=self.provider,
            status="connected",
            provider_user_id=token_details.get("provider_user_id"),
            access_token_value=token_details.get("access_token"),
            refresh_token_value=token_details.get("refresh_token"),
            token_expires_at=token_details.get("token_expires_at"),
            scopes=token_details.get("scopes", []),
            connected_at=_parse_iso_datetime(token_bundle.get("connected_at")) or datetime.now(timezone.utc),
            metadata={"token_type": token_details.get("token_type"), "token_refreshed_at": _utc_now_iso()},
        )
        await _upsert_integration_row(
            access_token,
            user_id=user_id,
            provider=self.provider,
            status="connected",
            last_error=None,
            scopes=token_details.get("scopes", []),
            provider_user_id=token_details.get("provider_user_id"),
            metadata={"oauth_stage": "connected"},
        )
        return token_details

    async def sync_activity(self, *, access_token: str, user_id: str, days: int) -> int:
        bounded_days = _normalize_days(days, default_value=DEFAULT_SYNC_DAYS, max_value=MAX_SYNC_DAYS)
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=bounded_days - 1)
        rows: list[dict[str, Any]] = []
        cursor = start_date
        while cursor <= end_date:
            payload = await self._fitbit_get_json(
                access_token=access_token,
                user_id=user_id,
                url=FITBIT_ACTIVITY_DAY_URL.format(date=cursor.isoformat()),
            )
            summary_raw = payload.get("summary") if isinstance(payload, dict) else None
            activities_raw = payload.get("activities") if isinstance(payload, dict) else None
            summary = summary_raw if isinstance(summary_raw, dict) else {}
            activities = [item for item in activities_raw if isinstance(item, dict)] if isinstance(activities_raw, list) else []
            if not summary and not activities:
                cursor += timedelta(days=1)
                continue

            distances = summary.get("distances")
            total_distance_value = 0.0
            if isinstance(distances, list):
                total_entry = next(
                    (
                        item
                        for item in distances
                        if isinstance(item, dict) and _safe_str(item.get("activity")).lower() == "total"
                    ),
                    None,
                )
                if isinstance(total_entry, dict):
                    total_distance_value = _safe_float(total_entry.get("distance"))
                else:
                    total_distance_value = sum(
                        _safe_float(item.get("distance")) for item in distances if isinstance(item, dict)
                    )

            workout_names: list[str] = []
            for item in activities:
                candidate = _safe_str(item.get("activityName"))
                if candidate and candidate not in workout_names:
                    workout_names.append(candidate)
            workout_type = ", ".join(workout_names[:3]) if workout_names else None
            started_at, ended_at = _extract_daily_workout_window(cursor, activities)

            exercise_minutes = (
                _safe_int(summary.get("lightlyActiveMinutes"))
                + _safe_int(summary.get("fairlyActiveMinutes"))
                + _safe_int(summary.get("veryActiveMinutes"))
            )
            rows.append(
                {
                    "user_id": user_id,
                    "provider": self.provider,
                    "source_record_id": f"fitbit-day-{cursor.isoformat()}",
                    "date": cursor.isoformat(),
                    "steps": max(0, _safe_int(summary.get("steps"))),
                    "active_calories": _round_number(max(0.0, _safe_float(summary.get("caloriesOut")))),
                    "distance_meters": _distance_to_meters(total_distance_value),
                    "exercise_minutes": max(0, exercise_minutes),
                    "workout_type": workout_type,
                    "started_at": started_at,
                    "ended_at": ended_at,
                    "raw_payload": {
                        "summary": summary,
                        "activities_count": len(activities),
                    },
                }
            )
            cursor += timedelta(days=1)

        return await _upsert_activity_logs(access_token, rows)

    async def sync_body(self, *, access_token: str, user_id: str, days: int) -> int:
        bounded_days = _normalize_days(days, default_value=DEFAULT_SYNC_DAYS, max_value=MAX_SYNC_DAYS)
        end_date = datetime.now(timezone.utc).date()
        start_date = end_date - timedelta(days=bounded_days - 1)

        weight_payload = await self._fitbit_get_json(
            access_token=access_token,
            user_id=user_id,
            url=FITBIT_WEIGHT_RANGE_URL.format(start=start_date.isoformat(), end=end_date.isoformat()),
            suppress_not_found=True,
        )
        fat_payload = await self._fitbit_get_json(
            access_token=access_token,
            user_id=user_id,
            url=FITBIT_FAT_RANGE_URL.format(start=start_date.isoformat(), end=end_date.isoformat()),
            suppress_not_found=True,
        )

        weight_entries_raw = weight_payload.get("weight") if isinstance(weight_payload, dict) else None
        fat_entries_raw = fat_payload.get("fat") if isinstance(fat_payload, dict) else None
        weight_entries = [item for item in weight_entries_raw if isinstance(item, dict)] if isinstance(weight_entries_raw, list) else []
        fat_entries = [item for item in fat_entries_raw if isinstance(item, dict)] if isinstance(fat_entries_raw, list) else []

        fat_by_key: dict[str, float] = {}
        for item in fat_entries:
            date_key = _safe_str(item.get("date"))
            time_key = _safe_str(item.get("time"), "00:00:00")
            if not date_key:
                continue
            fat_by_key[f"{date_key}T{time_key}"] = _safe_float(item.get("fat"), 0.0)

        rows: list[dict[str, Any]] = []
        consumed_fat_keys: set[str] = set()
        for item in weight_entries:
            date_key = _safe_str(item.get("date"))
            if not date_key:
                continue
            time_key = _safe_str(item.get("time"), "00:00:00")
            datetime_key = f"{date_key}T{time_key}"
            recorded_at = _parse_iso_datetime(f"{datetime_key}Z")
            if recorded_at is None:
                recorded_at = _parse_iso_datetime(f"{date_key}T00:00:00Z")
            if recorded_at is None:
                continue

            source_id = _safe_str(item.get("logId"))
            if not source_id:
                source_id = datetime_key
            fat_value = fat_by_key.get(datetime_key)
            if fat_value is not None:
                consumed_fat_keys.add(datetime_key)
            rows.append(
                {
                    "user_id": user_id,
                    "provider": self.provider,
                    "source_record_id": f"fitbit-weight-{source_id}",
                    "weight": _round_number(max(0.0, _safe_float(item.get("weight")))),
                    "body_fat_percentage": _round_number(fat_value) if fat_value is not None and fat_value > 0 else None,
                    "unit": "kg",
                    "recorded_at": _format_utc(recorded_at),
                    "raw_payload": {
                        "weight": item,
                        "fat_percentage": fat_value,
                    },
                }
            )

        for item in fat_entries:
            date_key = _safe_str(item.get("date"))
            if not date_key:
                continue
            time_key = _safe_str(item.get("time"), "00:00:00")
            datetime_key = f"{date_key}T{time_key}"
            if datetime_key in consumed_fat_keys:
                continue
            recorded_at = _parse_iso_datetime(f"{datetime_key}Z")
            if recorded_at is None:
                continue
            source_id = _safe_str(item.get("logId")) or datetime_key
            fat_value = _safe_float(item.get("fat"), 0.0)
            if fat_value <= 0:
                continue
            rows.append(
                {
                    "user_id": user_id,
                    "provider": self.provider,
                    "source_record_id": f"fitbit-fat-{source_id}",
                    "weight": None,
                    "body_fat_percentage": _round_number(fat_value),
                    "unit": "percent",
                    "recorded_at": _format_utc(recorded_at),
                    "raw_payload": {
                        "fat": item,
                    },
                }
            )

        return await _upsert_body_logs(access_token, rows)

    async def disconnect(self, *, access_token: str, user_id: str) -> dict[str, Any]:
        token_bundle: dict[str, Any] | None = None
        try:
            token_bundle = await _read_provider_tokens(access_token, provider=self.provider)
        except HealthIntegrationError:
            token_bundle = None

        revoke_token = _safe_str(token_bundle.get("access_token")) if isinstance(token_bundle, dict) else ""
        if revoke_token:
            headers = {
                "Authorization": f"Basic {_fitbit_basic_auth_header()}",
                "Content-Type": "application/x-www-form-urlencoded",
            }
            try:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
                    await client.post(FITBIT_REVOKE_URL, headers=headers, data={"token": revoke_token})
            except httpx.HTTPError:
                pass

        await _clear_integration_tokens(access_token, user_id=user_id, provider=self.provider)
        return {
            "success": True,
            "provider": self.provider,
            "status": "disconnected",
            "message": "Fitbit disconnected successfully.",
        }

    def normalize_data(self, payload: dict[str, Any]) -> dict[str, Any]:
        return payload

    async def _exchange_code(self, access_token: str, *, user_id: str, code: str) -> dict[str, Any]:
        headers = {
            "Authorization": f"Basic {_fitbit_basic_auth_header()}",
            "Content-Type": "application/x-www-form-urlencoded",
        }
        form_payload = {
            "client_id": _fitbit_client_id(),
            "grant_type": "authorization_code",
            "redirect_uri": _fitbit_redirect_uri(),
            "code": code,
        }
        try:
            async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
                response = await client.post(FITBIT_TOKEN_URL, headers=headers, data=form_payload)
        except httpx.HTTPError as exc:
            raise HealthIntegrationError(status_code=502, message="Failed to exchange Fitbit authorization code.") from exc

        parsed = _parse_response_json(response)
        if response.status_code >= 400:
            detail = _extract_supabase_error(parsed) or "Fitbit rejected authorization."
            raise HealthIntegrationError(status_code=409, message=detail)
        if not isinstance(parsed, dict):
            raise HealthIntegrationError(status_code=502, message="Invalid Fitbit token response.")
        return self._parse_token_payload(parsed)

    def _parse_token_payload(self, payload: dict[str, Any]) -> dict[str, Any]:
        access_token_value = _safe_str(payload.get("access_token"))
        if not access_token_value:
            raise HealthIntegrationError(status_code=502, message="Fitbit token response missing access token.")
        refresh_token_value = _safe_str(payload.get("refresh_token"))
        expires_in = max(60, _safe_int(payload.get("expires_in"), 28800))
        expires_at = datetime.now(timezone.utc) + timedelta(seconds=expires_in)
        scopes = _safe_scope_list(payload.get("scope"))
        return {
            "access_token": access_token_value,
            "refresh_token": refresh_token_value or None,
            "provider_user_id": _safe_str(payload.get("user_id")) or None,
            "token_expires_at": expires_at,
            "scopes": scopes,
            "token_type": _safe_str(payload.get("token_type"), "Bearer"),
        }

    async def _sync_all(self, *, access_token: str, user_id: str, days: int) -> dict[str, int]:
        activity_count = await self.sync_activity(access_token=access_token, user_id=user_id, days=days)
        body_count = await self.sync_body(access_token=access_token, user_id=user_id, days=days)
        return {
            "activity_records": max(0, int(activity_count)),
            "body_records": max(0, int(body_count)),
            "sleep_records": 0,
            "heart_records": 0,
        }

    async def _fitbit_get_json(
        self,
        *,
        access_token: str,
        user_id: str,
        url: str,
        suppress_not_found: bool = False,
    ) -> dict[str, Any]:
        bearer_token = await self._get_fitbit_access_token(access_token=access_token, user_id=user_id)
        headers = {"Authorization": f"Bearer {bearer_token}"}
        for attempt in range(2):
            try:
                async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT_SECONDS) as client:
                    response = await client.get(url, headers=headers)
            except httpx.HTTPError as exc:
                raise HealthIntegrationError(status_code=502, message="Fitbit request failed.") from exc

            parsed = _parse_response_json(response)
            if response.status_code < 400:
                return parsed if isinstance(parsed, dict) else {}

            if response.status_code == 401 and attempt == 0:
                await self.refresh_token(access_token=access_token, user_id=user_id)
                bearer_token = await self._get_fitbit_access_token(access_token=access_token, user_id=user_id)
                headers = {"Authorization": f"Bearer {bearer_token}"}
                continue

            if response.status_code in {403, 404} and suppress_not_found:
                return {}

            detail = _extract_supabase_error(parsed) or "Fitbit request failed."
            if response.status_code == 401:
                raise HealthIntegrationError(status_code=409, message="Fitbit authorization expired. Please reconnect.")
            if response.status_code in {403, 404}:
                raise HealthIntegrationError(status_code=422, message=detail)
            if response.status_code in {429, 500, 502, 503, 504}:
                raise HealthIntegrationError(status_code=502, message="Fitbit service is temporarily unavailable.")
            raise HealthIntegrationError(status_code=422, message=detail)

        raise HealthIntegrationError(status_code=502, message="Unable to read Fitbit data.")

    async def _get_fitbit_access_token(self, *, access_token: str, user_id: str) -> str:
        token_bundle = await _read_provider_tokens(access_token, provider=self.provider)
        if not bool(token_bundle.get("found")):
            raise HealthIntegrationError(status_code=409, message="Fitbit is not connected.")

        if _token_expires_soon(token_bundle.get("token_expires_at")):
            await self.refresh_token(access_token=access_token, user_id=user_id)
            token_bundle = await _read_provider_tokens(access_token, provider=self.provider)

        bearer_token = _safe_str(token_bundle.get("access_token"))
        if not bearer_token:
            raise HealthIntegrationError(status_code=409, message="Fitbit access token is unavailable. Reconnect Fitbit.")
        return bearer_token


_ADAPTERS: dict[ProviderName, HealthProviderAdapter] = {
    "fitbit": FitbitAdapter(),
    "apple_health": NativePlaceholderAdapter("apple_health"),
    "google_fit": NativePlaceholderAdapter("google_fit"),
    "health_connect": NativePlaceholderAdapter("health_connect"),
}


def _provider_adapter(provider: ProviderName) -> HealthProviderAdapter:
    adapter = _ADAPTERS.get(provider)
    if adapter is None:
        raise HealthIntegrationError(status_code=422, message="Unsupported integration provider.")
    return adapter


def _sanitize_redirect_to(redirect_to: str | None) -> str | None:
    if redirect_to is None:
        return None
    cleaned = redirect_to.strip()
    if not cleaned:
        return None
    if len(cleaned) > 600:
        return None
    if cleaned.startswith("/") or cleaned.startswith("http://") or cleaned.startswith("https://"):
        return cleaned
    return None


async def list_integrations(access_token: str, *, user_id: str | None) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    rows = await _fetch_integration_rows(access_token, user_id=owner_id)
    by_provider = {_safe_str(row.get("provider")): row for row in rows}

    integrations: list[dict[str, Any]] = []
    for provider in _SUPPORTED_PROVIDERS:
        catalog = _PROVIDER_CATALOG[provider]
        row = by_provider.get(provider)
        status = _safe_str(row.get("status")) if isinstance(row, dict) else ""
        if status not in {
            "disconnected",
            "connecting",
            "connected",
            "syncing",
            "sync_success",
            "sync_error",
            "permission_required",
            "native_required",
        }:
            status = catalog["default_status"]

        permissions = row.get("scopes") if isinstance(row, dict) else None
        permissions_list = [item for item in permissions if isinstance(item, str)] if isinstance(permissions, list) else []
        integration_payload = {
            "provider": provider,
            "display_name": catalog["display_name"],
            "status": status,
            "supports_web_oauth": bool(catalog["supports_web_oauth"]),
            "requires_native_app": bool(catalog["requires_native_app"]),
            "data_types": list(catalog["data_types"]),
            "permissions": permissions_list,
            "connected_at": row.get("connected_at") if isinstance(row, dict) else None,
            "last_synced_at": row.get("last_synced_at") if isinstance(row, dict) else None,
            "last_error": _safe_str(row.get("last_error")) or None if isinstance(row, dict) else None,
            "message": catalog["message"],
        }
        integrations.append(integration_payload)

    return {
        "success": True,
        "integrations": integrations,
    }


async def begin_integration_connect(
    access_token: str,
    *,
    user_id: str | None,
    provider: str,
    redirect_to: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_provider = _normalize_provider(provider)
    adapter = _provider_adapter(normalized_provider)
    return await adapter.connect(
        access_token=access_token,
        user_id=owner_id,
        redirect_to=_sanitize_redirect_to(redirect_to),
    )


async def complete_integration_callback(
    access_token: str,
    *,
    user_id: str | None,
    provider: str,
    code: str | None,
    state: str | None,
    error: str | None,
    error_description: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_provider = _normalize_provider(provider)
    adapter = _provider_adapter(normalized_provider)
    return await adapter.handle_callback(
        access_token=access_token,
        user_id=owner_id,
        code=code,
        state=state,
        error=error,
        error_description=error_description,
    )


async def disconnect_integration(access_token: str, *, user_id: str | None, provider: str) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_provider = _normalize_provider(provider)
    adapter = _provider_adapter(normalized_provider)
    return await adapter.disconnect(access_token=access_token, user_id=owner_id)


async def sync_integration(
    access_token: str,
    *,
    user_id: str | None,
    provider: str,
    days: int | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    normalized_provider = _normalize_provider(provider)
    adapter = _provider_adapter(normalized_provider)

    if normalized_provider in _NATIVE_ONLY_PROVIDERS:
        await _upsert_integration_row(
            access_token,
            user_id=owner_id,
            provider=normalized_provider,
            status="native_required",
            last_error=None,
        )
        return {
            "success": True,
            "provider": normalized_provider,
            "status": "native_required",
            "message": _PROVIDER_CATALOG[normalized_provider]["message"],
            "synced_counts": {
                "activity_records": 0,
                "body_records": 0,
                "sleep_records": 0,
                "heart_records": 0,
            },
            "last_synced_at": None,
        }

    bounded_days = _normalize_days(days, default_value=DEFAULT_SYNC_DAYS, max_value=MAX_SYNC_DAYS)
    await _upsert_integration_row(
        access_token,
        user_id=owner_id,
        provider=normalized_provider,
        status="syncing",
        last_error=None,
    )

    try:
        activity_records = await adapter.sync_activity(
            access_token=access_token,
            user_id=owner_id,
            days=bounded_days,
        )
        body_records = await adapter.sync_body(
            access_token=access_token,
            user_id=owner_id,
            days=bounded_days,
        )
    except HealthIntegrationError as exc:
        await _upsert_integration_row(
            access_token,
            user_id=owner_id,
            provider=normalized_provider,
            status="sync_error",
            last_error=_truncate_error(exc.message),
        )
        raise

    synced_at = _utc_now_iso()
    await _upsert_integration_row(
        access_token,
        user_id=owner_id,
        provider=normalized_provider,
        status="sync_success",
        last_synced_at=synced_at,
        last_error=None,
        metadata={"last_sync_days": bounded_days},
    )
    return {
        "success": True,
        "provider": normalized_provider,
        "status": "sync_success",
        "message": "Sync completed successfully.",
        "synced_counts": {
            "activity_records": max(0, int(activity_records)),
            "body_records": max(0, int(body_records)),
            "sleep_records": 0,
            "heart_records": 0,
        },
        "last_synced_at": synced_at,
    }


def _extract_workouts_count(row: dict[str, Any]) -> int:
    raw_payload = row.get("raw_payload")
    if isinstance(raw_payload, dict):
        count = _safe_int(raw_payload.get("activities_count"), 0)
        if count > 0:
            return count
    workout_type = _safe_str(row.get("workout_type"))
    if not workout_type:
        return 0
    return len([chunk for chunk in workout_type.split(",") if chunk.strip()])


def _date_range_from_days(days: int, *, timezone_name: str | None) -> tuple[DateType, DateType]:
    tz = _resolve_timezone(timezone_name)
    end_date = _resolve_target_date(None, tz)
    start_date = end_date - timedelta(days=days - 1)
    return start_date, end_date


async def fetch_health_data_summary(
    access_token: str,
    *,
    user_id: str | None,
    requested_date: str | None,
    timezone_name: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    tz = _resolve_timezone(timezone_name)
    target_date = _resolve_target_date(requested_date, tz)
    week_start = target_date - timedelta(days=6)

    integration_rows = await _fetch_integration_rows(access_token, user_id=owner_id)
    activity_rows_payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_activity_logs",
        params=[
            ("select", "provider,date,steps,active_calories,distance_meters,exercise_minutes,workout_type,raw_payload"),
            ("user_id", f"eq.{owner_id}"),
            ("date", f"gte.{week_start.isoformat()}"),
            ("date", f"lte.{target_date.isoformat()}"),
            ("limit", "500"),
        ],
    )
    if not isinstance(activity_rows_payload, list):
        raise HealthIntegrationError(status_code=502, message="Invalid activity payload from database.")
    activity_rows = [row for row in activity_rows_payload if isinstance(row, dict)]

    steps_today = 0
    active_calories_today = 0.0
    distance_today = 0.0
    exercise_minutes_today = 0
    workouts_this_week = 0
    for row in activity_rows:
        date_value = row.get("date")
        if not isinstance(date_value, str):
            continue
        try:
            row_date = DateType.fromisoformat(date_value)
        except ValueError:
            continue
        workouts_this_week += _extract_workouts_count(row)
        if row_date != target_date:
            continue
        steps_today += max(0, _safe_int(row.get("steps")))
        active_calories_today += max(0.0, _safe_float(row.get("active_calories")))
        distance_today += max(0.0, _safe_float(row.get("distance_meters")))
        exercise_minutes_today += max(0, _safe_int(row.get("exercise_minutes")))

    latest_weight_payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_body_logs",
        params=[
            ("select", "provider,weight,body_fat_percentage,unit,recorded_at"),
            ("user_id", f"eq.{owner_id}"),
            ("weight", "not.is.null"),
            ("order", "recorded_at.desc"),
            ("limit", "5"),
        ],
    )
    latest_weight: dict[str, Any] | None = None
    if isinstance(latest_weight_payload, list):
        for row in latest_weight_payload:
            if not isinstance(row, dict):
                continue
            weight_value = _safe_float(row.get("weight"), -1.0)
            unit = _safe_str(row.get("unit"), "kg").lower()
            if weight_value < 0 or unit not in {"kg", "lb"}:
                continue
            provider = _safe_str(row.get("provider"), "fitbit")
            if provider not in _SUPPORTED_PROVIDERS:
                continue
            latest_weight = {
                "provider": provider,
                "weight": _round_number(weight_value),
                "unit": unit,
                "body_fat_percentage": _round_number(_safe_float(row.get("body_fat_percentage")))
                if _safe_float(row.get("body_fat_percentage"), -1) >= 0
                else None,
                "recorded_at": row.get("recorded_at"),
            }
            break

    sleep_payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_sleep_logs",
        params=[
            ("select", "sleep_duration_minutes"),
            ("user_id", f"eq.{owner_id}"),
            ("order", "ended_at.desc"),
            ("limit", "1"),
        ],
    )
    sleep_duration_minutes: int | None = None
    if isinstance(sleep_payload, list) and sleep_payload and isinstance(sleep_payload[0], dict):
        sleep_duration_minutes = max(0, _safe_int(sleep_payload[0].get("sleep_duration_minutes")))

    heart_payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_heart_logs",
        params=[
            ("select", "resting_heart_rate_bpm"),
            ("user_id", f"eq.{owner_id}"),
            ("order", "recorded_at.desc"),
            ("limit", "1"),
        ],
    )
    resting_heart_rate_bpm: int | None = None
    if isinstance(heart_payload, list) and heart_payload and isinstance(heart_payload[0], dict):
        heart_value = max(0, _safe_int(heart_payload[0].get("resting_heart_rate_bpm")))
        resting_heart_rate_bpm = heart_value if heart_value > 0 else None

    status_rows: list[dict[str, Any]] = []
    for provider in _SUPPORTED_PROVIDERS:
        row = next(
            (candidate for candidate in integration_rows if _safe_str(candidate.get("provider")) == provider),
            None,
        )
        status = _safe_str(row.get("status")) if isinstance(row, dict) else ""
        if not status:
            status = _PROVIDER_CATALOG[provider]["default_status"]
        status_rows.append(
            {
                "provider": provider,
                "status": status,
                "last_synced_at": row.get("last_synced_at") if isinstance(row, dict) else None,
            }
        )

    timezone_label = "UTC"
    if hasattr(tz, "key"):
        timezone_label = str(getattr(tz, "key"))

    return {
        "success": True,
        "date": target_date,
        "timezone": timezone_label,
        "steps_today": max(0, steps_today),
        "active_calories_today": _round_number(active_calories_today),
        "distance_meters_today": _round_number(distance_today),
        "exercise_minutes_today": max(0, exercise_minutes_today),
        "workouts_this_week": max(0, workouts_this_week),
        "latest_weight": latest_weight,
        "sleep_duration_minutes": sleep_duration_minutes,
        "resting_heart_rate_bpm": resting_heart_rate_bpm,
        "integration_status": status_rows,
    }


async def fetch_health_data_activity(
    access_token: str,
    *,
    user_id: str | None,
    days: int,
    timezone_name: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    bounded_days = _normalize_days(days, default_value=7, max_value=MAX_ACTIVITY_DAYS)
    start_date, end_date = _date_range_from_days(bounded_days, timezone_name=timezone_name)

    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_activity_logs",
        params=[
            ("select", "provider,date,steps,active_calories,distance_meters,exercise_minutes,workout_type,raw_payload"),
            ("user_id", f"eq.{owner_id}"),
            ("date", f"gte.{start_date.isoformat()}"),
            ("date", f"lte.{end_date.isoformat()}"),
            ("order", "date.asc"),
            ("limit", "3000"),
        ],
    )
    if not isinstance(payload, list):
        raise HealthIntegrationError(status_code=502, message="Invalid health activity response from database.")

    day_map: dict[DateType, dict[str, Any]] = {}
    for index in range(bounded_days):
        day = start_date + timedelta(days=index)
        day_map[day] = {
            "date": day,
            "steps": 0,
            "active_calories": 0.0,
            "distance_meters": 0.0,
            "exercise_minutes": 0,
            "workouts_count": 0,
            "providers": set(),
        }

    for row in payload:
        if not isinstance(row, dict):
            continue
        date_raw = row.get("date")
        if not isinstance(date_raw, str):
            continue
        try:
            day = DateType.fromisoformat(date_raw)
        except ValueError:
            continue
        if day not in day_map:
            continue
        provider = _safe_str(row.get("provider"))
        if provider in _SUPPORTED_PROVIDERS:
            day_map[day]["providers"].add(provider)
        day_map[day]["steps"] += max(0, _safe_int(row.get("steps")))
        day_map[day]["active_calories"] += max(0.0, _safe_float(row.get("active_calories")))
        day_map[day]["distance_meters"] += max(0.0, _safe_float(row.get("distance_meters")))
        day_map[day]["exercise_minutes"] += max(0, _safe_int(row.get("exercise_minutes")))
        day_map[day]["workouts_count"] += _extract_workouts_count(row)

    entries: list[dict[str, Any]] = []
    for day in sorted(day_map.keys()):
        entry = day_map[day]
        entries.append(
            {
                "date": day,
                "steps": max(0, int(entry["steps"])),
                "active_calories": _round_number(entry["active_calories"]),
                "distance_meters": _round_number(entry["distance_meters"]),
                "exercise_minutes": max(0, int(entry["exercise_minutes"])),
                "workouts_count": max(0, int(entry["workouts_count"])),
                "providers": sorted(entry["providers"]),
            }
        )

    timezone_label = timezone_name.strip() if isinstance(timezone_name, str) and timezone_name.strip() else "UTC"
    return {
        "success": True,
        "timezone": timezone_label,
        "start_date": start_date,
        "end_date": end_date,
        "entries": entries,
    }


async def fetch_health_data_body(
    access_token: str,
    *,
    user_id: str | None,
    days: int,
    timezone_name: str | None,
) -> dict[str, Any]:
    owner_id = _normalize_user_id(user_id)
    bounded_days = _normalize_days(days, default_value=30, max_value=MAX_BODY_DAYS)
    tz = _resolve_timezone(timezone_name)
    end_date = _resolve_target_date(None, tz)
    start_date = end_date - timedelta(days=bounded_days - 1)
    start_local = datetime.combine(start_date, time.min, tzinfo=tz)
    end_local = datetime.combine(end_date + timedelta(days=1), time.min, tzinfo=tz)
    start_utc = _format_utc(start_local)
    end_utc = _format_utc(end_local)

    payload = await _supabase_get(
        access_token=access_token,
        path="/rest/v1/health_body_logs",
        params=[
            ("select", "id,provider,source_record_id,weight,body_fat_percentage,unit,recorded_at"),
            ("user_id", f"eq.{owner_id}"),
            ("recorded_at", f"gte.{start_utc}"),
            ("recorded_at", f"lt.{end_utc}"),
            ("order", "recorded_at.desc"),
            ("limit", "800"),
        ],
    )
    if not isinstance(payload, list):
        raise HealthIntegrationError(status_code=502, message="Invalid health body response from database.")

    entries: list[dict[str, Any]] = []
    for row in payload:
        if not isinstance(row, dict):
            continue
        record_id = _safe_str(row.get("id"))
        provider = _safe_str(row.get("provider"))
        source_record_id = _safe_str(row.get("source_record_id"))
        recorded_at = row.get("recorded_at")
        unit = _safe_str(row.get("unit"), "kg").lower()
        if not record_id or provider not in _SUPPORTED_PROVIDERS or not source_record_id:
            continue
        if unit not in {"kg", "lb", "percent"}:
            unit = "kg"
        if not isinstance(recorded_at, str) or not recorded_at.strip():
            continue
        weight_value = _safe_float(row.get("weight"), -1.0)
        fat_value = _safe_float(row.get("body_fat_percentage"), -1.0)
        if weight_value < 0 and fat_value < 0:
            continue
        entries.append(
            {
                "id": record_id,
                "provider": provider,
                "source_record_id": source_record_id,
                "weight": _round_number(weight_value) if weight_value >= 0 else None,
                "body_fat_percentage": _round_number(fat_value) if fat_value >= 0 else None,
                "unit": unit,
                "recorded_at": recorded_at,
            }
        )

    latest_entry = entries[0] if entries else None
    timezone_label = timezone_name.strip() if isinstance(timezone_name, str) and timezone_name.strip() else "UTC"
    return {
        "success": True,
        "timezone": timezone_label,
        "start_date": start_date,
        "end_date": end_date,
        "latest": latest_entry,
        "entries": entries,
    }
