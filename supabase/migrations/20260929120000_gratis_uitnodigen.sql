-- Styliste koppelen (beheerder) en een klant gratis uitnodigen voor een moment (beheerder of styliste).
alter table public.bookings add column if not exists gratis boolean not null default false;

-- Vrije plekken van één styliste uit haar rooster, zonder de 48-uursregel (vanaf over een uur).
create or replace function public.stylist_free_slots(p_stylist_id uuid, p_from date, p_to date, p_service_key text default 'pre_sample')
returns table(start_at timestamptz) language plpgsql stable security definer set search_path to 'public' as $$
declare v_dur int; v_tz text := 'Europe/Amsterdam'; d date; iv record; t time; ts timestamptz; te timestamptz;
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  select duration_min into v_dur from services where key = p_service_key and active;
  if v_dur is null then return; end if;
  d := p_from;
  while d <= p_to loop
    for iv in select * from public.stylist_day_intervals(p_stylist_id, d) loop
      t := iv.start_time;
      while (t + make_interval(mins => v_dur)) <= iv.end_time loop
        ts := (d + t) at time zone v_tz; te := ts + make_interval(mins => v_dur);
        if ts >= now() + interval '1 hour'
          and not exists (select 1 from bookings b where b.stylist_id = p_stylist_id and b.status in ('held','pending_payment','confirmed') and tstzrange(b.start_at, b.end_at) && tstzrange(ts, te))
          and not exists (select 1 from busy_blocks bb where bb.stylist_id = p_stylist_id and tstzrange(bb.start_at, bb.end_at) && tstzrange(ts, te))
        then start_at := ts; return next; end if;
        t := t + make_interval(mins => v_dur);
      end loop;
    end loop;
    d := d + 1;
  end loop;
end $$;

-- Beheerder koppelt een klant aan een styliste. Staat er al een afspraak in de toekomst, dan via overdragen.
create or replace function public.booking_set_stylist(p_booking_id uuid, p_stylist_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare b record;
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  select status, start_at into b from bookings where id = p_booking_id;
  if not found then raise exception 'afspraak niet gevonden'; end if;
  if b.status = 'confirmed' and b.start_at > now() then perform public.reassign_booking(p_booking_id, p_stylist_id);
  else update bookings set stylist_id = p_stylist_id where id = p_booking_id; end if;
end $$;

-- Een moment plannen voor een klant zonder afspraak (gratis advies, of betaald maar nog niet ingepland).
create or replace function public.plan_moment(p_booking_id uuid, p_stylist_id uuid, p_start timestamptz, p_service_key text default 'pre_sample') returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_dur int; v_sid uuid;
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'afspraak niet gevonden'; end if;
  if b.stylist_id is not null and not public.owns_stylist(b.stylist_id) then raise exception 'deze klant hoort bij een andere styliste'; end if;
  if b.status not in ('manual', 'paid_unplaced') then raise exception 'deze klant heeft al een afspraak; verzet die via Boekingen'; end if;
  select id, duration_min into v_sid, v_dur from services where key = p_service_key and active;
  if v_dur is null then raise exception 'onbekende dienst'; end if;
  if p_start < now() then raise exception 'kies een moment in de toekomst'; end if;
  update bookings set stylist_id = p_stylist_id, service_id = v_sid, start_at = p_start, end_at = p_start + make_interval(mins => v_dur),
    status = 'confirmed', confirmed_at = now(), gratis = (b.status = 'manual') where id = p_booking_id;
  return p_booking_id;
exception when exclusion_violation or unique_violation then
  raise exception 'Dit moment is al bezet bij deze styliste. Kies een ander moment.';
end $$;

-- Nieuwe klant (via via of gratis) direct uitnodigen voor een moment.
create or replace function public.invite_customer(p_name text, p_email text, p_phone text, p_stylist_id uuid, p_start timestamptz, p_service_key text default 'pre_sample') returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_dur int; v_sid uuid; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Vul een geldig e-mailadres in'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Vul de naam van de klant in'; end if;
  select id, duration_min into v_sid, v_dur from services where key = p_service_key and active;
  if v_dur is null then raise exception 'onbekende dienst'; end if;
  if p_start < now() then raise exception 'kies een moment in de toekomst'; end if;
  insert into bookings (service_id, stylist_id, start_at, end_at, status, customer_name, customer_email, customer_phone, confirmed_at, gratis, kanban_stage)
  values (v_sid, p_stylist_id, p_start, p_start + make_interval(mins => v_dur), 'confirmed', left(btrim(p_name), 120), v_email, nullif(btrim(coalesce(p_phone, '')), ''), now(), true, 'ingepland')
  returning id into v_id;
  return v_id;
exception when exclusion_violation or unique_violation then
  raise exception 'Dit moment is al bezet bij deze styliste. Kies een ander moment.';
end $$;

revoke all on function public.stylist_free_slots(uuid, date, date, text) from public, anon;
revoke all on function public.booking_set_stylist(uuid, uuid) from public, anon;
revoke all on function public.plan_moment(uuid, uuid, timestamptz, text) from public, anon;
revoke all on function public.invite_customer(text, text, text, uuid, timestamptz, text) from public, anon;
grant execute on function public.stylist_free_slots(uuid, date, date, text) to authenticated;
grant execute on function public.booking_set_stylist(uuid, uuid) to authenticated;
grant execute on function public.plan_moment(uuid, uuid, timestamptz, text) to authenticated;
grant execute on function public.invite_customer(text, text, text, uuid, timestamptz, text) to authenticated;
