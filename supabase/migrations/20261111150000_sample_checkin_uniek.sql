-- Hooguit een open sample check-in per gesprek. De webshop stuurt bij een bestelling soms twee
-- meldingen tegelijk; zo kan er nooit een dubbele taak ontstaan.
create unique index if not exists followup_tasks_open_checkin_uniek
  on public.followup_tasks (booking_id) where kind = 'sample_checkin' and done_at is null;
