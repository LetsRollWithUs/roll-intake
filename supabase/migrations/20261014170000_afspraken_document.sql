-- Getekende samenwerkingsafspraken per medewerker als document (privé). Beheerders beheren;
-- de medewerker zelf kan haar eigen documenten lezen.
insert into storage.buckets (id, name, public) values ('stylist-docs', 'stylist-docs', false)
on conflict (id) do nothing;
drop policy if exists "stylist-docs beheer" on storage.objects;
create policy "stylist-docs beheer" on storage.objects for all to authenticated
  using (bucket_id = 'stylist-docs' and public.is_admin())
  with check (bucket_id = 'stylist-docs' and public.is_admin());
drop policy if exists "stylist-docs eigen" on storage.objects;
create policy "stylist-docs eigen" on storage.objects for select to authenticated
  using (bucket_id = 'stylist-docs' and public.owns_stylist(((storage.foldername(name))[1])::uuid));
