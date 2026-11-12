-- Centraal dashboard (roll.nl/dashboard), fundament.
-- Een partner is een organisatie waar Roll mee samenwerkt (makelaar, creator, merk, later schilder).
-- Mensen horen bij een partner via hun e-mailadres, net als bij advisors en stylists.
-- Stylistes blijven in hun eigen tabellen staan; mijn_toegang() voegt alles samen tot een antwoord
-- waarmee het dashboard kiest wat iemand te zien krijgt.

create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  soort text not null check (soort in ('makelaar', 'creator', 'merk', 'schilder', 'overig')),
  naam text not null,
  actief boolean not null default true,
  -- Vrije instellingen per partner (bijv. welke blokken aan staan); de codes en percentages blijven op roll.nl.
  instellingen jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.partner_members (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references public.partners(id) on delete cascade,
  email text not null,
  naam text,
  created_at timestamptz not null default now()
);
create unique index if not exists partner_members_uniek on public.partner_members (partner_id, lower(email));
create index if not exists partner_members_email on public.partner_members (lower(email));

alter table public.partners enable row level security;
alter table public.partner_members enable row level security;

-- Hoort de ingelogde gebruiker bij deze partner? Security definer, zodat de policy op partners
-- de ledentabel mag raadplegen zonder dat leden elkaars regels hoeven te kunnen lezen.
create or replace function public.is_partner_lid(pid uuid) returns boolean
language sql stable security definer set search_path to 'public' as $$
  select exists (
    select 1 from public.partner_members m
    where m.partner_id = pid and lower(m.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  );
$$;
revoke all on function public.is_partner_lid(uuid) from public, anon;
grant execute on function public.is_partner_lid(uuid) to authenticated;

drop policy if exists partners_beheer on public.partners;
create policy partners_beheer on public.partners for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists partners_eigen on public.partners;
create policy partners_eigen on public.partners for select to authenticated
  using (actief and public.is_partner_lid(id));

drop policy if exists partner_members_beheer on public.partner_members;
create policy partner_members_beheer on public.partner_members for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
drop policy if exists partner_members_eigen on public.partner_members;
create policy partner_members_eigen on public.partner_members for select to authenticated
  using (lower(email) = lower(coalesce(auth.jwt() ->> 'email', '')));

-- Wat mag de ingelogde gebruiker zien? Een antwoord voor het hele dashboard.
create or replace function public.mijn_toegang() returns jsonb
language sql stable security definer set search_path to 'public' as $$
  with ik as (select lower(coalesce(auth.jwt() ->> 'email', '')) as mail)
  select jsonb_build_object(
    'beheerder', exists (select 1 from public.advisors a, ik where lower(a.email) = ik.mail and a.role = 'beheerder'),
    'styliste',  exists (select 1 from public.advisors a, ik where lower(a.email) = ik.mail),
    'partners',  coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'slug', p.slug, 'soort', p.soort, 'naam', p.naam) order by p.naam)
      from public.partners p
      join public.partner_members m on m.partner_id = p.id, ik
      where p.actief and lower(m.email) = ik.mail and ik.mail <> ''
    ), '[]'::jsonb)
  );
$$;
revoke all on function public.mijn_toegang() from public, anon;
grant execute on function public.mijn_toegang() to authenticated;

-- De twee partners van nu. Hun mensen komen er in fase 3 bij; tot die tijd werkt hun dashboard op roll.nl zoals het was.
insert into public.partners (slug, soort, naam) values
  ('arens', 'makelaar', 'Arens Makelaars'),
  ('luz-and-moon', 'creator', 'Luz and Moon')
on conflict (slug) do nothing;
