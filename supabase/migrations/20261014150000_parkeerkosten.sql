-- Parkeerkosten bij een thuisbezoek: de styliste vult het betaalde bedrag in; het telt mee in het maandoverzicht.
alter table public.thuis_visits add column if not exists parking numeric not null default 0;

drop function if exists public.thuis_outcome(uuid, text, text);
create or replace function public.thuis_outcome(p_booking_id uuid, p_outcome text, p_note text default null, p_parking numeric default 0) returns numeric
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_fee numeric; v_park numeric := round(coalesce(p_parking, 0)::numeric, 2);
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.format <> 'thuis' or b.stylist_id is null then raise exception 'thuisafspraak niet gevonden'; end if;
  if not (public.is_admin() or public.owns_stylist(b.stylist_id)) then raise exception 'geen toegang'; end if;
  if b.status <> 'confirmed' then raise exception 'er staat geen gepland bezoek'; end if;
  if v_park < 0 or v_park > 100 then raise exception 'Vul parkeerkosten in tussen 0 en 100 euro'; end if;
  v_fee := case p_outcome when 'uitgevoerd' then 75 when 'geannuleerd_ruim' then 0 when 'geannuleerd_kort' then 37.5 when 'dichte_deur' then 75 else null end;
  if v_fee is null then raise exception 'onbekende uitkomst'; end if;
  insert into thuis_visits (booking_id, stylist_id, planned_at, outcome, fee, parking, note, registered_by)
  values (b.id, b.stylist_id, b.start_at, p_outcome, v_fee, v_park, nullif(left(btrim(coalesce(p_note, '')), 500), ''), coalesce(auth.jwt() ->> 'email', ''));
  if p_outcome = 'uitgevoerd' then
    update bookings set gesprek_gevoerd_at = coalesce(gesprek_gevoerd_at, now()) where id = b.id;
  else
    update bookings set status = 'requested', start_at = now(), end_at = now() where id = b.id;
  end if;
  return v_fee;
end $$;
revoke all on function public.thuis_outcome(uuid, text, text, numeric) from public, anon;
grant execute on function public.thuis_outcome(uuid, text, text, numeric) to authenticated;

-- Parkeerkosten achteraf aanpassen (bijv. bonnetje later gevonden): styliste zelf of beheerder.
create or replace function public.thuis_visit_parking(p_visit_id uuid, p_parking numeric) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v record; v_park numeric := round(coalesce(p_parking, 0)::numeric, 2);
begin
  select * into v from thuis_visits where id = p_visit_id;
  if not found then raise exception 'bezoek niet gevonden'; end if;
  if not (public.is_admin() or public.owns_stylist(v.stylist_id)) then raise exception 'geen toegang'; end if;
  if v_park < 0 or v_park > 100 then raise exception 'Vul parkeerkosten in tussen 0 en 100 euro'; end if;
  update thuis_visits set parking = v_park where id = p_visit_id;
end $$;
revoke all on function public.thuis_visit_parking(uuid, numeric) from public, anon;
grant execute on function public.thuis_visit_parking(uuid, numeric) to authenticated;
