from __future__ import annotations

from datetime import date as DateType, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

MealType = Literal["breakfast", "lunch", "dinner", "snack"]
MealItemSource = Literal["ai_usda", "ai_estimate", "manual"]


class MealTotals(BaseModel):
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)


class MealItemCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    name: str = Field(min_length=1, max_length=120)
    quantity_estimate: str | None = Field(default=None, max_length=120)
    estimated_grams: float | None = Field(default=None)
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    confidence: float = Field(default=0.5, ge=0, le=1)
    source: MealItemSource = "ai_estimate"

    @model_validator(mode="after")
    def validate_grams(self) -> "MealItemCreateRequest":
        if self.estimated_grams is not None and self.estimated_grams <= 0:
            raise ValueError("estimated_grams must be greater than 0 when provided.")
        return self


class MealCreateRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    meal_name: str = Field(min_length=1, max_length=120)
    meal_type: MealType
    eaten_at: datetime
    notes: str | None = Field(default=None, max_length=2000)
    items: list[MealItemCreateRequest]

    @model_validator(mode="after")
    def validate_items(self) -> "MealCreateRequest":
        if not self.items:
            raise ValueError("At least one meal item is required.")
        return self


class MealRecordResponse(BaseModel):
    id: str
    user_id: str
    meal_name: str
    meal_type: MealType
    eaten_at: datetime
    notes: str | None = None


class MealItemResponse(BaseModel):
    name: str
    quantity_estimate: str | None = None
    estimated_grams: float | None = None
    calories: float
    protein_g: float
    carbs_g: float
    fat_g: float
    confidence: float
    source: MealItemSource


class MealCreateResponse(BaseModel):
    success: bool
    meal_id: str
    meal: MealRecordResponse
    items: list[MealItemResponse]
    totals: MealTotals


class DailyGoalTargets(BaseModel):
    calories: float = Field(default=0, ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)


class DailyConsumedTotals(BaseModel):
    calories: float = Field(default=0, ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)


class DailyRemainingTotals(BaseModel):
    calories: float = 0
    protein_g: float = 0
    carbs_g: float = 0
    fat_g: float = 0


class DailyProgressPercentages(BaseModel):
    calories_percent: int = Field(default=0, ge=0)
    protein_percent: int = Field(default=0, ge=0)
    carbs_percent: int = Field(default=0, ge=0)
    fat_percent: int = Field(default=0, ge=0)


class DailyMealSummary(BaseModel):
    id: str
    meal_name: str = Field(min_length=1, max_length=120)
    meal_type: str = Field(min_length=1, max_length=30)
    eaten_at: datetime
    total_calories: float = Field(ge=0)
    total_protein_g: float = Field(ge=0)
    total_carbs_g: float = Field(ge=0)
    total_fat_g: float = Field(ge=0)
    item_count: int = Field(default=0, ge=0)


class DailySummaryResponse(BaseModel):
    success: bool
    date: DateType
    goals: DailyGoalTargets
    consumed: DailyConsumedTotals
    remaining: DailyRemainingTotals
    progress: DailyProgressPercentages
    meals: list[DailyMealSummary]


class MealHistoryDaySummary(BaseModel):
    total_calories: float = Field(default=0, ge=0)
    total_protein_g: float = Field(default=0, ge=0)
    total_carbs_g: float = Field(default=0, ge=0)
    total_fat_g: float = Field(default=0, ge=0)
    meal_count: int = Field(default=0, ge=0)


class MealHistoryEntry(BaseModel):
    id: str
    meal_name: str = Field(min_length=1, max_length=120)
    meal_type: str = Field(min_length=1, max_length=30)
    eaten_at: datetime
    total_calories: float = Field(default=0, ge=0)
    total_protein_g: float = Field(default=0, ge=0)
    total_carbs_g: float = Field(default=0, ge=0)
    total_fat_g: float = Field(default=0, ge=0)
    item_count: int = Field(default=0, ge=0)
    image_url: str | None = None


class MealHistoryResponse(BaseModel):
    success: bool
    date: DateType
    summary: MealHistoryDaySummary
    goals: DailyGoalTargets
    remaining: DailyRemainingTotals
    progress: DailyProgressPercentages
    meals: list[MealHistoryEntry]


class MealDetailItem(BaseModel):
    id: str
    name: str
    category: str | None = None
    portion_description: str | None = None
    estimated_weight_g: float | None = Field(default=None, ge=0)
    calories: float = Field(default=0, ge=0)
    protein_g: float = Field(default=0, ge=0)
    carbs_g: float = Field(default=0, ge=0)
    fat_g: float = Field(default=0, ge=0)
    confidence: str = "medium"
    nutrition_source: str = "ai_estimate"
    notes: str | None = None


class MealDetailRecord(BaseModel):
    id: str
    meal_name: str = Field(min_length=1, max_length=120)
    meal_type: str = Field(min_length=1, max_length=30)
    eaten_at: datetime
    notes: str | None = None
    image_url: str | None = None
    total_calories: float = Field(default=0, ge=0)
    total_protein_g: float = Field(default=0, ge=0)
    total_carbs_g: float = Field(default=0, ge=0)
    total_fat_g: float = Field(default=0, ge=0)


class MealDetailResponse(BaseModel):
    success: bool
    meal: MealDetailRecord
    items: list[MealDetailItem]
