-- Offertes voor eigen klanten van een styliste (dus zonder Roll-adviesgesprek, boeking of intake).
-- De styliste kiest per offerte de verdeling tussen haar commissie en de korting voor de klant; de klant
-- krijgt nooit meer dan 10%. De offerte zelf leeft in de offerte-tool op roll.nl (offerte_id); deze tabel
-- is het overzicht voor het dashboard en de bron voor de commissie.
-- Schrijven gaat alleen via de edge function offerte-eigen (service role), zodat de verdeling en de
-- "Roll-klant"-regel niet te omzeilen zijn. Lezen: de styliste haar eigen offertes, beheer alles.
create table if not exists public.stylist_offers (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists(id),
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  offerte_id bigint unique,                 -- id in de offerte-tool (roll.nl/offerte)
  nummer text,
  versie int not null default 1,
  status text not null default 'concept' check (status in ('concept','verstuurd','besteld','vervallen')),
  commissie_pct numeric not null default 10 check (commissie_pct >= 0 and commissie_pct <= 20),
  korting_pct numeric not null default 10 check (korting_pct in (0, 5, 10)),
  roll_klant boolean not null default false,  -- had een Roll-adviesgesprek: 10% commissie, geen extra korting
  korting_aanvraag text check (korting_aanvraag is null or korting_aanvraag in ('aangevraagd','toegekend','afgewezen')),
  korting_reden text,
  totaal numeric,
  commissie_basis numeric,                   -- producten na korting, zonder btw en verzending
  klant_url text,
  mand_url text,
  sent_at timestamptz,
  sent_via text check (sent_via is null or sent_via in ('mail','link')),
  ordered_at timestamptz,
  woo_order_id text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists stylist_offers_stylist_idx on public.stylist_offers (stylist_id, created_at desc);
create index if not exists stylist_offers_email_idx on public.stylist_offers (lower(customer_email));

alter table public.stylist_offers enable row level security;
drop policy if exists "stylist_offers read" on public.stylist_offers;
create policy "stylist_offers read" on public.stylist_offers
  for select to authenticated using (owns_stylist(stylist_id));

-- Welke verdelingen (commissie, korting) een styliste mag kiezen. Beheer kan er een uitzetten.
create table if not exists public.stylist_offer_settings (
  id boolean primary key default true check (id),
  verdelingen jsonb not null default '[[10,10],[15,5],[20,0]]'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by text
);
insert into public.stylist_offer_settings (id) values (true) on conflict (id) do nothing;
alter table public.stylist_offer_settings enable row level security;
drop policy if exists "offer_settings read" on public.stylist_offer_settings;
create policy "offer_settings read" on public.stylist_offer_settings
  for select to authenticated using (is_advisor());
drop policy if exists "offer_settings admin update" on public.stylist_offer_settings;
create policy "offer_settings admin update" on public.stylist_offer_settings
  for update to authenticated using (is_admin()) with check (is_admin());

-- Commissie: nieuwe route 'offerte' (bestelling via een offerte voor een eigen klant), met de offerte erbij.
alter table public.commissions drop constraint if exists commissions_route_check;
alter table public.commissions add constraint commissions_route_check check (route in ('advies','code','offerte'));
alter table public.commissions add column if not exists offer_id uuid references public.stylist_offers(id) on delete set null;
alter table public.commissions add column if not exists klant_korting_pct numeric;

-- Roll-taak "korting aanvragen": de styliste vraagt een uitzondering aan voor een klant.
alter table public.roll_tasks drop constraint if exists roll_tasks_type_check;
alter table public.roll_tasks add constraint roll_tasks_type_check check (type in ('offerte','contact','maatwerk','nazorg','korting'));
alter table public.roll_tasks add column if not exists offer_id uuid references public.stylist_offers(id) on delete cascade;
