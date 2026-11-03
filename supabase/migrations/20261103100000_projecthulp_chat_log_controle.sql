-- Uitgaande controle van Jouw schilderplan: welke regels een antwoord brak (herkansing of zin weggehaald).
alter table public.projecthulp_chat_log add column if not exists controle jsonb;
create index if not exists projecthulp_chat_log_controle_idx on public.projecthulp_chat_log (created_at desc) where controle is not null;
