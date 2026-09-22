-- Sample-advies en verf-advies uit elkaar: elk een eigen bundel op de intake.
-- Bundel: {answer, rooms:[{room,surface,color,status,product,m2,liters,motivation}],
--          sample_instruction, next_step, internal, plan:{what,who,when}, route, products:[{kind,ref,name}]}
alter table public.intake add column if not exists advice_sample jsonb;
alter table public.intake add column if not exists advice_verf jsonb;

-- Bestaand advies overzetten naar de juiste fase op basis van de eerder gekozen route.
update public.intake set advice_sample = jsonb_build_object(
    'answer', coalesce(advice_client->>'answer', advisor_summary, ''),
    'rooms', coalesce(advice_client->'rooms', '[]'::jsonb),
    'sample_instruction', coalesce(advice_client->>'sample_instruction',''),
    'next_step', coalesce(advice_client->>'next_step',''),
    'internal', coalesce(advice_internal,''),
    'plan', coalesce(followup_plan, '{}'::jsonb),
    'route', 'samples',
    'products', coalesce(advice_products, '[]'::jsonb))
  where advice_sample is null and (followup_route = 'samples' or (followup_route is null and advice_client is not null));

update public.intake set advice_verf = jsonb_build_object(
    'answer', coalesce(advice_client->>'answer', advisor_summary, ''),
    'rooms', coalesce(advice_client->'rooms', '[]'::jsonb),
    'sample_instruction', '',
    'next_step', coalesce(advice_client->>'next_step',''),
    'internal', coalesce(advice_internal,''),
    'plan', coalesce(followup_plan, '{}'::jsonb),
    'route', coalesce(followup_route, 'zelf'),
    'products', '[]'::jsonb)
  where advice_verf is null and followup_route in ('zelf','roll');
