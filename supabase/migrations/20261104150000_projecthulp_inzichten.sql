-- Jouw schilderplan: inzichten in beheer. Klik op bestellen, orders per gesprek, en per beurt onderwerp en "geen antwoord".
-- Alleen de edge functions schrijven hier (service role); beheerders lezen.
alter table public.projecthulp_chat
  add column if not exists mand_op timestamptz,
  add column if not exists mand_soort text;

alter table public.projecthulp_chat_log
  add column if not exists onderwerp text,
  add column if not exists onbeantwoord boolean;

create table if not exists public.projecthulp_chat_order (
  order_id bigint primary key,
  sessie text not null,
  status text,
  totaal numeric(10,2),
  soort text,
  besteld_op timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists projecthulp_chat_order_sessie_idx on public.projecthulp_chat_order (sessie);

alter table public.projecthulp_chat_order enable row level security;
drop policy if exists "projecthulp_chat_order beheer lezen" on public.projecthulp_chat_order;
create policy "projecthulp_chat_order beheer lezen" on public.projecthulp_chat_order
  for select to authenticated using (is_admin());

create index if not exists projecthulp_chat_log_onbeantwoord_idx on public.projecthulp_chat_log (created_at desc) where onbeantwoord;
