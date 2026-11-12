-- Eigen wachtwoord- en uitnodigingsmail voor het dashboard (roll.nl/dashboard).
-- De edge function dashboard-toegang maakt de link en laat roll.nl de mail versturen. Deze tabel begrenst
-- hoe vaak dat per adres en in totaal gebeurt; alleen de service-rol komt erbij.

create table if not exists public.dashboard_mail_log (
  id bigint generated always as identity primary key,
  email text not null,
  soort text not null,
  verstuurd boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists dashboard_mail_log_tijd on public.dashboard_mail_log (created_at desc);
create index if not exists dashboard_mail_log_email on public.dashboard_mail_log (lower(email), created_at desc);
alter table public.dashboard_mail_log enable row level security;

-- Staat dit adres op een lijst die toegang geeft tot het dashboard (team of partner)? Met de naam voor de aanhef.
create or replace function public.dashboard_toegang_voor(p_email text) returns jsonb
language sql stable security definer set search_path to 'public' as $$
  select jsonb_build_object(
    'team', (select jsonb_build_object('naam', a.name) from public.advisors a where lower(a.email) = lower(p_email) limit 1),
    'partner', (
      select jsonb_build_object('naam', m.naam, 'partner', p.naam)
      from public.partner_members m join public.partners p on p.id = m.partner_id
      where p.actief and lower(m.email) = lower(p_email) order by m.created_at limit 1
    )
  );
$$;
revoke all on function public.dashboard_toegang_voor(text) from public, anon, authenticated;
grant execute on function public.dashboard_toegang_voor(text) to service_role;
