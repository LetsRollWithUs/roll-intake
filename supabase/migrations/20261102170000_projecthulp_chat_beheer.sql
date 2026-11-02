-- Jouw schilderplan: overdrachten beheren in intake.roll.nl/beheer/schilderplan.
-- Alleen beheerders lezen en wijzigen gesprekken; de edge function projecthulp-chat gebruikt de service role.
alter table public.projecthulp_chat
  add column if not exists overdracht_op timestamptz,
  add column if not exists overdracht_kanaal text,
  add column if not exists overgenomen_door text,
  add column if not exists overgenomen_op timestamptz,
  add column if not exists notitie text;

drop policy if exists "projecthulp_chat beheer lezen" on public.projecthulp_chat;
create policy "projecthulp_chat beheer lezen" on public.projecthulp_chat
  for select to authenticated using (is_admin());

drop policy if exists "projecthulp_chat beheer wijzigen" on public.projecthulp_chat;
create policy "projecthulp_chat beheer wijzigen" on public.projecthulp_chat
  for update to authenticated using (is_admin()) with check (is_admin());

create index if not exists projecthulp_chat_overdracht_idx on public.projecthulp_chat (overdracht_op desc) where code is not null;
