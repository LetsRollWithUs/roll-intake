// Advies per ruimte en oppervlak: één bron voor het klantverslag, de samples en het bestelvoorstel.
// Opgeslagen in intake.advice_v2. Bij elke wijziging leiden we de oude velden (advice_sample,
// advice_verf, advisor_advice) hieruit af, zodat de mails (C04/C05), het bestelvoorstel en de
// maten-rekenkern ongewijzigd blijven werken.
import { rollColors } from "@/data/roll-colors";
import type { AdvicePhase, AdviceRoom, DbRoom, IntakeRow } from "../types";

export type SurfaceType = "muren" | "accent" | "plafond" | "houtwerk";
export type Keuze = "bespreken" | "testen" | "bevestigd";

export interface PickedColor {
  id: string;            // Roll: kleur-id (bijv. "shadow-nap"); extern: id uit de kleurendatabase
  name: string;
  hex: string | null;    // alleen voor de schermweergave
  source: "roll" | "ark";
  brand?: string | null; // extern: merk (bijv. "Farrow & Ball")
  line?: string | null;  // extern: lijn of waaier
  roll_name?: string | null; // extern: bijpassende Roll-basis
  roll_code?: string | null; // extern: mengcode
}
export interface AdviceSurface { id: string; type: SurfaceType; name: string; status: Keuze; colors: PickedColor[]; note: string }
export interface AdviceRoomV2 { room_id: string; label: string; surfaces: AdviceSurface[] }
export interface AdviceV2 { rooms: AdviceRoomV2[]; message: string; updated_at?: string }

export const KEUZE_LABEL: Record<Keuze, string> = { bespreken: "Nog bespreken", testen: "Eerst testen", bevestigd: "Bevestigd" };
export const TYPE_LABEL: Record<SurfaceType, string> = { muren: "Muren", accent: "Accentwand", plafond: "Plafond", houtwerk: "Houtwerk" };
const TYPE_ORDER: Record<SurfaceType, number> = { muren: 0, plafond: 1, houtwerk: 2, accent: 3 };

const byName = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c]));
export const uid = () => Math.random().toString(36).slice(2, 9);

export function rollPicked(name: string): PickedColor | null {
  const c = byName.get(name.trim().toLowerCase());
  return c ? { id: c.id, name: c.name, hex: c.hex, source: "roll" } : name.trim() ? { id: `vrij:${name.trim()}`, name: name.trim(), hex: null, source: "roll" } : null;
}
export const colorLabel = (c: PickedColor) => (c.source === "ark" ? `${c.brand ? `${c.brand} · ` : ""}${c.name}` : c.name);

function typeFromText(s: string): SurfaceType {
  if (/accent/i.test(s)) return "accent";
  if (/plafond/i.test(s)) return "plafond";
  if (/kozijn|deur|houtwerk|plint|lak|trap/i.test(s)) return "houtwerk";
  return "muren";
}
export const newSurface = (type: SurfaceType, name?: string): AdviceSurface => ({ id: uid(), type, name: name ?? TYPE_LABEL[type], status: "bespreken", colors: [], note: "" });

// Startpunt: bestaand v2-advies, anders overgezet uit het oude advies, anders per intake-ruimte "Muren".
export function initialAdvice(intake: IntakeRow): AdviceV2 {
  const existing = (intake as IntakeRow & { advice_v2?: AdviceV2 | null }).advice_v2;
  if (existing && Array.isArray(existing.rooms)) return existing;
  const rooms: AdviceRoomV2[] = (intake.rooms ?? []).map((r: DbRoom) => ({ room_id: r.id, label: r.label, surfaces: [] }));
  const find = (row: AdviceRoom): AdviceRoomV2 => {
    let room = rooms.find((x) => (row.room_id ? x.room_id === row.room_id : x.label.trim().toLowerCase() === row.room.trim().toLowerCase()));
    if (!room) { room = { room_id: row.room_id ?? `extra-${uid()}`, label: row.room || "Ruimte", surfaces: [] }; rooms.push(room); }
    return room;
  };
  // Verf-advies = bevestigd; sample-advies = testen (kandidaten per oppervlak samengevoegd).
  for (const row of intake.advice_verf?.rooms ?? []) {
    if (!row.color.trim() && !row.room.trim()) continue;
    const room = find(row);
    const c = rollPicked(row.color);
    room.surfaces.push({ id: uid(), type: typeFromText(row.surface), name: row.surface || "Muren", status: c ? "bevestigd" : "bespreken", colors: c ? [c] : [], note: row.motivation ?? "" });
  }
  for (const row of intake.advice_sample?.rooms ?? []) {
    if (!row.color.trim()) continue;
    const room = find(row);
    const type = typeFromText(row.surface || "muren");
    if (room.surfaces.some((s) => s.type === type && s.status === "bevestigd")) continue;
    let s = room.surfaces.find((x) => x.type === type && x.status === "testen");
    if (!s) { s = { ...newSurface(type, row.surface || undefined), status: "testen" }; room.surfaces.push(s); }
    const c = rollPicked(row.color);
    if (c && !s.colors.some((x) => x.id === c.id)) s.colors.push(c);
  }
  for (const r of rooms) if (!r.surfaces.length) r.surfaces.push(newSurface("muren"));
  return { rooms, message: intake.advice_verf?.answer || intake.advice_sample?.answer || "" };
}

