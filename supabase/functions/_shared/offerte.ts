// Overdracht naar de offerte-tool (roll-verfcalculator v1.40.0): POST roll-advies/v1/offerte.
// Per intake-ruimte een "muur"-surface (muurvlakken + plafond) en zo nodig een "lak"-surface
// (houtwerk). Kleur per vlak als naam; kleurId blijft 0 zolang de koppeling op ID niet bekend is.
// Prijzen, blikken en de tools doet de offerte-tool zelf.

const n = (v: unknown) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : 0; };
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
const isWoodS = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
const isCeilS = (s: string) => /plafond/i.test(s);
const TRAP_M2 = 6; // standaard vaste trap, gelijk aan src/lib/verfcalc.ts

interface Vlak2 { w?: number; h?: number; l?: number; b?: number; color?: string }
interface Measure {
  walls?: Vlak2[];
  ceilings?: Vlak2[];
  woodwork?: { doors?: number; windows?: Vlak2[]; plinths_m?: number; radiators?: Vlak2[]; cabinets?: Vlak2[]; stairs?: number };
  wall_substrate?: string;
  wood_substrate?: string;
  wall_condition?: string;
  coats?: number;
  ceiling_color?: string;
  wood_color?: string;
  voorstrijk?: boolean;
  primer?: boolean;
  renovlies?: boolean;
}
interface AdviceRoomLike { room_id?: string; room?: string; surface?: string; color?: string }

type Vlak =
  | { soort: "muur"; breedte: number; hoogte: number; kleurId: number; kleurNaam: string }
  | { soort: "plafond"; delen: { breedte: number; diepte: number }[]; kleurId: number; kleurNaam: string }
  | { soort: "lak"; objecten: Record<string, unknown>[]; kleurId: number; kleurNaam: string };
export interface OfferSurface {
  naam: string;
  type: "muur" | "lak";
  ondergrond: string;
  lagen?: number; // weggelaten = standaard van de offerte-tool (muur 1, lak 2)
  renovlies: boolean;
  voorbehandeling: boolean;
  vlakken: Vlak[];
}
export interface OfferPayload {
  titel: string;
  klant: { voornaam: string; achternaam: string; email: string; telefoon: string; straat: string; postcode: string; plaats: string };
  project: { surfaces: OfferSurface[] };
  tools_in_mandje: boolean;
  notitie: string;
  bron: string;
  intake_id: string;
}

