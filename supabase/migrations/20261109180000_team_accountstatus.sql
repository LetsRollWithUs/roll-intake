-- Team-pagina: welke teamleden hebben een inlogaccount? (9 nov 2026)
-- Aanleiding: maurice@roll.nl stond in het team maar had geen account, waardoor inloggen en
-- "Wachtwoord wijzigen" niet werkten zonder dat het opviel. Alleen voor beheerders.
create or replace function public.admin_team_accounts()
returns table(email text, last_sign_in_at timestamptz)
language sql stable security definer set search_path to 'public', 'auth' as $$
  select lower(a.email), u.last_sign_in_at
  from public.advisors a
  join auth.users u on lower(u.email) = lower(a.email)
  where public.is_admin();
$$;
revoke all on function public.admin_team_accounts() from public, anon;
grant execute on function public.admin_team_accounts() to authenticated;
