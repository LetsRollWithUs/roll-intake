-- Kanban "Gesprekken": fase + badges per boeking (gesprek).
alter table public.bookings add column if not exists kanban_stage text not null default 'ingepland';
alter table public.bookings add column if not exists samples_besteld boolean not null default false;
alter table public.bookings add column if not exists opgevolgd_at timestamptz;
alter table public.bookings add column if not exists upsell_offered boolean not null default false;
alter table public.bookings add column if not exists upsell_booked boolean not null default false;
alter table public.bookings add column if not exists upsell_value numeric;

-- Startpositie voor bestaande boekingen: gesprek gehad -> 'advies', anders 'ingepland'.
update public.bookings
  set kanban_stage = 'advies'
  where status in ('confirmed','paid_unplaced') and start_at < now() and kanban_stage = 'ingepland';

-- Styliste (of beheerder) mag alleen de kanban-velden van haar eigen boeking wijzigen.
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
    kanban_stage    = coalesce(p_patch->>'kanban_stage', kanban_stage),
    samples_besteld = coalesce((p_patch->>'samples_besteld')::boolean, samples_besteld),
    opgevolgd_at    = case when p_patch ? 'opgevolgd'
                        then (case when (p_patch->>'opgevolgd')::boolean then now() else null end)
                        else opgevolgd_at end,
    upsell_offered  = coalesce((p_patch->>'upsell_offered')::boolean, upsell_offered),
    upsell_booked   = coalesce((p_patch->>'upsell_booked')::boolean, upsell_booked),
    upsell_value    = case when p_patch ? 'upsell_value'
                        then nullif(p_patch->>'upsell_value','')::numeric else upsell_value end
  where id = p_booking_id;
end $function$;

grant execute on function public.kanban_update(uuid, jsonb) to authenticated;
