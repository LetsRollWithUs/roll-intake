-- Thuisadvies (60 min, € 175 incl. reistijd). De klant betaalt bij de aanvraag, geeft adres en
-- algemene voorkeursmomenten op, en een beheerder of styliste maakt telefonisch de afspraak.
-- Werkgebied per styliste: vertrekpostcode + reisafstand. Leeg = geen thuisadvies.

-- ── Dienst ─────────────────────────────────────────────────────────────────────
insert into public.services (key, name, duration_min, price, active, sort)
select 'thuis', 'Kleuradvies thuis', 60, 175, false, 3
where not exists (select 1 from public.services where key = 'thuis');

-- ── Boekingen ──────────────────────────────────────────────────────────────────
-- format: online | thuis. status 'requested' = thuis betaald, moment nog niet gepland.
alter table public.bookings add column if not exists format text not null default 'online';
alter table public.bookings add column if not exists address jsonb;
alter table public.bookings add column if not exists preferences jsonb;
alter table public.bookings add column if not exists converted_from text;
do $$ begin
  alter table public.bookings add constraint bookings_format_check check (format in ('online', 'thuis'));
exception when duplicate_object then null; end $$;

-- ── Werkgebied per styliste ────────────────────────────────────────────────────
alter table public.stylists add column if not exists home_country text not null default 'NL';
alter table public.stylists add column if not exists home_pc4 text;
alter table public.stylists add column if not exists travel_km int;
grant select (home_country, home_pc4, travel_km) on public.stylists to authenticated;

-- Middelpunten van postcodes (4 cijfers) voor NL en BE. Bron: GeoNames postal codes (CC BY 4.0).
create table if not exists public.postcode_centroids (
  country text not null,
  pc4 text not null,
  place text,
  lat double precision not null,
  lon double precision not null,
  primary key (country, pc4)
);
alter table public.postcode_centroids enable row level security;
revoke all on public.postcode_centroids from anon, authenticated;

-- Uitgesloten postcodes (eilanden e.d.): een straal kan over water heen gaan.
create table if not exists public.thuis_excluded (
  id uuid primary key default gen_random_uuid(),
  country text not null default 'NL',
  pc_from int not null,
  pc_to int not null,
  label text,
  created_at timestamptz not null default now()
);
alter table public.thuis_excluded enable row level security;
drop policy if exists "thuis_excluded admin" on public.thuis_excluded;
create policy "thuis_excluded admin" on public.thuis_excluded for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists "thuis_excluded read" on public.thuis_excluded;
create policy "thuis_excluded read" on public.thuis_excluded for select to authenticated using (public.is_advisor());
insert into public.thuis_excluded (country, pc_from, pc_to, label)
select * from (values ('NL', 1791, 1797, 'Texel'), ('NL', 8881, 8897, 'Terschelling'), ('NL', 8899, 8899, 'Vlieland'),
  ('NL', 9161, 9164, 'Ameland'), ('NL', 9166, 9166, 'Schiermonnikoog')) v(c, a, b, l)
where not exists (select 1 from public.thuis_excluded);

-- Afstand in km tussen twee punten (haversine).
create or replace function public._km(lat1 double precision, lon1 double precision, lat2 double precision, lon2 double precision)
returns double precision language sql immutable as $$
  select 2 * 6371 * asin(sqrt(power(sin(radians(lat2 - lat1) / 2), 2) + cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lon2 - lon1) / 2), 2)));
$$;

-- Stylisten die thuisadvies doen, met hun afstand tot een postcode. Intern.
create or replace function public._thuis_candidates(p_country text, p_pc4 text)
returns table(stylist_id uuid, name text, km double precision, travel_km int, last_thuis timestamptz)
language sql stable security definer set search_path to 'public' as $$
  select s.id, s.name, public._km(c.lat, c.lon, h.lat, h.lon), s.travel_km,
    (select max(b.created_at) from bookings b where b.stylist_id = s.id and b.format = 'thuis' and b.status <> 'cancelled')
  from stylists s
  join postcode_centroids h on h.country = s.home_country and h.pc4 = s.home_pc4
  join postcode_centroids c on c.country = upper(p_country) and c.pc4 = p_pc4
  where s.active and s.travel_km is not null and s.travel_km > 0;
$$;
revoke all on function public._thuis_candidates(text, text) from public, anon, authenticated;

-- Postcodecheck voor de boekingstool: alleen een status, geen stylistgegevens.
-- ok = binnen iemands reisafstand · twijfel = net erbuiten (5 km) of postcode onbekend · buiten.
create or replace function public.thuis_check(p_country text, p_pc4 text) returns text
language plpgsql stable security definer set search_path to 'public' as $$
declare v_pc text := left(regexp_replace(coalesce(p_pc4, ''), '\D', '', 'g'), 4); v_c text := upper(coalesce(p_country, 'NL'));
begin
  if length(v_pc) <> 4 or v_c not in ('NL', 'BE') then return 'ongeldig'; end if;
  if not exists (select 1 from stylists where active and travel_km > 0 and home_pc4 is not null) then return 'buiten'; end if;
  if exists (select 1 from thuis_excluded e where e.country = v_c and v_pc::int between e.pc_from and e.pc_to) then return 'buiten'; end if;
  if not exists (select 1 from postcode_centroids where country = v_c and pc4 = v_pc) then return 'twijfel'; end if;
  if exists (select 1 from public._thuis_candidates(v_c, v_pc) where km <= travel_km) then return 'ok'; end if;
  if exists (select 1 from public._thuis_candidates(v_c, v_pc) where km <= travel_km + 5) then return 'twijfel'; end if;
  return 'buiten';
