-- Seed data for local/dev testing.
-- Replace v_user_id with a real test user ID from auth.users before running.
-- If the user does not exist in auth.users, this seed script exits without inserting rows.

do $$
declare
  v_user_id uuid := '11111111-1111-1111-1111-111111111111';
  v_meal_id uuid := gen_random_uuid();
  v_meal_item_id uuid := gen_random_uuid();
begin
  if not exists (select 1 from auth.users where id = v_user_id) then
    raise notice 'Seed skipped: replace v_user_id with an existing auth.users.id.';
    return;
  end if;

  insert into public.profiles (
    id, full_name, email, gender, age, height_cm, weight_kg, activity_level, diet_preference, onboarding_completed
  )
  values (
    v_user_id, 'Test User', 'test@example.com', 'unspecified', 28, 175, 78, 'moderately_active', 'high_protein', true
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    email = excluded.email,
    updated_at = now();

  insert into public.user_goals (
    user_id, goal_type, goal_weight_kg, daily_calorie_target, protein_target_g, carbs_target_g, fat_target_g, fiber_target_g, sugar_limit_g, sodium_limit_mg, water_target_ml, weekly_weight_goal_kg
  )
  values (
    v_user_id, 'lose_weight', 73, 2200, 160, 210, 70, 30, 50, 2300, 3000, -0.4
  );

  insert into public.meals (
    id, user_id, meal_name, meal_type, image_url, image_storage_path, total_calories, total_protein_g, total_carbs_g, total_fat_g, total_fiber_g, total_sugar_g, total_sodium_mg, ai_confidence, user_confirmed, consumed_percentage, eaten_at
  )
  values (
    v_meal_id,
    v_user_id,
    'Chicken Rice Bowl',
    'lunch',
    'https://example.com/meal.jpg',
    'users/' || v_user_id::text || '/meals/chicken-rice-bowl.jpg',
    640,
    48,
    62,
    21,
    8,
    6,
    880,
    'high',
    true,
    100,
    now() - interval '1 hour'
  );

  insert into public.meal_items (
    id, meal_id, user_id, name, category, portion_description, estimated_weight_g, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, confidence, nutrition_source, usda_food_id, usda_match_confidence
  )
  values (
    v_meal_item_id,
    v_meal_id,
    v_user_id,
    'Grilled Chicken Breast',
    'protein',
    '1 medium fillet',
    170,
    280,
    43,
    0,
    8,
    0,
    0,
    520,
    'high',
    'ai_estimate',
    '171077',
    0.92
  );

  insert into public.water_logs (user_id, amount_ml, logged_at)
  values
    (v_user_id, 500, now() - interval '4 hours'),
    (v_user_id, 350, now() - interval '2 hours');

  insert into public.weight_logs (user_id, weight_kg, body_fat_percentage, notes, logged_at)
  values
    (v_user_id, 78.0, 18.5, 'Morning weigh-in', current_date - interval '1 day'),
    (v_user_id, 77.8, 18.3, 'Good hydration day', current_date);

  insert into public.ai_feedback (
    user_id, date, summary, what_went_well, needs_improvement, next_meal_suggestion, motivation, remaining_calories, remaining_protein_g, remaining_carbs_g, remaining_fat_g
  )
  values (
    v_user_id,
    current_date,
    'Great protein intake so far. Stay consistent for dinner.',
    'You hit over 60% of your protein target before dinner.',
    'Fiber is a bit low today.',
    'Try a salmon salad with mixed greens and chickpeas.',
    'Small consistent wins build lasting results.',
    980,
    58,
    96,
    35
  );

  insert into public.food_corrections (
    user_id, meal_item_id, ai_predicted_name, corrected_name, ai_predicted_portion, corrected_portion, ai_predicted_calories, corrected_calories, notes
  )
  values (
    v_user_id,
    v_meal_item_id,
    'Chicken thigh',
    'Chicken breast',
    '200g',
    '170g',
    340,
    280,
    'User corrected cut and weight.'
  );

  insert into public.favorite_meals (user_id, name, meal_snapshot)
  values (
    v_user_id,
    'Chicken Rice Bowl',
    jsonb_build_object(
      'meal_name', 'Chicken Rice Bowl',
      'meal_type', 'lunch',
      'totals', jsonb_build_object('calories', 640, 'protein_g', 48, 'carbs_g', 62, 'fat_g', 21)
    )
  );

  insert into public.custom_foods (
    user_id, name, brand, serving_size_g, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg
  )
  values (
    v_user_id, 'Homemade Protein Oats', 'Home', 250, 420, 32, 45, 12, 7, 6, 260
  );

  insert into public.barcode_foods (
    barcode, name, brand, serving_size_g, calories, protein_g, carbs_g, fat_g, fiber_g, sugar_g, sodium_mg, source
  )
  values (
    '0123456789012', 'Greek Yogurt Plain', 'Sample Brand', 170, 120, 17, 6, 2, 0, 5, 65, 'seed'
  )
  on conflict (barcode) do nothing;

  insert into public.notifications (user_id, type, title, body, scheduled_for)
  values (
    v_user_id,
    'meal_reminder',
    'Log your dinner',
    'You still have calories and protein remaining for today.',
    now() + interval '2 hours'
  );
end
$$;
