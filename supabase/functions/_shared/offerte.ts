// Bouwt de gestructureerde ruimtedata voor de offerte-tool (WP-plugin).
// Zelfde veldnamen als een offerte-ruimte: type, ondergrond, wandvlakken, plafondvlakken,
// houtwerk-objecten, voorbehandeling, lagen, kleur. Prijzen doet de tool zelf (WooCommerce).
// Renovlies staat bewust op false (nog niet in gebruik).
import { ROLL_COLORS } from "./roll-collection.ts";

const NAME_TO_COLOR = new Map<string, { id: string; hex: string }>(
  ROLL_COLORS.map((c) => [c.name.trim().toLowerCase(), { id: c.id, hex: c.hex }]),
);

const n = (v: unknown) => { const x = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(",", ".")); return Number.isFinite(x) && x > 0 ? x : 0; };

interface Vlak2 { w?: number; h?: number; l?: number; b?: number }
interface Measure {
  walls?: Vlak2[];
  ceilings?: Vlak2[];
  woodwork?: { doors?: number; windows?: Vlak2[]; plinths_m?: number; radiators?: Vlak2[]; cabinets?: Vlak2[] };
  wall_substrate?: string;
  wood_substrate?: string;
  coats?: number;
}
interface AdviceRoomLike { room_id?: string; room?: string; surface?: string; color?: string; status?: string }

export interface OfferRoom {
  naam: string;
  type: string[]; // "muur" en/of "lak"
  ondergrond: { muren: string | null; houtwerk: string | null };
  wandvlakken: { breedte: number; hoogte: number }[];
  plafondvlakken: { lengte: number; breedte: number }[];
  houtwerk: {
    deuren: number;
    raamkozijnen: { breedte: number; hoogte: number }[];
    plinten_m: number;
    radiatoren: { breedte: number; hoogte: number }[];
    kasten: { breedte: number; hoogte: number }[];
  };
  voorbehandeling: { voorstrijk: boolean; primer: boolean };
  renovlies: boolean;
  lagen: number;
  kleuren: { vlak: string; naam: string; kleur_id: string | null; hex: string | null }[];
}
export interface OfferPayload {
  intake_id: string;
  booking_id: string | null;
  klant: { naam: string | null; email: string | null };
  ruimtes: OfferRoom[];
}

// intakeRow: rij uit public.intake (rooms, room_measures, advice_verf, contact_*).
export function buildOfferPayload(row: {
  id: string;
  booking_id?: string | null;
  contact_name?: string | null;
  contact_email?: string | null;
  rooms?: { id: string; label: string; surfaces?: string[] }[] | null;
  room_measures?: Record<string, Measure> | null;
  advice_verf?: { rooms?: AdviceRoomLike[] } | null;
}): OfferPayload {
  const measures = row.room_measures ?? {};
  const rooms = row.rooms ?? [];

  // Kleuren uit het verf-advies, per intake-ruimte: eerst op ruimte-id, anders op naam.
  const norm = (s?: string | null) => (s ?? "").trim().toLowerCase();
  const verfRows = (row.advice_verf?.rooms ?? []).filter((a) => (a.color ?? "").trim());
  const colorsFor = (r: { id: string; label: string }) => verfRows.filter((a) => (a.room_id ? a.room_id === r.id : norm(a.room) === norm(r.label)));

  const ruimtes: OfferRoom[] = [];
  for (const r of rooms) {
    const m = measures[r.id];
    if (!m) continue;
    const walls = (m.walls ?? []).filter((w) => n(w.w) > 0).map((w) => ({ breedte: n(w.w), hoogte: n(w.h) || 2.6 }));
    const plaf = (m.ceilings ?? []).filter((c) => n(c.l) > 0 && n(c.b) > 0).map((c) => ({ lengte: n(c.l), breedte: n(c.b) }));
    const w = m.woodwork ?? {};
    const doors = n(w.doors);
    const windows = (w.windows ?? []).filter((x) => n(x.w) > 0 || n(x.h) > 0).map((x) => ({ breedte: n(x.w), hoogte: n(x.h) }));
    const plinth = n(w.plinths_m);
    const radiators = (w.radiators ?? []).filter((x) => n(x.w) > 0).map((x) => ({ breedte: n(x.w), hoogte: n(x.h) }));
    const cabinets = (w.cabinets ?? []).filter((x) => n(x.w) > 0).map((x) => ({ breedte: n(x.w), hoogte: n(x.h) }));
    const hasMuur = walls.length > 0 || plaf.length > 0;
    const hasWood = doors > 0 || windows.length > 0 || plinth > 0 || radiators.length > 0 || cabinets.length > 0;
    if (!hasMuur && !hasWood) continue;

    const kleuren = colorsFor(r).map((a) => {
      const c = NAME_TO_COLOR.get((a.color ?? "").trim().toLowerCase());
      return { vlak: a.surface ?? "", naam: a.color ?? "", kleur_id: c?.id ?? null, hex: c?.hex ?? null };
    });

    ruimtes.push({
      naam: r.label,
      type: [hasMuur ? "muur" : "", hasWood ? "lak" : ""].filter(Boolean),
      ondergrond: { muren: hasMuur ? (m.wall_substrate ?? "bestaand") : null, houtwerk: hasWood ? (m.wood_substrate ?? "gelakt") : null },
      wandvlakken: walls,
      plafondvlakken: plaf,
      houtwerk: { deuren: doors, raamkozijnen: windows, plinten_m: plinth, radiatoren: radiators, kasten: cabinets },
      voorbehandeling: { voorstrijk: hasMuur && m.wall_substrate === "nieuw", primer: hasWood && m.wood_substrate === "kaal" },
      renovlies: false,
      lagen: n(m.coats) || 2,
      kleuren,
    });
  }

  return {
    intake_id: row.id,
    booking_id: row.booking_id ?? null,
    klant: { naam: row.contact_name ?? null, email: row.contact_email ?? null },
    ruimtes,
  };
}
