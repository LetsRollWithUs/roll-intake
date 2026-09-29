-- Geen afspraak bij een styliste zonder videolink: de klant krijgt anders een bevestiging zonder link.
create or replace function public.require_meet_url(p_stylist_id uuid) returns void
language plpgsql stable security definer set search_path to 'public' as $$
begin
  if not exists (select 1 from stylists where id = p_stylist_id and coalesce(btrim(meet_url), '') <> '') then
    raise exception 'Deze styliste heeft nog geen videolink. Vul die eerst in bij Agenda, dan kun je de klant uitnodigen.';
  end if;
end $$;
revoke all on function public.require_meet_url(uuid) from public, anon;

do $mig$
declare f text; def text; new_def text;
begin
  -- Publiek boeken en automatisch toewijzen: alleen stylisten met een videolink.
  foreach f in array array['available_slots', 'hold_slot', 'book_slot', 'book_with_credit', 'confirm_paid_booking'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f;
    new_def := replace(def, 'where st.active', 'where st.active and coalesce(btrim(st.meet_url), '''') <> ''''');
    new_def := replace(new_def, 'select id from stylists where active loop', 'select id from stylists where active and coalesce(btrim(meet_url), '''') <> '''' loop');
    if new_def = def and position('btrim(st.meet_url)' in def) = 0 and position('btrim(meet_url)' in def) = 0 then
      raise exception 'Geen stylistenfilter gevonden in %', f;
    end if;
    execute new_def;
  end loop;

  -- Handmatig plannen, uitnodigen en overdragen: duidelijke melding.
  foreach f in array array['plan_moment', 'invite_customer', 'booking_invite_self'] loop
    select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = f;
    if position('require_meet_url' in def) > 0 then continue; end if;
    new_def := replace(def, 'if not public.owns_stylist(p_stylist_id) then raise exception ''geen toegang''; end if;',
      'if not public.owns_stylist(p_stylist_id) then raise exception ''geen toegang''; end if;
  perform public.require_meet_url(p_stylist_id);');
    if new_def = def then raise exception 'Geen invoegpunt in %', f; end if;
    execute new_def;
  end loop;

  select pg_get_functiondef(p.oid) into def from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'reassign_booking';
  if position('require_meet_url' in def) = 0 then
    new_def := replace(def, 'then raise exception ''Onbekende of inactieve styliste''; end if;',
      'then raise exception ''Onbekende of inactieve styliste''; end if;
  if b.status in (''confirmed'', ''paid_unplaced'') and b.start_at > now() then perform public.require_meet_url(p_new_stylist_id); end if;');
    if new_def = def then raise exception 'Geen invoegpunt in reassign_booking'; end if;
    execute new_def;
  end if;
end $mig$;
