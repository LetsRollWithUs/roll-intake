import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { SURFACES } from "@/data/intake-options";
import type { IntakeRow, AdvicePhase, AdviceRoom, CheckinOutcome, SampleCheckin as Checkin } from "./types";
import type { FollowupTask } from "./FollowupTasks";

// Stap 4: hoe bevallen de samples? Per ruimte de winnaar kiezen; die gaat door naar het verf-advies.
const colorByName = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c]));
const hexOf = (n: string) => colorByName.get(n.trim().toLowerCase())?.hex;
const SURF_LABEL: Record<string, string> = Object.fromEntries(SURFACES.map((s) => [s.key, s.label]));
const isWood = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
const OUTCOMES: { key: CheckinOutcome; label: string; hint: string }[] = [
  { key: "keuze_gemaakt", label: "Keuze gemaakt", hint: "De winnaars staan klaar in het verf-advies." },
  { key: "meer_samples", label: "Meer samples nodig", hint: "Terug naar het sample-advies voor een nieuwe ronde." },
  { key: "nog_twijfel", label: "Nog twijfel", hint: "Leg vast waar ze tussen twijfelt." },
  { key: "later_schilderen", label: "Later schilderen", hint: "De opvolging schuift mee met haar planning." },
  { key: "geen_reactie", label: "Geen reactie", hint: "De check-in blijft open en schuift 4 dagen op." },
];
const fmt = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short" });

interface Group { key: string; room: string; surface: string; colors: string[] }

interface Props {
  intake: IntakeRow;
  tasks: FollowupTask[];
  startEditing?: boolean; // nieuwe sample-ronde: meteen een nieuwe check-in
  onSaved: (patch: Partial<IntakeRow>, opts: { followed: boolean; toVerf: boolean; toSamples: boolean }) => void;
}

