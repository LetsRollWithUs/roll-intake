-- Formaten per ruimte: lengte en breedte (met de bestaande hoogte en aftrek) voor wanden en plafond.
alter table public.mh_ruimtes add column if not exists lengte_m numeric;
alter table public.mh_ruimtes add column if not exists breedte_m numeric;
