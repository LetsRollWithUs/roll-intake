// Reken-engine voor de kleuradvies-offerte. Zelfde constanten als de roll-verfcalculator plugin.
// Het dashboard toont hiermee m² en aantallen; de offerte-tool rekent de definitieve blikken en
// prijzen (muurverf/lak per kleur via de Ark-configurator, live uit WooCommerce).
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
export const RENOVLIES_SNIJVERLIES = 1.1; // 10%
export const LIJM_M2_PER_L = 4.8; // 5 L dekt 24-30 m²; we rekenen voorzichtig met de ondergrens

// Verpakkingen. Muurverf/lak hebben geen vaste blikmaat (per kleur uit de configurator): liters.
export const VOORSTRIJK_BLIKKEN = [2.5, 10] as const; // 2,5 L (17 m²) en 10 L (68 m²)
export const LAK_BLIK = 0.75 as const;
export const PRIMER_BLIK = 0.75 as const;
export const RENOVLIES_ROLLEN = [25, 50] as const; // rollen 1 m breed: 25 m² of 50 m²
export const LIJM_BLIKKEN = [5, 10] as const;

export interface WandVlak { w: number; h: number; color?: string } // breedte × hoogte, kleur per vlak
export interface PlafondVlak { l: number; b: number } // lengte × breedte
export interface Raam { w: number; h: number }
export interface Object2D { w: number; h: number }

export type MuurOndergrond = "bestaand" | "nieuw"; // bestaande verflaag | nieuw stucwerk of gipsplaat
export type HoutOndergrond = "gelakt" | "kaal"; // al gelakt | kaal hout of metaal
export type MuurStaat = "glad" | "oneffen" | "scheuren"; // scheuren = ook "behang eraf"

// Meetgegevens per ruimte. Kleuren per vlak vult de styliste in het dashboard.
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
  wall_condition?: MuurStaat;
  coats: number; // standaard 2
  ceiling_color?: string;
  wood_color?: string;
  // Handmatige keuze van de styliste; leeg = afgeleid uit de ondergrond/staat.
  voorstrijk?: boolean;
  primer?: boolean;
  renovlies?: boolean;
}

export const emptyMeasure = (): RoomMeasure => ({
  walls: [],
  ceilings: [],
  woodwork: { doors: 0, windows: [], plinths_m: 0, radiators: [], cabinets: [] },
  wall_substrate: "bestaand",
  wood_substrate: "gelakt",
  wall_condition: "glad",
  coats: STANDAARD_LAGEN,
});

const num = (v: unknown) => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : 0; };
const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

// Afgeleide vlaggen (briefing): nieuw stucwerk -> voorstrijk, kaal -> primer, oneffen/scheuren -> renovlies.
export const needsVoorstrijk = (m: RoomMeasure) => m.voorstrijk ?? m.wall_substrate === "nieuw";
export const needsPrimer = (m: RoomMeasure) => m.primer ?? m.wood_substrate === "kaal";
export const needsRenovlies = (m: RoomMeasure) => m.renovlies ?? (m.wall_condition === "oneffen" || m.wall_condition === "scheuren");
export const margeFor = (m: RoomMeasure) => (m.wall_substrate === "nieuw" && !needsVoorstrijk(m) ? MARGE_ZONDER_VOORBEHANDELING : MARGE_NORMAAL);

// C. Oppervlaktes
export const wallVlakArea = (w: WandVlak) => num(w.w) * num(w.h);
export function wallArea(m: RoomMeasure): number { return m.walls.reduce((s, w) => s + wallVlakArea(w), 0); }
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

