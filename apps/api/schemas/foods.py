from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

FoodSource = Literal["usda", "openfoodfacts", "recent", "favorite", "custom"]


class FoodRecord(BaseModel):
    id: str = Field(min_length=1, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    serving_size: str = Field(min_length=1, max_length=80)
    serving_size_g: float | None = Field(default=None, gt=0)
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    image_url: str | None = None
    barcode: str | None = Field(default=None, pattern=r"^\d{8,14}$")
    source: FoodSource


class FoodsPagination(BaseModel):
    page: int = Field(default=1, ge=1)
    limit: int = Field(default=12, ge=1, le=50)
    has_more: bool = False


class FoodSearchResponse(BaseModel):
    success: bool
    query: str = Field(min_length=1, max_length=80)
    foods: list[FoodRecord]
    pagination: FoodsPagination


class FoodBarcodeResponse(BaseModel):
    success: bool
    barcode: str = Field(pattern=r"^\d{8,14}$")
    food: FoodRecord


class FoodsCollectionResponse(BaseModel):
    success: bool
    foods: list[FoodRecord]


class FavoriteFoodPayload(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str | None = Field(default=None, max_length=160)
    name: str = Field(min_length=1, max_length=160)
    brand: str | None = Field(default=None, max_length=120)
    serving_size: str = Field(min_length=1, max_length=80)
    serving_size_g: float | None = Field(default=None, gt=0)
    calories: float = Field(ge=0)
    protein_g: float = Field(ge=0)
    carbs_g: float = Field(ge=0)
    fat_g: float = Field(ge=0)
    image_url: str | None = None
    barcode: str | None = Field(default=None, pattern=r"^\d{8,14}$")
    source: FoodSource = "favorite"

    @field_validator("name")
    @classmethod
    def validate_name(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("name is required.")
        return cleaned

    @field_validator("serving_size")
    @classmethod
    def validate_serving_size(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("serving_size is required.")
        return cleaned


class FavoriteFoodRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    food: FavoriteFoodPayload


class FavoriteFoodResponse(BaseModel):
    success: bool
    favorite_id: str
    food: FoodRecord
