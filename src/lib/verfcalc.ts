// Reken-engine voor de kleuradvies-offerte. Zelfde constanten als de roll-verfcalculator plugin.
// Renovlies en behanglijm zitten er bewust nog NIET in (later). Euro's komen in een latere fase
// (muurverf/lak per kleur uit de Ark-configurator, voorstrijk/primer vaste WooCommerce-ID's).
//
// Deze module is puur (geen React, geen I/O) zodat de intake en het dashboard exact hetzelfde rekenen.

// A. Vaste rekenconstanten (uit de plugin, niet zelf verzinnen)
export const MUURVERF_DEKKING = 8.0; // m² per liter
export const LAK_PER_M2 = 0.09; // liter per m² (= 90 ml/m²)
export const VOORSTRIJK_DEKKING = 6.8; // m² per liter
export const PRIMER_DEKKING = 10.7; // m² per liter
export const STANDAARD_LAGEN = 2;
export const STANDAARD_HOOGTE = 2.6; // m
export const MARGE_NORMAAL = 1.1;
export const MARGE_ZONDER_VOORBEHANDELING = 1.15; // nieuw stucwerk zonder voorstrijk

// Blikmaten (liter). Muurverf/lak-blikken van muurverf hebben geen vaste maat: die komen per kleur
// uit de Ark-configurator, dus muurverf leveren we voorlopig als liters (geen blik-afronding).
export const VOORSTRIJK_BLIKKEN = [2.5, 10] as const; // 2,5 L (17 m²) en 10 L (68 m²)
export const LAK_BLIK = 0.75 as const;
export const PRIMER_BLIK = 0.75 as const;

export interface WandVlak { w: number; h: number } // breedte × hoogte
export interface PlafondVlak { l: number; b: number } // lengte × breedte
export interface Raam { w: number; h: number }
export interface Object2D { w: number; h: number }

export type MuurOndergrond = "bestaand" | "nieuw"; // bestaande verflaag | nieuw stucwerk of gipsplaat
export type HoutOndergrond = "gelakt" | "kaal"; // al gelakt | kaal hout of metaal

// Meetgegevens per ruimte. Kleur zit hier niet in; die voegt de styliste per vlak/onderdeel toe.
export interface RoomMeasure {
  walls: WandVlak[];
  ceilings: PlafondVlak[];
  woodwork: {
    doors: number; // deuren met kozijn (stuks)
    windows: Raam[]; // raamkozijnen (b × h)
    plinths_m: number; // plinten (strekkende meter)
    radiators: Object2D[]; // optioneel
    cabinets: Object2D[]; // optioneel
  };
  wall_substrate: MuurOndergrond;
  wood_substrate: HoutOndergrond;
  coats: number; // standaard 2
}

export const emptyMeasure = (): RoomMeasure => ({
  walls: [],
  ceilings: [],
  woodwork: { doors: 0, windows: [], plinths_m: 0, radiators: [], cabinets: [] },
  wall_substrate: "bestaand",
  wood_substrate: "gelakt",
  coats: STANDAARD_LAGEN,
});

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// C. Oppervlaktes
export function wallArea(m: RoomMeasure): number { return m.walls.reduce((s, w) => s + num(w.w) * num(w.h), 0); }
export function ceilingArea(m: RoomMeasure): number { return m.ceilings.reduce((s, c) => s + num(c.l) * num(c.b), 0); }
export function woodworkArea(m: RoomMeasure): number {
  const w = m.woodwork;
  let a = 0;
  a += num(w.doors) * 2.5; // deur met kozijn
  a += w.windows.reduce((s, r) => s + 2 * (num(r.w) + num(r.h)) * 0.25, 0); // raamkozijn
  a += num(w.plinths_m) * 0.1; // plint
  a += w.radiators.reduce((s, r) => s + num(r.w) * num(r.h) * 2, 0); // radiator (voor + achter)
  a += w.cabinets.reduce((s, k) => s + (num(k.w) * num(k.h) + 2 * (0.6 * num(k.h)) + num(k.w) * 0.6), 0); // kast
  return a;
}

