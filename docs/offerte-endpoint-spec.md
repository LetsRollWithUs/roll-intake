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
  - een `lak`-surface (`"<ruimte> houtwerk"`) met `objecten`: `deur {n}`, `raam {b,h}`, `plint {m}`, `radiator {b,h}`, `kast {b,h}`, en per standaard trap `vrij {b:6,h:1}` (6 m²: 13 treden van 80 cm, stootborden en trapbomen)
- `ondergrond`, `lagen`, `renovlies` (expliciet) en `voorbehandeling` (voorstrijk bij muur, primer bij lak) per surface, volgens de keuze van de styliste of afgeleid uit de ondergrond en de staat van de muren
- **Extra velden** (de tool negeert ze tot ze ondersteund worden): `tools_in_mandje` (boolean), `notitie`, `bron: "kleuradvies-dashboard"` en `intake_id`

## Wat het dashboard terugverwacht

`{ ok, id, nummer, editUrl, ruimtes }`. Het dashboard bewaart `editUrl` als offerte-link en `nummer`/`id` in `intake.offer_meta`.

## Afspraken met de offerte-tool (24 sep 2026)

1. **kleurId:** dit is het WooCommerce product-ID van het kleurproduct. Het endpoint zet `kleurNaam` zelf om naar `kleurId` (op naam, hoofdletterongevoelig, en op slug). Het dashboard blijft `kleurId: 0` en `kleurNaam` sturen.
2. **Radiator en kast** kloppen. De tool kent geen trap: een standaard trap gaat mee als `vrij` 6 × 1 (6 m²).
3. **Extra velden:** `tools_in_mandje`, `notitie`, `bron` en `intake_id` worden opgeslagen. De tools-vlag stuurt de mandvulling en het toolsblok in de mail; de notitie is zichtbaar in de editor. Dat bouwt de developer van de offerte-tool nog.
4. **Adres:** is niet nodig. De klant vult het in bij het afrekenen.
5. **Offertemail:** nog niet besloten wie hem verstuurt (de offerte-tool of Klaviyo). Dit bespreken we eerst.
