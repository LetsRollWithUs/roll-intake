-- Afspraak beheren: ook foto en introductie van de styliste (live gelezen, dus klopt na een wissel).
create or replace function public.booking_by_token(p_token uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare b record; v_service record; v_stylist record; v_cutoff interval := interval '24 hours';
begin
  select * into b from bookings where manage_token = p_token;
  if b.id is null then return null; end if;
  select key, duration_min into v_service from services where id = b.service_id;
  select name, photo_path, bio into v_stylist from stylists where id = b.stylist_id;
  return jsonb_build_object(
    'service_key', v_service.key,
    'duration_min', v_service.duration_min,
    'start_at', b.start_at,
    'status', b.status,
    'reschedule_count', b.reschedule_count,
    'customer_name', b.customer_name,
    'stylist_name', v_stylist.name,
    'stylist_photo_path', v_stylist.photo_path,
    'stylist_bio', v_stylist.bio,
    'can_self_reschedule', (b.status = 'confirmed' and now() < b.start_at - v_cutoff and b.reschedule_count < 2),
    'can_self_plan', (b.status = 'manual' and b.invited_at is not null and b.stylist_id is not null and b.service_id is not null)
  );
end $function$;
