-- Werkafspraken met stylisten (start pilot): profiel, thuisaanvragen zelf oppakken, bezoekvergoeding,
-- niet verschenen bij online gesprekken, en de basis voor het maandoverzicht.

-- ── 1. Profiel: foto en introductie ───────────────────────────────────────────
alter table public.stylists add column if not exists photo_path text;
alter table public.stylists add column if not exists bio text;
grant select (photo_path, bio) on public.stylists to authenticated;

insert into storage.buckets (id, name, public) values ('stylist-photos', 'stylist-photos', true)
on conflict (id) do nothing;
drop policy if exists "stylist-photos upload" on storage.objects;
create policy "stylist-photos upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'stylist-photos' and public.owns_stylist(((storage.foldername(name))[1])::uuid));
drop policy if exists "stylist-photos update" on storage.objects;
create policy "stylist-photos update" on storage.objects for update to authenticated
  using (bucket_id = 'stylist-photos' and public.owns_stylist(((storage.foldername(name))[1])::uuid));
drop policy if exists "stylist-photos delete" on storage.objects;
create policy "stylist-photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'stylist-photos' and public.owns_stylist(((storage.foldername(name))[1])::uuid));

create or replace function public.set_stylist_profile(p_stylist_id uuid, p_bio text, p_photo_path text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.owns_stylist(p_stylist_id) then raise exception 'Geen rechten voor deze medewerker'; end if;
  update stylists set bio = nullif(left(btrim(coalesce(p_bio, '')), 1200), ''), photo_path = nullif(btrim(coalesce(p_photo_path, '')), '')
  where id = p_stylist_id;
end $$;
revoke all on function public.set_stylist_profile(uuid, text, text) from public, anon;
grant execute on function public.set_stylist_profile(uuid, text, text) to authenticated;

-- ── 2. Thuisaanvraag toewijzen en zelf inplannen ───────────────────────────────
-- Na betaling: de dichtstbijzijnde styliste binnen haar reisafstand (bij gelijke afstand wie het langst
-- geen thuisklant had) krijgt de aanvraag. Geen styliste in de buurt: blijft bij beheer.
create or replace function public.thuis_assign(p_booking_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_sid uuid;
begin
  select * into b from bookings where id = p_booking_id;
  if not found or b.format <> 'thuis' or b.stylist_id is not null then return b.stylist_id; end if;
  select c.stylist_id into v_sid
  from public._thuis_candidates(coalesce(b.address->>'country', 'NL'), left(regexp_replace(coalesce(b.address->>'postcode', ''), '\D', '', 'g'), 4)) c
  where c.km <= c.travel_km
  order by round(c.km::numeric / 5), c.last_thuis asc nulls first
  limit 1;
  if v_sid is not null then update bookings set stylist_id = v_sid where id = p_booking_id; end if;
  return v_sid;
end $$;
revoke all on function public.thuis_assign(uuid) from public, anon, authenticated;

-- Moment vastleggen: beheerder, of de styliste aan wie de aanvraag is toegewezen (alleen voor zichzelf).
create or replace function public.thuis_plan(p_booking_id uuid, p_stylist_id uuid, p_start timestamptz) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_dur int;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.format <> 'thuis' then raise exception 'thuisaanvraag niet gevonden'; end if;
  if not (public.is_admin() or (b.stylist_id is not null and public.owns_stylist(b.stylist_id) and p_stylist_id = b.stylist_id)) then
    raise exception 'geen toegang';
  end if;
  if b.status not in ('requested', 'confirmed') then raise exception 'deze aanvraag is nog niet betaald of al geannuleerd'; end if;
  if p_start < now() then raise exception 'kies een moment in de toekomst'; end if;
  select duration_min into v_dur from services where id = b.service_id;
  update bookings set stylist_id = p_stylist_id, start_at = p_start, end_at = p_start + make_interval(mins => coalesce(v_dur, 60)),
    status = 'confirmed', confirmed_at = coalesce(confirmed_at, now())
  where id = p_booking_id;
  return p_booking_id;
exception when exclusion_violation then
  raise exception 'Op dat moment staat al een afspraak in je agenda. Kies een ander moment.';
end $$;

-- ── 3. Uitkomst van een thuisbezoek + bezoekvergoeding ─────────────────────────
-- Per afspraak één regel; na een annulering kan er later een vervangend bezoek met een eigen regel volgen.
create table if not exists public.thuis_visits (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.bookings(id) on delete cascade,
  stylist_id uuid references public.stylists(id),
  planned_at timestamptz,
  outcome text not null check (outcome in ('uitgevoerd', 'geannuleerd_ruim', 'geannuleerd_kort', 'dichte_deur')),
  fee numeric not null default 0,
  note text,
  registered_by text,
  created_at timestamptz not null default now()
);
create index if not exists thuis_visits_stylist_idx on public.thuis_visits(stylist_id, created_at);
alter table public.thuis_visits enable row level security;
drop policy if exists "thuis_visits lezen" on public.thuis_visits;
create policy "thuis_visits lezen" on public.thuis_visits for select to authenticated using (public.is_admin() or public.owns_stylist(stylist_id));
drop policy if exists "thuis_visits beheer" on public.thuis_visits;
create policy "thuis_visits beheer" on public.thuis_visits for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- Vergoedingen (excl. btw): uitgevoerd € 75 · ruim vooraf geannuleerd/verzet € 0 · binnen 24 uur € 37,50 · onderweg/dichte deur € 75.
create or replace function public.thuis_outcome(p_booking_id uuid, p_outcome text, p_note text default null) returns numeric
language plpgsql security definer set search_path to 'public' as $$
declare b record; v_fee numeric;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found or b.format <> 'thuis' or b.stylist_id is null then raise exception 'thuisafspraak niet gevonden'; end if;
  if not (public.is_admin() or public.owns_stylist(b.stylist_id)) then raise exception 'geen toegang'; end if;
  if b.status <> 'confirmed' then raise exception 'er staat geen gepland bezoek'; end if;
  v_fee := case p_outcome when 'uitgevoerd' then 75 when 'geannuleerd_ruim' then 0 when 'geannuleerd_kort' then 37.5 when 'dichte_deur' then 75 else null end;
  if v_fee is null then raise exception 'onbekende uitkomst'; end if;
  insert into thuis_visits (booking_id, stylist_id, planned_at, outcome, fee, note, registered_by)
  values (b.id, b.stylist_id, b.start_at, p_outcome, v_fee, nullif(left(btrim(coalesce(p_note, '')), 500), ''), coalesce(auth.jwt() ->> 'email', ''));
  if p_outcome = 'uitgevoerd' then
    update bookings set gesprek_gevoerd_at = coalesce(gesprek_gevoerd_at, now()) where id = b.id;
  else
    -- Niet doorgegaan: terug naar "nog inplannen", zodat een vervangend bezoek vastgelegd kan worden.
    update bookings set status = 'requested', start_at = now(), end_at = now() where id = b.id;
  end if;
  return v_fee;
end $$;
revoke all on function public.thuis_outcome(uuid, text, text) from public, anon;
grant execute on function public.thuis_outcome(uuid, text, text) to authenticated;

-- ── 4. Niet verschenen bij een online gesprek ──────────────────────────────────
-- De klant kiest daarna zelf een nieuw moment in de agenda van dezelfde styliste (zelfde route als "klant kiest zelf").
alter table public.bookings add column if not exists no_show_at timestamptz;
create or replace function public.booking_no_show(p_booking_id uuid) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare b record;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'afspraak niet gevonden'; end if;
  if not (public.is_admin() or (b.stylist_id is not null and public.owns_stylist(b.stylist_id))) then raise exception 'geen toegang'; end if;
  if b.format <> 'online' or b.status <> 'confirmed' then raise exception 'alleen voor een geplande online afspraak'; end if;
  if b.start_at > now() then raise exception 'de afspraak is nog niet begonnen'; end if;
  update bookings set no_show_at = now(), status = 'manual', invited_at = now(), start_at = now(), end_at = now() where id = p_booking_id;
  return p_booking_id;
end $$;
revoke all on function public.booking_no_show(uuid) from public, anon;
grant execute on function public.booking_no_show(uuid) to authenticated;

-- ── 5. Aanvullend interieuradvies: moment van boeken (voor het maandoverzicht) ──
alter table public.bookings add column if not exists upsell_booked_at timestamptz;
create or replace function public.trg_upsell_booked_at() returns trigger language plpgsql as $$
begin
  if new.upsell_booked and not coalesce(old.upsell_booked, false) then new.upsell_booked_at := coalesce(new.upsell_booked_at, now()); end if;
  if not new.upsell_booked then new.upsell_booked_at := null; end if;
  return new;
end $$;
drop trigger if exists upsell_booked_at on public.bookings;
create trigger upsell_booked_at before update of upsell_booked on public.bookings for each row execute function public.trg_upsell_booked_at();