end $$;
grant execute on function public.thuis_check(text, text) to anon, authenticated;

-- Voorstel voor de beheerder: dichtstbijzijnde eerst, bij gelijke afstand wie het langst geen thuisklant had.
create or replace function public.thuis_suggest(p_booking_id uuid)
returns table(stylist_id uuid, name text, km numeric, binnen boolean)
language plpgsql stable security definer set search_path to 'public' as $$
declare b record;
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  select address into b from bookings where id = p_booking_id;
  return query select c.stylist_id, c.name, round(c.km::numeric, 0), c.km <= c.travel_km
    from public._thuis_candidates(coalesce(b.address->>'country', 'NL'), left(regexp_replace(coalesce(b.address->>'postcode', ''), '\D', '', 'g'), 4)) c
    order by (c.km <= c.travel_km) desc, round(c.km::numeric / 5), c.last_thuis asc nulls first;
end $$;
grant execute on function public.thuis_suggest(uuid) to authenticated;

-- Werkgebied instellen (styliste zelf of beheerder). Leeg = geen thuisadvies.
create or replace function public.set_thuis_area(p_stylist_id uuid, p_country text, p_pc4 text, p_km int) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_pc text := nullif(left(regexp_replace(coalesce(p_pc4, ''), '\D', '', 'g'), 4), '');
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'Geen rechten voor deze medewerker'; end if;
  if v_pc is not null and length(v_pc) <> 4 then raise exception 'Vul de vier cijfers van je postcode in'; end if;
  if upper(coalesce(p_country, 'NL')) not in ('NL', 'BE') then raise exception 'Kies Nederland of België'; end if;
  update stylists set home_country = upper(coalesce(p_country, 'NL')), home_pc4 = v_pc,
    travel_km = case when v_pc is null then null else nullif(p_km, 0) end
  where id = p_stylist_id;
end $$;
grant execute on function public.set_thuis_area(uuid, text, text, int) to authenticated;

-- Plaatsnaam en middelpunt van een postcode (voor het kaartje en de bevestiging in de UI).
create or replace function public.postcode_info(p_country text, p_pc4 text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object('place', place, 'lat', lat, 'lon', lon) from postcode_centroids
  where country = upper(coalesce(p_country, 'NL')) and pc4 = left(regexp_replace(coalesce(p_pc4, ''), '\D', '', 'g'), 4);
$$;
grant execute on function public.postcode_info(text, text) to anon, authenticated;

-- Moment vastleggen na het telefonisch afspreken (beheerder; later ook de styliste zelf).
create or replace function public.thuis_plan(p_booking_id uuid, p_stylist_id uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_dur int;
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.format <> 'thuis' then raise exception 'thuisaanvraag niet gevonden'; end if;
  if b.status not in ('requested', 'confirmed') then raise exception 'deze aanvraag is nog niet betaald of al geannuleerd'; end if;
  if p_start < now() then raise exception 'kies een moment in de toekomst'; end if;
  select duration_min into v_dur from services where id = b.service_id;
  update bookings set stylist_id = p_stylist_id, start_at = p_start, end_at = p_start + make_interval(mins => coalesce(v_dur, 60)),
    status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
  where id = p_booking_id;
  return p_booking_id;
exception when exclusion_violation then
  raise exception 'Deze styliste heeft op dat moment al een afspraak. Kies een ander moment.';
end $$;
grant execute on function public.thuis_plan(uuid, uuid, timestamptz) to authenticated;

-- Omzetten naar online advies: de klant kiest zelf een moment in de agenda van de styliste.
-- Het verschil betaalt de beheerder terug in WooCommerce.
create or replace function public.thuis_to_online(p_booking_id uuid, p_stylist_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_sid uuid;
begin
  if not public.is_admin() then raise exception 'geen toegang'; end if;
  perform public.require_meet_url(p_stylist_id);
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.format <> 'thuis' then raise exception 'thuisaanvraag niet gevonden'; end if;
  if b.status not in ('requested', 'confirmed') then raise exception 'deze aanvraag is nog niet betaald of al geannuleerd'; end if;
  select id into v_sid from services where key = 'pre_sample';
  update bookings set format = 'online', converted_from = 'thuis', service_id = v_sid, stylist_id = p_stylist_id,
    status = 'manual', invited_at = now(), gratis = false, start_at = now(), end_at = now()
  where id = p_booking_id;
  return p_booking_id;
end $$;
grant execute on function public.thuis_to_online(uuid, uuid) to authenticated;

-- Betaling binnen: thuisaanvragen gaan naar 'requested' (geen styliste of moment nodig).
do $mig$
declare def text; new_def text;
begin
  def := pg_get_functiondef('public.confirm_paid_booking(uuid)'::regprocedure);
  if position('''requested''' in def) > 0 then return; end if;
  new_def := replace(def,
    'if not found then return jsonb_build_object(''outcome'',''not_found''); end if;',
    'if not found then return jsonb_build_object(''outcome'',''not_found''); end if;
  if b.format = ''thuis'' then
    if b.status in (''requested'', ''confirmed'') then
      return jsonb_build_object(''outcome'',''requested'',''booking_id'',b.id,''already'',true);
    end if;
    update bookings set status = ''requested'', hold_expires_at = null where id = b.id;
    return jsonb_build_object(''outcome'',''requested'',''booking_id'',b.id,''already'',false);
  end if;');
  if new_def = def then raise exception 'confirm_paid_booking: invoegpunt niet gevonden'; end if;
  execute new_def;
end $mig$;
