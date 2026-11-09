-- Waar een gesprek vandaan komt: de utm-velden van de link (samplemail, later quizmail). bron bestond al.
alter table public.projecthulp_chat add column if not exists utm jsonb;
