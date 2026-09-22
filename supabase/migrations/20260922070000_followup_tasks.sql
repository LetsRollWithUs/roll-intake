-- Werkplek fase 4: echte opvolgtaken (actie + eigenaar + datum + uitkomst) per gesprek.
create table if not exists public.followup_tasks (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid references public.bookings(id) on delete cascade,
  stylist_id uuid references public.stylists(id),
  action text not null,
  owner text not null default 'styliste' check (owner in ('styliste','roll','klant')),
  due_date date,
  kind text not null default 'algemeen' check (kind in ('algemeen','sample_checkin','achteraan')),
  outcome text check (outcome is null or outcome in ('keuze_gemaakt','nog_twijfel','later_schilderen','hulp_roll','geen_reactie','verf_gekocht','anders')),
  note text,
  done_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);
create index if not exists followup_tasks_booking_idx on public.followup_tasks (booking_id, done_at, due_date);
create index if not exists followup_tasks_stylist_open_idx on public.followup_tasks (stylist_id, due_date) where done_at is null;

alter table public.followup_tasks enable row level security;
create policy "followup read" on public.followup_tasks for select to authenticated using (owns_stylist(stylist_id));
create policy "followup insert" on public.followup_tasks for insert to authenticated with check (owns_stylist(stylist_id));
create policy "followup update" on public.followup_tasks for update to authenticated using (owns_stylist(stylist_id)) with check (owns_stylist(stylist_id));
