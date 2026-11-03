-- Nakijklijst in beheer: beurten waarin de controle ingreep of iets misging. Alleen beheerders lezen en markeren.
alter table public.projecthulp_chat_log
  add column if not exists nagekeken_op timestamptz,
  add column if not exists nagekeken_door text,
  add column if not exists nakijk_notitie text;

alter table public.projecthulp_chat_log enable row level security;
drop policy if exists "projecthulp_chat_log beheer lezen" on public.projecthulp_chat_log;
create policy "projecthulp_chat_log beheer lezen" on public.projecthulp_chat_log
  for select to authenticated using (is_admin());
drop policy if exists "projecthulp_chat_log beheer nakijken" on public.projecthulp_chat_log;
create policy "projecthulp_chat_log beheer nakijken" on public.projecthulp_chat_log
  for update to authenticated using (is_admin()) with check (is_admin());

create index if not exists projecthulp_chat_log_nakijken_idx on public.projecthulp_chat_log (created_at desc)
  where controle is not null or fout is not null;