export function SampleCheckin({ intake, tasks, startEditing, onSaved }: Props) {
  const prev = intake.sample_checkin;

  // Groepen per ruimte + oppervlak uit het sample-advies; zonder advies de ruimtes uit de intake.
  const groups = useMemo<Group[]>(() => {
    const extra = (intake.advice_sample?.products ?? []).filter((p) => p.kind !== "pack").map((p) => p.name);
    const map = new Map<string, Group>();
    for (const r of intake.advice_sample?.rooms ?? []) {
      if (!r.room.trim() && !r.color.trim()) continue;
      const key = `${r.room.trim().toLowerCase()}|${r.surface.trim().toLowerCase()}`;
      const g = map.get(key) ?? { key, room: r.room.trim(), surface: r.surface.trim(), colors: [] };
      if (r.color.trim() && !g.colors.includes(r.color.trim())) g.colors.push(r.color.trim());
      map.set(key, g);
    }
    if (map.size === 0) {
      for (const r of intake.rooms ?? []) {
        const s = r.surfaces ?? [];
        const surface = SURF_LABEL[s.includes("muren") ? "muren" : s[0]] ?? "";
        map.set(`${r.label.toLowerCase()}|${surface.toLowerCase()}`, { key: `${r.label.toLowerCase()}|${surface.toLowerCase()}`, room: r.label, surface, colors: [] });
      }
    }
    return [...map.values()].map((g) => ({ ...g, colors: [...g.colors, ...extra.filter((c) => !g.colors.includes(c))] }));
  }, [intake]);

  const initSel = () => {
    const o: Record<string, string> = {};
    if (startEditing) return o;
    for (const w of prev?.winners ?? []) o[`${w.room.toLowerCase()}|${w.surface.toLowerCase()}`] = w.color;
    return o;
  };
  const [sel, setSel] = useState<Record<string, string>>(initSel);
  const [outcome, setOutcome] = useState<CheckinOutcome | "">(startEditing ? "" : prev?.outcome ?? "");
  const [note, setNote] = useState(prev?.note ?? "");
  const [editing, setEditing] = useState(!prev || !!startEditing);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const winners = groups.map((g) => ({ room: g.room, surface: g.surface, color: (sel[g.key] ?? "").trim() })).filter((w) => w.color);
  const effOutcome: CheckinOutcome = outcome || (winners.length ? "keuze_gemaakt" : "nog_twijfel");

  const save = async () => {
    setSaving(true); setErr(null);
    const { data: u } = await supabase.auth.getUser();
    const checkin: Checkin = { at: new Date().toISOString(), by: u?.user?.email ?? null, outcome: effOutcome, winners, note: note.trim() };
    const patch: Partial<IntakeRow> = { sample_checkin: checkin };

    // Winnaars als definitieve kleuren in het verf-advies zetten (bestaande regels per ruimte+oppervlak bijwerken).
    if (effOutcome === "keuze_gemaakt" && winners.length) {
      const base: AdvicePhase = intake.advice_verf ?? { answer: "", rooms: [], sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" }, route: "zelf", products: [] };
      const rooms: AdviceRoom[] = base.rooms.filter((r) => r.room.trim() || r.color.trim());
      for (const w of winners) {
        const i = rooms.findIndex((r) => r.room.trim().toLowerCase() === w.room.toLowerCase() && r.surface.trim().toLowerCase() === w.surface.toLowerCase());
        const row: AdviceRoom = { room: w.room, surface: w.surface, color: w.color, status: "definitief", product: isWood(w.surface) ? "Lak" : "Muurverf", m2: "", liters: "", motivation: i >= 0 ? rooms[i].motivation : "" };
        if (i >= 0) rooms[i] = { ...rooms[i], ...row }; else rooms.push(row);
      }
      patch.advice_verf = { ...base, rooms };
    }
    const { error } = await supabase.from("intake").update(patch).eq("id", intake.id);
    if (error) { setSaving(false); setErr("Opslaan mislukte."); return; }

    // De check-in-taak afronden, of bij geen reactie 4 dagen opschuiven.
    const task = tasks.find((t) => t.kind === "sample_checkin" && !t.done_at);
    if (task) {
      if (effOutcome === "geen_reactie") {
        const d = new Date(); d.setDate(d.getDate() + 4);
        await supabase.from("followup_tasks").update({ due_date: d.toISOString().slice(0, 10), note: note.trim() || "Geen reactie, opnieuw proberen" }).eq("id", task.id);
      } else {
        await supabase.from("followup_tasks").update({ done_at: new Date().toISOString(), outcome: effOutcome, note: note.trim() || null }).eq("id", task.id);
      }
    }
    setSaving(false); setEditing(false);
    onSaved(patch, { followed: effOutcome !== "geen_reactie", toVerf: effOutcome === "keuze_gemaakt" && winners.length > 0, toSamples: effOutcome === "meer_samples" });
  };

  const swatch = (hex?: string) => <span style={{ width: 14, height: 14, borderRadius: 4, background: hex ?? "#eee", border: "1px solid rgba(0,0,0,.12)", display: "inline-block", flex: "none" }} />;

  if (prev && !editing) {
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ fontSize: 14 }}><strong>Check-in {fmt(prev.at)}:</strong> {OUTCOMES.find((o) => o.key === prev.outcome)?.label}</div>
        {prev.winners.length > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {prev.winners.map((w, i) => <div key={i} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5 }}>{swatch(hexOf(w.color))}<span>{[w.room, w.surface].filter(Boolean).join(", ")}: <strong>{w.color}</strong></span></div>)}
          </div>
        )}
        {prev.note && <div style={{ fontSize: 13, opacity: 0.75 }}>{prev.note}</div>}
        <button className="rd-textlink" onClick={() => setEditing(true)} style={{ alignSelf: "flex-start" }}>Aanpassen</button>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <datalist id="checkin-roll-colors">{rollColors.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>Vraag hoe de samples bevallen en kies per ruimte de winnaar. De winnaars staan daarna klaar in het verf-advies.</p>

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {groups.map((g) => {
          const cur = sel[g.key] ?? "";
          return (
            <div key={g.key} style={{ padding: "10px 12px", borderRadius: 12, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)" }}>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 6 }}>{[g.room, g.surface].filter(Boolean).join(", ") || "Ruimte"}</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                {g.colors.map((c) => (
                  <button key={c} onClick={() => setSel((s) => ({ ...s, [g.key]: cur === c ? "" : c }))} className="rd-chip"
                    style={{ display: "inline-flex", gap: 6, alignItems: "center", cursor: "pointer", border: cur === c ? "1.5px solid var(--rd-aubergine)" : "1px solid var(--rd-line)", background: cur === c ? "var(--rd-grey-light)" : "#fff", fontWeight: cur === c ? 700 : 500 }}>
                    {swatch(hexOf(c))} {c} {cur === c && "✓"}
                  </button>
                ))}
                <input className="rd-input" list="checkin-roll-colors" value={g.colors.includes(cur) ? "" : cur} onChange={(e) => setSel((s) => ({ ...s, [g.key]: e.target.value }))} placeholder={g.colors.length ? "Of een andere kleur" : "Winnende kleur"} style={{ height: 34, width: 180, fontSize: 13 }} />
              </div>
            </div>
          );
        })}
      </div>

      <div>
        <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Uitkomst</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {OUTCOMES.map((o) => (
            <button key={o.key} className={`rd-seg${effOutcome === o.key ? " is-on" : ""}`} onClick={() => setOutcome(o.key)} style={{ fontSize: 12.5 }}>{o.label}</button>
          ))}
        </div>
        <div style={{ fontSize: 12, opacity: 0.65, marginTop: 6 }}>{OUTCOMES.find((o) => o.key === effOutcome)?.hint}</div>
      </div>

      <input className="rd-input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Korte notitie (optioneel), bijv. twijfelt tussen Zen Den en Sunday Sweater" style={{ height: 38, fontSize: 13 }} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-primary" onClick={save} disabled={saving || (effOutcome === "keuze_gemaakt" && winners.length === 0)} style={{ width: "auto", padding: "0 22px" }}>
          {saving ? "Opslaan..." : effOutcome === "keuze_gemaakt" ? "Opslaan en naar verf-advies" : "Check-in opslaan"}
        </button>
        {prev && <button className="rd-textlink" onClick={() => setEditing(false)}>Annuleren</button>}
        {effOutcome === "keuze_gemaakt" && winners.length === 0 && <span style={{ fontSize: 12.5, opacity: 0.7 }}>Kies minstens één winnende kleur.</span>}
        {err && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{err}</span>}
      </div>
    </div>
  );
}
