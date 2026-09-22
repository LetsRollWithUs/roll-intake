import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { PRODUCTS } from "./outcome";
import type { IntakeRow, AdviceClient, AdviceRoom, FollowupPlan } from "./types";

// Gestructureerd advies: klanttekst, interne notities en vervolgafspraak, met een bewerkbaar
// mailconcept. Opslaan verstuurt nooit; versturen is een aparte, expliciete stap in de preview.

const ROUTES: { key: "samples" | "zelf" | "roll"; label: string; hint: string }[] = [
  { key: "samples", label: "Eerst samples testen", hint: "Klant test de geadviseerde kleuren thuis; jij checkt later hoe ze bevallen." },
  { key: "zelf", label: "Zelf verf bestellen", hint: "Kleuren staan vast; klant bestelt via roll.nl (hulp: roll.nl/prijsopgave)." },
  { key: "roll", label: "Hulp van Roll", hint: "Roll maakt een offerte of neemt contact op over hoeveelheden en bestelling." },
];
const WHO: { key: FollowupPlan["who"]; label: string }[] = [
  { key: "styliste", label: "Styliste" }, { key: "roll", label: "Roll" }, { key: "klant", label: "Klant" },
];
const emptyRoom = (room = ""): AdviceRoom => ({ room, surface: "", color: "", status: "voorgesteld", product: "Muurverf", m2: "", liters: "", motivation: "" });

const DEFAULT_SAMPLE_INSTRUCTION =
  "Test de samples op twee plekken in de ruimte en bekijk ze op verschillende momenten van de dag, zeker in het licht waarin je de ruimte het meest gebruikt.";

export function buildMail(opts: {
  customerName: string; stylistName: string; advice: AdviceClient; route: "samples" | "zelf" | "roll" | null; plan: FollowupPlan;
}): { subject: string; body: string } {
  const first = (opts.customerName || "").trim().split(/\s+/)[0] || "";
  const lines: string[] = [];
  lines.push(`Hoi ${first || "daar"},`);
  lines.push("");
  if (opts.advice.answer.trim()) { lines.push(opts.advice.answer.trim()); lines.push(""); }
  const rooms = opts.advice.rooms.filter((r) => r.room.trim() || r.color.trim());
  if (rooms.length) {
    lines.push("Mijn advies per ruimte:");
    for (const r of rooms) {
      const where = [r.room, r.surface].filter((x) => x.trim()).join(", ");
      const status = r.status === "definitief" ? "" : " (voorstel)";
      const bits = [r.color ? `${r.color}${status}` : "", r.product].filter(Boolean).join(" in ");
      lines.push(`- ${where || "Ruimte"}: ${bits}${r.motivation.trim() ? `. ${r.motivation.trim()}` : ""}`);
    }
    lines.push("");
  }
  if (opts.route === "samples") {
    lines.push("Volgende stap: test eerst de samples.");
    lines.push(opts.advice.sample_instruction.trim() || DEFAULT_SAMPLE_INSTRUCTION);
    lines.push("De geadviseerde kleuren bestel je als sample via de knop in deze mail.");
  } else if (opts.route === "zelf") {
    lines.push("Volgende stap: bestel de verf op roll.nl. Wil je zeker weten hoeveel je nodig hebt? Gebruik roll.nl/prijsopgave of stuur me een berichtje.");
  } else if (opts.route === "roll") {
    lines.push("Volgende stap: Roll pakt de offerte en de hoeveelheden met je op. Je hoort binnenkort van ons.");
  }
  if (opts.advice.next_step.trim()) { lines.push(""); lines.push(opts.advice.next_step.trim()); }
  if (opts.plan.what.trim()) {
    lines.push("");
    const who = opts.plan.who === "styliste" ? "Ik" : opts.plan.who === "roll" ? "Roll" : opts.plan.who === "klant" ? "Jij" : "";
    lines.push(`${who ? who + ": " : ""}${opts.plan.what.trim()}${opts.plan.when ? ` (rond ${opts.plan.when})` : ""}.`);
  }
  lines.push("");
  lines.push("Veel plezier met kiezen!");
  lines.push(opts.stylistName ? `${opts.stylistName}, kleuradviseur bij Roll` : "Team Roll");
  return { subject: "Jouw kleuradvies van Roll", body: lines.join("\n") };
}