export function buildOfferPayload(row: {
  id: string;
  contact_name?: string | null;
  contact_email?: string | null;
  rooms?: { id: string; label: string; surfaces?: string[] }[] | null;
  room_measures?: Record<string, Measure> | null;
  advice_verf?: { rooms?: AdviceRoomLike[] } | null;
}, opts: { phone?: string | null; name?: string | null; toolsInCart?: boolean; notes?: string; alleRuimtes?: boolean } = {}): OfferPayload {
  const full = (row.contact_name || opts.name || "").trim();
  const [voornaam, ...rest] = full.split(/\s+/);
  const verf = (row.advice_verf?.rooms ?? []).filter((a) => (a.color ?? "").trim());
  const surfaces: OfferSurface[] = [];

  for (const r of row.rooms ?? []) {
    const gemeten = row.room_measures?.[r.id];
    // Advies: elke ruimte uit de intake doet mee, ook zonder maten (die zijn voor samples niet nodig).
    if (!gemeten && !opts.alleRuimtes) continue;
    const m: Measure = gemeten ?? {};
    const wil = new Set(r.surfaces ?? []);
    // Standaardkleuren uit het verf-advies (op ruimte-id, anders naam) als een vlak geen eigen kleur heeft.
    const mine = verf.filter((a) => (a.room_id ? a.room_id === r.id : norm(a.room) === norm(r.label)));
    const dMuur = mine.find((a) => !isWoodS(a.surface ?? "") && !isCeilS(a.surface ?? ""))?.color ?? "";
    const dPlaf = mine.find((a) => isCeilS(a.surface ?? ""))?.color ?? "";
    const dHout = mine.find((a) => isWoodS(a.surface ?? ""))?.color ?? "";
    // Lagen alleen meesturen als ze zijn ingevuld; anders kiest de offerte-tool zijn eigen standaard (muur 1 laag).
    const lagen = n(m.coats) || undefined;

    // Maten in meters (11 nov 2026): centimeters uit de intake (410) worden 4,1 m; zie src/lib/maten.ts.
    const walls = (m.walls ?? []).filter((w) => n(w.w) > 0).map((w) => ({ ...w, w: inMeter(n(w.w), 100), h: inMeter(n(w.h), 8) }));
    const plaf = (m.ceilings ?? []).filter((c) => n(c.l) > 0 && n(c.b) > 0).map((c) => ({ ...c, l: inMeter(n(c.l), 30), b: inMeter(n(c.b), 30) }));
    if (!walls.length && !plaf.length && opts.alleRuimtes && (wil.has("muren") || wil.has("plafond") || !wil.size)) {
      const leeg: Vlak[] = [];
      if (wil.has("muren") || !wil.size) leeg.push({ soort: "muur", breedte: 0, hoogte: 2.6, kleurId: 0, kleurNaam: dMuur });
      if (wil.has("plafond")) leeg.push({ soort: "plafond", delen: [{ breedte: 0, diepte: 0 }], kleurId: 0, kleurNaam: dPlaf });
      surfaces.push({ naam: r.label, type: "muur", ondergrond: "bestaand", lagen, renovlies: false, voorbehandeling: false, vlakken: leeg });
    }
    if (walls.length || plaf.length) {
      const vlakken: Vlak[] = walls.map((w) => ({ soort: "muur", breedte: n(w.w), hoogte: n(w.h) || 2.6, kleurId: 0, kleurNaam: (w.color ?? "").trim() || dMuur }));
      if (plaf.length) vlakken.push({ soort: "plafond", delen: plaf.map((c) => ({ breedte: n(c.b), diepte: n(c.l) })), kleurId: 0, kleurNaam: (m.ceiling_color ?? "").trim() || dPlaf });
      surfaces.push({
        naam: r.label,
        type: "muur",
        ondergrond: m.wall_substrate === "nieuw" ? "nieuw" : "bestaand",
        lagen,
        // Renovlies kies je zelf (besluit 10 nov 2026); niet meer automatisch aan bij oneffen muren of scheuren.
        renovlies: m.renovlies ?? false,
        voorbehandeling: m.voorstrijk ?? m.wall_substrate === "nieuw",
        vlakken,
      });
    }

    const w = m.woodwork ?? {};
    const objecten: Record<string, unknown>[] = [];
    if (n(w.doors) > 0) objecten.push({ soort: "deur", n: n(w.doors) });
    for (const x of w.windows ?? []) if (n(x.w) > 0 || n(x.h) > 0) objecten.push({ soort: "raam", b: inMeter(n(x.w), 4), h: inMeter(n(x.h), 3) });
    if (n(w.plinths_m) > 0) objecten.push({ soort: "plint", m: n(w.plinths_m) });
    for (const x of w.radiators ?? []) if (n(x.w) > 0) objecten.push({ soort: "radiator", b: inMeter(n(x.w), 3), h: inMeter(n(x.h), 2) });
    for (const x of w.cabinets ?? []) if (n(x.w) > 0) objecten.push({ soort: "kast", b: inMeter(n(x.w), 5), h: inMeter(n(x.h), 3) });
    // De tool kent geen trap-object: een standaard trap gaat als vrij oppervlak van 6 m² (6 x 1) mee.
    for (let i = 0; i < Math.round(n(w.stairs)); i++) objecten.push({ soort: "vrij", b: TRAP_M2, h: 1 });
    if (!objecten.length && opts.alleRuimtes && !gemeten && ["kozijnen", "deuren", "houtwerk"].some((k) => wil.has(k))) objecten.push({ soort: "vrij", b: 0, h: 0 });
    if (objecten.length) {
      surfaces.push({
        naam: `${r.label} houtwerk`,
        type: "lak",
        ondergrond: m.wood_substrate === "kaal" ? "kaal" : "gelakt",
        // Lak: geen muurlagen meesturen; de offerte-tool rekent lak met zijn standaard (2 lagen).
        renovlies: false,
        voorbehandeling: m.primer ?? m.wood_substrate === "kaal",
        vlakken: [{ soort: "lak", objecten, kleurId: 0, kleurNaam: (m.wood_color ?? "").trim() || dHout }],
      });
    }
  }

  return {
    titel: `Kleuradvies ${full || "klant"}`,
    klant: { voornaam: voornaam ?? "", achternaam: rest.join(" "), email: row.contact_email ?? "", telefoon: opts.phone ?? "", straat: "", postcode: "", plaats: "" },
    project: { surfaces },
    tools_in_mandje: opts.toolsInCart ?? true,
    notitie: opts.notes ?? "",
    bron: "kleuradvies-dashboard",
    intake_id: row.id,
  };
}

/** Een getal dat als meter niet kan, is in centimeters (of millimeters) ingevuld. Zelfde regel als src/lib/maten.ts. */
function inMeter(v: number, max: number): number {
  if (!(v > max)) return v;
  if (v / 100 <= max) return Math.round(v) / 100;
  if (v / 1000 <= max) return Math.round(v / 10) / 100;
  return max;
}
