-- Adres per huis (voor het overzicht, de kaart en later advies aan huis).
alter table public.mh_projecten add column if not exists straat text;
alter table public.mh_projecten add column if not exists huisnummer text;
alter table public.mh_projecten add column if not exists plaats text;
