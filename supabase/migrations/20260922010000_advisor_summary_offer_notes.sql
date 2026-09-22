-- Fase 2 stylist-dashboard: gesprekssamenvatting (kan mee in de opvolgmail)
-- en een offerte-notitie voor het Roll-kantoor (interne offerte-input).
alter table public.intake add column if not exists advisor_summary text;
alter table public.intake add column if not exists advisor_offer_notes text;
