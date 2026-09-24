# Offerte-koppeling dashboard → offerte-tool

Contract volgens de dev-briefing van 24 sep 2026 (roll-verfcalculator v1.40.0).

## Aanroep

- **Endpoint:** `POST https://roll.nl/wp-json/roll-advies/v1/offerte` (te overschrijven met Supabase-secret `OFFERTE_API_URL`)
- **Auth:** header `X-Roll-Advies-Key`, waarde uit Supabase-secret `OFFERTE_API_KEY`
- **Aan de WP-kant:** dezelfde sleutel in `define('ROLL_ADVIES_KEY', '...')` (wp-config) of wp-optie `roll_advies_api_key`. Zonder sleutel geeft het endpoint 503 en maakt het dashboard automatisch een Roll-taak aan.
- **Aanroeper:** edge-functie `booking`, action `offerte_create` (alleen adviseurs). De payload wordt gebouwd in `supabase/functions/_shared/offerte.ts`.

Koppeling aanzetten, met dezelfde sleutel als in wp-config:

```bash
npx supabase secrets set OFFERTE_API_KEY="<sleutel>" --project-ref lsboujprrvhntgbvlvyu
```

## Wat het dashboard stuurt

- `titel`, `klant` (naam, e-mail, telefoon uit de boeking; adres leeg, dat vraagt de intake niet)
- `project.surfaces`: per intake-ruimte
  - een `muur`-surface met de muurvlakken (`breedte`, `hoogte`, `kleurNaam`) en het plafond (`delen` met `breedte`, `diepte`)
  - een `lak`-surface (`"<ruimte> houtwerk"`) met `objecten`: `deur {n}`, `raam {b,h}`, `plint {m}`, `radiator {b,h}`, `kast {b,h}`
- `ondergrond`, `lagen`, `renovlies` (expliciet) en `voorbehandeling` (voorstrijk bij muur, primer bij lak) per surface, volgens de keuze van de styliste of afgeleid uit de ondergrond en de staat van de muren
- **Extra velden** (de tool negeert ze tot ze ondersteund worden): `tools_in_mandje` (boolean), `notitie`, `bron: "kleuradvies-dashboard"` en `intake_id`

## Wat het dashboard terugverwacht

`{ ok, id, nummer, editUrl, ruimtes }`. Het dashboard bewaart `editUrl` als offerte-link en `nummer`/`id` in `intake.offer_meta`.

## Open punten voor de offerte-tool

1. **kleurId:** we sturen `0` plus de kleurnaam. Welke ID verwacht de tool (Ark-kleur-ID of WooCommerce-ID)? Dan sturen we die mee.
2. **Radiator, kast en trap:** kloppen de objectvelden `{soort:"radiator", b, h}` en `{soort:"kast", b, h}`? Trap vraagt het dashboard nog niet uit.
3. **Tools-vlag:** kan de tool `tools_in_mandje` uitlezen voor het mandje en het mailblok?
