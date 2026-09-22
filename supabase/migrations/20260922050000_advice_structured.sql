-- Werkplek fase 2: gestructureerd advies (klanttekst apart van intern) + verzendlog klantmail.
alter table public.intake add column if not exists advice_client jsonb;      -- {answer, rooms:[{room,surface,color,status,product,m2,liters,motivation}], sample_instruction, next_step}
alter table public.intake add column if not exists advice_internal text;      -- interne notities (nooit naar klant)
alter table public.intake add column if not exists followup_plan jsonb;       -- {what, who, when}
alter table public.intake add column if not exists followup_route text        -- samples | zelf | roll
  check (followup_route is null or followup_route in ('samples','zelf','roll'));

-- Eenmalige migratie van de oude losse velden naar de nieuwe structuur.
update public.intake set
  advice_client = jsonb_build_object(
    'answer', coalesce(advisor_summary, ''),
    'rooms', coalesce((
      select jsonb_agg(jsonb_build_object(
        'room', a->>'room', 'surface', '', 'color', a->>'color', 'status', 'voorgesteld',
        'product', coalesce(a->>'product','Muurverf'), 'm2', coalesce(a->>'m2',''), 'liters', coalesce(a->>'liters',''), 'motivation', ''))
      from jsonb_array_elements(coalesce(advisor_advice,'[]'::jsonb)) a), '[]'::jsonb),
    'sample_instruction', '', 'next_step', ''),
  advice_internal = nullif(concat_ws(E'\n\n', advisor_notes, advisor_offer_notes), ''),
  followup_route = case advisor_outcome when 'samples_needed' then 'samples' when 'color_chosen' then 'zelf' when 'followup_needed' then 'roll' else null end
where advice_client is null and (advisor_summary is not null or advisor_advice <> '[]'::jsonb or advisor_notes is not null);

-- Verzendlog: wat de klant daadwerkelijk ontving.
create table if not exists public.advice_sends (
  id uuid primary key default gen_random_uuid(),
  intake_id uuid references public.intake(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  route text not null,
  subject text not null,
  body text not null,
  sent_to text,
  sent_by text,
  sent_at timestamptz not null default now()
);
create index if not exists advice_sends_intake_idx on public.advice_sends (intake_id, sent_at desc);
alter table public.advice_sends enable row level security;
create policy "advice_sends advisor read" on public.advice_sends for select to authenticated using (is_advisor());
