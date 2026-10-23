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
  m2: { vloer: number; muren: number };
  aantallen: { deuren: number; ramen: number; radiatoren: number };
  kleur: KpKleur | null;
  plafondKleur?: KpKleur | null;
  houtKleur?: KpKleur | null;
}
export interface Kleurplan { token: string; ruimtes: KpRuimte[]; overweegt: KpKleur[] }

const TYPES = new Set(ROOM_TYPES.map((t) => t.key));
const GROOTTE: Record<string, KamerGrootte> = { klein: "klein", middel: "gemiddeld", groot: "groot" };
const r1 = (n: number) => Math.round(n * 10) / 10;
const byName = new Map(rollColors.map((c) => [c.name.toLowerCase(), c]));

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
function measure(r: KpRuimte, s: SurfaceKey[]): RoomMeasure {
  const m = emptyMeasure();
  const vloer = r.m2?.vloer || 0;
  const omtrek = r.vloer ? 2 * (r.vloer.l + r.vloer.b) : 4 * Math.sqrt(vloer);
  if (s.includes("muren")) m.walls = [{ w: r1(omtrek), h: STANDAARD_HOOGTE, color: r.kleur?.naam || undefined }];
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
  return m;
}

function pick(k: KpKleur): ColorPick {
  const c = k.roll !== false ? byName.get(k.naam.toLowerCase()) : undefined;
  return c ? { id: uid(), rollId: c.id, name: c.name, hex: c.hex } : { id: uid(), name: k.naam, hex: k.hex || undefined };
}

export function kleurplanNaarIntake(kp: Kleurplan): { rooms: Room[]; colors: ColorPick[] } {
  const rooms: Room[] = (kp.ruimtes ?? []).map((r) => {
    const s = surfaces(r.onderdelen ?? []);
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
  for (const k of [...(kp.ruimtes ?? []).map((r) => r.kleur), ...(kp.overweegt ?? [])]) {
    if (!k?.naam || seen.has(k.naam.toLowerCase())) continue;
    seen.add(k.naam.toLowerCase());
    colors.push(pick(k));
  }
  return { rooms, colors };
}
