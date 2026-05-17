# AI Diet FastAPI Service

## Purpose
FastAPI backend for AI food-image analysis and nutrition estimation.

## Setup
1. Create a Python virtual environment.
2. Install dependencies:
   - `python -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and set values:
   - `OPENAI_API_KEY`
   - `USDA_API_KEY`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Run the API:
   - `python -m uvicorn main:app --reload`

## Endpoints
- `GET /health`: service health check.
- `POST /analyze-image`: analyzes a food image with OpenAI Vision, enriches macros with USDA FoodData Central when possible, and returns structured nutrition JSON.
- `POST /meals`: authenticated meal persistence endpoint that validates and stores confirmed meal + meal items in Supabase transactionally.
- `GET /daily-summary`: authenticated dashboard summary endpoint for date-scoped goals, consumed totals, remaining macros, progress percentages, and today’s meals.
- `GET /meal-history`: authenticated history endpoint for selected-day summary + meal list.
- `GET /meals/{meal_id}`: authenticated endpoint returning full details for one logged meal and its items.

## `POST /analyze-image` input options
1. Multipart upload (recommended):
   - `image` (file)
   - `user_portion_description` (optional text)
2. JSON body:
   - `image_base64` (required for JSON unless `image_url` is provided)
   - `image_url` (optional)
   - `user_portion_description` (optional)

## Example curl requests
Multipart upload:
```bash
curl -X POST "http://localhost:8000/analyze-image" \
  -H "accept: application/json" \
  -F "image=@/absolute/path/to/meal.jpg" \
  -F "user_portion_description=1 full plate"
```

JSON with base64 image:
```bash
curl -X POST "http://localhost:8000/analyze-image" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d "{\"image_base64\":\"<BASE64_IMAGE>\",\"user_portion_description\":\"about one bowl\"}"
```

## Response shape
The endpoint returns:
- `success`
- `detected_foods[]` with `name`, `quantity_estimate`, `estimated_grams`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `confidence`, optional `usda_match`
- `total` with aggregated macros
- `notes` with warnings/assumptions

## `POST /meals` request
Requires `Authorization: Bearer <supabase_access_token>`.

Body:
- `meal_name`
- `meal_type` (`breakfast` | `lunch` | `dinner` | `snack`)
- `eaten_at` (ISO datetime)
- `notes` (optional)
- `items[]` with `name`, `quantity_estimate`, `estimated_grams`, `calories`, `protein_g`, `carbs_g`, `fat_g`, `confidence`, `source`

Returns:
- `success`
- `meal_id`
- `meal`
- `items[]`
- `totals`

## `GET /daily-summary` request
Requires `Authorization: Bearer <supabase_access_token>`.

Query params:
- `date` (optional, `YYYY-MM-DD`, defaults to current date)
- `timezone` (optional IANA timezone, e.g. `Asia/Kolkata`; defaults to UTC)

Returns:
- `success`
- `date`
- `goals` (`calories`, `protein_g`, `carbs_g`, `fat_g`)
- `consumed`
- `remaining`
- `progress` percentages
- `meals[]` for the selected day with macro totals and `item_count`

## `GET /meal-history` request
Requires `Authorization: Bearer <supabase_access_token>`.

Query params:
- `date` (optional, `YYYY-MM-DD`, defaults to current date)
- `timezone` (optional IANA timezone, e.g. `Asia/Kolkata`; defaults to UTC)

Returns:
- `success`
- `date`
- `summary` (`total_calories`, `total_protein_g`, `total_carbs_g`, `total_fat_g`, `meal_count`)
- `goals`
- `remaining`
- `progress`
- `meals[]` with daily meal cards (`id`, `meal_name`, `meal_type`, `eaten_at`, totals, `item_count`, optional `image_url`)

## `GET /meals/{meal_id}` request
Requires `Authorization: Bearer <supabase_access_token>`.

Returns:
- `success`
- `meal` metadata/totals (`meal_name`, `meal_type`, `eaten_at`, `notes`, optional `image_url`)
- `items[]` full nutrition rows for the meal

## Manual test checklist
1. Start API and verify health:
   - `GET http://localhost:8000/health`
2. Send multipart image request to `/analyze-image`.
3. Confirm response includes:
   - detected foods
   - per-item `calories`, `protein_g`, `carbs_g`, `fat_g`
   - `total` macros
4. Failure-case checks:
   - missing image (expect 400)
   - invalid non-image file (expect 400)
   - invalid JSON/base64 payload (expect 400/422)
5. Optional integration checks:
   - remove `USDA_API_KEY` and confirm endpoint still returns AI-based estimates with warnings in `notes`
   - invalid `OPENAI_API_KEY` should return a clean OpenAI failure error
