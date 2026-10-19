-- Kleurplan vanaf advies.roll.nl (meerdere ruimtes): wordt bewaard en per mail bevestigd. Pas na een klik op de link
-- maakt roll.nl het account en het project aan. Token alleen als hash; eenmalig te gebruiken, 14 dagen geldig.
create table if not exists public.mh_kleurplannen (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  voornaam text,
  postcode text,
  ruimtes jsonb not null default '[]'::jsonb,   -- [{soort, naam, nu}]
  token_hash text not null,
  created_at timestamptz not null default now(),
  verloopt_at timestamptz not null default now() + interval '14 days',
  geclaimd_at timestamptz,
  woo_user_id bigint,
  project_id uuid references public.mh_projecten(id) on delete set null
);
create index if not exists mh_kleurplannen_email_idx on public.mh_kleurplannen(lower(email), created_at desc);
alter table public.mh_kleurplannen enable row level security;
revoke all on public.mh_kleurplannen from anon, authenticated;
alter table public.mh_kleurplannen add column if not exists ip_hash text;
