-- Archief voor het offerte-overzicht van het beheer (roll.nl/dashboard/offertes).
-- Het overzicht voegt offertes uit vier bronnen samen (offerte-tool op roll.nl, stylistes, Charlie, prijsopgave).
-- Besteld of vervallen gaat vanzelf naar het archief; met deze tabel zet het beheer er ook andere offertes in.
-- soort + sleutel wijzen de offerte in haar eigen bron aan (bijv. 'roll' + '412', 'charlie' + sessie).

create table if not exists public.offerte_archief (
  soort text not null,
  sleutel text not null,
  archived_at timestamptz not null default now(),
  archived_by text,
  primary key (soort, sleutel)
);
alter table public.offerte_archief enable row level security;

drop policy if exists offerte_archief_beheer on public.offerte_archief;
create policy offerte_archief_beheer on public.offerte_archief for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
