// Haalt de geldende rekenregels live uit de offerte-plugin (roll.nl/offerte/beheer), zodat de intake
// precies zo rekent als de offerte-tool. Eén keer per sessie; bij een storing blijft de terugval in verfcalc.ts.
import { zetRekenregels, type PluginRekenregels } from "@/lib/verfcalc";

const BRON = "https://roll.nl/wp-json/roll-advies/v1/rekenregels";
const GELDIG_MS = 10 * 60 * 1000; // na een aanpassing in het beheer zie je het binnen 10 minuten
const SLEUTEL = "roll-rekenregels";
let bezig: Promise<boolean> | null = null;

export function laadRekenregels(timeoutMs = 2500): Promise<boolean> {
  if (bezig) return bezig;
  bezig = (async () => {
    try {
      const bewaard = JSON.parse(sessionStorage.getItem(SLEUTEL) ?? "null") as { t: number; regels: PluginRekenregels } | null;
      if (bewaard?.regels && Date.now() - bewaard.t < GELDIG_MS) {
        zetRekenregels(bewaard.regels);
        return true;
      }
    } catch { /* geen sessionStorage */ }
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), timeoutMs);
      const res = await fetch(BRON, { signal: ctl.signal });
      clearTimeout(t);
      if (!res.ok) return false;
      const data = (await res.json()) as { regels?: PluginRekenregels };
      if (!data?.regels) return false;
      zetRekenregels(data.regels);
      try { sessionStorage.setItem(SLEUTEL, JSON.stringify({ t: Date.now(), regels: data.regels })); } catch { /* vol of geblokkeerd */ }
      return true;
    } catch {
      return false;
    }
  })();
  return bezig;
}
