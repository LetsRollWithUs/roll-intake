-- submit_intake uitbreiden zodat de klant-intake room_measures meeschrijft (reken-engine).
CREATE OR REPLACE FUNCTION public.submit_intake(p_id uuid, p_row jsonb)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
declare
  v_help  text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'help_needs') x), '{}');
  v_moods text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'moods') x), '{}');
  v_likes text[] := coalesce((select array_agg(x) from jsonb_array_elements_text(p_row->'inspiration_likes') x), '{}');
  v_booking uuid := nullif(p_row->>'booking_id','')::uuid;
  v_mode text := p_row->>'mode';
  v_email text := lower(btrim(coalesce(p_row->>'contact_email','')));
  v_name text := left(btrim(coalesce(p_row->>'contact_name','')), 120);
  v_question text := left(coalesce(p_row->>'main_question',''), 4000);
  v_note text := left(coalesce(p_row->>'inspiration_note',''), 2000);
  v_pin text := case when p_row->>'pinterest_url' ~* '^https?://' then left(p_row->>'pinterest_url', 500) else null end;
  v_other text := case when p_row->>'other_inspiration_url' ~* '^https?://' then left(p_row->>'other_inspiration_url', 500) else null end;
  v_rooms jsonb := case when jsonb_typeof(p_row->'rooms')='array' then p_row->'rooms' else '[]'::jsonb end;
  v_colors jsonb := case when jsonb_typeof(p_row->'colors')='array' then p_row->'colors' else '[]'::jsonb end;
  v_samples jsonb := case when jsonb_typeof(p_row->'samples')='array' then p_row->'samples' else '[]'::jsonb end;
  v_images jsonb := case when jsonb_typeof(p_row->'inspiration_images')='array' then p_row->'inspiration_images' else '[]'::jsonb end;
  v_payload jsonb := coalesce(p_row->'payload','{}'::jsonb);
  v_measures jsonb := case when jsonb_typeof(p_row->'room_measures')='object' then p_row->'room_measures' else '{}'::jsonb end;
  v_existing record;
  v_couple boolean := false;
begin
  if v_email = '' or v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'Vul een geldig e-mailadres in';
  end if;
  if jsonb_array_length(v_rooms) > 25 or jsonb_array_length(v_samples) > 40
     or jsonb_array_length(v_images) > 40 or jsonb_array_length(v_colors) > 60 then
    raise exception 'Er zijn te veel items meegestuurd';
  end if;

  select status, advisor_status, advisor_outcome, advisor_advice, advisor_notes
    into v_existing from intake where id = p_id;
  if found then
    if coalesce(v_existing.advisor_status, 'nieuw') <> 'nieuw'
       or v_existing.advisor_outcome is not null
       or (jsonb_typeof(v_existing.advisor_advice) = 'array' and jsonb_array_length(v_existing.advisor_advice) > 0)
       or coalesce(v_existing.advisor_notes, '') <> '' then
      raise exception 'Deze intake is al in behandeling en kan niet meer gewijzigd worden';
    end if;
  end if;

  if v_booking is not null then
    select true into v_couple from bookings b where b.id = v_booking and lower(b.customer_email) = v_email;
    v_couple := coalesce(v_couple, false);
  end if;

  update public.intake set
    status = 'verzonden',
    contact_name = v_name,
    contact_email = v_email,
    main_question = v_question,
    help_needs = v_help, moods = v_moods, inspiration_likes = v_likes,
    inspiration_note = v_note,
    boldness = nullif(p_row->>'boldness','')::int,
    rooms = v_rooms, colors = v_colors,
    has_samples = p_row->>'has_samples',
    samples = v_samples,
    pinterest_url = v_pin,
    other_inspiration_url = v_other,
    inspiration_images = v_images,
    planning = p_row->>'planning',
    complexity_level = p_row->>'complexity_level',
    complexity_score = nullif(p_row->>'complexity_score','')::numeric,
    booking_id = case when v_couple then v_booking else booking_id end,
    mode = case when v_couple then v_mode else mode end,
    payload = v_payload,
    room_measures = v_measures
  where id = p_id;

  if not found then
    insert into public.intake (id, status, contact_name, contact_email, main_question,
      help_needs, moods, inspiration_likes, inspiration_note, boldness, rooms, colors,
      has_samples, samples, pinterest_url, other_inspiration_url, inspiration_images,
      planning, complexity_level, complexity_score, booking_id, mode, payload, room_measures)
    values (p_id, 'verzonden', v_name, v_email, v_question,
      v_help, v_moods, v_likes, v_note, nullif(p_row->>'boldness','')::int,
      v_rooms, v_colors, p_row->>'has_samples', v_samples, v_pin, v_other, v_images,
      p_row->>'planning', p_row->>'complexity_level', nullif(p_row->>'complexity_score','')::numeric,
      case when v_couple then v_booking else null end, case when v_couple then v_mode else null end, v_payload, v_measures);
  end if;

  if v_couple then
    update public.bookings set intake_id = p_id where id = v_booking;
  end if;
end $function$;
