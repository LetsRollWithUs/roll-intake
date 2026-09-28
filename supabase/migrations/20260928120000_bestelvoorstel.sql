-- Bestelvoorstel (offertes uit het kleuradvies): status van het voorstel op de intake,
-- nieuwe taaktypes voor Roll en een interne melding (Klaviyo-metric "Roll melding") aan de beheerders.

alter table public.intake
  add column if not exists offer_status text check (offer_status in ('concept','verstuurd','besteld')),
  add column if not exists offer_sent_at timestamptz,
  add column if not exists offer_total numeric,
  add column if not exists offer_nazorg_at timestamptz;

-- maatwerk = voorstel boven EUR 1.000 met extra korting door Roll; nazorg = 10 dagen na het voorstel geen bestelling.
alter table public.roll_tasks drop constraint if exists roll_tasks_type_check;
alter table public.roll_tasks add constraint roll_tasks_type_check check (type in ('offerte','contact','maatwerk','nazorg'));

-- Interne melding naar elke beheerder via de outbox (de notification-worker verstuurt en probeert opnieuw).
create or replace function public.roll_melding(p_soort text, p_props jsonb, p_key text)
returns void language plpgsql security definer set search_path to 'public' as $$
declare a record;
begin
  for a in select email from public.advisors where role = 'beheerder' and email is not null loop
    insert into public.notification_outbox (metric, profile, properties, profile_props, unique_id)
    values ('Roll melding', jsonb_build_object('email', a.email),
            p_props || jsonb_build_object('soort', p_soort, 'dashboard_url', coalesce(p_props->>'dashboard_url', 'https://intake.roll.nl/beheer/taken')),
            '{}'::jsonb, p_key || ':' || a.email);
  end loop;
end $$;
revoke all on function public.roll_melding(text, jsonb, text) from public, anon, authenticated;

-- Elke nieuwe Roll-taak geeft een seintje aan Maurice en Ingmar.
create or replace function public.trg_roll_task_melding() returns trigger
language plpgsql security definer set search_path to 'public' as $$
declare v_klant text; v_styliste text;
begin
  select b.customer_name, s.name into v_klant, v_styliste
    from public.bookings b left join public.stylists s on s.id = b.stylist_id where b.id = new.booking_id;
  perform public.roll_melding('taak_' || new.type, jsonb_build_object(
    'klant_naam', coalesce(v_klant, 'klant'), 'styliste', v_styliste, 'aangevraagd_door', new.requested_by,
    'notitie', new.payload->>'notes', 'taak_id', new.id,
    'dashboard_url', 'https://intake.roll.nl/beheer/taken'), 'taak:' || new.id);
  return new;
end $$;
drop trigger if exists roll_task_melding on public.roll_tasks;
create trigger roll_task_melding after insert on public.roll_tasks for each row execute function public.trg_roll_task_melding();
