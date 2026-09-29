-- Uitnodigen met "klant kiest zelf": een gratis boeking zonder moment (status 'manual') met een vaste
-- styliste. De klant kiest via /boek/beheer?token= een vrij moment uit het rooster van die styliste.
alter table public.bookings add column if not exists invited_at timestamptz;

-- Vrije plekken van één styliste, met een eigen minimale aanlooptijd. Intern: geen eigen grant.
create or replace function public._stylist_slots(p_stylist_id uuid, p_from date, p_to date, p_service_key text, p_lead interval)
returns table(start_at timestamptz) language plpgsql stable security definer set search_path to 'public' as $$
declare v_dur int; v_tz text := 'Europe/Amsterdam'; d date; iv record; t time; ts timestamptz; te timestamptz;
begin
  select duration_min into v_dur from services where key = p_service_key and active;
  if v_dur is null then return; end if;
  d := p_from;
  while d <= p_to loop
    for iv in select * from public.stylist_day_intervals(p_stylist_id, d) loop
      t := iv.start_time;
      while (t + make_interval(mins => v_dur)) <= iv.end_time loop
        ts := (d + t) at time zone v_tz; te := ts + make_interval(mins => v_dur);
        if ts >= now() + p_lead
          and not exists (select 1 from bookings b where b.stylist_id = p_stylist_id and b.status in ('held','pending_payment','confirmed') and tstzrange(b.start_at, b.end_at) && tstzrange(ts, te))
          and not exists (select 1 from busy_blocks bb where bb.stylist_id = p_stylist_id and tstzrange(bb.start_at, bb.end_at) && tstzrange(ts, te))
        then start_at := ts; return next; end if;
        t := t + make_interval(mins => v_dur);
      end loop;
    end loop;
    d := d + 1;
  end loop;
end $$;
revoke all on function public._stylist_slots(uuid, date, date, text, interval) from public, anon, authenticated;

create or replace function public.stylist_free_slots(p_stylist_id uuid, p_from date, p_to date, p_service_key text default 'pre_sample')
returns table(start_at timestamptz) language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  return query select s.start_at from public._stylist_slots(p_stylist_id, p_from, p_to, p_service_key, interval '1 hour') s;
end $$;

-- Nieuwe klant uitnodigen. Met p_start: moment staat vast. Zonder p_start: de klant kiest zelf.
drop function if exists public.invite_customer(text, text, text, uuid, timestamptz, text);
create or replace function public.invite_customer(p_name text, p_email text, p_phone text, p_stylist_id uuid, p_start timestamptz default null, p_service_key text default 'pre_sample') returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_dur int; v_sid uuid; v_id uuid; v_email text := lower(btrim(coalesce(p_email, '')));
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then raise exception 'Vul een geldig e-mailadres in'; end if;
  if btrim(coalesce(p_name, '')) = '' then raise exception 'Vul de naam van de klant in'; end if;
  select id, duration_min into v_sid, v_dur from services where key = p_service_key and active;
  if v_dur is null then raise exception 'onbekende dienst'; end if;
  if p_start is null then
    insert into bookings (service_id, stylist_id, start_at, end_at, status, customer_name, customer_email, customer_phone, gratis, invited_at, kanban_stage)
    values (v_sid, p_stylist_id, now(), now(), 'manual', left(btrim(p_name), 120), v_email, nullif(btrim(coalesce(p_phone, '')), ''), true, now(), 'ingepland')
    returning id into v_id;
    return v_id;
  end if;
  if p_start < now() then raise exception 'kies een moment in de toekomst'; end if;
  insert into bookings (service_id, stylist_id, start_at, end_at, status, customer_name, customer_email, customer_phone, confirmed_at, gratis, kanban_stage)
  values (v_sid, p_stylist_id, p_start, p_start + make_interval(mins => v_dur), 'confirmed', left(btrim(p_name), 120), v_email, nullif(btrim(coalesce(p_phone, '')), ''), now(), true, 'ingepland')
  returning id into v_id;
  return v_id;
exception when exclusion_violation or unique_violation then
  raise exception 'Dit moment is al bezet bij deze styliste. Kies een ander moment.';
end $$;

