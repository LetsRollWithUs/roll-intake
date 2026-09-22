-- Geeft de stylists-rij van de ingelogde gebruiker (koppeling op e-mail).
-- Voor het persoonlijke dashboard: naam voor de begroeting, id/meet_url voor
-- eigen afspraken. Retourneert niets voor een beheerder zonder stylist-rij.
create or replace function public.current_stylist()
returns table(id uuid, name text, email text, meet_url text)
language sql stable security definer set search_path to 'public'
as $function$
  select s.id, s.name, s.email, s.meet_url
  from public.stylists s
  where lower(s.email) = lower(coalesce(auth.jwt() ->> 'email', ''))
  limit 1;
$function$;

grant execute on function public.current_stylist() to authenticated;
