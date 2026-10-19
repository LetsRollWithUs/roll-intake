-- Ondergrond per ruimte (bepaalt voorstrijk) en een eigen status van de klant (nog niet getest, twijfel, uitgesteld, klaar).
alter table public.mh_ruimtes add column if not exists ondergrond text not null default 'bestaand';
alter table public.mh_ruimtes add column if not exists status_klant text;