// Blik-afronding: kies de combinatie hele verpakkingen die de hoeveelheid dekt.
// Met prijzen: laagste totaalprijs. Zonder prijzen: laagste totaalvolume, daarna minste stuks.
export interface BlikSize { size: number; price?: number }
export interface BlikCombo { size: number; count: number }
export function packBlikken(liters: number, sizes: (number | BlikSize)[]): BlikCombo[] {
  const norm = sizes.map((s) => (typeof s === "number" ? { size: s } : s)).filter((s) => s.size > 0).sort((a, b) => b.size - a.size);
  if (liters <= 0 || norm.length === 0) return [];
  const need = round2(liters);
  const havePrices = norm.every((s) => typeof s.price === "number");
  const step = Math.min(...norm.map((s) => s.size));
  const cap = need + Math.max(...norm.map((s) => s.size));
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

// Leesbare samenvatting van de maten (voor het review-scherm en de intake-detail).
export function summarizeMeasure(m: RoomMeasure): string[] {
  const g = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");
  const out: string[] = [];
  const ws = m.walls.filter((w) => num(w.w) > 0);
  const staat = m.wall_condition === "oneffen" ? " · oneffen" : m.wall_condition === "scheuren" ? " · scheuren of behang eraf" : "";
  if (ws.length) out.push(`Muren: ${ws.map((w) => `${g(num(w.w))} × ${g(num(w.h) || STANDAARD_HOOGTE)} m`).join(" + ")}${m.wall_substrate === "nieuw" ? " · nieuw stucwerk" : ""}${staat}`);
  const cs = m.ceilings.filter((c) => num(c.l) > 0 && num(c.b) > 0);
  if (cs.length) out.push(`Plafond: ${cs.map((c) => `${g(num(c.l))} × ${g(num(c.b))} m`).join(" + ")}`);
  const w = m.woodwork;
  const wood: string[] = [];
  if (num(w.doors) > 0) wood.push(`${num(w.doors)} deur${num(w.doors) === 1 ? "" : "en"}`);
  const win = w.windows.filter((x) => num(x.w) > 0 || num(x.h) > 0).length;
  if (win) wood.push(`${win} raamkozijn${win === 1 ? "" : "en"}`);
  if (num(w.plinths_m) > 0) wood.push(`${g(num(w.plinths_m))} m plint`);
  const rad = w.radiators.filter((r) => num(r.w) > 0).length;
  if (rad) wood.push(`${rad} radiator${rad === 1 ? "" : "en"}`);
  const kast = w.cabinets.filter((r) => num(r.w) > 0).length;
  if (kast) wood.push(`${kast} kast${kast === 1 ? "" : "en"}`);
  if (wood.length) out.push(`Houtwerk: ${wood.join(", ")}${m.wood_substrate === "kaal" ? " · kaal hout/metaal" : ""}`);
  return out;
}

export type MaterialKey = "muurverf" | "lak" | "voorstrijk" | "primer" | "renovlies" | "lijm";
export interface MaterialLine {
  key: MaterialKey;
  label: string;
  amount: number; // liters, of m² bij renovlies
  unit: "L" | "m²";
  blikken: BlikCombo[]; // leeg = per liter (muurverf per kleur via de configurator)
  packUnit?: "L" | "m"; // eenheid van de verpakking (renovlies: rol in meters)
  color?: string; // bij muurverf en lak
  liters: number; // alias van amount (achterwaarts)
  note?: string;
}
export interface RoomCalc {
  wall_m2: number;
  ceiling_m2: number;
  woodwork_m2: number;
  materials: MaterialLine[];
}

const NO_COLOR = "kleur nog kiezen";
const line = (key: MaterialKey, label: string, amount: number, unit: "L" | "m²", sizes: readonly number[] | null, extra: Partial<MaterialLine> = {}): MaterialLine => {
  const a = round2(amount);
  return { key, label, amount: a, unit, liters: a, blikken: sizes ? packBlikken(a, [...sizes]) : [], packUnit: key === "renovlies" ? "m" : "L", ...extra };
};

// Verf per kleur binnen één ruimte: muren per vlak, plafond en houtwerk elk met hun eigen kleur.
function paintByColor(m: RoomMeasure): { muur: Map<string, number>; lak: Map<string, number> } {
  const lagen = num(m.coats) || STANDAARD_LAGEN;
  const marge = margeFor(m);
  const muur = new Map<string, number>();
  const add = (map: Map<string, number>, color: string | undefined, l: number) => { if (l <= 0) return; const k = (color ?? "").trim() || NO_COLOR; map.set(k, (map.get(k) ?? 0) + l); };
  for (const w of m.walls) add(muur, w.color, (wallVlakArea(w) * lagen) / MUURVERF_DEKKING * marge);
  add(muur, m.ceiling_color, (ceilingArea(m) * lagen) / MUURVERF_DEKKING * marge);
  const lak = new Map<string, number>();
  add(lak, m.wood_color, woodworkArea(m) * lagen * LAK_PER_M2 * marge);
  return { muur, lak };
}

// Materialen voor één ruimte.
export function calcRoom(m: RoomMeasure): RoomCalc {
  const wall = wallArea(m);
  const ceiling = ceilingArea(m);
  const wood = woodworkArea(m);
  const materials: MaterialLine[] = [];
  const { muur, lak } = paintByColor(m);
  for (const [color, l] of muur) materials.push(line("muurverf", `Muurverf · ${color}`, l, "L", null, { color, note: "blik en prijs per kleur in de offerte" }));
  for (const [color, l] of lak) materials.push(line("lak", `Lak · ${color}`, l, "L", [LAK_BLIK], { color }));
  if (needsVoorstrijk(m) && wall + ceiling > 0) materials.push(line("voorstrijk", "Voorstrijk muren", (wall + ceiling) / VOORSTRIJK_DEKKING * MARGE_NORMAAL, "L", VOORSTRIJK_BLIKKEN));
  if (needsPrimer(m) && wood > 0) materials.push(line("primer", "Primer hout/metaal", wood / PRIMER_DEKKING * MARGE_NORMAAL, "L", [PRIMER_BLIK]));
  if (needsRenovlies(m) && wall > 0) {
    materials.push(line("renovlies", "Renovlies (wanden)", wall * RENOVLIES_SNIJVERLIES, "m²", RENOVLIES_ROLLEN));
    materials.push(line("lijm", "Behanglijm", wall / LIJM_M2_PER_L, "L", LIJM_BLIKKEN));
  }
  return { wall_m2: round1(wall), ceiling_m2: round1(ceiling), woodwork_m2: round1(wood), materials };
}

// Projecttotaal: verf gebundeld per identieke kleur; voorstrijk, primer, renovlies en lijm op de
// opgetelde m², zodat je niet per ruimte te veel inkoopt.
export interface ProjectCalc {
  wall_m2: number; ceiling_m2: number; woodwork_m2: number;
  paint: MaterialLine[]; // muurverf en lak per kleur
  voorstrijk: MaterialLine | null;
  primer: MaterialLine | null;
  renovlies: MaterialLine | null;
  lijm: MaterialLine | null;
}
export function calcProject(measures: RoomMeasure[]): ProjectCalc {
  let wall = 0, ceiling = 0, wood = 0, voorM2 = 0, primerM2 = 0, renoM2 = 0;
  const muur = new Map<string, number>();
  const lak = new Map<string, number>();
  for (const m of measures) {
    const w = wallArea(m), c = ceilingArea(m), h = woodworkArea(m);
    wall += w; ceiling += c; wood += h;
    const p = paintByColor(m);
    for (const [k, l] of p.muur) muur.set(k, (muur.get(k) ?? 0) + l);
    for (const [k, l] of p.lak) lak.set(k, (lak.get(k) ?? 0) + l);
    if (needsVoorstrijk(m)) voorM2 += w + c;
    if (needsPrimer(m)) primerM2 += h;
    if (needsRenovlies(m)) renoM2 += w;
  }
  const paint = [
    ...[...muur].map(([color, l]) => line("muurverf", `Muurverf · ${color}`, l, "L", null, { color, note: "blik en prijs per kleur in de offerte" })),
    ...[...lak].map(([color, l]) => line("lak", `Lak · ${color}`, l, "L", [LAK_BLIK], { color })),
  ];
  return {
    wall_m2: round1(wall), ceiling_m2: round1(ceiling), woodwork_m2: round1(wood),
    paint,
    voorstrijk: voorM2 > 0 ? line("voorstrijk", "Voorstrijk muren", voorM2 / VOORSTRIJK_DEKKING * MARGE_NORMAAL, "L", VOORSTRIJK_BLIKKEN) : null,
    primer: primerM2 > 0 ? line("primer", "Primer hout/metaal", primerM2 / PRIMER_DEKKING * MARGE_NORMAAL, "L", [PRIMER_BLIK]) : null,
    renovlies: renoM2 > 0 ? line("renovlies", "Renovlies (wanden)", renoM2 * RENOVLIES_SNIJVERLIES, "m²", RENOVLIES_ROLLEN) : null,
    lijm: renoM2 > 0 ? line("lijm", "Behanglijm", renoM2 / LIJM_M2_PER_L, "L", LIJM_BLIKKEN) : null,
  };
}
