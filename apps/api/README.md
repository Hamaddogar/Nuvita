# Nuvita FastAPI Service
FastAPI backend for image-based meal analysis, Supabase-backed meal logging, dashboard/history summaries, and AI coaching insights.

## Setup
1. Create and activate a Python virtual environment.
2. Install dependencies:
   - `python -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and populate required values:
   - `OPENAI_API_KEY`
   - `USDA_API_KEY`
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - Optional:
     - `OPENAI_VISION_MODEL`
     - `OPENAI_INSIGHTS_MODEL`
     - `SUPABASE_SERVICE_ROLE_KEY`
4. Run the API:
   - `python -m uvicorn main:app --reload`

## Endpoints
- `GET /health`: service health status
- `POST /analyze-image`: meal image analysis + nutrition estimate
- `POST /meals`: authenticated meal save
- `GET /daily-summary`: authenticated day-level nutrition summary
- `GET /meal-history`: authenticated meal timeline for a selected date
- `GET /meals/{meal_id}`: authenticated meal detail
- `GET /ai-insights/today`: authenticated daily coaching cards
- `GET /ai-insights/weekly`: authenticated weekly coaching summary

## Input/output behavior highlights
- Analyze endpoint accepts:
  1. Multipart (`image`, optional `user_portion_description`)
  2. JSON (`image_base64` or `image_url`, optional `user_portion_description`)
- `AnalyzeImageJSONPayload` is strict (`extra="forbid"`).
- Meal create payloads are strict (`extra="forbid"` for top-level and item objects).
- Protected endpoints require `Authorization: Bearer <supabase_access_token>`.
- User-facing errors are sanitized (internal provider/runtime details are not surfaced directly).

## Example requests
Multipart analyze request:
```bash
curl -X POST "http://localhost:8000/analyze-image" \
  -H "accept: application/json" \
  -F "image=@/absolute/path/to/meal.jpg" \
  -F "user_portion_description=1 full plate"
```

JSON analyze request:
```bash
curl -X POST "http://localhost:8000/analyze-image" \
  -H "accept: application/json" \
  -H "Content-Type: application/json" \
  -d "{\"image_base64\":\"<BASE64_IMAGE>\",\"user_portion_description\":\"about one bowl\"}"
```

## Test commands
- From repo root:
  - `npm run test:api`
- Directly in API context:
  - `python -m pytest tests -q`

## Troubleshooting
- **401 on protected routes**: confirm Bearer token is present and valid.
- **422 for `/meals`**: payload contains invalid/extra fields or invalid item values.
- **Analyze-image fails with 503/502**: check AI env vars and outbound network access.
- **Frequent USDA fallback notes**: verify `USDA_API_KEY` and USDA API connectivity.
- **Summary/history empty unexpectedly**: confirm data exists for the authenticated user/date/timezone.
