create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  email text,
  avatar_url text,
  gender text,
  age integer check (age is null or age > 0),
  height_cm numeric check (height_cm is null or height_cm > 0),
  weight_kg numeric check (weight_kg is null or weight_kg > 0),
  activity_level text check (
    activity_level is null
    or activity_level in ('sedentary', 'lightly_active', 'moderately_active', 'very_active', 'athlete')
  ),
  diet_preference text check (
    diet_preference is null
    or diet_preference in ('normal', 'vegetarian', 'vegan', 'halal', 'keto', 'high_protein')
  ),
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  goal_type text not null check (goal_type in ('lose_weight', 'maintain', 'gain_muscle')),
  goal_weight_kg numeric,
  daily_calorie_target integer,
  protein_target_g numeric,
  carbs_target_g numeric,
  fat_target_g numeric,
  fiber_target_g numeric,
  sugar_limit_g numeric,
  sodium_limit_mg numeric,
  water_target_ml integer,
  weekly_weight_goal_kg numeric,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_name text not null,
  meal_type text not null default 'unknown' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'drink', 'unknown')),
  image_url text,
  image_storage_path text,
  total_calories numeric not null default 0,
  total_protein_g numeric not null default 0,
  total_carbs_g numeric not null default 0,
  total_fat_g numeric not null default 0,
  total_fiber_g numeric not null default 0,
  total_sugar_g numeric not null default 0,
  total_sodium_mg numeric not null default 0,
  ai_confidence text not null default 'medium' check (ai_confidence in ('high', 'medium', 'low')),
  ai_accuracy_warning text,
  clarifying_question text,
  user_confirmed boolean not null default false,
  consumed_percentage numeric not null default 100 check (consumed_percentage >= 0 and consumed_percentage <= 100),
  eaten_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.meal_items (
  id uuid primary key default gen_random_uuid(),
  meal_id uuid not null references public.meals(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  category text,
  portion_description text,
  estimated_weight_g numeric,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  confidence text not null default 'medium' check (confidence in ('high', 'medium', 'low')),
  notes text,
  nutrition_source text not null default 'ai_estimate',
  usda_food_id text,
  usda_match_confidence numeric check (usda_match_confidence is null or (usda_match_confidence >= 0 and usda_match_confidence <= 1)),
  created_at timestamptz not null default now()
);

create table if not exists public.health_integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  provider_user_id text,
  status text not null default 'disconnected' check (
    status in (
      'disconnected',
      'connecting',
      'connected',
      'syncing',
      'sync_success',
      'sync_error',
      'permission_required',
      'native_required'
    )
  ),
  access_token_encrypted bytea,
  refresh_token_encrypted bytea,
  token_expires_at timestamptz,
  scopes text[] not null default '{}',
  connected_at timestamptz,
  last_synced_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table if not exists public.health_activity_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  source_record_id text not null,
  date date not null,
  steps integer not null default 0,
  active_calories numeric not null default 0,
  distance_meters numeric not null default 0,
  exercise_minutes integer not null default 0,
  workout_type text,
  started_at timestamptz,
  ended_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, source_record_id)
);

create table if not exists public.health_body_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  source_record_id text not null,
  weight numeric,
  body_fat_percentage numeric,
  unit text not null default 'kg' check (unit in ('kg', 'lb', 'percent')),
  recorded_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, source_record_id)
);

create table if not exists public.health_sleep_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  source_record_id text not null,
  sleep_duration_minutes integer not null default 0,
  started_at timestamptz,
  ended_at timestamptz,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, source_record_id)
);

create table if not exists public.health_heart_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  source_record_id text not null,
  resting_heart_rate_bpm integer not null default 0,
  recorded_at timestamptz not null,
  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider, source_record_id)
);

create table if not exists public.health_oauth_states (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null check (
    provider in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop')
  ),
  state_token text not null unique,
  code_verifier text,
  redirect_to text,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.daily_nutrition_totals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  water_ml integer not null default 0,
  meals_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists public.water_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  amount_ml integer not null,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.weight_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  weight_kg numeric not null,
  body_fat_percentage numeric,
  notes text,
  logged_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  date date not null,
  summary text,
  what_went_well text,
  needs_improvement text,
  next_meal_suggestion text,
  motivation text,
  remaining_calories numeric,
  remaining_protein_g numeric,
  remaining_carbs_g numeric,
  remaining_fat_g numeric,
  created_at timestamptz not null default now()
);

