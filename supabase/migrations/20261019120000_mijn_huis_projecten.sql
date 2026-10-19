-- Mijn huis (roll.nl): projecten (huizen) en ruimtes van een klant. Eigenaar = WooCommerce-gebruiker (woo_user_id);
-- alleen bereikbaar via de edge function mijn-huis (service role), dus RLS aan zonder policies.

create table if not exists public.mh_projecten (
  id uuid primary key default gen_random_uuid(),
  woo_user_id bigint not null,
  email text,
  naam text not null default 'Mijn huis',
  postcode text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists mh_projecten_user_idx on public.mh_projecten(woo_user_id) where archived_at is null;
alter table public.mh_projecten enable row level security;

create table if not exists public.mh_ruimtes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.mh_projecten(id) on delete cascade,
  naam text not null,
  soort text,
  kleur_id text,                         -- gekozen muurkleur (Roll-kleur-id)
  test_kleuren text[] not null default '{}',
  plafond_mee boolean not null default false,
  plafond_kleur_id text,
  omtrek_m numeric,                      -- muren: omtrek x hoogte min ramen en deuren
  hoogte_m numeric,
  aftrek_m2 numeric,
  muur_m2 numeric,                       -- direct ingevuld, of berekend uit de maten
  plafond_m2 numeric,
  quiz_result_id uuid,
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);
create index if not exists mh_ruimtes_project_idx on public.mh_ruimtes(project_id) where archived_at is null;
alter table public.mh_ruimtes enable row level security;

revoke all on public.mh_projecten, public.mh_ruimtes from anon, authenticated;
