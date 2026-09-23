import { formatDate } from "./ui";
import { calcRoom, summarizeMeasure } from "@/lib/verfcalc";
import { PLANNING } from "@/data/intake-options";
import { sameRoom } from "./roomMatch";
import type { IntakeRow } from "./types";

// Hulp van Roll: een taak voor Roll (offerte maken of contact opnemen). De gegevens worden
// automatisch opgebouwd uit het verf-advies en de maten; de styliste hoeft niets over te typen.
export interface RollTask {
  id: string;
  type: "offerte" | "contact";
  status: "aangevraagd" | "opgepakt" | "verstuurd" | "afgerond";
  owner: string | null;
  due_date: string | null;
  payload: TaskPayload;
  result: { offer_url?: string; note?: string } | null;
  created_at: string;
  updated_at: string | null;
}
interface TaskRoom { room: string; surface: string; color: string; color_status: string; product: string; m2: string; dimensions: string; substrate: string }
export interface TaskPayload { rooms: TaskRoom[]; planning: string; notes: string }

export const TASK_STATUS: Record<RollTask["status"], string> = { aangevraagd: "Aangevraagd", opgepakt: "Opgepakt", verstuurd: "Verstuurd", afgerond: "Afgerond" };
export const TASK_TYPE: Record<RollTask["type"], string> = { offerte: "Offerte door Roll", contact: "Roll neemt contact op" };

const isWood = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
const g1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

// Taakgegevens uit het verf-advies (kleuren) en room_measures (maten), per intake-ruimte.
export function buildTaskPayload(intake: IntakeRow, notes: string): TaskPayload {
  const verf = (intake.advice_verf?.rooms ?? []).filter((a) => a.room.trim() || a.color.trim());
  const used = new Set<number>();
  const rooms: TaskRoom[] = [];
  for (const r of intake.rooms ?? []) {
    const m = intake.room_measures?.[r.id];
    const calc = m ? calcRoom(m) : null;
    const dims = m ? summarizeMeasure(m).join("; ") : "";
    const substrate = m ? [m.wall_substrate === "nieuw" ? "nieuw stucwerk (voorstrijk)" : "", m.wood_substrate === "kaal" ? "kaal hout/metaal (primer)" : ""].filter(Boolean).join(", ") : "";
    const rows = verf.map((a, i) => ({ a, i })).filter(({ a }) => sameRoom(a, r));
    rows.forEach(({ i }) => used.add(i));
    const m2For = (surface: string) => (calc ? (isWood(surface) ? calc.woodwork_m2 : calc.wall_m2 + calc.ceiling_m2) : 0);
    if (rows.length) {
      for (const { a } of rows) rooms.push({ room: r.label, surface: a.surface, color: a.color, color_status: "definitief", product: isWood(a.surface) ? "Lak" : "Muurverf", m2: m2For(a.surface) ? g1(m2For(a.surface)) : "", dimensions: dims, substrate });
    } else if (m && dims) {
      rooms.push({ room: r.label, surface: "", color: "", color_status: "voorgesteld", product: "", m2: calc ? g1(calc.wall_m2 + calc.ceiling_m2) : "", dimensions: dims, substrate });
    }
  }
  // Regels die niet bij een intake-ruimte horen (handmatig toegevoegd) gaan zonder maten mee.
  verf.forEach((a, i) => { if (!used.has(i)) rooms.push({ room: a.room, surface: a.surface, color: a.color, color_status: "definitief", product: isWood(a.surface) ? "Lak" : "Muurverf", m2: "", dimensions: "", substrate: "" }); });
  return { rooms, planning: PLANNING.find((p) => p.key === intake.planning)?.label ?? "", notes };
}

// Stand van een aanvraag bij Roll.
export function RollTaskStatus({ task }: { task: RollTask }) {
  const steps: RollTask["status"][] = ["aangevraagd", "opgepakt", "verstuurd", "afgerond"];
  const idx = steps.indexOf(task.status);
  return (
    <div style={{ border: "1px solid var(--rd-line)", borderRadius: 12, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <div><strong>{TASK_TYPE[task.type]}</strong><span style={{ fontSize: 13, opacity: 0.65 }}> · aangevraagd {formatDate(task.created_at)}</span></div>
        <span className="rd-chip" style={{ background: task.status === "afgerond" ? "#C9E6CE" : "var(--rd-aubergine)", color: task.status === "afgerond" ? "#1e4429" : "#fff", fontWeight: 700 }}>{TASK_STATUS[task.status]}</span>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
        {steps.map((s, i) => <div key={s} title={TASK_STATUS[s]} style={{ flex: 1, height: 6, borderRadius: 99, background: i <= idx ? "var(--rd-pink-dark)" : "var(--rd-line)" }} />)}
      </div>
      <div style={{ fontSize: 13, marginTop: 8, opacity: 0.8 }}>
        {task.owner ? <>Eigenaar: <strong>{task.owner}</strong></> : "Nog geen eigenaar"}{task.due_date ? ` · opvolgdatum ${task.due_date}` : ""}
      </div>
      {task.result?.offer_url && <div style={{ marginTop: 6, fontSize: 14 }}>Offerte: <a href={task.result.offer_url} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)", fontWeight: 600, wordBreak: "break-all" }}>{task.result.offer_url}</a></div>}
      {task.result?.note && <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{task.result.note}</div>}
    </div>
  );
}
