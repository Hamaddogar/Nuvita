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

select pg_notify('pgrst', 'reload schema');