const sorted = (list: AdviceSurface[]) => [...list].sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type]);
const surfaceText = (s: AdviceSurface) => (s.type === "accent" ? `Accentwand: ${s.name}` : s.name || TYPE_LABEL[s.type]);
const product = (s: AdviceSurface) => (s.type === "houtwerk" ? "Lak" : "Muurverf");

// Oude velden afleiden, zodat verzenden (advies_done) en het bestelvoorstel blijven werken.
export function derive(a: AdviceV2, prev: { sample: AdvicePhase | null; verf: AdvicePhase | null }) {
  const verfRows: AdviceRoom[] = [];
  const sampleRows: AdviceRoom[] = [];
  for (const r of a.rooms) {
    for (const s of sorted(r.surfaces)) {
      if (s.status === "bevestigd" && s.colors[0]) {
        verfRows.push({ room_id: r.room_id, room: r.label, surface: surfaceText(s), color: s.colors[0].name, status: "definitief", product: product(s), m2: "", liters: "", motivation: s.note });
      }
      if (s.status === "testen") {
        for (const c of s.colors) sampleRows.push({ room_id: r.room_id, room: r.label, surface: surfaceText(s), color: c.name, status: "voorgesteld", product: product(s), m2: "", liters: "", motivation: s.note });
      }
    }
  }
  const base = (p: AdvicePhase | null, route: AdvicePhase["route"]): AdvicePhase => ({
    answer: a.message, rooms: [], sample_instruction: p?.sample_instruction ?? "", next_step: p?.next_step ?? "",
    internal: p?.internal ?? "", plan: p?.plan ?? { what: "", who: "", when: "" }, route: p?.route ?? route, products: p?.products ?? [],
  });
  return {
    advice_sample: sampleRows.length ? { ...base(prev.sample, "samples"), route: "samples" as const, rooms: sampleRows } : prev.sample,
    advice_verf: verfRows.length ? { ...base(prev.verf, "roll"), rooms: verfRows } : prev.verf,
    advisor_advice: verfRows.map((r) => ({ room: `${r.room} · ${r.surface}`, color: r.color, product: r.product, liters: "", m2: "" })),
  };
}

export interface RoomProgress { label: string; tone: "todo" | "test" | "ok" }
export function roomProgress(r: AdviceRoomV2): RoomProgress {
  const st = r.surfaces.map((s) => s.status);
  if (st.length && st.every((x) => x === "bevestigd")) return { label: "Keuzes bevestigd", tone: "ok" };
  if (st.some((x) => x === "testen")) return { label: "Kleuren testen", tone: "test" };
  return { label: "Nog bespreken", tone: "todo" };
}

// Samenvatting voor de afronding: wat is klaar voor verf, wat wordt getest, wat staat nog open.
export function summarize(a: AdviceV2) {
  const bevestigd: { room: string; surface: AdviceSurface }[] = [];
  const testen: { room: string; surface: AdviceSurface }[] = [];
  const open: { room: string; surface: AdviceSurface }[] = [];
  for (const r of a.rooms) for (const s of r.surfaces) {
    const item = { room: r.label, surface: s };
    if (s.status === "bevestigd" && s.colors[0]) bevestigd.push(item);
    else if (s.status === "testen" && s.colors.length) testen.push(item);
    else open.push(item);
  }
  return { bevestigd, testen, open };
}
