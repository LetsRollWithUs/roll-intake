-- Tijdlijn + leadkwalificatie op het kaartje.
alter table public.bookings add column if not exists expected_purchase_at date;
alter table public.bookings add column if not exists toolkit_offered_at timestamptz;
-- Wie gaat schilderen: zelf / schilder / deels (leadkwalificatie).
alter table public.intake add column if not exists painter text;

create or replace function public.kanban_update(p_booking_id uuid, p_patch jsonb)
returns void language plpgsql security definer set search_path to 'public' as $function$
declare v_sid uuid;
begin
  select stylist_id into v_sid from public.bookings where id = p_booking_id;
  if v_sid is null and not exists (select 1 from public.bookings where id = p_booking_id) then
    raise exception 'boeking niet gevonden';
  end if;
  if not public.owns_stylist(v_sid) then raise exception 'geen toegang'; end if;
  if p_patch ? 'kanban_stage' and (p_patch->>'kanban_stage') not in ('ingepland','advies','opvolging','verf','afgehaakt') then
    raise exception 'ongeldige fase';
  end if;
  update public.bookings set
    kanban_stage         = coalesce(p_patch->>'kanban_stage', kanban_stage),
    samples_besteld      = coalesce((p_patch->>'samples_besteld')::boolean, samples_besteld),
    opgevolgd_at         = case when p_patch ? 'opgevolgd'
                             then (case when (p_patch->>'opgevolgd')::boolean then now() else null end)
                             else opgevolgd_at end,
    upsell_offered       = coalesce((p_patch->>'upsell_offered')::boolean, upsell_offered),
    upsell_booked        = coalesce((p_patch->>'upsell_booked')::boolean, upsell_booked),
    upsell_value         = case when p_patch ? 'upsell_value'
                             then nullif(p_patch->>'upsell_value','')::numeric else upsell_value end,
    expected_purchase_at = case when p_patch ? 'expected_purchase_at'
                             then nullif(p_patch->>'expected_purchase_at','')::date else expected_purchase_at end,
    toolkit_offered_at   = case when p_patch ? 'toolkit_offered'
                             then (case when (p_patch->>'toolkit_offered')::boolean then now() else null end)
                             else toolkit_offered_at end
  where id = p_booking_id;
end $function$;
