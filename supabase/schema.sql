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

drop trigger if exists meals_recalculate_daily_totals on public.meals;
create trigger meals_recalculate_daily_totals
after insert or update or delete on public.meals
for each row execute function public.handle_meals_daily_totals();

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();
