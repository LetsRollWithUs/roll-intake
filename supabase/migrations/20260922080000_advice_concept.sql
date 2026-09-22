-- Werkplek fase 5: conceptvoorbereiding op basis van de intake (AI-concept, altijd door de styliste goed te keuren).
alter table public.intake add column if not exists advice_concept jsonb;
alter table public.intake add column if not exists advice_concept_at timestamptz;
