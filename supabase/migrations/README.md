# Databasemigraties

Het intake/boeking-schema leeft hier onder versiebeheer, zodat schemawijzigingen te reviewen en te reproduceren zijn.

## Wat hier staat

- `20260916000000_baseline_intake_booking.sql` — de baseline van het intake/boeking-domein (extensies, tabellen, constraints, indexen, functies, trigger, RLS, policies, kolom- en functie-rechten). Gegenereerd uit de live-catalogus op 2026-09-18.

De baseline dekt de objecten die de roll-intake app bezit. De quiz-tabellen (`quiz_results`, `colors`, `image_jobs`, `swipe_*`, `app_settings`) delen hetzelfde Supabase-project maar horen bij de Quiz-repo en staan hier bewust niet in.

Niet in de baseline (omgevingsspecifiek, niet "schema"):
- **pg_cron-jobs**: `release-expired-holds` (elke minuut), `calendar-pull` (elke 10 min), `notification-worker` (elke minuut). Deze staan in het `cron`-schema en bevatten het cron-secret; ze horen bij de omgeving, niet bij het schema.
- **Storage-buckets/policies** (`intake-photos`, privé): beheerd via de Supabase-config van de storage.
- **Edge function secrets**: staan als Supabase-secrets (WOO_*, KLAVIYO_*, CALENDAR_CRON_SECRET, etc.).

## Werkwijze voor een nieuwe wijziging

1. Nieuw bestand: `supabase/migrations/<UTC-timestamp>_korte_naam.sql` (bijv. `20260920101500_add_x.sql`).
2. Zet de wijziging erin als idempotente SQL waar mogelijk (`create ... if not exists`, `create or replace`).
3. Toepassen op de database (een van beide):
   - via de Supabase MCP `apply_migration`, of
   - `npx supabase db push` (vereist een gekoppeld project, zie hieronder).
4. Commit het bestand samen met de bijbehorende code.

## Eenmalig koppelen (voor `db push` / `db dump`)

De CLI heeft voor directe DB-toegang de database-wachtwoord-koppeling nodig (die alleen het team heeft):

```bash
npx supabase link --project-ref lsboujprrvhntgbvlvyu
```

Daarna kun je een byte-exacte export maken (de canonieke bron als de baseline ooit ververst moet worden):

```bash
npx supabase db dump --linked --schema public -f supabase/migrations/<timestamp>_baseline.sql
```

## Let op

- De baseline gaat uit van een Supabase-omgeving: de rollen `anon`, `authenticated`, `service_role` en het `auth`-schema (`auth.jwt()`) moeten bestaan.
- De reeds toegepaste migratiehistorie staat in de database (`supabase_migrations.schema_migrations`). Deze baseline is een momentopname voor review/herstel, geen vervanging van die historie.
