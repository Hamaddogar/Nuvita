from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

WeightUnit = Literal["kg", "lb"]


class WaterLogRecord(BaseModel):
    id: str
    amount_ml: int = Field(ge=1, le=5000)
    logged_at: datetime
    created_at: datetime


class WaterGoalResponse(BaseModel):
    success: bool
    goal_ml: int = Field(ge=1200, le=6000)


class WaterTodayResponse(BaseModel):
    success: bool
    date: DateType
    today_total_ml: int = Field(ge=0)
    goal_ml: int = Field(ge=1200, le=6000)
    remaining_ml: int = Field(ge=0)
    progress_percent: int = Field(ge=0)
    logs: list[WaterLogRecord]


class WaterHistoryDayTotal(BaseModel):
    date: DateType
    total_ml: int = Field(ge=0)
    goal_ml: int = Field(ge=1200, le=6000)
    progress_percent: int = Field(ge=0)


class WaterHistoryResponse(BaseModel):
    success: bool
    entries: list[WaterHistoryDayTotal]
    logs: list[WaterLogRecord]


class WaterLogCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_ml: int = Field(ge=50, le=3000)
    logged_at: datetime | None = None


class WaterLogUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    amount_ml: int = Field(ge=50, le=3000)
    logged_at: datetime | None = None


class WaterGoalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_ml: int = Field(ge=1200, le=6000)


class WaterLogMutationResponse(BaseModel):
    success: bool
    log: WaterLogRecord
    today_total_ml: int = Field(ge=0)
    goal_ml: int = Field(ge=1200, le=6000)
    remaining_ml: int = Field(ge=0)
    progress_percent: int = Field(ge=0)


class WeightLogRecord(BaseModel):
    id: str
    weight: float = Field(ge=20, le=400)
    unit: WeightUnit
    weight_kg: float = Field(ge=20, le=400)
    notes: str | None = Field(default=None, max_length=500)
    logged_at: datetime
    created_at: datetime


class WeightTrendPoint(BaseModel):
    date: DateType
    weight: float = Field(ge=20, le=400)
    unit: WeightUnit


class WeightHistoryResponse(BaseModel):
    success: bool
    logs: list[WeightLogRecord]
    trend: list[WeightTrendPoint]


class WeightSummaryResponse(BaseModel):
    success: bool
    current_weight: float | None = Field(default=None, ge=20, le=400)
    target_weight: float | None = Field(default=None, ge=20, le=400)
    unit: WeightUnit = "kg"
    change_from_start: float | None = None
    remaining_to_goal: float | None = None
    recent_change: float | None = None
    progress_percent: int | None = Field(default=None, ge=0, le=100)
    trend: list[WeightTrendPoint]


class WeightLogCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weight: float = Field(ge=20, le=400)
    unit: WeightUnit = "kg"
    logged_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=500)


class WeightLogUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    weight: float = Field(ge=20, le=400)
    unit: WeightUnit = "kg"
    logged_at: datetime | None = None
    notes: str | None = Field(default=None, max_length=500)


class WeightGoalUpdateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    target_weight: float = Field(ge=20, le=400)
    unit: WeightUnit = "kg"


class WeightGoalResponse(BaseModel):
    success: bool
    target_weight: float = Field(ge=20, le=400)
    unit: WeightUnit


class WeightLogMutationResponse(BaseModel):
    success: bool
    log: WeightLogRecord
    summary: WeightSummaryResponse


class WeightUnitQuery(BaseModel):
    unit: WeightUnit = "kg"

    @field_validator("unit")
    @classmethod
    def normalize_unit(cls, value: WeightUnit) -> WeightUnit:
        return "lb" if value == "lb" else "kg"


class WeightGoalPair(BaseModel):
    target_weight: float | None = Field(default=None, ge=20, le=400)
    unit: WeightUnit = "kg"

    @model_validator(mode="after")
    def validate_target(self) -> "WeightGoalPair":
        if self.target_weight is None:
            return self
        if self.target_weight < 20 or self.target_weight > 400:
            raise ValueError("target_weight must be between 20 and 400.")
        return self
