-- Uitkomst van de sample-check-in (stap 4): winnende kleur per ruimte, uitkomst en notitie.
-- Vorm: { at, by, outcome: keuze_gemaakt|meer_samples|nog_twijfel|later_schilderen|geen_reactie,
--         winners: [{ room, surface, color }], note }
alter table public.intake add column if not exists sample_checkin jsonb;
