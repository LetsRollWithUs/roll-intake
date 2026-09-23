# Offerte-koppeling: contract voor de offerte-tool (WP-plugin)

Het dashboard (intake.roll.nl) levert de gestructureerde ruimtedata; de offerte-tool
maakt daar een offerte-record van met **live WooCommerce-prijzen** en geeft een offerte-URL
terug. De tool verzorgt daarna de klantmail met "alles in winkelmandje" en "bekijk/pas aan".

## Wat het dashboard doet

Bij "Genereer offerte" roept de edge-functie `booking` (action `offerte_create`) dit endpoint aan:

- **Method:** POST
- **URL:** waarde van de Supabase-secret `OFFERTE_API_URL` (nog te zetten)
- **Auth:** header `x-api-key: <OFFERTE_API_KEY>` (optioneel; alleen als de secret gezet is)
- **Body:** JSON, zie hieronder
- **Verwacht antwoord:** `200` met JSON die een offerte-URL bevat in `offer_url` (of `offerte_url` / `url`)

Zolang `OFFERTE_API_URL` niet gezet is, stuurt het dashboard niets en toont het dat de
ruimtedata klaarstaat. Zet de twee secrets om live te gaan:

```bash
npx supabase secrets set OFFERTE_API_URL="https://roll.nl/wp-json/roll/v1/offerte" --project-ref lsboujprrvhntgbvlvyu
npx supabase secrets set OFFERTE_API_KEY="<geheim>" --project-ref lsboujprrvhntgbvlvyu
```

## Request-body (voorbeeld)

```json
{
  "intake_id": "uuid",
  "booking_id": "uuid of null",
  "klant": { "naam": "Fleur", "email": "fleur@example.com" },
  "ruimtes": [
    {
      "naam": "Woonkamer",
      "type": ["muur", "lak"],
      "ondergrond": { "muren": "nieuw", "houtwerk": "kaal" },
      "wandvlakken": [{ "breedte": 10, "hoogte": 2.6 }],
      "plafondvlakken": [{ "lengte": 4, "breedte": 5 }],
      "houtwerk": {
        "deuren": 2,
        "raamkozijnen": [{ "breedte": 1.2, "hoogte": 1.4 }],
        "plinten_m": 12,
        "radiatoren": [],
        "kasten": []
      },
      "voorbehandeling": { "voorstrijk": true, "primer": true },
      "renovlies": false,
      "lagen": 2,
      "kleuren": [
        { "vlak": "muren", "naam": "Zen Den", "kleur_id": "zen-den", "hex": "#E1DED8" },
        { "vlak": "deuren", "naam": "Shut Eye", "kleur_id": "shut-eye", "hex": "#3F3F3E" }
      ]
    }
  ]
}
```

### Veldbetekenis

- `type`: `"muur"` als er wand-/plafondvlakken zijn, `"lak"` als er houtwerk is.
- `ondergrond.muren`: `"bestaand"` of `"nieuw"` (nieuw stucwerk/gipsplaat → voorstrijk).
- `ondergrond.houtwerk`: `"gelakt"` of `"kaal"` (kaal → primer). `null` als n.v.t.
- `voorbehandeling`: afgeleid uit de ondergrond; `voorstrijk`/`primer` als boolean.
- `renovlies`: staat nu altijd `false` (nog niet in gebruik).
- Maten in meters; `plinten_m` in strekkende meter.
- `kleuren[].kleur_id`: Roll-kleur-id (voor de Ark-configurator / prijs per kleur). `null`
  als de opgegeven kleurnaam geen Roll-kleur is.

## Wat de tool moet doen (samenvatting)

1. Maak een offerte-record uit de payload (hergebruik `schoon_project/opslaan`), met de
   dezelfde rekenkern als de offerte-tool, zodat de uitkomst identiek is.
2. Prijs alles live uit WooCommerce (muurverf/lak per kleur via de Ark-configurator;
   voorstrijk 8156 → varianten 10945 = 2,5 L / 10946 = 10 L; primer 8165 = 0,75 L).
3. Geef `offer_url` terug.
4. Verstuur de klant de HTML-mail met de producten en twee knoppen:
   - **Alles in winkelmandje** → roept de bestaande mand-vulling aan en redirect naar `/winkelmandje`.
   - **Bekijk of pas aan** → opent de offerte-pagina.

## Rekenconstanten (referentie, gelijk aan `src/lib/verfcalc.ts`)

- Muurverf: 8,0 m²/L · Lak: 0,09 L/m² · Voorstrijk: 6,8 m²/L · Primer: 10,7 m²/L
- Lagen standaard 2 · marge 1,10 · kamerhoogte standaard 2,6 m
- Houtwerk-m²: deur met kozijn 2,5 · raamkozijn 2×(b+h)×0,25 · plint m×0,10 ·
  radiator b×h×2 · kast b×h + 2×(0,6×h) + b×0,6
