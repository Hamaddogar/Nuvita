alter table public.profiles enable row level security;
alter table public.user_goals enable row level security;
alter table public.meals enable row level security;
alter table public.meal_items enable row level security;
alter table public.daily_nutrition_totals enable row level security;
alter table public.water_logs enable row level security;
alter table public.weight_logs enable row level security;
alter table public.ai_feedback enable row level security;
alter table public.food_corrections enable row level security;
alter table public.favorite_meals enable row level security;
alter table public.custom_foods enable row level security;
alter table public.barcode_foods enable row level security;
alter table public.notifications enable row level security;

drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles
for insert with check (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id) with check (auth.uid() = id);

drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
for delete using (auth.uid() = id);

drop policy if exists "user_goals_all_own" on public.user_goals;
create policy "user_goals_all_own" on public.user_goals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meals_all_own" on public.meals;
create policy "meals_all_own" on public.meals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "meal_items_all_own" on public.meal_items;
create policy "meal_items_all_own" on public.meal_items
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "daily_nutrition_totals_all_own" on public.daily_nutrition_totals;
create policy "daily_nutrition_totals_all_own" on public.daily_nutrition_totals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "water_logs_all_own" on public.water_logs;
create policy "water_logs_all_own" on public.water_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "weight_logs_all_own" on public.weight_logs;
create policy "weight_logs_all_own" on public.weight_logs
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "ai_feedback_all_own" on public.ai_feedback;
create policy "ai_feedback_all_own" on public.ai_feedback
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "food_corrections_all_own" on public.food_corrections;
create policy "food_corrections_all_own" on public.food_corrections
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "favorite_meals_all_own" on public.favorite_meals;
create policy "favorite_meals_all_own" on public.favorite_meals
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "custom_foods_all_own" on public.custom_foods;
create policy "custom_foods_all_own" on public.custom_foods
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "notifications_all_own" on public.notifications;
create policy "notifications_all_own" on public.notifications
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "barcode_foods_select_authenticated" on public.barcode_foods;
create policy "barcode_foods_select_authenticated" on public.barcode_foods
for select using (auth.role() = 'authenticated');

drop policy if exists "barcode_foods_service_role_write" on public.barcode_foods;
create policy "barcode_foods_service_role_write" on public.barcode_foods
for all using ((auth.jwt() ->> 'role') = 'service_role')
with check ((auth.jwt() ->> 'role') = 'service_role');
