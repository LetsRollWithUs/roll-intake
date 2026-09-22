import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PLANNING } from "@/data/intake-options";
import { formatDate } from "./ui";
import type { IntakeRow } from "./types";

// "Hulp van Roll aanvragen": de styliste levert per ruimte de gegevens, Roll maakt de offerte
// of neemt contact op. Geen liters, verpakkingen of primerbehoefte verplicht.
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

interface Props {
  bookingId: string;
  stylistId: string | null;
  intake: IntakeRow | null;
  task: RollTask | null;
  onCreated: (t: RollTask) => void;
}

export function RollHelpForm({ bookingId, stylistId, intake, task, onCreated }: Props) {
  const seedRooms: TaskRoom[] = (intake?.advice_client?.rooms ?? []).map((r) => ({
    room: r.room, surface: r.surface, color: r.color, color_status: r.status, product: r.product, m2: r.m2, dimensions: "", substrate: "",
  }));
  const [type, setType] = useState<RollTask["type"]>("offerte");
  const [rooms, setRooms] = useState<TaskRoom[]>(seedRooms.length ? seedRooms : [{ room: "", surface: "", color: "", color_status: "voorgesteld", product: "Muurverf", m2: "", dimensions: "", substrate: "" }]);
  const [planning, setPlanning] = useState(PLANNING.find((p) => p.key === intake?.planning)?.label ?? "");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setRoom = (i: number, p: Partial<TaskRoom>) => setRooms((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...p } : r)));

  const submit = async () => {
    setBusy(true); setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const payload: TaskPayload = { rooms: rooms.filter((r) => r.room.trim() || r.color.trim()), planning, notes };
    if (type === "offerte" && payload.rooms.length === 0) { setErr("Vul minimaal één ruimte in, of kies 'Roll neemt contact op'."); setBusy(false); return; }
    const due = new Date(); due.setDate(due.getDate() + 3);
    const { data, error } = await supabase.from("roll_tasks").insert({
      type, booking_id: bookingId, intake_id: intake?.id ?? null, stylist_id: stylistId,
      requested_by: u?.user?.email ?? null, due_date: due.toISOString().slice(0, 10), payload,
    }).select("id,type,status,owner,due_date,payload,result,created_at,updated_at").single();
    setBusy(false);
    if (error || !data) { setErr("Aanvragen lukte niet. Probeer het opnieuw."); return; }
    onCreated(data as RollTask);
  };

  const field = (label: string, el: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{label}</label>
      {el}
    </div>
  );

  if (task) {
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(["offerte", "contact"] as const).map((t) => (
          <label key={t} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${type === t ? "var(--rd-aubergine)" : "var(--rd-line)"}`, background: type === t ? "var(--rd-grey-light)" : "transparent", cursor: "pointer" }}>
            <input type="radio" name="rolltype" checked={type === t} onChange={() => setType(t)} style={{ marginTop: 3 }} />
            <span><strong style={{ fontSize: 14 }}>{TASK_TYPE[t]}</strong><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>{t === "offerte" ? "Op basis van de gegevens hieronder. Roll bepaalt liters, verpakkingen en primer." : "Roll werkt hoeveelheden en bestelling samen met de klant uit. Afmetingen mogen ontbreken."}</span></span>
          </label>
        ))}
      </div>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Per ruimte</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {rooms.map((r, i) => (
            <div key={i} style={{ padding: 12, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)", borderRadius: 12, display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))" }}>
              {field("Ruimte", <input className="rd-input" value={r.room} onChange={(e) => setRoom(i, { room: e.target.value })} style={{ height: 40 }} />)}
              {field("Oppervlak", <input className="rd-input" value={r.surface} onChange={(e) => setRoom(i, { surface: e.target.value })} placeholder="muren / plafond / accentwand" style={{ height: 40 }} />)}
              {field("Kleur", <input className="rd-input" value={r.color} onChange={(e) => setRoom(i, { color: e.target.value })} style={{ height: 40 }} />)}
              {field("Kleurstatus", <select className="rd-input" value={r.color_status} onChange={(e) => setRoom(i, { color_status: e.target.value })} style={{ height: 40 }}><option value="voorgesteld">Onder voorbehoud</option><option value="definitief">Gekozen</option></select>)}
              {field("Product (indien bekend)", <input className="rd-input" value={r.product} onChange={(e) => setRoom(i, { product: e.target.value })} style={{ height: 40 }} />)}
              {field("m²", <input className="rd-input" inputMode="decimal" value={r.m2} onChange={(e) => setRoom(i, { m2: e.target.value })} placeholder="of vul maten in" style={{ height: 40 }} />)}
              {field("Maten (l × h per wand)", <input className="rd-input" value={r.dimensions} onChange={(e) => setRoom(i, { dimensions: e.target.value })} placeholder="bijv. 4,2 × 2,6 en 5,0 × 2,6" style={{ height: 40 }} />)}
              {field("Ondergrond en staat", <input className="rd-input" value={r.substrate} onChange={(e) => setRoom(i, { substrate: e.target.value })} placeholder="onbekend / gestuukt / eerder geverfd" style={{ height: 40 }} />)}
              <div style={{ gridColumn: "1 / -1", textAlign: "right" }}><button className="rd-textlink" onClick={() => setRooms((rs) => rs.filter((_, idx) => idx !== i))} style={{ fontSize: 12, opacity: 0.6 }}>Verwijder</button></div>
            </div>
          ))}
          <button className="rd-textlink" onClick={() => setRooms((rs) => [...rs, { room: "", surface: "", color: "", color_status: "voorgesteld", product: "Muurverf", m2: "", dimensions: "", substrate: "" }])} style={{ alignSelf: "flex-start", minHeight: 36 }}>+ Ruimte toevoegen</button>
        </div>
      </div>

      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 2fr" }}>
        {field("Planning", <input className="rd-input" value={planning} onChange={(e) => setPlanning(e.target.value)} placeholder="gewenste schilderdatum" style={{ height: 40 }} />)}
        {field("Toelichting", <input className="rd-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="openstaande vragen, bijzonderheden" style={{ height: 40 }} />)}
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-primary" onClick={submit} disabled={busy} style={{ width: "auto", padding: "0 20px" }}>{busy ? "Aanvragen..." : "Hulp van Roll aanvragen"}</button>
        {err && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{err}</span>}
      </div>
    </div>
  );
}
