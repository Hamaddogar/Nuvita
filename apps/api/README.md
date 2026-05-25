# Nuvita FastAPI Service
FastAPI backend for image-based meal analysis, Supabase-backed meal logging, dashboard/history summaries, advanced analytics trends, AI coaching insights, and wearable health integrations.

## Setup
1. Create and activate a Python virtual environment.
2. Install dependencies:
   - `python -m pip install -r requirements.txt`
3. Copy `.env.example` to `.env` and populate required values:
   - `OPENAI_API_KEY`
   - `USDA_API_KEY`
   - `OPENFOODFACTS_USER_AGENT` (recommended for barcode lookups)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `FITBIT_CLIENT_ID` (required for Fitbit web OAuth)
   - `FITBIT_CLIENT_SECRET` (required for Fitbit web OAuth)
   - `FITBIT_REDIRECT_URI` (must match Fitbit app config, e.g. `http://localhost:3000/api/integrations/fitbit/callback`)
   - `HEALTH_TOKEN_ENCRYPTION_KEY` (16+ chars; used for encrypted integration token storage)
   - Optional:
     - `OPENAI_VISION_MODEL`
     - `OPENAI_INSIGHTS_MODEL`
     - `OPENAI_ANALYTICS_MODEL`
     - `OPENFOODFACTS_BASE_URL`
     - `SUPABASE_SERVICE_ROLE_KEY`
     - `SUPABASE_ENCRYPTION_KEY` (legacy alias fallback for `HEALTH_TOKEN_ENCRYPTION_KEY`)
4. Run the API:
   - `python -m uvicorn main:app --reload`

## Endpoints
- `GET /health`: service health status
- `POST /analyze-image`: meal image analysis + nutrition estimate
- `GET /foods/search`: authenticated manual food search (custom + cached barcode + USDA)
- `GET /foods/barcode/{barcode}`: authenticated barcode lookup via cache/OpenFoodFacts
- `GET /foods/recent`: authenticated quick-add list from recent meal items
- `GET /foods/favorites`: authenticated quick-add list from saved favorites
- `POST /foods/favorite`: authenticated save/update favorite food snapshot
- `POST /meals`: authenticated meal save
- `GET /daily-summary`: authenticated day-level nutrition summary
- `GET /meal-history`: authenticated meal timeline for a selected date
- `GET /meals/{meal_id}`: authenticated meal detail
- `GET /ai-insights/today`: authenticated daily coaching cards
- `GET /ai-insights/weekly`: authenticated weekly coaching summary
- `GET /analytics/weekly`: authenticated 7-day adherence + macro trend metrics
- `GET /analytics/monthly`: authenticated 30-day trend and weekly rollup analytics
- `GET /analytics/streaks`: authenticated current/best consistency streak metrics
- `GET /analytics/achievements`: authenticated achievement progression and unlock status
- `GET /analytics/summary`: authenticated AI smart-progress narrative with fallback support
- `GET /water-logs/today`: authenticated daily hydration summary and logs
- `GET /water-logs/history`: authenticated hydration trend data
- `POST /water-logs`: authenticated hydration log create
- `PATCH /water-logs/{log_id}`: authenticated hydration log update
- `DELETE /water-logs/{log_id}`: authenticated hydration log delete
- `PUT /water-logs/goal`: authenticated hydration goal update
- `POST /weight-logs`: authenticated weight log create
- `GET /weight-logs/history`: authenticated weight history + trend
- `GET /weight-summary`: authenticated weight summary metrics
- `PUT /weight-logs/goal`: authenticated weight goal update
- `GET /integrations`: authenticated list of provider states
- `POST /integrations/{provider}/connect`: start provider connect flow (Fitbit OAuth on web)
- `GET /integrations/{provider}/callback`: complete provider OAuth callback
- `POST /integrations/{provider}/sync`: fetch and normalize provider data
- `POST /integrations/{provider}/disconnect`: revoke/disconnect provider
- `GET /health-data/summary`: compact synced health snapshot for dashboard/coaching context
- `GET /health-data/activity`: normalized activity timeline
- `GET /health-data/body`: normalized body-metric timeline

## Input/output behavior highlights
- Analyze endpoint accepts:
  1. Multipart (`image`, optional `user_portion_description`)
  2. JSON (`image_base64` or `image_url`, optional `user_portion_description`)
- `AnalyzeImageJSONPayload` is strict (`extra="forbid"`).
- Meal create payloads are strict (`extra="forbid"` for top-level and item objects).
- Protected endpoints require `Authorization: Bearer <supabase_access_token>`.
- User-facing errors are sanitized (internal provider/runtime details are not surfaced directly).
- Food search requires `USDA_API_KEY`; barcode lookup uses OpenFoodFacts and supports `OPENFOODFACTS_USER_AGENT` override.
- Analytics summary generation uses OpenAI with strict JSON-schema validation and a sanitized deterministic fallback when AI is unavailable.
- Fitbit is the first fully implemented web provider; Apple Health, Google Fit, and Health Connect intentionally return native-required placeholders in web-only mode.

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
- **Barcode lookup failures**: verify outbound access to OpenFoodFacts and a valid `OPENFOODFACTS_USER_AGENT` value.
- **Summary/history empty unexpectedly**: confirm data exists for the authenticated user/date/timezone.
- **Frequent analytics summary fallback**: verify `OPENAI_API_KEY`, optional `OPENAI_ANALYTICS_MODEL`, and outbound access to OpenAI.
- **Integration connect fails immediately**: verify `FITBIT_CLIENT_ID`, `FITBIT_CLIENT_SECRET`, and `FITBIT_REDIRECT_URI` exactly match Fitbit app settings.
- **Token encryption errors**: set `HEALTH_TOKEN_ENCRYPTION_KEY` (16+ chars) or legacy `SUPABASE_ENCRYPTION_KEY`.
- **Native-only provider not connecting on web**: expected behavior for Apple Health/Google Fit/Health Connect until native app flows are added.