interface Props {
  intake: IntakeRow;
  bookingId: string;
  customerName: string;
  stylistName: string;
  roomLabels: string[];
  onChange: (patch: Partial<IntakeRow>) => void;
}

export function AdviceEditor({ intake, bookingId, customerName, stylistName, roomLabels, onChange }: Props) {
  const init: AdviceClient = intake.advice_client ?? {
    answer: intake.advisor_summary ?? "", rooms: roomLabels.map((l) => emptyRoom(l)), sample_instruction: "", next_step: "",
  };
  const [advice, setAdvice] = useState<AdviceClient>(init);
  const [internal, setInternal] = useState(intake.advice_internal ?? intake.advisor_notes ?? "");
  const [plan, setPlan] = useState<FollowupPlan>(intake.followup_plan ?? { what: "", who: "", when: "" });
  const [route, setRoute] = useState<"samples" | "zelf" | "roll" | null>(intake.followup_route ?? null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => { if (msg) { const t = setTimeout(() => setMsg(null), 2500); return () => clearTimeout(t); } }, [msg]);

  const setRoom = (i: number, p: Partial<AdviceRoom>) => setAdvice((a) => ({ ...a, rooms: a.rooms.map((r, idx) => (idx === i ? { ...r, ...p } : r)) }));
  const addRoom = () => setAdvice((a) => ({ ...a, rooms: [...a.rooms, emptyRoom()] }));
  const delRoom = (i: number) => setAdvice((a) => ({ ...a, rooms: a.rooms.filter((_, idx) => idx !== i) }));

  // Oude velden blijven gevuld (intake-detail, notificaties en de opvolgmail lezen die nog).
  const mirrored = useMemo(() => ({
    advisor_summary: advice.answer.trim() || null,
    advisor_advice: advice.rooms.filter((r) => r.room.trim() || r.color.trim()).map((r) => ({ room: [r.room, r.surface].filter((x) => x.trim()).join(" · "), color: r.color, product: r.product, liters: r.liters, m2: r.m2 })),
    advisor_notes: internal.trim() || null,
    advisor_outcome: route === "samples" ? "samples_needed" : route === "zelf" ? "color_chosen" : route === "roll" ? "followup_needed" : null,
  }), [advice, internal, route]);

  const persist = async () => {
    const patch = {
      advice_client: { ...advice, rooms: advice.rooms.filter((r) => r.room.trim() || r.color.trim()) },
      advice_internal: internal.trim() || null,
      followup_plan: plan,
      followup_route: route,
      ...mirrored,
      advisor_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("intake").update(patch).eq("id", intake.id);
    if (!error) onChange(patch as Partial<IntakeRow>);
    return !error;
  };

  const save = async () => { setSaving(true); const ok = await persist(); setSaving(false); setMsg(ok ? "Concept opgeslagen ✓" : "Opslaan mislukte."); };

  const openPreview = async () => {
    if (!route) { setMsg("Kies eerst een vervolgrichting."); return; }
    const ok = await persist();
    if (!ok) { setMsg("Opslaan mislukte."); return; }
    const m = buildMail({ customerName, stylistName, advice, route, plan });
    setSubject(m.subject); setBodyText(m.body); setPreview(true);
  };

  const send = async () => {
    if (!route) return;
    setSending(true);
    const { data, error } = await supabase.functions.invoke("booking", {
      body: { action: "advies_done", intake_id: intake.id, booking_id: bookingId, route, subject, body: bodyText },
    });
    setSending(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) { setMsg("Versturen lukte niet. Probeer het later opnieuw."); return; }
    const now = new Date().toISOString();
    onChange({ advisor_followup_sent_at: now });
    setPreview(false);
    setMsg("Advies verstuurd ✓");
  };

  const field = (label: string, el: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{label}</label>
      {el}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <datalist id="advice-roll-colors">{rollColors.map((c) => <option key={c.id} value={c.name} />)}</datalist>

      {/* A. Advies voor de klant */}
      <div style={{ borderLeft: "3px solid var(--rd-pink-dark)", paddingLeft: 12 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 2 }}>Advies voor de klant</div>
        <p className="rd-sub" style={{ margin: "0 0 10px", fontSize: 13 }}>Dit ontvangt de klant. Schrijf alsof je het tegen haar zegt.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {field("Kort antwoord op de hulpvraag", (
            <textarea className="rd-input" value={advice.answer} onChange={(e) => setAdvice({ ...advice, answer: e.target.value })} placeholder="Bijv. Je zoekt warm en rustig; met jouw avondzon werkt een koelere greige beter dan beige." style={{ height: 96, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
          ))}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Kleuren per ruimte</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {advice.rooms.map((r, i) => (
                <div key={i} className="rd-card-white" style={{ padding: 12, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)", display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  {field("Ruimte", <input className="rd-input" value={r.room} onChange={(e) => setRoom(i, { room: e.target.value })} placeholder="Woonkamer" style={{ height: 40 }} />)}
                  {field("Oppervlak", <input className="rd-input" value={r.surface} onChange={(e) => setRoom(i, { surface: e.target.value })} placeholder="muren / accentwand" style={{ height: 40 }} />)}
                  {field("Kleur", <input className="rd-input" list="advice-roll-colors" value={r.color} onChange={(e) => setRoom(i, { color: e.target.value })} placeholder="Zen Den" style={{ height: 40 }} />)}
                  {field("Status", (
                    <div style={{ display: "flex", gap: 4 }}>
                      {(["voorgesteld", "definitief"] as const).map((s) => <button key={s} className={`rd-seg${r.status === s ? " is-on" : ""}`} onClick={() => setRoom(i, { status: s })} style={{ flex: 1, fontSize: 12 }}>{s}</button>)}
                    </div>
                  ))}
                  {field("Product", <select className="rd-input" value={r.product} onChange={(e) => setRoom(i, { product: e.target.value })} style={{ height: 40 }}>{PRODUCTS.map((p) => <option key={p} value={p}>{p}</option>)}</select>)}
                  {field("m² (optioneel)", <input className="rd-input" inputMode="decimal" value={r.m2} onChange={(e) => setRoom(i, { m2: e.target.value })} placeholder="48" style={{ height: 40 }} />)}
                  {field("Liters (optioneel)", <input className="rd-input" inputMode="decimal" value={r.liters} onChange={(e) => setRoom(i, { liters: e.target.value })} placeholder="7.5" style={{ height: 40 }} />)}
                  <div style={{ gridColumn: "1 / -1", display: "flex", gap: 8, alignItems: "flex-end" }}>
                    <div style={{ flex: 1 }}>{field("Korte motivatie", <input className="rd-input" value={r.motivation} onChange={(e) => setRoom(i, { motivation: e.target.value })} placeholder="Waarom deze kleur hier werkt" style={{ height: 40 }} />)}</div>
                    <button className="rd-textlink" onClick={() => delRoom(i)} aria-label="Regel verwijderen" style={{ minHeight: 40, opacity: 0.6 }}>✕</button>
                  </div>
                </div>
              ))}
              <button className="rd-textlink" onClick={addRoom} style={{ minHeight: 36, alignSelf: "flex-start" }}>+ Ruimte of oppervlak toevoegen</button>
            </div>
          </div>
          {field("Sample-instructie (alleen bij samples testen)", (
            <textarea className="rd-input" value={advice.sample_instruction} onChange={(e) => setAdvice({ ...advice, sample_instruction: e.target.value })} placeholder={DEFAULT_SAMPLE_INSTRUCTION} style={{ height: 64, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
          ))}
          {field("Wat de klant nu kan doen (optioneel)", (
            <input className="rd-input" value={advice.next_step} onChange={(e) => setAdvice({ ...advice, next_step: e.target.value })} placeholder="Bijv. Laat me weten welke kleur wint, dan help ik met de hoeveelheid." style={{ height: 40 }} />
          ))}
        </div>
      </div>

      {/* B. Vervolgrichting */}
      <div>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Vervolgrichting</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {ROUTES.map((r) => (
            <label key={r.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${route === r.key ? "var(--rd-aubergine)" : "var(--rd-line)"}`, background: route === r.key ? "var(--rd-grey-light)" : "transparent", cursor: "pointer" }}>
              <input type="radio" name="route" checked={route === r.key} onChange={() => setRoute(r.key)} style={{ marginTop: 3 }} />
              <span><strong style={{ fontSize: 14 }}>{r.label}</strong><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>{r.hint}</span></span>
            </label>
          ))}
        </div>
      </div>

      {/* C. Vervolgafspraak */}
      <div>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Vervolgafspraak</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr" }}>
          {field("Wat gebeurt er", <input className="rd-input" value={plan.what} onChange={(e) => setPlan({ ...plan, what: e.target.value })} placeholder="Bijv. Check hoe de samples bevallen" style={{ height: 40 }} />)}
          {field("Door wie", <select className="rd-input" value={plan.who} onChange={(e) => setPlan({ ...plan, who: e.target.value as FollowupPlan["who"] })} style={{ height: 40 }}><option value="">—</option>{WHO.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</select>)}
          {field("Wanneer", <input type="date" className="rd-input" value={plan.when} onChange={(e) => setPlan({ ...plan, when: e.target.value })} style={{ height: 40 }} />)}
        </div>
      </div>

      {/* D. Intern */}
      <div style={{ borderLeft: "3px solid var(--rd-lavender-mid, #BBB1CB)", paddingLeft: 12 }}>
        <div className="rd-kicker" style={{ opacity: 0.65, marginBottom: 2 }}>Interne notities</div>
        <p className="rd-sub" style={{ margin: "0 0 8px", fontSize: 13 }}>Alleen zichtbaar voor styliste en Roll. Twijfels, aandachtspunten, informatie voor de offerte.</p>
        <textarea className="rd-input" value={internal} onChange={(e) => setInternal(e.target.value)} placeholder="Bijv. Twijfelt tussen greige en groen; vloer wordt nog vervangen. Primer waarschijnlijk niet nodig." style={{ height: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
      </div>

      {/* Knoppen */}
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-outline" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 20px" }}>{saving ? "Opslaan..." : "Concept opslaan"}</button>
        <button className="rd-btn rd-btn-primary" onClick={openPreview} style={{ width: "auto", padding: "0 20px" }}>Klantmail bekijken</button>
        {intake.advisor_followup_sent_at && <span style={{ fontSize: 13, opacity: 0.65 }}>Laatst verstuurd {new Date(intake.advisor_followup_sent_at).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        {msg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</span>}
      </div>

      {/* Preview */}
      {preview && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPreview(false)}>
          <div className="rd-card-white" style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Dit ontvangt de klant</div>
            <p className="rd-sub" style={{ margin: "0 0 12px", fontSize: 13 }}>Aan {intake.contact_email}. Pas de tekst gerust aan; versturen gebeurt pas als je op de knop drukt.</p>
            {field("Onderwerp", <input className="rd-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 40 }} />)}
            <div style={{ height: 10 }} />
            {field("Bericht", <textarea className="rd-input" value={bodyText} onChange={(e) => setBodyText(e.target.value)} style={{ height: 320, paddingTop: 10, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />)}
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={send} disabled={sending} style={{ width: "auto", padding: "0 22px" }}>{sending ? "Versturen..." : "Advies versturen"}</button>
              <button className="rd-textlink" onClick={() => setPreview(false)}>Terug naar bewerken</button>
              {route === "samples" && <span style={{ fontSize: 12, opacity: 0.6 }}>De samplebestelknop wordt door de mailtemplate toegevoegd.</span>}
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
