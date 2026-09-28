-- Kanban: kaarten archiveren en terugzetten. Een styliste archiveert haar eigen afspraken,
-- losse intakes (zonder afspraak) archiveert alleen de beheerder. Verwijderen loopt via de
-- booking-functie (actie dossier_delete, alleen beheerders), omdat daar ook de foto's weg moeten.
alter table public.bookings add column if not exists archived_at timestamptz, add column if not exists archived_by text;
alter table public.intake add column if not exists archived_at timestamptz, add column if not exists archived_by text;

create or replace function public.dossier_archive(p_booking_id uuid, p_intake_id uuid, p_archive boolean)
returns void language plpgsql security definer set search_path to 'public' as $$
declare v_sid uuid; v_who text := auth.jwt()->>'email';
begin
  if p_booking_id is not null then
    select stylist_id into v_sid from public.bookings where id = p_booking_id;
    if not found then raise exception 'afspraak niet gevonden'; end if;
    if not public.owns_stylist(v_sid) then raise exception 'geen toegang'; end if;
    update public.bookings set archived_at = case when p_archive then now() end, archived_by = case when p_archive then v_who end where id = p_booking_id;
  elsif p_intake_id is not null then
    if not public.is_admin() then raise exception 'geen toegang'; end if;
    update public.intake set archived_at = case when p_archive then now() end, archived_by = case when p_archive then v_who end where id = p_intake_id;
  end if;
end $$;
revoke all on function public.dossier_archive(uuid, uuid, boolean) from public, anon;
grant execute on function public.dossier_archive(uuid, uuid, boolean) to authenticated;
