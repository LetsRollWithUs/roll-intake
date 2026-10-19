-- Projecten per site (roll.nl vs een staging-kopie), zodat gebruiker-id's van verschillende WordPress-installaties
-- nooit elkaars projecten raken.
alter table public.mh_projecten add column if not exists site text not null default 'roll.nl';
drop index if exists mh_projecten_user_idx;
create index if not exists mh_projecten_site_user_idx on public.mh_projecten(site, woo_user_id) where archived_at is null;
