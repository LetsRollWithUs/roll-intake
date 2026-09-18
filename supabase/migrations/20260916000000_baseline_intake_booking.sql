-- Baseline van het intake/boeking-domein (public schema), gegenereerd uit de live-catalogus
-- op 2026-09-18 met Postgres' eigen DDL-functies (pg_get_functiondef / _constraintdef / _indexdef
-- / _triggerdef). Bevat de objecten die de roll-intake app bezit. De quiz-tabellen
-- (quiz_results, colors, image_jobs, swipe_*, app_settings) horen bij de Quiz-repo en staan hier
-- bewust NIET in; ze delen wel hetzelfde Supabase-project.
--
-- Dit is de schema-van-record voor review en reproductie. Voor een byte-exacte export is
-- `supabase db dump` de canonieke weg (zie README). Cron-jobs (pg_cron) en secrets zijn
-- omgevingsspecifiek en staan in de README, niet hier.

-- ============================================================ EXTENSIES
create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;
create extension if not exists btree_gist;

-- ============================================================ TABELLEN
create table if not exists public.advisors (
  email text not null,
  name text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.availability_exceptions (
  id uuid not null default gen_random_uuid(),
  stylist_id uuid not null,
  date date not null,
  is_off boolean not null default true,
  start_time time without time zone,
  end_time time without time zone
);

create table if not exists public.availability_rules (
  id uuid not null default gen_random_uuid(),
  stylist_id uuid not null,
  weekday integer not null,
  start_time time without time zone not null,
  end_time time without time zone not null
);

create table if not exists public.bookings (
  id uuid not null default gen_random_uuid(),
  service_id uuid,
  stylist_id uuid,
  start_at timestamp with time zone not null,
  end_at timestamp with time zone not null,
  status text not null default 'held'::text,
  customer_name text,
  customer_email text,
  hold_expires_at timestamp with time zone,
  woo_order_id text,
  intake_id uuid,
  created_at timestamp with time zone not null default now(),
  manage_token uuid not null default gen_random_uuid(),
  reschedule_count integer not null default 0,
  customer_phone text,
  confirmed_at timestamp with time zone
);

create table if not exists public.busy_blocks (
  id uuid not null default gen_random_uuid(),
  stylist_id uuid not null,
  start_at timestamp with time zone not null,
  end_at timestamp with time zone not null,
  source text not null default 'ical'::text,
  external_uid text,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.intake (
  id uuid not null default gen_random_uuid(),
  created_at timestamp with time zone not null default now(),
  contact_name text,
  contact_email text,
  main_question text,
  help_needs text[] not null default '{}'::text[],
  moods text[] not null default '{}'::text[],
  inspiration_likes text[] not null default '{}'::text[],
  inspiration_note text,
  boldness integer,
  rooms jsonb not null default '[]'::jsonb,
  colors jsonb not null default '[]'::jsonb,
  complexity_level text,
  complexity_score numeric,
  payload jsonb not null default '{}'::jsonb,
  has_samples text,
  samples jsonb not null default '[]'::jsonb,
  pinterest_url text,
  other_inspiration_url text,
  inspiration_images jsonb not null default '[]'::jsonb,
  planning text,
  status text not null default 'verzonden'::text,
  advisor_status text not null default 'nieuw'::text,
  advisor_notes text,
  advisor_updated_at timestamp with time zone,
  advisor_rejected_reason text,
  advisor_outcome text,
  advisor_advice jsonb not null default '[]'::jsonb,
  advisor_buy_moment text,
  advisor_next_action text,
  booking_id uuid,
  mode text,
  advisor_offer_url text,
  advisor_followup_sent_at timestamp with time zone
);

create table if not exists public.notification_outbox (
  id uuid not null default gen_random_uuid(),
  metric text not null,
  profile jsonb not null,
  properties jsonb not null default '{}'::jsonb,
  profile_props jsonb not null default '{}'::jsonb,
  unique_id text,
  attempts integer not null default 0,
  next_attempt_at timestamp with time zone not null default now(),
  last_error text,
  sent_at timestamp with time zone,
  alerted_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table if not exists public.services (
  id uuid not null default gen_random_uuid(),
  key text not null,
  name text not null,
  duration_min integer not null default 30,
  buffer_before_min integer not null default 0,
  buffer_after_min integer not null default 0,
  price numeric not null default 30,
  active boolean not null default true,
  sort integer not null default 0
);

create table if not exists public.stylists (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text not null,
  timezone text not null default 'Europe/Amsterdam'::text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  meet_url text,
  ical_feed_url text,
  ical_synced_at timestamp with time zone,
  feed_token uuid not null default gen_random_uuid()
);

create table if not exists public.system_alerts (
  id uuid not null default gen_random_uuid(),
  kind text not null,
  message text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now(),
  acknowledged_at timestamp with time zone
);

-- ============================================================ CONSTRAINTS
alter table public.advisors add constraint advisors_pkey PRIMARY KEY (email);
alter table public.availability_exceptions add constraint availability_exceptions_pkey PRIMARY KEY (id);
alter table public.availability_exceptions add constraint availability_exceptions_stylist_id_fkey FOREIGN KEY (stylist_id) REFERENCES stylists(id) ON DELETE CASCADE;
alter table public.availability_rules add constraint availability_rules_pkey PRIMARY KEY (id);
alter table public.availability_rules add constraint availability_rules_check CHECK ((end_time > start_time));
alter table public.availability_rules add constraint availability_rules_weekday_check CHECK (((weekday >= 1) AND (weekday <= 7)));
alter table public.availability_rules add constraint availability_rules_stylist_id_fkey FOREIGN KEY (stylist_id) REFERENCES stylists(id) ON DELETE CASCADE;
alter table public.bookings add constraint bookings_pkey PRIMARY KEY (id);
alter table public.bookings add constraint bookings_service_id_fkey FOREIGN KEY (service_id) REFERENCES services(id);
alter table public.bookings add constraint bookings_stylist_id_fkey FOREIGN KEY (stylist_id) REFERENCES stylists(id);
alter table public.bookings add constraint bookings_intake_id_fkey FOREIGN KEY (intake_id) REFERENCES intake(id);
alter table public.bookings add constraint bookings_no_overlap EXCLUDE USING gist (stylist_id WITH =, tstzrange(start_at, end_at) WITH &&) WHERE ((status = ANY (ARRAY['held'::text, 'pending_payment'::text, 'confirmed'::text])));
alter table public.busy_blocks add constraint busy_blocks_pkey PRIMARY KEY (id);
alter table public.busy_blocks add constraint busy_blocks_stylist_id_fkey FOREIGN KEY (stylist_id) REFERENCES stylists(id) ON DELETE CASCADE;
alter table public.intake add constraint intake_pkey PRIMARY KEY (id);
alter table public.intake add constraint intake_booking_id_fkey FOREIGN KEY (booking_id) REFERENCES bookings(id);
alter table public.notification_outbox add constraint notification_outbox_pkey PRIMARY KEY (id);
alter table public.services add constraint services_pkey PRIMARY KEY (id);
alter table public.services add constraint services_key_key UNIQUE (key);
alter table public.stylists add constraint stylists_pkey PRIMARY KEY (id);
alter table public.stylists add constraint stylists_email_key UNIQUE (email);
alter table public.system_alerts add constraint system_alerts_pkey PRIMARY KEY (id);

-- ============================================================ INDEXEN
CREATE INDEX availability_exceptions_stylist_idx ON public.availability_exceptions USING btree (stylist_id, date);
CREATE INDEX availability_rules_stylist_idx ON public.availability_rules USING btree (stylist_id);
CREATE INDEX bookings_email_created_idx ON public.bookings USING btree (lower(customer_email), created_at DESC);
CREATE INDEX bookings_manage_token_idx ON public.bookings USING btree (manage_token);
CREATE INDEX busy_blocks_range_gist ON public.busy_blocks USING gist (stylist_id, tstzrange(start_at, end_at));
CREATE INDEX busy_blocks_stylist_time_idx ON public.busy_blocks USING btree (stylist_id, start_at, end_at);
CREATE INDEX intake_email_created_idx ON public.intake USING btree (lower(contact_email), created_at DESC);
CREATE INDEX outbox_due_idx ON public.notification_outbox USING btree (next_attempt_at) WHERE (sent_at IS NULL);
CREATE INDEX stylists_feed_token_idx ON public.stylists USING btree (feed_token);
CREATE INDEX system_alerts_open_idx ON public.system_alerts USING btree (created_at DESC) WHERE (acknowledged_at IS NULL);

-- ============================================================ FUNCTIES
CREATE OR REPLACE FUNCTION public.is_advisor()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select exists (
    select 1 from public.advisors a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_advisor() and lower(coalesce(auth.jwt() ->> 'email','')) like '%@roll.nl';
$function$;

CREATE OR REPLACE FUNCTION public.owns_stylist(sid uuid)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select public.is_admin() or exists (
    select 1 from public.stylists s
    where s.id = sid and lower(s.email) = lower(coalesce(auth.jwt() ->> 'email',''))
  );
$function$;

CREATE OR REPLACE FUNCTION public.stylist_day_intervals(p_stylist uuid, p_date date)
 RETURNS TABLE(start_time time without time zone, end_time time without time zone)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare has_exc boolean;
begin
  select true into has_exc from availability_exceptions where stylist_id = p_stylist and date = p_date limit 1;
  if has_exc then
    return query select e.start_time, e.end_time from availability_exceptions e
      where e.stylist_id = p_stylist and e.date = p_date and e.is_off = false
        and e.start_time is not null and e.end_time is not null;
    return;
  end if;
  return query select r.start_time, r.end_time from availability_rules r
    where r.stylist_id = p_stylist and r.weekday = extract(isodow from p_date)::int;
end $function$;

CREATE OR REPLACE FUNCTION public.available_slots(p_service_key text, p_from date, p_to date)
 RETURNS TABLE(start_at timestamp with time zone, free integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_dur int; v_tz text := 'Europe/Amsterdam'; v_lead interval := interval '48 hours'; d date; s record; iv record; t time; ts timestamptz; te timestamptz;
begin
  select duration_min into v_dur from services where key = p_service_key and active;
  if v_dur is null then return; end if;
  create temp table if not exists _slots(stylist_id uuid, start_at timestamptz) on commit drop;
  truncate _slots;
  d := p_from;
  while d <= p_to loop
    for s in select id from stylists where active loop
      for iv in select * from public.stylist_day_intervals(s.id, d) loop
        t := iv.start_time;
        while (t + make_interval(mins => v_dur)) <= iv.end_time loop
          ts := (d + t) at time zone v_tz;
          te := ts + make_interval(mins => v_dur);
          if ts >= now() + v_lead
            and not exists (
              select 1 from bookings b where b.stylist_id = s.id
                and b.status in ('held','pending_payment','confirmed')
                and tstzrange(b.start_at, b.end_at) && tstzrange(ts, te))
            and not exists (
              select 1 from busy_blocks bb where bb.stylist_id = s.id
                and tstzrange(bb.start_at, bb.end_at) && tstzrange(ts, te))
          then
            insert into _slots values (s.id, ts);
          end if;
          t := t + make_interval(mins => v_dur);
        end loop;
      end loop;
    end loop;
    d := d + 1;
  end loop;
  return query select sl.start_at, count(distinct sl.stylist_id)::int from _slots sl group by sl.start_at order by sl.start_at;
end $function$;

CREATE OR REPLACE FUNCTION public.hold_slot(p_service_key text, p_start timestamp with time zone, p_name text, p_email text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_dur int; v_service uuid; v_end timestamptz; s record; v_id uuid; v_exp timestamptz; v_tz text := 'Europe/Amsterdam'; v_lead interval := interval '48 hours';
        v_email text := lower(btrim(p_email)); v_recent int;
begin
  if v_email is null or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Vul een geldig e-mailadres in';
  end if;
  select id, duration_min into v_service, v_dur from services where key = p_service_key and active;
  if v_service is null then raise exception 'Onbekende service'; end if;
  if p_start < now() + v_lead then raise exception 'Dit tijdstip is niet meer boekbaar; kies een moment minstens 48 uur vooruit'; end if;

  select count(*) into v_recent from bookings b
    where lower(b.customer_email) = v_email and b.created_at > now() - interval '10 minutes';
  if v_recent >= 3 then
    raise exception 'Even geduld: je hebt net al een paar keer geprobeerd te reserveren. Probeer het over 10 minuten opnieuw';
  end if;

  update bookings set status = 'cancelled'
    where lower(customer_email) = v_email and status in ('held','pending_payment') and hold_expires_at > now();

  v_end := p_start + make_interval(mins => v_dur);
  v_exp := now() + interval '15 minutes';
  for s in
    select st.id from stylists st
    where st.active
      and exists (select 1 from public.stylist_day_intervals(st.id, (p_start at time zone v_tz)::date) iv
        where (p_start at time zone v_tz)::time >= iv.start_time and (v_end at time zone v_tz)::time <= iv.end_time)
      and not exists (select 1 from bookings b where b.stylist_id = st.id
        and b.status in ('held','pending_payment','confirmed')
        and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, v_end))
      and not exists (select 1 from busy_blocks bb where bb.stylist_id = st.id
        and tstzrange(bb.start_at, bb.end_at) && tstzrange(p_start, v_end))
    order by (select max(b.created_at) from bookings b where b.stylist_id = st.id
                and b.status in ('held','pending_payment','confirmed')) asc nulls first, random()
  loop
    begin
      insert into bookings(service_id, stylist_id, start_at, end_at, status, customer_name, customer_email, customer_phone, hold_expires_at)
      values (v_service, s.id, p_start, v_end, 'pending_payment', btrim(p_name), v_email, nullif(btrim(p_phone), ''), v_exp)
      returning id into v_id;
      return jsonb_build_object('booking_id', v_id, 'stylist_id', s.id, 'hold_expires_at', v_exp);
    exception when unique_violation or exclusion_violation then continue;
    end;
  end loop;
  raise exception 'Geen stylist beschikbaar voor dit tijdstip';
end $function$;

CREATE OR REPLACE FUNCTION public.book_slot(p_service_key text, p_start timestamp with time zone, p_name text, p_email text, p_phone text DEFAULT NULL::text)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_dur int; v_service uuid; v_end timestamptz; s record; v_id uuid; v_tz text := 'Europe/Amsterdam'; v_lead interval := interval '48 hours';
begin
  select id, duration_min into v_service, v_dur from services where key = p_service_key and active;
  if v_service is null then raise exception 'Onbekende service'; end if;
  if p_start < now() + v_lead then raise exception 'Dit tijdstip is niet meer boekbaar; kies een moment minstens 48 uur vooruit'; end if;
  v_end := p_start + make_interval(mins => v_dur);
  for s in
    select st.id from stylists st
    where st.active
      and exists (select 1 from public.stylist_day_intervals(st.id, (p_start at time zone v_tz)::date) iv
        where (p_start at time zone v_tz)::time >= iv.start_time and (v_end at time zone v_tz)::time <= iv.end_time)
      and not exists (select 1 from bookings b where b.stylist_id = st.id
        and b.status in ('held','pending_payment','confirmed')
        and tstzrange(b.start_at, b.end_at) && tstzrange(p_start, v_end))
      and not exists (select 1 from busy_blocks bb where bb.stylist_id = st.id
        and tstzrange(bb.start_at, bb.end_at) && tstzrange(p_start, v_end))
    order by (select max(b.created_at) from bookings b where b.stylist_id = st.id
                and b.status in ('held','pending_payment','confirmed')) asc nulls first, random()
  loop
    begin
      insert into bookings(service_id, stylist_id, start_at, end_at, status, customer_name, customer_email, customer_phone)
      values (v_service, s.id, p_start, v_end, 'confirmed', p_name, p_email, nullif(btrim(p_phone), ''))
      returning id into v_id;
      return jsonb_build_object('booking_id', v_id, 'stylist_id', s.id);
    exception when unique_violation or exclusion_violation then continue;
    end;
  end loop;
  raise exception 'Geen stylist beschikbaar voor dit tijdstip';
end $function$;

CREATE OR REPLACE FUNCTION public.release_expired_holds()
 RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare n int;
begin
  update public.bookings set status = 'cancelled'
  where status in ('held','pending_payment') and hold_expires_at is not null and hold_expires_at < now();
  get diagnostics n = row_count;
  return n;
end $function$;

CREATE OR REPLACE FUNCTION public.booking_by_token(p_token uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b record; v_service record; v_lead interval := interval '48 hours'; v_cutoff interval := interval '24 hours';
begin
  select * into b from bookings where manage_token = p_token;
  if b.id is null then return null; end if;
  select key, duration_min into v_service from services where id = b.service_id;
  return jsonb_build_object(
    'service_key', v_service.key,
    'duration_min', v_service.duration_min,
    'start_at', b.start_at,
    'status', b.status,
    'reschedule_count', b.reschedule_count,
    'customer_name', b.customer_name,
    'can_self_reschedule', (b.status = 'confirmed' and now() < b.start_at - v_cutoff and b.reschedule_count < 2)
  );
end $function$;

CREATE OR REPLACE FUNCTION public.reschedule_by_token(p_token uuid, p_new_start timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b record; v_dur int; v_end timestamptz; v_lead interval := interval '48 hours'; v_cutoff interval := interval '24 hours';
begin
  select * into b from bookings where manage_token = p_token for update;
  if b.id is null then raise exception 'Afspraak niet gevonden'; end if;
  if b.status <> 'confirmed' then raise exception 'Deze afspraak kan niet verzet worden'; end if;
  if now() >= b.start_at - v_cutoff then raise exception 'Verzetten kan tot 24 uur voor de afspraak; neem contact op met je styliste'; end if;
  if b.reschedule_count >= 2 then raise exception 'Deze afspraak is al twee keer verzet; neem contact op met je styliste'; end if;
  if p_new_start < now() + v_lead then raise exception 'Kies een moment minstens 48 uur vooruit'; end if;
  select duration_min into v_dur from services where id = b.service_id;
  v_end := p_new_start + make_interval(mins => v_dur);
  if exists (select 1 from bookings x where x.stylist_id = b.stylist_id and x.id <> b.id
    and x.status in ('held','pending_payment','confirmed')
    and tstzrange(x.start_at, x.end_at) && tstzrange(p_new_start, v_end)) then
    raise exception 'Dit moment is niet meer vrij; kies een ander tijdstip';
  end if;
  update bookings set start_at = p_new_start, end_at = v_end, reschedule_count = reschedule_count + 1
    where id = b.id;
  return jsonb_build_object('booking_id', b.id, 'start_at', p_new_start);
end $function$;

CREATE OR REPLACE FUNCTION public.reschedule_booking(p_booking_id uuid, p_new_start timestamp with time zone)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b record; v_dur int; v_end timestamptz;
begin
  select * into b from bookings where id = p_booking_id for update;
  if b.id is null then raise exception 'Afspraak niet gevonden'; end if;
  if not owns_stylist(b.stylist_id) then raise exception 'Geen rechten voor deze afspraak'; end if;
  if p_new_start <= now() then raise exception 'Kies een moment in de toekomst'; end if;
  select duration_min into v_dur from services where id = b.service_id;
  v_end := p_new_start + make_interval(mins => v_dur);
  if exists (select 1 from bookings x where x.stylist_id = b.stylist_id and x.id <> b.id
    and x.status in ('held','pending_payment','confirmed')
    and tstzrange(x.start_at, x.end_at) && tstzrange(p_new_start, v_end)) then
    raise exception 'Dit moment overlapt met een andere afspraak van deze styliste';
  end if;
  update bookings set start_at = p_new_start, end_at = v_end,
    status = case when status = 'paid_unplaced' then 'confirmed' else status end,
    confirmed_at = case when status = 'paid_unplaced' then now() else confirmed_at end
    where id = b.id;
  update system_alerts set acknowledged_at = now()
    where kind = 'paid_unplaced' and acknowledged_at is null and (payload->>'booking_id')::uuid = b.id;
  return jsonb_build_object('booking_id', b.id, 'start_at', p_new_start);
end $function$;

CREATE OR REPLACE FUNCTION public.reassign_booking(p_booking_id uuid, p_new_stylist_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b record;
begin
  select * into b from bookings where id = p_booking_id for update;
  if b.id is null then raise exception 'Afspraak niet gevonden'; end if;
  if not (owns_stylist(b.stylist_id) or owns_stylist(p_new_stylist_id)) then raise exception 'Geen rechten voor deze overdracht'; end if;
  if not exists (select 1 from stylists where id = p_new_stylist_id and active) then raise exception 'Onbekende of inactieve styliste'; end if;
  if exists (select 1 from bookings x where x.stylist_id = p_new_stylist_id and x.id <> b.id
    and x.status in ('held','pending_payment','confirmed')
    and tstzrange(x.start_at, x.end_at) && tstzrange(b.start_at, b.end_at)) then
    raise exception 'Deze styliste heeft al een afspraak op dat tijdstip';
  end if;
  update bookings set stylist_id = p_new_stylist_id,
    status = case when status = 'paid_unplaced' then 'confirmed' else status end,
    confirmed_at = case when status = 'paid_unplaced' then now() else confirmed_at end
    where id = b.id;
  update system_alerts set acknowledged_at = now()
    where kind = 'paid_unplaced' and acknowledged_at is null and (payload->>'booking_id')::uuid = b.id;
  return jsonb_build_object('booking_id', b.id, 'stylist_id', p_new_stylist_id);
end $function$;

CREATE OR REPLACE FUNCTION public.confirm_paid_booking(p_booking_id uuid)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare b record; s record; v_tz text := 'Europe/Amsterdam'; v_free boolean; v_now timestamptz := now();
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then return jsonb_build_object('outcome','not_found'); end if;
  if b.status = 'confirmed' then
    return jsonb_build_object('outcome','already_confirmed','booking_id',b.id,'stylist_id',b.stylist_id,'confirmed_at',b.confirmed_at);
  end if;
  if b.status = 'paid_unplaced' then
    return jsonb_build_object('outcome','paid_unplaced','booking_id',b.id,'already',true);
  end if;

  v_free := b.start_at > v_now
    and not exists (select 1 from bookings x where x.stylist_id = b.stylist_id and x.id <> b.id
      and x.status in ('held','pending_payment','confirmed')
      and tstzrange(x.start_at, x.end_at) && tstzrange(b.start_at, b.end_at))
    and not exists (select 1 from busy_blocks bb where bb.stylist_id = b.stylist_id
      and tstzrange(bb.start_at, bb.end_at) && tstzrange(b.start_at, b.end_at));
  if v_free then
    begin
      update bookings set status = 'confirmed', hold_expires_at = null, confirmed_at = v_now where id = b.id;
      return jsonb_build_object('outcome','confirmed','booking_id',b.id,'stylist_id',b.stylist_id,'confirmed_at',v_now);
    exception when unique_violation or exclusion_violation then null;
    end;
  end if;

  if b.start_at > v_now then
    for s in
      select st.id from stylists st
      where st.active and st.id <> b.stylist_id
        and exists (select 1 from public.stylist_day_intervals(st.id, (b.start_at at time zone v_tz)::date) iv
          where (b.start_at at time zone v_tz)::time >= iv.start_time and (b.end_at at time zone v_tz)::time <= iv.end_time)
        and not exists (select 1 from bookings x where x.stylist_id = st.id and x.id <> b.id
          and x.status in ('held','pending_payment','confirmed')
          and tstzrange(x.start_at, x.end_at) && tstzrange(b.start_at, b.end_at))
        and not exists (select 1 from busy_blocks bb where bb.stylist_id = st.id
          and tstzrange(bb.start_at, bb.end_at) && tstzrange(b.start_at, b.end_at))
      order by (select max(x.created_at) from bookings x where x.stylist_id = st.id
                  and x.status in ('held','pending_payment','confirmed')) asc nulls first, random()
    loop
      begin
        update bookings set stylist_id = s.id, status = 'confirmed', hold_expires_at = null, confirmed_at = v_now where id = b.id;
        return jsonb_build_object('outcome','reassigned','booking_id',b.id,'stylist_id',s.id,'confirmed_at',v_now);
      exception when unique_violation or exclusion_violation then continue;
      end;
    end loop;
  end if;

  update bookings set status = 'paid_unplaced', hold_expires_at = null where id = b.id;
  insert into system_alerts(kind, message, payload) values (
    'paid_unplaced',
    'Klant heeft betaald maar het moment is niet meer beschikbaar. Plaats de afspraak handmatig.',
    jsonb_build_object('booking_id', b.id, 'customer_email', b.customer_email, 'customer_name', b.customer_name,
      'start_at', b.start_at, 'woo_order_id', b.woo_order_id)
  );
  return jsonb_build_object('outcome','paid_unplaced','booking_id',b.id,'already',false);
end $function$;

CREATE OR REPLACE FUNCTION public.set_meet_url(p_stylist_id uuid, p_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_email text;
begin
  v_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  if not (is_admin() or exists (
    select 1 from stylists s where s.id = p_stylist_id and lower(s.email) = v_email
  )) then
    raise exception 'Geen rechten voor deze stylist';
  end if;
  update stylists set meet_url = nullif(btrim(p_url), '') where id = p_stylist_id;
end $function$;

CREATE OR REPLACE FUNCTION public.set_ical_feed_url(p_stylist_id uuid, p_url text)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_email text;
begin
  v_email := lower(coalesce((auth.jwt() ->> 'email'), ''));
  if not (is_admin() or exists (
    select 1 from stylists s where s.id = p_stylist_id and lower(s.email) = v_email
  )) then
    raise exception 'Geen rechten voor deze stylist';
  end if;
  update stylists set ical_feed_url = nullif(btrim(p_url), '') where id = p_stylist_id;
  if nullif(btrim(p_url), '') is null then
    delete from busy_blocks where stylist_id = p_stylist_id and source = 'ical';
    update stylists set ical_synced_at = null where id = p_stylist_id;
  end if;
end $function$;

CREATE OR REPLACE FUNCTION public.stylist_secrets(p_stylist_id uuid)
 RETURNS TABLE(feed_token uuid, ical_feed_url text, ical_synced_at timestamp with time zone)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  select s.feed_token, s.ical_feed_url, s.ical_synced_at
  from stylists s
  where s.id = p_stylist_id and owns_stylist(p_stylist_id);
$function$;

CREATE OR REPLACE FUNCTION public.intake_insert_rate_limit()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare v_email text := lower(btrim(new.contact_email)); n int;
begin
  if v_email is null or v_email = '' then return new; end if;
  select count(*) into n from intake where lower(contact_email) = v_email and created_at > now() - interval '10 minutes';
  if n >= 5 then
    raise exception 'Even geduld: er zijn net al meerdere intakes met dit e-mailadres gestart. Probeer het over 10 minuten opnieuw';
  end if;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.submit_intake(p_id uuid, p_row jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_help  text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'help_needs') x), '{}');
  v_moods text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'moods') x), '{}');
  v_likes text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'inspiration_likes') x), '{}');
  v_booking uuid := nullif(p_row->>'booking_id','')::uuid;
  v_mode text := p_row->>'mode';
  v_email text := lower(btrim(coalesce(p_row->>'contact_email','')));
  v_name text := left(btrim(coalesce(p_row->>'contact_name','')), 120);
  v_question text := left(coalesce(p_row->>'main_question',''), 4000);
  v_note text := left(coalesce(p_row->>'inspiration_note',''), 2000);
  v_pin text := case when p_row->>'pinterest_url' ~* '^https?://' then left(p_row->>'pinterest_url', 500) else null end;
  v_other text := case when p_row->>'other_inspiration_url' ~* '^https?://' then left(p_row->>'other_inspiration_url', 500) else null end;
  v_rooms jsonb := case when jsonb_typeof(p_row->'rooms')='array' then p_row->'rooms' else '[]'::jsonb end;
  v_colors jsonb := case when jsonb_typeof(p_row->'colors')='array' then p_row->'colors' else '[]'::jsonb end;
  v_samples jsonb := case when jsonb_typeof(p_row->'samples')='array' then p_row->'samples' else '[]'::jsonb end;
  v_images jsonb := case when jsonb_typeof(p_row->'inspiration_images')='array' then p_row->'inspiration_images' else '[]'::jsonb end;
  v_payload jsonb := coalesce(p_row->'payload','{}'::jsonb);
  v_existing record;
  v_couple boolean := false;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Vul een geldig e-mailadres in';
  end if;
  if jsonb_array_length(v_rooms) > 25 or jsonb_array_length(v_samples) > 40
     or jsonb_array_length(v_images) > 40 or jsonb_array_length(v_colors) > 60 then
    raise exception 'Er zijn te veel items meegestuurd';
  end if;

  select status, advisor_status, advisor_outcome, advisor_advice, advisor_notes
    into v_existing from intake where id = p_id;
  if found then
    if coalesce(v_existing.advisor_status, 'nieuw') <> 'nieuw'
       or v_existing.advisor_outcome is not null
       or (jsonb_typeof(v_existing.advisor_advice) = 'array' and jsonb_array_length(v_existing.advisor_advice) > 0)
       or coalesce(v_existing.advisor_notes, '') <> '' then
      raise exception 'Deze intake is al in behandeling en kan niet meer gewijzigd worden';
    end if;
  end if;

  if v_booking is not null then
    select true into v_couple from bookings b where b.id = v_booking and lower(b.customer_email) = v_email;
    v_couple := coalesce(v_couple, false);
  end if;

  update public.intake set
    status = 'verzonden',
    contact_name = v_name,
    contact_email = v_email,
    main_question = v_question,
    help_needs = v_help, moods = v_moods, inspiration_likes = v_likes,
    inspiration_note = v_note,
    boldness = nullif(p_row->>'boldness','')::int,
    rooms = v_rooms, colors = v_colors,
    has_samples = p_row->>'has_samples',
    samples = v_samples,
    pinterest_url = v_pin,
    other_inspiration_url = v_other,
    inspiration_images = v_images,
    planning = p_row->>'planning',
    complexity_level = p_row->>'complexity_level',
    complexity_score = nullif(p_row->>'complexity_score','')::numeric,
    booking_id = case when v_couple then v_booking else booking_id end,
    mode = case when v_couple then v_mode else mode end,
    payload = v_payload
  where id = p_id;

  if not found then
    insert into public.intake (id, status, contact_name, contact_email, main_question,
      help_needs, moods, inspiration_likes, inspiration_note, boldness, rooms, colors,
      has_samples, samples, pinterest_url, other_inspiration_url, inspiration_images,
      planning, complexity_level, complexity_score, booking_id, mode, payload)
    values (p_id, 'verzonden', v_name, v_email, v_question,
      v_help, v_moods, v_likes, v_note, nullif(p_row->>'boldness','')::int,
      v_rooms, v_colors, p_row->>'has_samples', v_samples, v_pin, v_other, v_images,
      p_row->>'planning', p_row->>'complexity_level', nullif(p_row->>'complexity_score','')::numeric,
      case when v_couple then v_booking else null end, case when v_couple then v_mode else null end, v_payload);
  end if;

  if v_couple then
    update public.bookings set intake_id = p_id where id = v_booking;
  end if;
end $function$;

-- ============================================================ TRIGGERS
CREATE TRIGGER intake_rate_limit BEFORE INSERT ON public.intake FOR EACH ROW EXECUTE FUNCTION intake_insert_rate_limit();

-- ============================================================ ROW LEVEL SECURITY
alter table public.advisors enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.availability_rules enable row level security;
alter table public.bookings enable row level security;
alter table public.busy_blocks enable row level security;
alter table public.intake enable row level security;
alter table public.notification_outbox enable row level security;
alter table public.services enable row level security;
alter table public.stylists enable row level security;
alter table public.system_alerts enable row level security;

-- ============================================================ POLICIES
create policy "exc read" on public.availability_exceptions for select to authenticated using (owns_stylist(stylist_id));
create policy "exc write" on public.availability_exceptions for all to authenticated using (owns_stylist(stylist_id)) with check (owns_stylist(stylist_id));
create policy "rules read" on public.availability_rules for select to authenticated using (owns_stylist(stylist_id));
create policy "rules write" on public.availability_rules for all to authenticated using (owns_stylist(stylist_id)) with check (owns_stylist(stylist_id));
create policy "bookings read" on public.bookings for select to authenticated using (owns_stylist(stylist_id));
create policy "busy_blocks read" on public.busy_blocks for select to authenticated using (owns_stylist(stylist_id));
create policy "intake advisor select" on public.intake for select to authenticated using (is_advisor());
create policy "intake advisor update" on public.intake for update to authenticated using (is_advisor()) with check (is_advisor());
create policy "intake anon insert" on public.intake for insert to anon with check (true);
create policy "outbox admin read" on public.notification_outbox for select to authenticated using (is_admin());
create policy "services admin" on public.services for all to authenticated using (is_admin()) with check (is_admin());
create policy "services read" on public.services for select to authenticated using (is_advisor());
create policy "stylists admin" on public.stylists for all to authenticated using (is_admin()) with check (is_admin());
create policy "stylists read" on public.stylists for select to authenticated using (is_advisor());
create policy "alerts admin" on public.system_alerts for all to authenticated using (is_admin()) with check (is_admin());

-- ============================================================ KOLOMRECHTEN
-- stylists: geheimen (feed_token, ical_feed_url, ical_synced_at) niet via de tabel leesbaar;
-- die lopen via de RPC stylist_secrets. Alleen de niet-geheime kolommen zijn selecteerbaar.
revoke select on public.stylists from authenticated;
revoke select on public.stylists from anon;
grant select (id, email, name, timezone, active, created_at, meet_url) on public.stylists to authenticated;

-- ============================================================ FUNCTIE-RECHTEN
grant execute on function public.available_slots(text, date, date) to anon, authenticated, service_role;
grant execute on function public.book_slot(text, timestamptz, text, text, text) to anon, authenticated, service_role;
grant execute on function public.booking_by_token(uuid) to anon, authenticated, service_role;
grant execute on function public.confirm_paid_booking(uuid) to service_role;
grant execute on function public.hold_slot(text, timestamptz, text, text, text) to anon, authenticated, service_role;
grant execute on function public.reassign_booking(uuid, uuid) to authenticated, service_role;
grant execute on function public.reschedule_booking(uuid, timestamptz) to authenticated, service_role;
grant execute on function public.reschedule_by_token(uuid, timestamptz) to anon, authenticated, service_role;
grant execute on function public.set_ical_feed_url(uuid, text) to authenticated, service_role;
grant execute on function public.set_meet_url(uuid, text) to authenticated, service_role;
grant execute on function public.stylist_day_intervals(uuid, date) to anon, authenticated, service_role;
grant execute on function public.stylist_secrets(uuid) to authenticated, service_role;
grant execute on function public.submit_intake(uuid, jsonb) to anon, authenticated, service_role;
