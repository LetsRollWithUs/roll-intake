-- Boeken vanuit roll.nl/kleurplan: het token van het bewaarde plan gaat mee met de boeking.
-- De booking-functie (status, met_kleurplan) haalt het plan op; de intake vult ruimtes, maten en kleuren voor.
alter table public.bookings add column if not exists kleurplan_token text;
comment on column public.bookings.kleurplan_token is 'Token van een bewaard plan op roll.nl/kleurplan; de intake vult daarmee ruimtes, maten en kleuren voor.';
