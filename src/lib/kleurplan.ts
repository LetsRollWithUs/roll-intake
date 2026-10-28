// Plan van roll.nl/kleurplan naar de intake: ruimtes, onderdelen, maten, ondergrond en kleuren.
// De klant boekte advies vanuit het kleurplan; de booking-functie geeft het plan mee bij "status".
// Puur (geen React, geen I/O), zodat het te testen is.

import { ROOM_TYPES } from "@/data/intake-options";
import { rollColors } from "@/data/roll-colors";
import { uid } from "@/lib/store";
import type { ColorPick, Room, SurfaceKey } from "@/lib/types";
import { emptyMeasure, KAMER_VLOER, STANDAARD_HOOGTE, type KamerGrootte, type RoomMeasure } from "@/lib/verfcalc";

interface KpKleur { naam: string; hex?: string; roll?: boolean }
export interface KpRuimte {
  type: string;
  naam: string;
  onderdelen: string[]; // muren | plafond | houtwerk | radiatoren
  ondergrond: string; // licht | donker | nieuw | scheuren | onbekend
  grootte: string; // klein | middel | groot
  vloer: { l: number; b: number } | null;
  /** Sinds kleurplan 2.x: plafondhoogte, extra m² muur (zit al in m2.muren) en lakwerk buiten. */
  hoogte?: number;
  extra?: number;
  buiten?: boolean;
  m2: { vloer: number; muren: number };
  aantallen: { deuren: number; ramen: number; radiatoren: number };
  kleur: KpKleur | null;
  plafondKleur?: KpKleur | null;
  houtKleur?: KpKleur | null;
  /** Sinds okt 2026: vlakken met eigen kleur (muren, accent, plafond, deuren, kozijnen, plinten, radiatoren). */
  vlakken?: KpVlak[];
}
export interface KpVlak {
  id: string;
  soort: string; // muren | accent | plafond | deuren | kozijnen | plinten | radiatoren | lambrisering | kasten | trap | meubel
  m2: number;
  aantal: number | null;
  kleur: KpKleur | null;
  glans?: string | null;
  /** Muren: licht | donker | nieuw | onbekend. Lakwerk: gelakt | bladdert | kaal | metaal | onbekend. */
  ondergrond?: string | null;
  staat?: string; // glad | scheurtjes | scheuren
  structuur?: boolean;
  behang?: string; // "eraf" of leeg
  breedte?: number | null; // accentmuur
  hoogte?: number | null; // accentmuur, anders de hoogte van de ruimte
}
export interface Kleurplan { token: string; ruimtes: KpRuimte[]; overweegt: KpKleur[] }

const TYPES = new Set(ROOM_TYPES.map((t) => t.key));
const GROOTTE: Record<string, KamerGrootte> = { klein: "klein", middel: "gemiddeld", groot: "groot" };
const r1 = (n: number) => Math.round(n * 10) / 10;
const byName = new Map(rollColors.map((c) => [c.name.toLowerCase(), c]));

function surfacesUitVlakken(v: NonNullable<KpRuimte["vlakken"]>): SurfaceKey[] {
  const s = new Set(v.map((x) => x.soort));
  const out: SurfaceKey[] = [];
  if (s.has("muren") || s.has("accent")) out.push("muren");
  if (s.has("plafond")) out.push("plafond");
  if (s.has("deuren")) out.push("deuren");
  if (s.has("kozijnen")) out.push("kozijnen");
  if (["plinten", "radiatoren", "lambrisering", "kasten", "trap", "meubel"].some((x) => s.has(x))) out.push("houtwerk");
  return out;
}

function surfaces(ond: string[]): SurfaceKey[] {
  const out: SurfaceKey[] = [];
  if (ond.includes("muren")) out.push("muren");
  if (ond.includes("plafond")) out.push("plafond");
  if (ond.includes("houtwerk")) out.push("deuren", "kozijnen");
  if (ond.includes("radiatoren")) out.push("houtwerk");
  return out;
}

// Zelfde aannames als het kleurplan: raamkozijn 1,3 m² (1,2 × 1,4), radiator 1,2 m² (1,0 × 0,6, voor + achter),
// plint over de hele omtrek. Muren als één vlak met de omtrek als breedte.
const LAK = ["deuren", "kozijnen", "plinten", "lambrisering", "kasten", "radiatoren", "trap", "meubel"];

/** Houtwerk van de ruimte: kaal, metaal of bladderende lak vraagt primer (kaal); onbekend blijft onbekend. */
function houtOndergrond(v: KpVlak[]): RoomMeasure["wood_substrate"] {
  const o = v.filter((x) => LAK.includes(x.soort)).map((x) => x.ondergrond || "");
  if (o.some((x) => ["kaal", "metaal", "bladdert"].includes(x))) return "kaal";
  return o.includes("onbekend") ? "onbekend" : "gelakt";
}