create table if not exists public.food_corrections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  meal_item_id uuid references public.meal_items(id) on delete set null,
  ai_predicted_name text,
  corrected_name text,
  ai_predicted_portion text,
  corrected_portion text,
  ai_predicted_calories numeric,
  corrected_calories numeric,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.favorite_meals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  meal_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.custom_foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  brand text,
  serving_size_g numeric,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.barcode_foods (
  id uuid primary key default gen_random_uuid(),
  barcode text unique not null,
  name text not null,
  brand text,
  serving_size_g numeric,
  calories numeric not null default 0,
  protein_g numeric not null default 0,
  carbs_g numeric not null default 0,
  fat_g numeric not null default 0,
  fiber_g numeric not null default 0,
  sugar_g numeric not null default 0,
  sodium_mg numeric not null default 0,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null,
  title text not null,
  body text,
  scheduled_for timestamptz,
  sent_at timestamptz,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_meals_user_id_eaten_at_desc on public.meals(user_id, eaten_at desc);
create index if not exists idx_meal_items_meal_id on public.meal_items(meal_id);
create index if not exists idx_daily_nutrition_totals_user_id_date on public.daily_nutrition_totals(user_id, date);
create index if not exists idx_water_logs_user_id_logged_at_desc on public.water_logs(user_id, logged_at desc);
create index if not exists idx_weight_logs_user_id_logged_at_desc on public.weight_logs(user_id, logged_at desc);
create index if not exists idx_health_integrations_user_id_provider on public.health_integrations(user_id, provider);
create index if not exists idx_health_activity_logs_user_id_date on public.health_activity_logs(user_id, date desc);
create index if not exists idx_health_body_logs_user_id_recorded_at on public.health_body_logs(user_id, recorded_at desc);
create index if not exists idx_health_sleep_logs_user_id_started_at on public.health_sleep_logs(user_id, started_at desc);
create index if not exists idx_health_heart_logs_user_id_recorded_at on public.health_heart_logs(user_id, recorded_at desc);
create index if not exists idx_health_oauth_states_user_id_provider on public.health_oauth_states(user_id, provider);
create index if not exists idx_health_oauth_states_state_token on public.health_oauth_states(state_token);
create index if not exists idx_ai_feedback_user_id_date on public.ai_feedback(user_id, date);
create index if not exists idx_food_corrections_user_id on public.food_corrections(user_id);
create index if not exists idx_favorite_meals_user_id on public.favorite_meals(user_id);
create index if not exists idx_custom_foods_user_id on public.custom_foods(user_id);
create index if not exists idx_notifications_user_id_scheduled_for on public.notifications(user_id, scheduled_for);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.recalculate_daily_nutrition_totals(p_user_id uuid, p_date date)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_calories numeric;
  v_protein numeric;
  v_carbs numeric;
  v_fat numeric;
  v_fiber numeric;
  v_sugar numeric;
  v_sodium numeric;
  v_meals_count integer;
begin
  select
    coalesce(sum(m.total_calories), 0),
    coalesce(sum(m.total_protein_g), 0),
    coalesce(sum(m.total_carbs_g), 0),
    coalesce(sum(m.total_fat_g), 0),
    coalesce(sum(m.total_fiber_g), 0),
    coalesce(sum(m.total_sugar_g), 0),
    coalesce(sum(m.total_sodium_mg), 0),
    count(*)::integer
  into
    v_calories,
    v_protein,
    v_carbs,
    v_fat,
    v_fiber,
    v_sugar,
    v_sodium,
    v_meals_count
  from public.meals m
  where m.user_id = p_user_id
    and m.eaten_at::date = p_date;

  insert into public.daily_nutrition_totals (
    user_id,
    date,
    calories,
    protein_g,
    carbs_g,
    fat_g,
    fiber_g,
    sugar_g,
    sodium_mg,
    meals_count
  )
  values (
    p_user_id,
    p_date,
    v_calories,
    v_protein,
    v_carbs,
    v_fat,
    v_fiber,
    v_sugar,
    v_sodium,
    v_meals_count
  )
  on conflict (user_id, date) do update
  set
    calories = excluded.calories,
    protein_g = excluded.protein_g,
    carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g,
    fiber_g = excluded.fiber_g,
    sugar_g = excluded.sugar_g,
    sodium_mg = excluded.sodium_mg,
    meals_count = excluded.meals_count,
    water_ml = public.daily_nutrition_totals.water_ml,
    updated_at = now();
end;
$$;

create or replace function public.handle_meals_daily_totals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.recalculate_daily_nutrition_totals(new.user_id, new.eaten_at::date);
    return new;
  elsif tg_op = 'UPDATE' then
    perform public.recalculate_daily_nutrition_totals(old.user_id, old.eaten_at::date);
    perform public.recalculate_daily_nutrition_totals(new.user_id, new.eaten_at::date);
    return new;
  elsif tg_op = 'DELETE' then
    perform public.recalculate_daily_nutrition_totals(old.user_id, old.eaten_at::date);
    return old;
  end if;
  return null;
end;
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists user_goals_set_updated_at on public.user_goals;
create trigger user_goals_set_updated_at
before update on public.user_goals
for each row execute function public.set_updated_at();

drop trigger if exists meals_set_updated_at on public.meals;
create trigger meals_set_updated_at
before update on public.meals
for each row execute function public.set_updated_at();

drop trigger if exists daily_nutrition_totals_set_updated_at on public.daily_nutrition_totals;
create trigger daily_nutrition_totals_set_updated_at
before update on public.daily_nutrition_totals
for each row execute function public.set_updated_at();

drop trigger if exists favorite_meals_set_updated_at on public.favorite_meals;
create trigger favorite_meals_set_updated_at
before update on public.favorite_meals
for each row execute function public.set_updated_at();

drop trigger if exists custom_foods_set_updated_at on public.custom_foods;
create trigger custom_foods_set_updated_at
before update on public.custom_foods
for each row execute function public.set_updated_at();

drop trigger if exists barcode_foods_set_updated_at on public.barcode_foods;
create trigger barcode_foods_set_updated_at
before update on public.barcode_foods
for each row execute function public.set_updated_at();

drop trigger if exists health_integrations_set_updated_at on public.health_integrations;
create trigger health_integrations_set_updated_at
before update on public.health_integrations
for each row execute function public.set_updated_at();

drop trigger if exists health_activity_logs_set_updated_at on public.health_activity_logs;
create trigger health_activity_logs_set_updated_at
before update on public.health_activity_logs
for each row execute function public.set_updated_at();

drop trigger if exists health_body_logs_set_updated_at on public.health_body_logs;
create trigger health_body_logs_set_updated_at
before update on public.health_body_logs
for each row execute function public.set_updated_at();

drop trigger if exists health_sleep_logs_set_updated_at on public.health_sleep_logs;
create trigger health_sleep_logs_set_updated_at
before update on public.health_sleep_logs
for each row execute function public.set_updated_at();

drop trigger if exists health_heart_logs_set_updated_at on public.health_heart_logs;
create trigger health_heart_logs_set_updated_at
before update on public.health_heart_logs
for each row execute function public.set_updated_at();

drop trigger if exists meals_recalculate_daily_totals on public.meals;
create trigger meals_recalculate_daily_totals
after insert or update or delete on public.meals
for each row execute function public.handle_meals_daily_totals();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table if exists public.meals
add column if not exists notes text;

drop function if exists public.create_meal_with_items(jsonb);
create or replace function public.create_meal_with_items(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_meal_id uuid;
  v_meal_name text;
  v_meal_type text;
  v_eaten_at timestamptz;
  v_notes text;
  v_items jsonb;
  v_item jsonb;
  v_item_name text;
  v_item_quantity text;
  v_item_source text;
  v_item_estimated_grams numeric;
  v_item_calories numeric;
  v_item_protein numeric;
  v_item_carbs numeric;
  v_item_fat numeric;
  v_item_confidence numeric;
  v_item_confidence_level text;
  v_total_calories numeric := 0;
  v_total_protein numeric := 0;
  v_total_carbs numeric := 0;
  v_total_fat numeric := 0;
  v_average_confidence numeric := 0;
  v_meal_confidence_level text := 'medium';
  v_item_count integer := 0;
  v_inserted_items jsonb := '[]'::jsonb;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Unauthorized: missing authenticated user.';
  end if;

  if payload is null then
    raise exception using
      errcode = '22023',
      message = 'Meal payload is required.';
  end if;

  v_meal_name := trim(coalesce(payload ->> 'meal_name', ''));
  if v_meal_name = '' then
    raise exception using
      errcode = '22023',
      message = 'meal_name is required.';
  end if;

  v_meal_type := lower(trim(coalesce(payload ->> 'meal_type', '')));
  if v_meal_type not in ('breakfast', 'lunch', 'dinner', 'snack') then
    raise exception using
      errcode = '22023',
      message = 'meal_type must be one of: breakfast, lunch, dinner, snack.';
  end if;

  begin
    v_eaten_at := coalesce((payload ->> 'eaten_at')::timestamptz, now());
  exception
    when others then
      raise exception using
        errcode = '22007',
        message = 'eaten_at must be a valid ISO datetime.';
  end;

  v_notes := nullif(trim(coalesce(payload ->> 'notes', '')), '');
  v_items := payload -> 'items';
  if jsonb_typeof(v_items) <> 'array' or jsonb_array_length(v_items) = 0 then
    raise exception using
      errcode = '22023',
      message = 'items must be a non-empty array.';
  end if;

  v_item_count := jsonb_array_length(v_items);

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_item_name := trim(coalesce(v_item ->> 'name', ''));
    if v_item_name = '' then
      raise exception using
        errcode = '22023',
        message = 'Each item requires a non-empty name.';
    end if;

    v_item_calories := greatest(coalesce((v_item ->> 'calories')::numeric, 0), 0);
    v_item_protein := greatest(coalesce((v_item ->> 'protein_g')::numeric, 0), 0);
    v_item_carbs := greatest(coalesce((v_item ->> 'carbs_g')::numeric, 0), 0);
    v_item_fat := greatest(coalesce((v_item ->> 'fat_g')::numeric, 0), 0);

    if (v_item ->> 'calories')::numeric < 0
      or (v_item ->> 'protein_g')::numeric < 0
      or (v_item ->> 'carbs_g')::numeric < 0
      or (v_item ->> 'fat_g')::numeric < 0 then
      raise exception using
        errcode = '22023',
        message = 'Item nutrition values cannot be negative.';
    end if;

    if v_item ? 'estimated_grams'
      and coalesce(trim(v_item ->> 'estimated_grams'), '') <> ''
      and (v_item ->> 'estimated_grams')::numeric <= 0 then
      raise exception using
        errcode = '22023',
        message = 'estimated_grams must be greater than 0 when provided.';
    end if;

    v_total_calories := v_total_calories + v_item_calories;
    v_total_protein := v_total_protein + v_item_protein;
    v_total_carbs := v_total_carbs + v_item_carbs;
    v_total_fat := v_total_fat + v_item_fat;

    v_average_confidence := v_average_confidence
      + greatest(least(coalesce((v_item ->> 'confidence')::numeric, 0), 1), 0);
  end loop;

  if v_item_count > 0 then
    v_average_confidence := v_average_confidence / v_item_count;
  end if;

  if v_average_confidence >= 0.75 then
    v_meal_confidence_level := 'high';
  elsif v_average_confidence <= 0.4 then
    v_meal_confidence_level := 'low';
  end if;

  insert into public.meals (
    user_id,
    meal_name,
    meal_type,
    notes,
    total_calories,
    total_protein_g,
    total_carbs_g,
    total_fat_g,
    ai_confidence,
    user_confirmed,
    eaten_at
  )
  values (
    v_user_id,
    v_meal_name,
    v_meal_type,
    v_notes,
    round(v_total_calories, 2),
    round(v_total_protein, 2),
    round(v_total_carbs, 2),
    round(v_total_fat, 2),
    v_meal_confidence_level,
    true,
    v_eaten_at
  )
  returning id into v_meal_id;

  for v_item in select value from jsonb_array_elements(v_items)
  loop
    v_item_name := trim(coalesce(v_item ->> 'name', ''));
    v_item_quantity := nullif(trim(coalesce(v_item ->> 'quantity_estimate', '')), '');
    v_item_source := lower(trim(coalesce(v_item ->> 'source', 'ai_estimate')));
    v_item_estimated_grams := nullif(trim(coalesce(v_item ->> 'estimated_grams', '')), '')::numeric;

    v_item_calories := round(greatest(coalesce((v_item ->> 'calories')::numeric, 0), 0), 2);
    v_item_protein := round(greatest(coalesce((v_item ->> 'protein_g')::numeric, 0), 0), 2);
    v_item_carbs := round(greatest(coalesce((v_item ->> 'carbs_g')::numeric, 0), 0), 2);
    v_item_fat := round(greatest(coalesce((v_item ->> 'fat_g')::numeric, 0), 0), 2);
    v_item_confidence := greatest(least(coalesce((v_item ->> 'confidence')::numeric, 0), 1), 0);

    v_item_confidence_level := 'medium';
    if v_item_confidence >= 0.75 then
      v_item_confidence_level := 'high';
    elsif v_item_confidence <= 0.4 then
      v_item_confidence_level := 'low';
    end if;

    insert into public.meal_items (
      meal_id,
      user_id,
      name,
      portion_description,
      estimated_weight_g,
      calories,
      protein_g,
      carbs_g,
      fat_g,
      confidence,
      nutrition_source,
      usda_match_confidence
    )
    values (
      v_meal_id,
      v_user_id,
      v_item_name,
      v_item_quantity,
      v_item_estimated_grams,
      v_item_calories,
      v_item_protein,
      v_item_carbs,
      v_item_fat,
      v_item_confidence_level,
      v_item_source,
      v_item_confidence
    );

    v_inserted_items := v_inserted_items || jsonb_build_array(
      jsonb_build_object(
        'name', v_item_name,
        'quantity_estimate', v_item_quantity,
        'estimated_grams', v_item_estimated_grams,
        'calories', v_item_calories,
        'protein_g', v_item_protein,
        'carbs_g', v_item_carbs,
        'fat_g', v_item_fat,
        'confidence', v_item_confidence,
        'source', v_item_source
      )
    );
  end loop;

  return jsonb_build_object(
    'success', true,
    'meal_id', v_meal_id,
    'meal', jsonb_build_object(
      'id', v_meal_id,
      'user_id', v_user_id,
      'meal_name', v_meal_name,
      'meal_type', v_meal_type,
      'eaten_at', v_eaten_at,
      'notes', v_notes
    ),
    'items', v_inserted_items,
    'totals', jsonb_build_object(
      'calories', round(v_total_calories, 2),
      'protein_g', round(v_total_protein, 2),
      'carbs_g', round(v_total_carbs, 2),
      'fat_g', round(v_total_fat, 2)
    )
  );
end;
$$;

grant execute on function public.create_meal_with_items(jsonb) to authenticated;

drop function if exists public.upsert_health_integration_tokens(
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text[],
  timestamptz,
  text,
  jsonb,
  text
);
create or replace function public.upsert_health_integration_tokens(
  p_provider text,
  p_status text default null,
  p_provider_user_id text default null,
  p_access_token text default null,
  p_refresh_token text default null,
  p_token_expires_at timestamptz default null,
  p_scopes text[] default null,
  p_connected_at timestamptz default null,
  p_last_error text default null,
  p_metadata jsonb default null,
  p_encryption_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.health_integrations%rowtype;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized: missing authenticated user.';
  end if;

  if p_provider not in ('fitbit', 'apple_health', 'google_fit', 'health_connect', 'garmin', 'oura', 'whoop') then
    raise exception using errcode = '22023', message = 'Unsupported integration provider.';
  end if;

  if coalesce(trim(p_encryption_key), '') = '' then
    raise exception using errcode = '22023', message = 'Encryption key is required.';
  end if;

  insert into public.health_integrations (
    user_id,
    provider,
    provider_user_id,
    status,
    access_token_encrypted,
    refresh_token_encrypted,
    token_expires_at,
    scopes,
    connected_at,
    last_error,
    metadata
  )
  values (
    v_user_id,
    p_provider,
    nullif(trim(coalesce(p_provider_user_id, '')), ''),
    coalesce(nullif(trim(coalesce(p_status, '')), ''), 'connected'),
    case
      when nullif(coalesce(p_access_token, ''), '') is null then null
      else pgp_sym_encrypt(p_access_token, p_encryption_key)
    end,
    case
      when nullif(coalesce(p_refresh_token, ''), '') is null then null
      else pgp_sym_encrypt(p_refresh_token, p_encryption_key)
    end,
    p_token_expires_at,
    coalesce(p_scopes, '{}'::text[]),
    coalesce(p_connected_at, now()),
    p_last_error,
    coalesce(p_metadata, '{}'::jsonb)
  )
  on conflict (user_id, provider) do update
  set
    provider_user_id = coalesce(
      nullif(trim(coalesce(p_provider_user_id, '')), ''),
      public.health_integrations.provider_user_id
    ),
    status = coalesce(nullif(trim(coalesce(p_status, '')), ''), public.health_integrations.status),
    access_token_encrypted = case
      when nullif(coalesce(p_access_token, ''), '') is null then public.health_integrations.access_token_encrypted
      else pgp_sym_encrypt(p_access_token, p_encryption_key)
    end,
    refresh_token_encrypted = case
      when nullif(coalesce(p_refresh_token, ''), '') is null then public.health_integrations.refresh_token_encrypted
      else pgp_sym_encrypt(p_refresh_token, p_encryption_key)
    end,
    token_expires_at = coalesce(p_token_expires_at, public.health_integrations.token_expires_at),
    scopes = coalesce(p_scopes, public.health_integrations.scopes),
    connected_at = coalesce(p_connected_at, public.health_integrations.connected_at, now()),
    last_error = coalesce(p_last_error, public.health_integrations.last_error),
    metadata = coalesce(p_metadata, public.health_integrations.metadata),
    updated_at = now()
  returning * into v_row;

  return jsonb_build_object(
    'id', v_row.id,
    'provider', v_row.provider,
    'provider_user_id', v_row.provider_user_id,
    'status', v_row.status,
    'scopes', v_row.scopes,
    'token_expires_at', v_row.token_expires_at,
    'connected_at', v_row.connected_at,
    'last_synced_at', v_row.last_synced_at,
    'last_error', v_row.last_error,
    'metadata', v_row.metadata,
    'created_at', v_row.created_at,
    'updated_at', v_row.updated_at
  );
end;
$$;

drop function if exists public.get_health_integration_tokens(text, text);
create or replace function public.get_health_integration_tokens(
  p_provider text,
  p_encryption_key text
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid;
  v_row public.health_integrations%rowtype;
  v_access_token text;
  v_refresh_token text;
begin
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Unauthorized: missing authenticated user.';
  end if;

  if coalesce(trim(p_encryption_key), '') = '' then
    raise exception using errcode = '22023', message = 'Encryption key is required.';
  end if;

  select *
  into v_row
  from public.health_integrations
  where user_id = v_user_id
    and provider = p_provider
  limit 1;

  if not found then
    return jsonb_build_object('found', false);
  end if;

  v_access_token := case
    when v_row.access_token_encrypted is null then null
    else pgp_sym_decrypt(v_row.access_token_encrypted, p_encryption_key)
  end;
  v_refresh_token := case
    when v_row.refresh_token_encrypted is null then null
    else pgp_sym_decrypt(v_row.refresh_token_encrypted, p_encryption_key)
  end;

  return jsonb_build_object(
    'found', true,
    'provider', v_row.provider,
    'status', v_row.status,
    'access_token', v_access_token,
    'refresh_token', v_refresh_token,
    'token_expires_at', v_row.token_expires_at,
    'scopes', v_row.scopes,
    'connected_at', v_row.connected_at,
    'last_synced_at', v_row.last_synced_at,
    'last_error', v_row.last_error,
    'metadata', v_row.metadata
  );
end;
$$;

grant execute on function public.upsert_health_integration_tokens(
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  text[],
  timestamptz,
  text,
  jsonb,
  text
) to authenticated;
grant execute on function public.get_health_integration_tokens(text, text) to authenticated;
