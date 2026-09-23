import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

// Opvolgtaken per gesprek: actie + eigenaar + datum + uitkomst. "Opgevolgd" is geen vinkje meer,
// maar een afgeronde taak met een vastgelegde uitkomst.
export interface FollowupTask {
  id: string;
  action: string;
  owner: "styliste" | "roll" | "klant";
  due_date: string | null;
  kind: "algemeen" | "sample_checkin" | "achteraan";
  outcome: string | null;
  note: string | null;
  done_at: string | null;
  created_at: string;
}

export const OUTCOMES_FU: { key: string; label: string }[] = [
  { key: "keuze_gemaakt", label: "Keuze gemaakt" },
  { key: "nog_twijfel", label: "Nog twijfel" },
  { key: "meer_samples", label: "Meer samples nodig" },
  { key: "later_schilderen", label: "Later schilderen" },
  { key: "hulp_roll", label: "Hulp van Roll nodig" },
  { key: "geen_reactie", label: "Geen reactie" },
  { key: "verf_gekocht", label: "Verf gekocht" },
  { key: "anders", label: "Anders" },
];
const OWNER: Record<FollowupTask["owner"], string> = { styliste: "Styliste", roll: "Roll", klant: "Klant" };
export const outcomeLabel = (k?: string | null) => OUTCOMES_FU.find((o) => o.key === k)?.label ?? k ?? "";

interface Props {
  bookingId: string;
  stylistId: string | null;
  tasks: FollowupTask[];
  onChange: (tasks: FollowupTask[]) => void;
}

export function FollowupTasks({ bookingId, stylistId, tasks, onChange }: Props) {
  const [action, setAction] = useState("");
  const [owner, setOwner] = useState<FollowupTask["owner"]>("styliste");
  const [due, setDue] = useState("");
  const [closing, setClosing] = useState<string | null>(null);
  const [outcome, setOutcome] = useState("");
  const [note, setNote] = useState("");

  const add = async () => {
    if (!action.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("followup_tasks")
      .insert({ booking_id: bookingId, stylist_id: stylistId, action: action.trim(), owner, due_date: due || null, kind: "algemeen", created_by: u?.user?.email ?? null })
      .select("id,action,owner,due_date,kind,outcome,note,done_at,created_at").single();
    if (data) onChange([...tasks, data as FollowupTask]);
    setAction(""); setDue("");
  };

  const complete = async (id: string) => {
    const patch = { done_at: new Date().toISOString(), outcome: outcome || null, note: note.trim() || null };
    await supabase.from("followup_tasks").update(patch).eq("id", id);
    onChange(tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)));
    setClosing(null); setOutcome(""); setNote("");
  };
  const reopen = async (id: string) => {
    await supabase.from("followup_tasks").update({ done_at: null, outcome: null }).eq("id", id);
    onChange(tasks.map((t) => (t.id === id ? { ...t, done_at: null, outcome: null } : t)));
  };

  const today = new Date().toISOString().slice(0, 10);
  const open = tasks.filter((t) => !t.done_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const done = tasks.filter((t) => t.done_at).sort((a, b) => (b.done_at ?? "").localeCompare(a.done_at ?? ""));

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {open.length === 0 && <span style={{ fontSize: 14, opacity: 0.6 }}>Geen open taken.</span>}
        {open.map((t) => {
          const late = t.due_date && t.due_date < today;
          return (
            <div key={t.id} style={{ border: `1px solid ${late ? "var(--rd-pink-dark)" : "var(--rd-line)"}`, borderRadius: 12, padding: "10px 12px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{t.action}</div>
                  <div style={{ fontSize: 12.5, opacity: 0.7 }}>{OWNER[t.owner]}{t.due_date ? ` · ${late ? "te laat, was " : ""}${t.due_date}` : ""}</div>
                </div>
                {closing !== t.id && <button className="rd-plan-chip" onClick={() => setClosing(t.id)}>Afronden</button>}
              </div>
              {closing === t.id && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <select className="rd-input" value={outcome} onChange={(e) => setOutcome(e.target.value)} style={{ height: 38, flex: "0 1 200px" }}>
                    <option value="">Uitkomst…</option>
                    {OUTCOMES_FU.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                  </select>
                  <input className="rd-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Korte notitie (optioneel)" style={{ height: 38, flex: "1 1 200px" }} />
                  <button className="rd-plan-chip is-on" onClick={() => complete(t.id)}>Opslaan</button>
                  <button className="rd-textlink" onClick={() => setClosing(null)} style={{ fontSize: 13 }}>Annuleer</button>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <input className="rd-input" value={action} onChange={(e) => setAction(e.target.value)} placeholder="Nieuwe taak, bijv. Bel over de samples" style={{ height: 38, flex: "2 1 220px" }} />
        <select className="rd-input" value={owner} onChange={(e) => setOwner(e.target.value as FollowupTask["owner"])} style={{ height: 38, flex: "0 1 120px" }}>
          {(Object.keys(OWNER) as FollowupTask["owner"][]).map((k) => <option key={k} value={k}>{OWNER[k]}</option>)}
        </select>
        <input type="date" className="rd-input" value={due} onChange={(e) => setDue(e.target.value)} style={{ height: 38, flex: "0 1 160px" }} />
        <button className="rd-plan-chip" onClick={add} disabled={!action.trim()}>+ Taak</button>
      </div>

      {done.length > 0 && (
        <details>
          <summary style={{ cursor: "pointer", fontSize: 13, opacity: 0.7 }}>{done.length} afgeronde ta{done.length === 1 ? "ak" : "ken"}</summary>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 6 }}>
            {done.map((t) => (
              <div key={t.id} style={{ fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
                <span><span style={{ textDecoration: "line-through", opacity: 0.6 }}>{t.action}</span> · <strong>{outcomeLabel(t.outcome) || "afgerond"}</strong>{t.note ? ` · ${t.note}` : ""}</span>
                <span style={{ opacity: 0.6 }}>{formatDate(t.done_at)} <button className="rd-textlink" onClick={() => reopen(t.id)} style={{ fontSize: 12, opacity: 0.7 }}>heropen</button></span>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}
