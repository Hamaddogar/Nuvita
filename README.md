# Nuvita Monorepo
Nuvita is a mobile-first AI nutrition tracking app with a Next.js frontend, FastAPI backend, and Supabase persistence.

## Monorepo structure
- `apps/web`: Next.js app (auth, onboarding, dashboard, scan, history, insights, profile)
- `apps/api`: FastAPI service (`/analyze-image`, `/foods/*`, `/meals`, `/daily-summary`, `/meal-history`, `/ai-insights/*`)
- `packages/shared`: shared TypeScript domain types and goal-calculation utilities
- `supabase`: SQL schema, RLS policies, and setup notes
- `docs`: additional planning/architecture notes

## Prerequisites
- Node.js 20+
- npm 10+
- Python 3.10+
- Supabase project (URL + anon key)
- OpenAI API key
- USDA API key (recommended for stronger nutrition lookup enrichment)
- OpenFoodFacts user agent string (recommended for barcode lookup requests)

## Environment setup
### Frontend (`apps/web/.env.local`)
1. Copy `apps/web/.env.example` to `apps/web/.env.local`.
2. Set:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `FASTAPI_URL` (example: `http://localhost:8000`)
   - Optional fallback routing:
     - `NEXT_PUBLIC_FASTAPI_URL`
     - `FASTAPI_FALLBACK_URL`

### Backend (`apps/api/.env`)
1. Copy `apps/api/.env.example` to `apps/api/.env`.
2. Set:
   - `OPENAI_API_KEY`
   - `USDA_API_KEY`
   - `OPENFOODFACTS_USER_AGENT` (recommended, identifies your app to OpenFoodFacts)
   - Optional barcode lookup base URL override: `OPENFOODFACTS_BASE_URL`
   - `OPENAI_VISION_MODEL` (default is fine)
   - `OPENAI_INSIGHTS_MODEL` (default is fine)
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - Optional operational key: `SUPABASE_SERVICE_ROLE_KEY`

### Supabase SQL setup
Follow `supabase/README.md` run order:
1. `supabase/schema.sql`
2. `supabase/rls-policies.sql`
3. Optional seed: `supabase/seed.sql`

## Run locally
1. Install JS dependencies:
   - `npm install`
2. Install Python dependencies:
   - `python -m pip install -r apps/api/requirements.txt`
3. Start API:
   - `npm run dev:api`
4. Start web app:
   - `npm run dev:web`

## Quality checks and tests
- API import sanity: `npm run check:api`
- Web lint: `npm run lint:web`
- Web build: `npm run build:web`
- Frontend tests: `npm run test:web`
- Backend tests: `npm run test:api`

## Security and reliability notes
- Protected API routes require Bearer auth and user ownership checks.
- Supabase RLS policies enforce row ownership (`auth.uid()`-scoped access).
- Meal create payloads and analyze-image JSON payloads reject unknown extra fields.
- User-facing error messages are intentionally sanitized to avoid leaking internal provider/runtime details.
- AI insights and dashboard paths include fallback behavior for degraded backend/AI conditions.

## Production deployment checklist
1. Apply Supabase schema + RLS SQL in the target environment.
2. Configure all required frontend/backend environment variables.
3. Deploy backend and verify:
   - `GET /health` is healthy
   - auth-required routes return 401 without token
4. Deploy frontend and verify auth flow (signup/login/onboarding redirect).
5. Run full quality checks:
   - `npm run lint:web`
   - `npm run build:web`
   - `npm run check:api`
   - `npm run test:web`
   - `npm run test:api`

## Troubleshooting
- **401 from app routes**: session expired or missing auth token; sign in again and confirm Supabase keys are correct.
- **`/analyze-image` fails immediately**: verify API env vars and ensure uploaded file is valid image type/size.
- **Barcode lookup not finding products**: verify connectivity to OpenFoodFacts and set a valid `OPENFOODFACTS_USER_AGENT`.
- **Meal save unavailable**: verify Supabase schema/RPC migration is applied and API can reach Supabase.
- **Insights fallback appears frequently**: verify `OPENAI_API_KEY`, `OPENAI_INSIGHTS_MODEL`, and backend connectivity.
- **No dashboard/history data**: confirm onboarding completed and meals were saved under same authenticated user.

## Manual QA checklist
1. Signup/login/logout works and protected routes redirect correctly.
2. Onboarding completes and writes profile + latest user goals.
3. Scan flow:
   - image upload works
   - analysis returns detected foods
   - barcode scan/manual barcode lookup resolves product with nutrition
   - manual food search shows live results and quick-add works
   - favorites and recents quick-add paths work
   - meal confirm/edit/save succeeds
4. Dashboard:
   - loading, empty, success, and error states render cleanly
5. History:
   - date navigation works
   - empty day and populated day states render
   - meal detail sheet opens and closes correctly
6. Insights:
   - loading state renders
   - error/fallback states render friendly messaging
   - populated coaching cards render
7. Profile renders and logout works.
