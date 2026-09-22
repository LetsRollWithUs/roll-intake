-- Verfcommissie voor stylisten (pilot: 0 vast + 10% verfcommissie).
-- Persoonlijke kortingscode per styliste (eigen-klant-route).
alter table public.stylists add column if not exists discount_code text;
create unique index if not exists stylists_discount_code_key
  on public.stylists (lower(discount_code)) where discount_code is not null;

-- Grootboek: één regel per betaalde verforder.
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  woo_order_id text not null unique,
  stylist_id uuid references public.stylists(id),
  route text not null check (route in ('advies','code')),
  customer_email text,
  verf_excl numeric not null default 0,
  rate numeric not null default 0.10,
  amount numeric not null default 0,
  order_total numeric,
  currency text not null default 'EUR',
  status text not null default 'te_controleren'
    check (status in ('te_controleren','uitbetaalbaar','uitbetaald','vervallen')),
  conflict boolean not null default false,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists commissions_stylist_idx on public.commissions (stylist_id, created_at desc);
create index if not exists commissions_status_idx on public.commissions (status);

alter table public.commissions enable row level security;
-- Styliste ziet haar eigen commissie; beheerder ziet alles (owns_stylist = admin OR eigen).
create policy "commissions read" on public.commissions
  for select to authenticated using (owns_stylist(stylist_id));
-- Alleen beheerder past status/regels aan.
create policy "commissions admin write" on public.commissions
  for all to authenticated using (is_admin()) with check (is_admin());
