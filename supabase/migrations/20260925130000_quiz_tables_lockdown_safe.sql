-- Quiz-tabellen (repo rolltest, zelfde Supabase-project): veilige eerste stap zonder impact op de live quiz.
-- 1) image_jobs: "Service role full access" gold voor iedereen (roles public). Alleen de service role
--    heeft dit nodig (en die omzeilt RLS al); de browser gebruikt de tabel niet.
-- 2) colors: schrijven alleen nog via de service role. Lezen blijft publiek. Het script
--    scripts/seed-colors.mjs moet daarvoor met de service-sleutel draaien.
drop policy if exists "Service role full access" on public.image_jobs;
create policy "Service role full access" on public.image_jobs for all to service_role using (true) with check (true);

drop policy if exists "Public write colors" on public.colors;
drop policy if exists "Public update colors" on public.colors;
