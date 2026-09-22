import { PLANNING, PAINTERS } from "@/data/intake-options";

// Tijdlijn- en leadlogica, gedeeld door kanban, dossier en notificaties.

// Verwachte verfaankoop: gesprek + planning uit de intake (aanpasbaar in het dossier).
export const PLANNING_DAYS: Record<string, number> = { "2weken": 14, maand: 30, "3maanden": 90, later: 45, "weet-niet": 45 };
export const TOOLKIT_DAYS = 21; // zonder verf na het gesprek: toolkit-korting achter de hand

export function deriveExpected(startAt: string, planning?: string | null): string {
  const d = new Date(startAt);
  d.setDate(d.getDate() + (PLANNING_DAYS[planning ?? ""] ?? 45));
  return d.toISOString().slice(0, 10);
}
export const daysSince = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
export const todayKey = () => new Date().toISOString().slice(0, 10);

export const planningLabel = (k?: string | null) => PLANNING.find((p) => p.key === k)?.label ?? null;
export const painterLabel = (k?: string | null) => PAINTERS.find((p) => p.key === k)?.label ?? null;

export interface LeadInput {
  rooms?: { surfaces?: string[] }[] | null;
  planning?: string | null;
  painter?: string | null;
}
export type LeadTemp = "warm" | "lauw" | "koud";

// Omvang (ruimtes/oppervlakken) + timing + wie schildert. Schilder = risico dat verf via de schilder loopt.
export function leadScore(i: LeadInput): { score: number; temp: LeadTemp; rooms: number; surfaces: number } {
  const rooms = i.rooms?.length ?? 0;
  const surfaces = (i.rooms ?? []).reduce((s, r) => s + (r.surfaces?.length ?? 0), 0);
  let score = 0;
  score += rooms >= 3 ? 2 : rooms === 2 ? 1 : 0;
  score += surfaces >= 3 ? 1 : 0;
  score += i.planning === "2weken" ? 2 : i.planning === "maand" ? 1 : i.planning === "3maanden" ? 0.5 : 0;
  score += i.painter === "zelf" ? 1 : i.painter === "deels" ? 0.5 : i.painter === "schilder" ? -1 : 0;
  const temp: LeadTemp = score >= 3 ? "warm" : score >= 1.5 ? "lauw" : "koud";
  return { score, temp, rooms, surfaces };
}
export const TEMP_LABEL: Record<LeadTemp, { label: string; bg: string; ink: string }> = {
  warm: { label: "🔥 warm", bg: "var(--rd-pink)", ink: "var(--rd-aubergine)" },
  lauw: { label: "lauw", bg: "var(--rd-lime)", ink: "var(--rd-aubergine)" },
  koud: { label: "koud", bg: "var(--rd-grey-light)", ink: "var(--rd-aubergine)" },
};
