-- Onderdelen per ruimte: wanden (één of meer kleuren), plafond en houtwerk (lak met glans), elk met eigen kleur en
-- oppervlak. De oude kolommen (kleur_id, test_kleuren, plafond_*) blijven gesynchroniseerd met de eerste wand en het plafond.
alter table public.mh_ruimtes add column if not exists onderdelen jsonb;
update public.mh_ruimtes set onderdelen =
  jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', substr(md5(id::text || 'w'), 1, 8), 'soort', 'wand', 'kleur_id', kleur_id, 'test_kleuren', to_jsonb(test_kleuren))))
  || case when plafond_mee then jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id', substr(md5(id::text || 'p'), 1, 8), 'soort', 'plafond', 'kleur_id', plafond_kleur_id, 'm2', plafond_m2, 'test_kleuren', '[]'::jsonb))) else '[]'::jsonb end
where onderdelen is null;
