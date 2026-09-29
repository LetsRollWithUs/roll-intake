-- Meerdere agenda's per medewerker (max 5). Afspraken uit elke agenda blokkeren de beschikbaarheid.
-- De links zijn geheim: niet via de tabel leesbaar, alleen via RPC's voor de eigen styliste of een beheerder.
create table if not exists public.stylist_calendars (
  id uuid primary key default gen_random_uuid(),
  stylist_id uuid not null references public.stylists(id) on delete cascade,
  url text not null,
  label text,
  synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create index if not exists stylist_calendars_stylist_idx on public.stylist_calendars(stylist_id);
alter table public.stylist_calendars enable row level security;
revoke all on public.stylist_calendars from anon, authenticated;

alter table public.busy_blocks add column if not exists calendar_id uuid references public.stylist_calendars(id) on delete cascade;

-- Bestaande enkele agenda-link overzetten, inclusief de al opgehaalde blokken.
do $$
declare s record; v_id uuid;
begin
  for s in select id, ical_feed_url, ical_synced_at from stylists where coalesce(btrim(ical_feed_url), '') <> '' loop
    if not exists (select 1 from stylist_calendars c where c.stylist_id = s.id and c.url = btrim(s.ical_feed_url)) then
      insert into stylist_calendars (stylist_id, url, label, synced_at) values (s.id, btrim(s.ical_feed_url), 'Agenda 1', s.ical_synced_at) returning id into v_id;
      update busy_blocks set calendar_id = v_id where stylist_id = s.id and source = 'ical' and calendar_id is null;
    end if;
  end loop;
end $$;

create or replace function public.stylist_calendars_list(p_stylist_id uuid)
returns table(id uuid, url text, label text, synced_at timestamptz, last_error text)
language sql stable security definer set search_path to 'public' as $$
  select c.id, c.url, c.label, c.synced_at, c.last_error from stylist_calendars c
  where c.stylist_id = p_stylist_id and owns_stylist(p_stylist_id) order by c.created_at;
$$;

create or replace function public.stylist_calendar_add(p_stylist_id uuid, p_url text, p_label text default null) returns uuid
language plpgsql security definer set search_path to 'public' as $$
declare v_url text := btrim(coalesce(p_url, '')); v_id uuid;
begin
  if not owns_stylist(p_stylist_id) then raise exception 'Geen rechten voor deze medewerker'; end if;
  if v_url !~* '^(https?|webcal)://' then raise exception 'Plak een agenda-link die begint met https:// of webcal://'; end if;
  if (select count(*) from stylist_calendars where stylist_id = p_stylist_id) >= 5 then raise exception 'Je kunt maximaal 5 agenda''s koppelen'; end if;
  if exists (select 1 from stylist_calendars where stylist_id = p_stylist_id and url = v_url) then raise exception 'Deze agenda is al gekoppeld'; end if;
  insert into stylist_calendars (stylist_id, url, label) values (p_stylist_id, v_url, nullif(btrim(coalesce(p_label, '')), '')) returning id into v_id;
  return v_id;
end $$;

create or replace function public.stylist_calendar_remove(p_id uuid) returns void
language plpgsql security definer set search_path to 'public' as $$
declare v_sid uuid;
begin
  select stylist_id into v_sid from stylist_calendars where id = p_id;
  if v_sid is null then return; end if;
  if not owns_stylist(v_sid) then raise exception 'Geen rechten voor deze medewerker'; end if;
  delete from stylist_calendars where id = p_id; -- blokken verdwijnen mee (on delete cascade)
end $$;

revoke all on function public.stylist_calendars_list(uuid) from public, anon;
revoke all on function public.stylist_calendar_add(uuid, text, text) from public, anon;
revoke all on function public.stylist_calendar_remove(uuid) from public, anon;
grant execute on function public.stylist_calendars_list(uuid) to authenticated;
grant execute on function public.stylist_calendar_add(uuid, text, text) to authenticated;
grant execute on function public.stylist_calendar_remove(uuid) to authenticated;