function measure(r: KpRuimte, s: SurfaceKey[]): RoomMeasure {
  const m = emptyMeasure();
  const vloer = r.m2?.vloer || 0;
  const hoogte = r.hoogte && r.hoogte > 0 ? r.hoogte : STANDAARD_HOOGTE;
  const omtrek = r.vloer ? 2 * (r.vloer.l + r.vloer.b) : 4 * Math.sqrt(vloer);
  if (s.includes("muren")) m.walls = [{ w: r1(omtrek), h: hoogte, color: r.kleur?.naam || undefined }];
  if (s.includes("plafond")) m.ceilings = [r.vloer ? { l: r.vloer.l, b: r.vloer.b } : { l: r1(Math.sqrt(vloer)), b: r1(Math.sqrt(vloer)) }];
  if (s.includes("deuren")) {
    m.woodwork.doors = r.aantallen?.deuren ?? 1;
    m.woodwork.windows = Array.from({ length: r.aantallen?.ramen ?? 0 }, () => ({ w: 1.2, h: 1.4 }));
    m.woodwork.plinths_m = r1(omtrek);
  }
  if (s.includes("houtwerk")) m.woodwork.radiators = Array.from({ length: r.aantallen?.radiatoren ?? 0 }, () => ({ w: 1, h: 0.6 }));
  m.wall_substrate = r.ondergrond === "nieuw" ? "nieuw" : r.ondergrond === "onbekend" ? "onbekend" : "bestaand";
  m.wall_condition = r.ondergrond === "scheuren" ? "scheuren" : r.ondergrond === "onbekend" ? "onbekend" : "glad";
  // Schatting alleen markeren als de grootte overeenkomt met de intake (10/18/30 m²); bij toilet en badkamer
  // rekent het kleurplan met kleinere vloeren, dan staan de maten er gewoon in.
  const g = GROOTTE[r.grootte];
  if (!r.vloer && g && KAMER_VLOER[g] === vloer) m.geschat = g;
  if (r.plafondKleur?.naam) m.ceiling_color = r.plafondKleur.naam;
  if (r.houtKleur?.naam) m.wood_color = r.houtKleur.naam;
  // Vlakken: muren en elke accentmuur als eigen wandvlak met kleur; lakwerk per soort.
  if (r.vlakken?.length) {
    const v = r.vlakken;
    const van = (soort: string) => v.find((x) => x.soort === soort);
    // Accentmuur met eigen maat: breedte × hoogte zoals de klant die invulde; anders m² over de hoogte van de ruimte.
    m.walls = v.filter((x) => (x.soort === "muren" || x.soort === "accent") && x.m2 > 0)
      .map((x) => x.soort === "accent" && x.breedte
        ? { w: x.breedte, h: x.hoogte || hoogte, color: x.kleur?.naam || undefined }
        : { w: r1(x.m2 / hoogte), h: hoogte, color: x.kleur?.naam || undefined });
    m.woodwork.doors = van("deuren")?.aantal ?? 0;
    m.woodwork.windows = Array.from({ length: van("kozijnen")?.aantal ?? 0 }, () => ({ w: 1.2, h: 1.4 }));
    m.woodwork.plinths_m = van("plinten") ? r1(omtrek) : 0;
    m.woodwork.radiators = Array.from({ length: van("radiatoren")?.aantal ?? 0 }, () => ({ w: 1, h: 0.6 }));
    // Kast 1 × 2 m (voorkant en zijkanten), trap volgens de standaard van de intake.
    m.woodwork.cabinets = Array.from({ length: van("kasten")?.aantal ?? 0 }, () => ({ w: 1, h: 2 }));
    // Meubel als kast van 1 m breed, zo hoog dat het oppervlak (voor, zijkanten, boven) de m² uit het plan is.
    const meubel = van("meubel");
    if (meubel?.m2) m.woodwork.cabinets.push({ w: 1, h: Math.max(0.3, r1((meubel.m2 - 0.6) / 2.2)) });
    if (van("trap")) m.woodwork.stairs = van("trap")?.aantal ?? 1;
    const plafond = van("plafond")?.kleur?.naam;
    if (plafond) m.ceiling_color = plafond;
    const lak = LAK.map(van).find((x) => x?.kleur?.naam);
    if (lak?.kleur?.naam) m.wood_color = lak.kleur.naam;
    // Ondergrond per vlak (kleurplan 2.x). Behang eraf is een kale muur: voorstrijk, net als nieuw stucwerk.
    // Alleen scheuren vraagt renovlies; scheurtjes en structuur niet, die blijven glad.
    const muur = van("muren") ?? van("accent");
    if (muur?.ondergrond) {
      const o = muur.behang === "eraf" ? "nieuw" : muur.ondergrond;
      m.wall_substrate = o === "nieuw" ? "nieuw" : o === "onbekend" ? "onbekend" : "bestaand";
      m.wall_condition = muur.staat === "scheuren" ? "scheuren" : o === "onbekend" ? "onbekend" : "glad";
    }
    if (v.some((x) => LAK.includes(x.soort) && x.ondergrond)) m.wood_substrate = houtOndergrond(v);
  }
  return m;
}

function pick(k: KpKleur): ColorPick {
  const c = k.roll !== false ? byName.get(k.naam.toLowerCase()) : undefined;
  return c ? { id: uid(), rollId: c.id, name: c.name, hex: c.hex } : { id: uid(), name: k.naam, hex: k.hex || undefined };
}

export function kleurplanNaarIntake(kp: Kleurplan): { rooms: Room[]; colors: ColorPick[] } {
  const rooms: Room[] = (kp.ruimtes ?? []).map((r) => {
    const s = r.vlakken?.length ? surfacesUitVlakken(r.vlakken) : surfaces(r.onderdelen ?? []);
    return {
      id: uid(),
      typeKey: TYPES.has(r.type) ? r.type : "anders",
      label: r.naam,
      surfaces: s,
      photos: [],
      measure: measure(r, s),
    };
  });
  const seen = new Set<string>();
  const colors: ColorPick[] = [];
  const vlakKleuren = (kp.ruimtes ?? []).flatMap((r) => (r.vlakken ?? []).filter((x) => x.soort === "accent").map((x) => x.kleur));
  for (const k of [...(kp.ruimtes ?? []).map((r) => r.kleur), ...vlakKleuren, ...(kp.overweegt ?? [])]) {
    if (!k?.naam || seen.has(k.naam.toLowerCase())) continue;
    seen.add(k.naam.toLowerCase());
    colors.push(pick(k));
  }
  return { rooms, colors };
}
