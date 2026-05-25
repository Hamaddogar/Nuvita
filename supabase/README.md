# Supabase Setup
This folder contains the SQL for the Version 1 backend foundation:
- `schema.sql`: tables, constraints, indexes, functions, and triggers
- `rls-policies.sql`: row-level security setup and policies
- `seed.sql`: optional sample data for a test user

## Run order in Supabase SQL Editor
1. Run `supabase/schema.sql`
2. Run `supabase/rls-policies.sql`
3. (Optional) Run `supabase/seed.sql` after creating a test auth user

## Storage bucket setup (`meal-images`)
Create a Supabase Storage bucket:
- Bucket name: `meal-images`
- Visibility: **Private** (recommended)

Recommended object path convention:
- `users/<auth.uid()>/meals/<filename>`

Recommended storage policy behavior:
- Authenticated users can upload to paths that start with their own `auth.uid()`
- Authenticated users can read/list only files under their own path
- Service role can manage all files

## Required environment variables
For frontend (`apps/web/.env.local`):
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `FASTAPI_URL`
- Fitbit callback route must be configured in Fitbit app settings:
  - `http://localhost:3000/api/integrations/fitbit/callback` (local example)

For backend (`apps/api/.env`):
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` (optional but recommended for operations/migrations)
- `HEALTH_TOKEN_ENCRYPTION_KEY` (16+ chars for encrypted wearable token storage)
- `FITBIT_CLIENT_ID`
- `FITBIT_CLIENT_SECRET`
- `FITBIT_REDIRECT_URI`
- `OPENAI_API_KEY`
- `USDA_API_KEY`
- Legacy compatibility aliases accepted by API services:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `SUPABASE_ENCRYPTION_KEY`

## RLS notes
- RLS is enabled on all user-owned tables.
- Policies enforce `auth.uid() = user_id` (or `id` for `profiles`) for user data access.
- `barcode_foods` is readable by authenticated users.
- `barcode_foods` writes are restricted to service-role contexts.

## Daily totals trigger notes
- Meal writes (`insert`, `update`, `delete`) trigger recalculation of `daily_nutrition_totals`.
- Recalculation aggregates meal totals per user/date and updates:
  - calories/macros/fiber/sugar/sodium
  - `meals_count`
- Existing `water_ml` is preserved during recalculation updates.
