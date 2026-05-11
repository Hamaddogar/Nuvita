# Architecture
This project uses a monorepo with a clear split between frontend, backend, shared domain types, and infrastructure setup placeholders.

## Components
- `apps/web`: Next.js app for authentication, onboarding, scan flow, dashboard, and PWA shell.
- `apps/api`: FastAPI service for AI image analysis and nutrition processing.
- `packages/shared`: shared TypeScript domain types used by the frontend and future API clients.
- `supabase`: SQL and setup notes for database, auth, and storage.

## Data flow (planned)
1. User scans/uploads a food image in `apps/web`.
2. Frontend sends payload to `apps/api` `/analyze-image`.
3. API calls OpenAI Vision + USDA APIs and returns structured nutrition output.
4. Frontend lets user confirm portion and saves meal to Supabase.
5. Dashboard aggregates daily progress and AI coach feedback.
