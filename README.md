# AI Diet Monorepo
Monorepo foundation for a premium AI calorie tracking app.

## Structure
- `apps/web`: Next.js frontend (mobile-first, PWA-ready)
- `apps/api`: FastAPI backend placeholders
- `packages/shared`: Shared TypeScript types
- `supabase`: Placeholder SQL schema + docs
- `docs`: Architecture and planning docs

## Quick start
1. Install root dependencies:
   - `npm install`
2. Install backend dependencies:
   - `python -m pip install -r apps/api/requirements.txt`
3. Start frontend:
   - `npm run dev:web`
4. Start backend:
   - `npm run dev:api`

## Web auth and onboarding setup
Frontend auth requires `apps/web/.env.local`:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FASTAPI_URL`

The web app now includes:
- Supabase email/password signup and login pages
- Protected route middleware for app pages
- Onboarding redirect logic based on `profiles.onboarding_completed`

## Onboarding flow
`/onboarding` contains a 5-step flow:
1. Personal info
2. Activity level
3. Goal setup
4. Diet preference
5. Target review

On completion it:
- Updates `profiles` (including `onboarding_completed = true`)
- Inserts or updates latest `user_goals`
- Redirects to `/dashboard`

## Goal calculation model
Goal calculations are implemented in `packages/shared/src/utils/goal-calculations.ts`:
- BMR: Mifflin-St Jeor
- TDEE: BMR × activity multiplier
- Calorie adjustment:
  - lose: `-500`
  - maintain: `0`
  - gain muscle: `+300`
- Minimum calorie floors by sex
- Protein/fat/carbs/fiber/sugar/sodium/water targets
