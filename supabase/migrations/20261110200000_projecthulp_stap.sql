-- Jouw verfplan: de stappen van de trechter, ook voor het eerste bericht (startpagina gezien, startkeuze gemaakt).
-- Vervangt de GTM-trigger die nooit is ingesteld: de browser meldt elke stap aan de edge function projecthulp-chat.
-- Alleen de edge function schrijft (service role); beheerders lezen.
create table if not exists public.projecthulp_stap (
  id bigint generated always as identity primary key,
  sessie text not null,
  stap text not null,
  extra jsonb,
  created_at timestamptz not null default now()
);
create index if not exists projecthulp_stap_tijd_idx on public.projecthulp_stap (created_at desc);
create index if not exists projecthulp_stap_sessie_idx on public.projecthulp_stap (sessie);

alter table public.projecthulp_stap enable row level security;
drop policy if exists "projecthulp_stap beheer lezen" on public.projecthulp_stap;
create policy "projecthulp_stap beheer lezen" on public.projecthulp_stap
  for select to authenticated using (is_admin());
