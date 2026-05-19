from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Header, HTTPException, Query
from pydantic import ValidationError

from schemas.foods import (
    FavoriteFoodRequest,
    FavoriteFoodResponse,
    FoodBarcodeResponse,
    FoodSearchResponse,
    FoodsCollectionResponse,
)
from services.food_catalog import (
    FoodCatalogError,
    fetch_favorite_foods,
    fetch_recent_foods,
    lookup_food_by_barcode,
    save_favorite_food,
    search_foods,
)
from services.supabase_meals import SupabaseServiceError, authenticate_user, extract_bearer_token

router = APIRouter(tags=["foods"])


def _sanitize_food_catalog_error(
    exc: FoodCatalogError,
    *,
    fallback_message: str,
) -> tuple[int, str]:
    normalized = exc.message.lower()

    if exc.status_code == 401:
        return 401, "Authentication required. Please sign in again."
    if exc.status_code == 404:
        return 404, "Food item was not found."
    if exc.status_code == 422:
        if "barcode" in normalized:
            return 422, "Barcode must contain 8-14 digits."
        if "search query" in normalized:
            return 422, "Search query must contain at least 2 characters."
        return 422, "Request data is invalid. Please review your input and try again."
    if exc.status_code == 503:
        return 503, "Food catalog service is temporarily unavailable. Please try again shortly."
    if exc.status_code >= 500:
        return 502, fallback_message
    return exc.status_code, fallback_message

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


@router.get("/foods/search", response_model=FoodSearchResponse)
async def get_food_search_results(
    q: Annotated[str, Query(min_length=2, max_length=80)],
    page: int = Query(default=1, ge=1, le=200),
    limit: int = Query(default=12, ge=1, le=25),
    authorization: Annotated[str | None, Header()] = None,
) -> FoodSearchResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await search_foods(
            access_token,
            user_id=str(user.get("id") or ""),
            query=q,
            page=page,
            limit=limit,
        )
        return FoodSearchResponse.model_validate(payload)
    except FoodCatalogError as exc:
        status_code, detail = _sanitize_food_catalog_error(
            exc,
            fallback_message="Food search is unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Food search is unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Food search service returned an invalid response.",
        ) from exc


@router.get("/foods/barcode/{barcode}", response_model=FoodBarcodeResponse)
async def get_food_by_barcode(
    barcode: str,
    authorization: Annotated[str | None, Header()] = None,
) -> FoodBarcodeResponse:
    try:
        access_token = extract_bearer_token(authorization)
        await authenticate_user(access_token)
        payload = await lookup_food_by_barcode(access_token, barcode.strip())
        return FoodBarcodeResponse.model_validate(payload)
    except FoodCatalogError as exc:
        status_code, detail = _sanitize_food_catalog_error(
            exc,
            fallback_message="Barcode lookup is unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Barcode lookup is unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Barcode lookup service returned an invalid response.",
        ) from exc


@router.get("/foods/recent", response_model=FoodsCollectionResponse)
async def get_recent_foods(
    limit: int = Query(default=8, ge=1, le=20),
    authorization: Annotated[str | None, Header()] = None,
) -> FoodsCollectionResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_recent_foods(
            access_token,
            user_id=str(user.get("id") or ""),
            limit=limit,
        )
        return FoodsCollectionResponse.model_validate(payload)
    except FoodCatalogError as exc:
        status_code, detail = _sanitize_food_catalog_error(
            exc,
            fallback_message="Recent foods are unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Recent foods are unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Recent foods service returned an invalid response.",
        ) from exc


@router.get("/foods/favorites", response_model=FoodsCollectionResponse)
async def get_favorite_foods(
    limit: int = Query(default=8, ge=1, le=30),
    authorization: Annotated[str | None, Header()] = None,
) -> FoodsCollectionResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        payload = await fetch_favorite_foods(
            access_token,
            user_id=str(user.get("id") or ""),
            limit=limit,
        )
        return FoodsCollectionResponse.model_validate(payload)
    except FoodCatalogError as exc:
        status_code, detail = _sanitize_food_catalog_error(
            exc,
            fallback_message="Favorite foods are unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Favorite foods are unavailable right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Favorite foods service returned an invalid response.",
        ) from exc


@router.post("/foods/favorite", response_model=FavoriteFoodResponse)
async def create_favorite_food(
    payload: FavoriteFoodRequest,
    authorization: Annotated[str | None, Header()] = None,
) -> FavoriteFoodResponse:
    try:
        access_token = extract_bearer_token(authorization)
        user = await authenticate_user(access_token)
        saved = await save_favorite_food(
            access_token,
            user_id=str(user.get("id") or ""),
            food=payload.food.model_dump(),
        )
        return FavoriteFoodResponse.model_validate(saved)
    except FoodCatalogError as exc:
        status_code, detail = _sanitize_food_catalog_error(
            exc,
            fallback_message="Unable to save favorite food right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except SupabaseServiceError as exc:
        status_code, detail = _sanitize_supabase_error(
            exc,
            fallback_message="Unable to save favorite food right now.",
        )
        raise HTTPException(status_code=status_code, detail=detail) from exc
    except ValidationError as exc:
        raise HTTPException(
            status_code=502,
            detail="Favorite save service returned an invalid response.",
        ) from exc
