-- Turnstile-meetlog: per gecontroleerd verzoek de uitkomst, zodat we in meet-modus kunnen zien
-- of echte klanten er zonder problemen doorheen komen voordat we gaan blokkeren.
-- Alleen de service role schrijft; alleen beheerders lezen. Geen persoonsgegevens.
create table if not exists public.turnstile_log (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  action text not null,
  ok boolean not null,
  codes text[] not null default '{}',
  hostname text,
  mode text not null,
  blocked boolean not null default false
);
alter table public.turnstile_log enable row level security;
drop policy if exists "turnstile_log admin read" on public.turnstile_log;
create policy "turnstile_log admin read" on public.turnstile_log for select to authenticated using (public.is_admin());
