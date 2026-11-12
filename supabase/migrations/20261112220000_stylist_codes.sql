-- Kortingscodes van stylistes voor hun eigen klanten (besluit Ingmar 12 nov 2026, zoals afgesproken met Rachel).
-- Een styliste kan meerdere codes hebben, elk met een eigen verdeling: bijvoorbeeld 10% korting voor de klant en
-- 10% commissie, of 5% korting en 15% commissie (samen hooguit 20%). De klant vult de code in de webshop in; de
-- code bepaalt dan het commissiepercentage. De kortingsbon zelf staat in de webshop (Roll Partners).

create table if not exists public.stylist_codes (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists(id) on delete cascade,
  code text not null,
  korting_pct numeric not null check (korting_pct >= 0 and korting_pct <= 20),
  commissie_pct numeric not null check (commissie_pct >= 0 and commissie_pct <= 20),
  -- Een bestaande kortingsbon die alleen is gekoppeld (de bon zelf is niet door het dashboard gemaakt of aangepast).
  gekoppeld boolean not null default false,
  actief boolean not null default true,
  created_at timestamptz not null default now(),
  created_by text
);
create unique index if not exists stylist_codes_code on public.stylist_codes (lower(code));
create index if not exists stylist_codes_stylist on public.stylist_codes (stylist_id);
alter table public.stylist_codes enable row level security;

drop policy if exists stylist_codes_lezen on public.stylist_codes;
create policy stylist_codes_lezen on public.stylist_codes for select to authenticated using (public.owns_stylist(stylist_id));
drop policy if exists stylist_codes_beheer on public.stylist_codes;
create policy stylist_codes_beheer on public.stylist_codes for all to authenticated using (public.is_admin()) with check (public.is_admin());