// Blik-afronding: kies de combinatie hele blikken die de liters dekt.
// Met prijzen: laagste totaalprijs. Zonder prijzen: laagste totaalvolume, daarna minste blikken
// (grotere blikken zijn doorgaans goedkoper per liter). true "goedkoopste" volgt in de prijs-fase.
export interface BlikSize { size: number; price?: number }
export interface BlikCombo { size: number; count: number }
export function packBlikken(liters: number, sizes: (number | BlikSize)[]): BlikCombo[] {
  const norm = sizes.map((s) => (typeof s === "number" ? { size: s } : s)).filter((s) => s.size > 0).sort((a, b) => b.size - a.size);
  if (liters <= 0 || norm.length === 0) return [];
  const need = round2(liters);
  const havePrices = norm.every((s) => typeof s.price === "number");
  const step = Math.min(...norm.map((s) => s.size));
  const cap = need + Math.max(...norm.map((s) => s.size));
  // DP over volume-buckets (stap = kleinste blik) naar beste combinatie.
  const buckets = Math.ceil(cap / step) + 1;
  const best: ({ vol: number; cost: number; count: number; combo: Map<number, number> } | null)[] = Array(buckets + 1).fill(null);
  best[0] = { vol: 0, cost: 0, count: 0, combo: new Map() };
  for (let i = 0; i <= buckets; i++) {
    const cur = best[i];
    if (!cur) continue;
    for (const s of norm) {
      const ni = i + Math.round(s.size / step);
      if (ni > buckets) continue;
      const nvol = cur.vol + s.size;
      const ncost = cur.cost + (s.price ?? 0);
      const ncount = cur.count + 1;
      const prev = best[ni];
      const better = !prev
        || (havePrices ? ncost < prev.cost - 1e-9
            : nvol < prev.vol - 1e-9 || (Math.abs(nvol - prev.vol) < 1e-9 && ncount < prev.count));
      if (better) { const combo = new Map(cur.combo); combo.set(s.size, (combo.get(s.size) ?? 0) + 1); best[ni] = { vol: nvol, cost: ncost, count: ncount, combo }; }
    }
  }
  // Eerste bucket die de benodigde liters dekt met de beste (goedkoopste/kleinste) combinatie.
  let winner: (typeof best)[number] = null;
  for (let i = Math.ceil(need / step); i <= buckets; i++) {
    const c = best[i];
    if (!c) continue;
    if (!winner
      || (havePrices ? c.cost < winner.cost - 1e-9
          : c.vol < winner.vol - 1e-9 || (Math.abs(c.vol - winner.vol) < 1e-9 && c.count < winner.count))) winner = c;
  }
  if (!winner) return [];
  return [...winner.combo.entries()].map(([size, count]) => ({ size, count })).sort((a, b) => b.size - a.size);
}

export interface MaterialLine {
  key: "muurverf" | "lak" | "voorstrijk" | "primer";
  label: string;
  liters: number; // benodigde liters (voor marge)
  blikken: BlikCombo[]; // lege lijst = per liter (muurverf: per kleur via Ark)
  note?: string;
}
export interface RoomCalc {
  wall_m2: number;
  ceiling_m2: number;
  woodwork_m2: number;
  materials: MaterialLine[];
}

