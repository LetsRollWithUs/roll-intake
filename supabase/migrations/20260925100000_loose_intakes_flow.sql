-- Losse intakes (ingevuld zonder afspraak) in de flow.
-- 1) Boekt de klant later met hetzelfde e-mailadres, dan koppelen we de intake automatisch.
-- 2) Beheer kan een losse intake handmatig in de flow zetten (status 'manual': niet betaald, geen afspraak).
-- 3) Beheer kan een losse intake aan een bestaande afspraak koppelen.

create or replace function public.link_loose_intake() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_id uuid;
begin
  if new.intake_id is null and new.status in ('confirmed', 'paid_unplaced') and coalesce(new.customer_email, '') <> '' then
    select i.id into v_id from intake i
     where i.status = 'verzonden' and i.booking_id is null
       and lower(i.contact_email) = lower(new.customer_email)
       and not exists (select 1 from bookings b where b.intake_id = i.id)
     order by i.created_at desc limit 1;
    if v_id is not null then
      update bookings set intake_id = v_id where id = new.id;
      update intake set booking_id = new.id where id = v_id;
    end if;
  end if;
  return null;
end $$;

drop trigger if exists trg_link_loose_intake on public.bookings;
create trigger trg_link_loose_intake after insert or update of status on public.bookings
  for each row execute function public.link_loose_intake();

-- Losse intake handmatig in de flow zetten: maakt een boeking zonder betaling en zonder afspraak.
create or replace function public.intake_to_flow(p_intake_id uuid, p_stage text default 'ingepland', p_stylist_id uuid default null)
returns uuid language plpgsql security definer set search_path to 'public' as $$
declare v_it record; v_id uuid;
begin
  if not is_admin() then raise exception 'Alleen voor beheer'; end if;
  if p_stage not in ('ingepland', 'advies', 'opvolging', 'verf', 'afgehaakt') then raise exception 'Onbekende fase'; end if;
  select id, contact_name, contact_email, booking_id into v_it from intake where id = p_intake_id;
  if not found then raise exception 'Intake niet gevonden'; end if;
  if v_it.booking_id is not null then return v_it.booking_id; end if;
  insert into bookings (status, start_at, end_at, customer_name, customer_email, intake_id, stylist_id, kanban_stage)
  values ('manual', now(), now(), v_it.contact_name, v_it.contact_email, p_intake_id, p_stylist_id, p_stage)
  returning id into v_id;
  update intake set booking_id = v_id where id = p_intake_id;
  return v_id;
end $$;

-- Losse intake aan een bestaande afspraak koppelen.
create or replace function public.link_intake_booking(p_intake_id uuid, p_booking_id uuid)
returns void language plpgsql security definer set search_path to 'public' as $$
begin
  if not is_admin() then raise exception 'Alleen voor beheer'; end if;
  update bookings set intake_id = p_intake_id where id = p_booking_id and intake_id is null;
  if not found then raise exception 'Afspraak niet gevonden of al gekoppeld'; end if;
  update intake set booking_id = p_booking_id where id = p_intake_id;
end $$;

grant execute on function public.intake_to_flow(uuid, text, uuid) to authenticated;
grant execute on function public.link_intake_booking(uuid, uuid) to authenticated;
