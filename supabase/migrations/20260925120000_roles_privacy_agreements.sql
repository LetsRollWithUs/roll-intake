-- Rollen, afscherming per medewerker en samenwerkingsafspraken.
--
-- 1) Beheerder is een expliciete rol (advisors.role), niet langer "elk @roll.nl-adres".
-- 2) Medewerkers zien alleen hun eigen klanten: intakes, foto's en verstuurde adviesmails via
--    de boekingen waarvan zij de styliste zijn. Losse intakes en tegoeden: alleen beheer.
-- 3) Stylistenprofielen: medewerkers zien alleen hun eigen profiel.
-- 4) Samenwerkingsafspraken + commissiepercentage in een eigen tabel, alleen voor beheer.

-- 1) Rollen
alter table public.advisors add column if not exists role text not null default 'medewerker'
  check (role in ('beheerder', 'medewerker'));
update public.advisors set role = 'beheerder' where lower(email) in ('ingmar@roll.nl', 'maurice@roll.nl');

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.advisors a
    where lower(a.email) = lower(coalesce(auth.jwt() ->> 'email', '')) and a.role = 'beheerder'
  );
$$;

-- 2) Mag de ingelogde gebruiker deze intake zien? Beheer altijd; een medewerker alleen via een eigen boeking.
create or replace function public.can_see_intake(iid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select public.is_admin() or exists (
    select 1 from public.bookings b
    where (b.intake_id = iid or b.id = (select i.booking_id from public.intake i where i.id = iid))
      and b.stylist_id is not null and public.owns_stylist(b.stylist_id)
  );
$$;

-- Foto-pad begint met het intake-id.
create or replace function public.can_see_intake_path(p text) returns boolean
language plpgsql stable security definer set search_path to 'public' as $$
declare f text := split_part(p, '/', 1);
begin
  if f !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return public.is_admin(); end if;
  return public.can_see_intake(f::uuid);
end $$;

drop policy if exists "intake advisor select" on public.intake;
drop policy if exists "intake advisor update" on public.intake;
create policy "intake select" on public.intake for select using (public.can_see_intake(id));
create policy "intake update" on public.intake for update using (public.can_see_intake(id)) with check (public.can_see_intake(id));

drop policy if exists "advice_sends advisor read" on public.advice_sends;
create policy "advice_sends read" on public.advice_sends for select
  using (public.is_admin() or (intake_id is not null and public.can_see_intake(intake_id)));

drop policy if exists "advice_credits admin read" on public.advice_credits;
create policy "advice_credits admin read" on public.advice_credits for select using (public.is_admin());

drop policy if exists "intake-photos advisor read" on storage.objects;
create policy "intake-photos advisor read" on storage.objects for select
  using (bucket_id = 'intake-photos' and public.can_see_intake_path(name));

-- 3) Stylistenprofielen: eigen profiel of beheer.
drop policy if exists "stylists read" on public.stylists;
create policy "stylists read" on public.stylists for select
  using (public.is_admin() or lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- 4) Samenwerkingsafspraken (alleen beheer).
create table if not exists public.stylist_agreements (
  stylist_id uuid primary key references public.stylists(id) on delete cascade,
  commission_rate numeric check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 1)),
  notes text,
  start_date date,
  updated_at timestamptz not null default now(),
  updated_by text
);
alter table public.stylist_agreements enable row level security;
drop policy if exists "agreements admin" on public.stylist_agreements;
create policy "agreements admin" on public.stylist_agreements for all using (public.is_admin()) with check (public.is_admin());

insert into public.stylist_agreements (stylist_id, commission_rate)
  select id, commission_rate from public.stylists where commission_rate is not null
  on conflict (stylist_id) do nothing;
alter table public.stylists drop column if exists commission_rate;

-- Rol wijzigen (alleen beheer; niet jezelf terugzetten; altijd minstens één beheerder).
create or replace function public.set_advisor_role(p_email text, p_role text) returns void
language plpgsql security definer set search_path to 'public' as $$
begin
  if not public.is_admin() then raise exception 'Alleen voor beheer'; end if;
  if p_role not in ('beheerder', 'medewerker') then raise exception 'Onbekende rol'; end if;
  if lower(p_email) = lower(coalesce(auth.jwt() ->> 'email', '')) and p_role <> 'beheerder' then
    raise exception 'Je kunt jezelf niet terugzetten naar medewerker';
  end if;
  update public.advisors set role = p_role where lower(email) = lower(p_email);
  if not exists (select 1 from public.advisors where role = 'beheerder') then
    raise exception 'Er moet minstens één beheerder zijn';
  end if;
end $$;

-- Teamoverzicht voor de beheerpagina: account, rol, stylistenprofiel en afspraken.
create or replace function public.admin_team() returns table (
  email text, name text, role text,
  stylist_id uuid, stylist_name text, active boolean, meet_url text, discount_code text,
  commission_rate numeric, notes text, start_date date, updated_at timestamptz, updated_by text
) language sql stable security definer set search_path to 'public' as $$
  select a.email, a.name, a.role,
         s.id, s.name, s.active, s.meet_url, s.discount_code,
         g.commission_rate, g.notes, g.start_date, g.updated_at, g.updated_by
  from public.advisors a
  left join public.stylists s on lower(s.email) = lower(a.email)
  left join public.stylist_agreements g on g.stylist_id = s.id
  where public.is_admin()
  order by (a.role = 'beheerder') desc, coalesce(s.name, a.name, a.email);
$$;

grant execute on function public.set_advisor_role(text, text) to authenticated;
grant execute on function public.admin_team() to authenticated;

notify pgrst, 'reload schema';
