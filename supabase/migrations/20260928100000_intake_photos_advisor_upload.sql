-- Stylisten/beheerders kunnen achteraf foto's toevoegen aan een intake die ze mogen zien
-- (bijv. foto's die de klant per mail nastuurt). Zelfde regel als lezen: can_see_intake_path.
drop policy if exists "intake-photos advisor upload" on storage.objects;
create policy "intake-photos advisor upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'intake-photos' and public.can_see_intake_path(name));
