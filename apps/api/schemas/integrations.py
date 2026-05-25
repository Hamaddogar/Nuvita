from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

IntegrationProvider = Literal["fitbit", "apple_health", "google_fit", "health_connect"]
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


class IntegrationProviderCard(BaseModel):
    provider: IntegrationProvider
    display_name: str
    status: IntegrationStatus
    supports_web_oauth: bool
    requires_native_app: bool
    data_types: list[str] = Field(default_factory=list)
    permissions: list[str] = Field(default_factory=list)
    connected_at: datetime | None = None
    last_synced_at: datetime | None = None
    last_error: str | None = None
    message: str | None = None


class IntegrationsListResponse(BaseModel):
    success: bool
    integrations: list[IntegrationProviderCard]


class IntegrationConnectRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    redirect_to: str | None = Field(default=None, max_length=600)


class IntegrationConnectResponse(BaseModel):
    success: bool
    provider: IntegrationProvider
    status: IntegrationStatus
    authorization_url: str | None = None
    message: str | None = None
    state_expires_at: datetime | None = None


class IntegrationSyncRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    days: int = Field(default=7, ge=1, le=31)


class IntegrationSyncCounts(BaseModel):
    activity_records: int = Field(default=0, ge=0)
    body_records: int = Field(default=0, ge=0)
    sleep_records: int = Field(default=0, ge=0)
    heart_records: int = Field(default=0, ge=0)


class IntegrationSyncResponse(BaseModel):
    success: bool
    provider: IntegrationProvider
    status: IntegrationStatus
    message: str
    synced_counts: IntegrationSyncCounts
    last_synced_at: datetime | None = None


class IntegrationCallbackResponse(BaseModel):
    success: bool
    provider: IntegrationProvider
    status: IntegrationStatus
    message: str
    synced_counts: IntegrationSyncCounts | None = None
    last_synced_at: datetime | None = None


class IntegrationDisconnectResponse(BaseModel):
    success: bool
    provider: IntegrationProvider
    status: IntegrationStatus
    message: str


class IntegrationStatusSnapshot(BaseModel):
    provider: IntegrationProvider
    status: IntegrationStatus
    last_synced_at: datetime | None = None


class LatestWeightRecord(BaseModel):
    provider: IntegrationProvider
    weight: float = Field(ge=0)
    unit: Literal["kg", "lb"]
    body_fat_percentage: float | None = Field(default=None, ge=0)
    recorded_at: datetime


class HealthDataSummaryResponse(BaseModel):
    success: bool
    date: DateType
    timezone: str
    steps_today: int = Field(default=0, ge=0)
    active_calories_today: float = Field(default=0, ge=0)
    distance_meters_today: float = Field(default=0, ge=0)
    exercise_minutes_today: int = Field(default=0, ge=0)
    workouts_this_week: int = Field(default=0, ge=0)
    latest_weight: LatestWeightRecord | None = None
    sleep_duration_minutes: int | None = Field(default=None, ge=0)
    resting_heart_rate_bpm: int | None = Field(default=None, ge=0)
    integration_status: list[IntegrationStatusSnapshot] = Field(default_factory=list)


class ActivityDayEntry(BaseModel):
    date: DateType
    steps: int = Field(default=0, ge=0)
    active_calories: float = Field(default=0, ge=0)
    distance_meters: float = Field(default=0, ge=0)
    exercise_minutes: int = Field(default=0, ge=0)
    workouts_count: int = Field(default=0, ge=0)
    providers: list[IntegrationProvider] = Field(default_factory=list)


class HealthDataActivityResponse(BaseModel):
    success: bool
    timezone: str
    start_date: DateType
    end_date: DateType
    entries: list[ActivityDayEntry]


class BodyLogEntry(BaseModel):
    id: str
    provider: IntegrationProvider
    source_record_id: str
    weight: float | None = Field(default=None, ge=0)
    body_fat_percentage: float | None = Field(default=None, ge=0)
    unit: Literal["kg", "lb", "percent"]
    recorded_at: datetime


class HealthDataBodyResponse(BaseModel):
    success: bool
    timezone: str
    start_date: DateType
    end_date: DateType
    latest: BodyLogEntry | None = None
    entries: list[BodyLogEntry]