-- Bestaande klant zonder afspraak (manual) uitnodigen om zelf een moment te kiezen.
create or replace function public.booking_invite_self(p_booking_id uuid, p_stylist_id uuid, p_service_key text default 'pre_sample') returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_sid uuid;
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'geen toegang'; end if;
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'afspraak niet gevonden'; end if;
  if b.stylist_id is not null and not public.owns_stylist(b.stylist_id) then raise exception 'deze klant hoort bij een andere styliste'; end if;
  if b.status <> 'manual' then raise exception 'deze klant heeft al een afspraak of een tegoed; plan het moment zelf'; end if;
  select id into v_sid from services where key = p_service_key and active;
  if v_sid is null then raise exception 'onbekende dienst'; end if;
  update bookings set stylist_id = p_stylist_id, service_id = v_sid, gratis = true, invited_at = now() where id = p_booking_id;
  return p_booking_id;
end $$;

-- Klantpagina: kan de klant zelf een moment kiezen?
create or replace function public.booking_by_token(p_token uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare b record; v_service record; v_stylist text; v_cutoff interval := interval '24 hours';
begin
  select * into b from bookings where manage_token = p_token;
  if b.id is null then return null; end if;
  select key, duration_min into v_service from services where id = b.service_id;
  select name into v_stylist from stylists where id = b.stylist_id;
  return jsonb_build_object(
    'service_key', v_service.key,
    'duration_min', v_service.duration_min,
    'start_at', b.start_at,
    'status', b.status,
    'reschedule_count', b.reschedule_count,
    'customer_name', b.customer_name,
    'stylist_name', v_stylist,
    -- zelf verzetten mag: bevestigd, nog niet te dichtbij (>24u), en max 2x
    'can_self_reschedule', (b.status = 'confirmed' and now() < b.start_at - v_cutoff and b.reschedule_count < 2),
    -- zelf plannen: uitgenodigd, nog geen moment, vaste styliste
    'can_self_plan', (b.status = 'manual' and b.invited_at is not null and b.stylist_id is not null and b.service_id is not null)
  );
end $$;

create or replace function public.slots_by_token(p_token uuid, p_from date, p_to date)
returns table(start_at timestamptz, free int) language plpgsql stable security definer set search_path to 'public' as $$
declare b record; v_key text;
begin
  select * into b from bookings where manage_token = p_token;
  if b.id is null or b.status <> 'manual' or b.invited_at is null or b.stylist_id is null then return; end if;
  select key into v_key from services where id = b.service_id;
  return query select s.start_at, 1 from public._stylist_slots(b.stylist_id, p_from, least(p_to, p_from + 70), v_key, interval '24 hours') s;
end $$;

create or replace function public.plan_by_token(p_token uuid, p_start timestamptz) returns jsonb
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_key text; v_dur int; v_tz text := 'Europe/Amsterdam'; v_day date;
begin
  select * into b from bookings where manage_token = p_token for update;
  if b.id is null then raise exception 'Afspraak niet gevonden'; end if;
  if b.status = 'confirmed' then return jsonb_build_object('booking_id', b.id, 'start_at', b.start_at, 'already', true); end if;
  if b.status <> 'manual' or b.invited_at is null or b.stylist_id is null then raise exception 'Deze link werkt niet meer; neem contact op met je styliste'; end if;
  select key, duration_min into v_key, v_dur from services where id = b.service_id;
  v_day := (p_start at time zone v_tz)::date;
  if not exists (select 1 from public._stylist_slots(b.stylist_id, v_day, v_day, v_key, interval '24 hours') s where s.start_at = p_start) then
    raise exception 'Dit moment is niet meer vrij; kies een ander tijdstip';
  end if;
  update bookings set start_at = p_start, end_at = p_start + make_interval(mins => v_dur), status = 'confirmed', confirmed_at = now()
    where id = b.id;
  return jsonb_build_object('booking_id', b.id, 'start_at', p_start, 'already', false);
exception when exclusion_violation or unique_violation then
  raise exception 'Dit moment is niet meer vrij; kies een ander tijdstip';
end $$;

revoke all on function public.invite_customer(text, text, text, uuid, timestamptz, text) from public, anon;
revoke all on function public.booking_invite_self(uuid, uuid, text) from public, anon;
revoke all on function public.slots_by_token(uuid, date, date) from public;
revoke all on function public.plan_by_token(uuid, timestamptz) from public;
grant execute on function public.invite_customer(text, text, text, uuid, timestamptz, text) to authenticated;
grant execute on function public.booking_invite_self(uuid, uuid, text) to authenticated;
grant execute on function public.slots_by_token(uuid, date, date) to anon, authenticated;
grant execute on function public.plan_by_token(uuid, timestamptz) to anon, authenticated;
