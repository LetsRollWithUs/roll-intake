-- Wat een styliste in haar agenda invult, mag het boeken nooit blokkeren (9 nov 2026).
-- Oorzaak storing: een blok tot vlak voor middernacht (za 23:00-23:50). Bij 30 min sprong t + 30 min
-- van 23:30 naar 00:00, en 00:00 <= 23:50 is waar: de lus stopte nooit, available_slots liep in de timeout.
-- 1. De lussen stoppen zodra de volgende tijd over middernacht zou gaan.
-- 2. Een slot moet binnen dezelfde dag eindigen (ook bij reserveren en bevestigen).
-- 3. available_slots slaat een styliste over als haar dag een fout geeft, in plaats van alles te laten falen.
do $mig$
declare
  f text; def text; nieuw text;
begin
  -- 1. Lussen
  foreach f in array array['public.available_slots(text,date,date)', 'public._stylist_slots(uuid,date,date,text,interval)'] loop
    def := pg_get_functiondef(f::regprocedure);
    nieuw := replace(def,
      'while (t + make_interval(mins => v_dur)) <= iv.end_time loop',
      'while (t + make_interval(mins => v_dur)) <= iv.end_time and (t + make_interval(mins => v_dur)) > t loop');
    if nieuw = def then raise exception 'Geen invoegpunt (lus) in %', f; end if;
    execute nieuw;
  end loop;

  -- 3. Per styliste isoleren in available_slots
  def := pg_get_functiondef('public.available_slots(text,date,date)'::regprocedure);
  nieuw := replace(def,
    'for iv in select * from public.stylist_day_intervals(s.id, d) loop',
    'begin
      for iv in select * from public.stylist_day_intervals(s.id, d) loop');
  nieuw := regexp_replace(nieuw,
    '(t := t \+ make_interval\(mins => v_dur\);\s*end loop;\s*end loop;)',
    '\1
      exception when others then
        raise warning ''available_slots: styliste % op % overgeslagen: %'', s.id, d, sqlerrm;
      end;');
  if nieuw = def or position('exception when others' in nieuw) = 0 then raise exception 'Geen invoegpunt (isolatie) in available_slots'; end if;
  execute nieuw;

  -- 2. Slot binnen dezelfde dag
  foreach f in array array['public.book_slot(text,timestamp with time zone,text,text,text)', 'public.hold_slot(text,timestamp with time zone,text,text,text)', 'public.book_with_credit(uuid,text,timestamp with time zone,text,text,text)'] loop
    def := pg_get_functiondef(f::regprocedure);
    nieuw := replace(def,
      '(v_end at time zone v_tz)::time <= iv.end_time)',
      '(v_end at time zone v_tz)::time <= iv.end_time and (v_end at time zone v_tz)::time > (p_start at time zone v_tz)::time)');
    if nieuw = def then raise exception 'Geen invoegpunt (slot) in %', f; end if;
    execute nieuw;
  end loop;
  def := pg_get_functiondef('public.confirm_paid_booking(uuid)'::regprocedure);
  nieuw := replace(def,
    '(b.end_at at time zone v_tz)::time <= iv.end_time)',
    '(b.end_at at time zone v_tz)::time <= iv.end_time and (b.end_at at time zone v_tz)::time > (b.start_at at time zone v_tz)::time)');
  if nieuw = def then raise exception 'Geen invoegpunt (slot) in confirm_paid_booking'; end if;
  execute nieuw;
end $mig$;
