-- Werkplek fase 3: "Hulp van Roll aanvragen". Roll maakt offertes en pakt bestelvragen op,
-- de styliste levert de gegevens. Elke aanvraag is een taak met eigenaar, opvolgdatum en status.
create table if not exists public.roll_tasks (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('offerte','contact')),
  booking_id uuid references public.bookings(id) on delete cascade,
  intake_id uuid references public.intake(id) on delete set null,
  stylist_id uuid references public.stylists(id),
  requested_by text,
  owner text,
  due_date date,
  status text not null default 'aangevraagd'
    check (status in ('aangevraagd','opgepakt','verstuurd','afgerond')),
  payload jsonb not null default '{}'::jsonb,   -- {rooms:[{room,surface,color,color_status,product,m2,dimensions,substrate}], planning, notes}
  result jsonb,                                  -- {offer_url, note}
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists roll_tasks_status_idx on public.roll_tasks (status, due_date);
create index if not exists roll_tasks_booking_idx on public.roll_tasks (booking_id);

alter table public.roll_tasks enable row level security;
-- Styliste ziet en maakt taken voor haar eigen boekingen; beheerder ziet en beheert alles.
create policy "roll_tasks read" on public.roll_tasks for select to authenticated using (owns_stylist(stylist_id));
create policy "roll_tasks insert" on public.roll_tasks for insert to authenticated with check (owns_stylist(stylist_id));
create policy "roll_tasks admin update" on public.roll_tasks for update to authenticated using (is_admin()) with check (is_admin());
