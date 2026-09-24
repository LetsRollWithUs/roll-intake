// Overdracht naar de offerte-tool (roll-verfcalculator v1.40.0): POST roll-advies/v1/offerte.
// Per intake-ruimte een "muur"-surface (muurvlakken + plafond) en zo nodig een "lak"-surface
// (houtwerk). Kleur per vlak als naam; kleurId blijft 0 zolang de koppeling op ID niet bekend is.
// Prijzen, blikken en de tools doet de offerte-tool zelf.

const n = (v: unknown) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : 0; };
const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
const isWoodS = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
const isCeilS = (s: string) => /plafond/i.test(s);

interface Vlak2 { w?: number; h?: number; l?: number; b?: number; color?: string }
interface Measure {
  walls?: Vlak2[];
  ceilings?: Vlak2[];
  woodwork?: { doors?: number; windows?: Vlak2[]; plinths_m?: number; radiators?: Vlak2[]; cabinets?: Vlak2[] };
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
  lagen: number;
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
}, opts: { phone?: string | null; name?: string | null; toolsInCart?: boolean; notes?: string } = {}): OfferPayload {
  const full = (row.contact_name || opts.name || "").trim();
  const [voornaam, ...rest] = full.split(/\s+/);
  const verf = (row.advice_verf?.rooms ?? []).filter((a) => (a.color ?? "").trim());
  const surfaces: OfferSurface[] = [];

  for (const r of row.rooms ?? []) {
    const m = row.room_measures?.[r.id];
    if (!m) continue;
    // Standaardkleuren uit het verf-advies (op ruimte-id, anders naam) als een vlak geen eigen kleur heeft.
    const mine = verf.filter((a) => (a.room_id ? a.room_id === r.id : norm(a.room) === norm(r.label)));
    const dMuur = mine.find((a) => !isWoodS(a.surface ?? "") && !isCeilS(a.surface ?? ""))?.color ?? "";
    const dPlaf = mine.find((a) => isCeilS(a.surface ?? ""))?.color ?? "";
    const dHout = mine.find((a) => isWoodS(a.surface ?? ""))?.color ?? "";
    const lagen = n(m.coats) || 2;

    const walls = (m.walls ?? []).filter((w) => n(w.w) > 0);
    const plaf = (m.ceilings ?? []).filter((c) => n(c.l) > 0 && n(c.b) > 0);
    if (walls.length || plaf.length) {
      const vlakken: Vlak[] = walls.map((w) => ({ soort: "muur", breedte: n(w.w), hoogte: n(w.h) || 2.6, kleurId: 0, kleurNaam: (w.color ?? "").trim() || dMuur }));
      if (plaf.length) vlakken.push({ soort: "plafond", delen: plaf.map((c) => ({ breedte: n(c.b), diepte: n(c.l) })), kleurId: 0, kleurNaam: (m.ceiling_color ?? "").trim() || dPlaf });
      surfaces.push({
        naam: r.label,
        type: "muur",
        ondergrond: m.wall_substrate === "nieuw" ? "nieuw" : "bestaand",
        lagen,
        renovlies: m.renovlies ?? (m.wall_condition === "oneffen" || m.wall_condition === "scheuren"),
        voorbehandeling: m.voorstrijk ?? m.wall_substrate === "nieuw",
        vlakken,
      });
    }

    const w = m.woodwork ?? {};
    const objecten: Record<string, unknown>[] = [];
    if (n(w.doors) > 0) objecten.push({ soort: "deur", n: n(w.doors) });
    for (const x of w.windows ?? []) if (n(x.w) > 0 || n(x.h) > 0) objecten.push({ soort: "raam", b: n(x.w), h: n(x.h) });
    if (n(w.plinths_m) > 0) objecten.push({ soort: "plint", m: n(w.plinths_m) });
    for (const x of w.radiators ?? []) if (n(x.w) > 0) objecten.push({ soort: "radiator", b: n(x.w), h: n(x.h) });
    for (const x of w.cabinets ?? []) if (n(x.w) > 0) objecten.push({ soort: "kast", b: n(x.w), h: n(x.h) });
    if (objecten.length) {
      surfaces.push({
        naam: `${r.label} houtwerk`,
        type: "lak",
        ondergrond: m.wood_substrate === "kaal" ? "kaal" : "gelakt",
        lagen,
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
