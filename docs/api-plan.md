# API Plan
## FastAPI endpoints (initial)
- `GET /health`
  - Purpose: uptime and service check.
- `POST /analyze-image`
  - Purpose: placeholder for AI image-to-nutrition analysis.

## Future endpoints
- `POST /coach-feedback`
- `POST /save-meal`
- `GET /daily-summary`
- `GET /meal-history`

## Integration notes
- OpenAI Vision will return structured JSON nutrition estimates.
- USDA FoodData Central will refine nutrition references.
- Supabase tables will persist user profiles, goals, meals, and daily totals.