// Materialen voor één ruimte (op basis van de oppervlaktes en ondergrond).
export function calcRoom(m: RoomMeasure): RoomCalc {
  const wall = wallArea(m);
  const ceiling = ceilingArea(m);
  const wood = woodworkArea(m);
  const lagen = num(m.coats) || STANDAARD_LAGEN;
  const materials: MaterialLine[] = [];

  // 1. Muurverf (wand + plafond). Liters; blik-afronding per kleur later.
  const muurM2 = wall + ceiling;
  if (muurM2 > 0) {
    const liters = round2((muurM2 * lagen) / MUURVERF_DEKKING * MARGE_NORMAAL);
    materials.push({ key: "muurverf", label: "Muurverf", liters, blikken: [], note: "blik en prijs per kleur (Ark)" });
  }
  // 2. Lak (houtwerk) -> 0,75 L blikken
  if (wood > 0) {
    const liters = round2(wood * lagen * LAK_PER_M2 * MARGE_NORMAAL);
    materials.push({ key: "lak", label: "Lak (houtwerk)", liters, blikken: packBlikken(liters, [LAK_BLIK]) });
  }
  // 3. Voorstrijk muren (alleen nieuw stucwerk; wand + plafond) -> 2,5/10 L
  if (m.wall_substrate === "nieuw" && muurM2 > 0) {
    const liters = round2(muurM2 / VOORSTRIJK_DEKKING * MARGE_NORMAAL);
    materials.push({ key: "voorstrijk", label: "Voorstrijk muren", liters, blikken: packBlikken(liters, [...VOORSTRIJK_BLIKKEN]) });
  }
  // 4. Primer hout/metaal (alleen kaal houtwerk) -> 0,75 L
  if (m.wood_substrate === "kaal" && wood > 0) {
    const liters = round2(wood / PRIMER_DEKKING * MARGE_NORMAAL);
    materials.push({ key: "primer", label: "Primer hout/metaal", liters, blikken: packBlikken(liters, [PRIMER_BLIK]) });
  }
  return { wall_m2: round1(wall), ceiling_m2: round1(ceiling), woodwork_m2: round1(wood), materials };
}

// Projecttotaal: voorstrijk/primer op de opgetelde m² (niet per ruimte inkopen), muurverf-liters gesommeerd.
// Kleur-bundeling (muurverf per identieke kleur) hoort bij de offerte-fase met kleuren erbij.
export interface ProjectCalc {
  wall_m2: number; ceiling_m2: number; woodwork_m2: number;
  muurverf_liters: number;
  lak: MaterialLine | null;
  voorstrijk: MaterialLine | null;
  primer: MaterialLine | null;
}
export function calcProject(measures: RoomMeasure[]): ProjectCalc {
  let wall = 0, ceiling = 0, wood = 0;
  let muurLiters = 0, lakLiters = 0, voorM2 = 0, primerM2 = 0;
  let hasVoor = false, hasPrimer = false, hasLak = false;
  for (const m of measures) {
    const c = calcRoom(m);
    wall += c.wall_m2; ceiling += c.ceiling_m2; wood += c.woodwork_m2;
    for (const line of c.materials) {
      if (line.key === "muurverf") muurLiters += line.liters;
      if (line.key === "lak") { lakLiters += line.liters; hasLak = true; }
    }
    if (m.wall_substrate === "nieuw") { voorM2 += wallArea(m) + ceilingArea(m); hasVoor = true; }
    if (m.wood_substrate === "kaal") { primerM2 += woodworkArea(m); hasPrimer = true; }
  }
  const voorstrijk = hasVoor && voorM2 > 0 ? (() => { const liters = round2(voorM2 / VOORSTRIJK_DEKKING * MARGE_NORMAAL); return { key: "voorstrijk" as const, label: "Voorstrijk muren", liters, blikken: packBlikken(liters, [...VOORSTRIJK_BLIKKEN]) }; })() : null;
  const primer = hasPrimer && primerM2 > 0 ? (() => { const liters = round2(primerM2 / PRIMER_DEKKING * MARGE_NORMAAL); return { key: "primer" as const, label: "Primer hout/metaal", liters, blikken: packBlikken(liters, [PRIMER_BLIK]) }; })() : null;
  const lak = hasLak && lakLiters > 0 ? { key: "lak" as const, label: "Lak (houtwerk)", liters: round2(lakLiters), blikken: packBlikken(round2(lakLiters), [LAK_BLIK]) } : null;
  return { wall_m2: round1(wall), ceiling_m2: round1(ceiling), woodwork_m2: round1(wood), muurverf_liters: round2(muurLiters), lak, voorstrijk, primer };
}
