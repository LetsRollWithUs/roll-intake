import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";
import { PRODUCTS } from "./outcome";
import type { AdviceRoom, FollowupPlan, AdviceProduct, AdvicePhase } from "./types";

const colorByName = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c]));
const emptyRoom = (room = ""): AdviceRoom => ({ room, surface: "", color: "", status: "voorgesteld", product: "Muurverf", m2: "", liters: "", motivation: "" });
const DEFAULT_SAMPLE_INSTRUCTION =
  "Test de samples op twee plekken in de ruimte en bekijk ze op verschillende momenten van de dag, zeker in het licht waarin je de ruimte het meest gebruikt.";

const VERF_ROUTES: { key: "zelf" | "roll"; label: string; hint: string }[] = [
  { key: "zelf", label: "Zelf verf bestellen", hint: "Kleuren staan vast; klant bestelt via de kleurpagina op roll.nl." },
  { key: "roll", label: "Hulp van Roll", hint: "Roll maakt een offerte of neemt contact op over hoeveelheden." },
];
const WHO: { key: FollowupPlan["who"]; label: string }[] = [
  { key: "styliste", label: "Styliste" }, { key: "roll", label: "Roll" }, { key: "klant", label: "Klant" },
];

export function buildMail(opts: { customerName: string; stylistName: string; phase: AdvicePhase }): { subject: string; body: string } {
  const a = opts.phase;
  const first = (opts.customerName || "").trim().split(/\s+/)[0] || "";
  const lines: string[] = [`Hoi ${first || "daar"},`, ""];
  if (a.answer.trim()) { lines.push(a.answer.trim()); lines.push(""); }
  const rooms = a.rooms.filter((r) => r.room.trim() || r.color.trim());
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
  if (a.route === "samples") {
    lines.push("Volgende stap: test eerst de samples.");
    lines.push(a.sample_instruction.trim() || DEFAULT_SAMPLE_INSTRUCTION);
    lines.push("De geadviseerde kleuren bestel je als sample via de knoppen in deze mail.");
  } else if (a.route === "zelf") {
    lines.push("Volgende stap: bestel de verf via de kleurpagina's in deze mail. Twijfel je over de hoeveelheid? Gebruik de prijsopgave of stuur me een berichtje.");
  } else {
    lines.push("Volgende stap: Roll pakt de offerte en de hoeveelheden met je op. Je hoort binnenkort van ons.");
  }
  if (a.next_step.trim()) { lines.push(""); lines.push(a.next_step.trim()); }
  if (a.plan.what.trim()) {
    const who = a.plan.who === "styliste" ? "Ik" : a.plan.who === "roll" ? "Roll" : a.plan.who === "klant" ? "Jij" : "";
    lines.push(""); lines.push(`${who ? who + ": " : ""}${a.plan.what.trim()}${a.plan.when ? ` (rond ${a.plan.when})` : ""}.`);
  }
  lines.push("", "Veel plezier met kiezen!", opts.stylistName ? `${opts.stylistName}, kleuradviseur bij Roll` : "Team Roll");
  return { subject: opts.phase.route === "samples" ? "Jouw kleuradvies en samples van Roll" : "Jouw kleuradvies van Roll", body: lines.join("\n") };
}

interface Props {
  intakeId: string;
  phase: "sample" | "verf";
  value: AdvicePhase | null;
  bookingId: string;
  customerName: string;
  stylistName: string;
  roomLabels: string[];
  sentAt: string | null;
  onSaved: (bundle: AdvicePhase) => void;
  onSent: () => void;
}

export function AdviceEditor({ intakeId, phase, value, bookingId, customerName, stylistName, roomLabels, sentAt, onSaved, onSent }: Props) {
  const isSample = phase === "sample";
  const init: AdvicePhase = value ?? {
    answer: "", rooms: isSample ? roomLabels.map((l) => emptyRoom(l)) : [emptyRoom()],
    sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" },
    route: isSample ? "samples" : "zelf", products: [],
  };
  const [advice, setAdvice] = useState<AdvicePhase>(init);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  const set = (p: Partial<AdvicePhase>) => setAdvice((a) => ({ ...a, ...p }));
  const setRoom = (i: number, p: Partial<AdviceRoom>) => setAdvice((a) => ({ ...a, rooms: a.rooms.map((r, idx) => (idx === i ? { ...r, ...p } : r)) }));
  const addRoom = () => setAdvice((a) => ({ ...a, rooms: [...a.rooms, emptyRoom()] }));
  const delRoom = (i: number) => setAdvice((a) => ({ ...a, rooms: a.rooms.filter((_, idx) => idx !== i) }));

  const candidates = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; hex: string }>();
    for (const r of advice.rooms) { const c = colorByName.get((r.color ?? "").trim().toLowerCase()); if (c && !seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name, hex: c.hex }); }
    return [...seen.values()];
  }, [advice.rooms]);
  const suggestedPack = useMemo(() => {
    const ids = new Set(candidates.map((c) => c.id));
    let best: { id: string; name: string; colorIds: string[]; overlap: number } | null = null;
    for (const p of SAMPLE_PACKS) { const overlap = p.colorIds.filter((id) => ids.has(id)).length; if (overlap > 0 && (!best || overlap > best.overlap)) best = { id: p.id, name: p.displayName + " Sample Pack", colorIds: p.colorIds, overlap }; }
    return best;
  }, [candidates]);
  const hasProduct = (kind: AdviceProduct["kind"], ref: string) => advice.products.some((p) => p.kind === kind && p.ref === ref);
  const toggleProduct = (kind: AdviceProduct["kind"], ref: string, name: string) =>
    set({ products: hasProduct(kind, ref) ? advice.products.filter((p) => !(p.kind === kind && p.ref === ref)) : [...advice.products, { kind, ref, name }] });

  const outcome = isSample ? "samples_needed" : advice.route === "zelf" ? "color_chosen" : "followup_needed";
  const persist = async () => {
    const clean = { ...advice, rooms: advice.rooms.filter((r) => r.room.trim() || r.color.trim()) };
    const patch: Record<string, unknown> = {
      [`advice_${phase}`]: clean,
      // Route/afspraak in sync houden zodat kanban en meldingen blijven kloppen.
      followup_route: clean.route,
      followup_plan: clean.plan,
      advisor_summary: clean.answer.trim() || null,
      advisor_advice: clean.rooms.map((r) => ({ room: [r.room, r.surface].filter((x) => x.trim()).join(" · "), color: r.color, product: r.product, liters: r.liters, m2: r.m2 })),
      advisor_notes: clean.internal.trim() || null,
      advisor_outcome: outcome,
      advisor_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("intake").update(patch).eq("id", intakeId);
    if (!error) onSaved(clean);
    return !error;
  };
  const save = async () => { setSaving(true); const ok = await persist(); setSaving(false); setMsg(ok ? "Concept opgeslagen ✓" : "Opslaan mislukte."); if (msg) setTimeout(() => setMsg(null), 2500); };

  const openPreview = async () => {
    if (!isSample && !advice.route) { setMsg("Kies een route."); return; }
    if (!(await persist())) { setMsg("Opslaan mislukte."); return; }
    const m = buildMail({ customerName, stylistName, phase: advice });
    setSubject(m.subject); setBodyText(m.body); setPreview(true);
  };
  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("booking", { body: { action: "advies_done", intake_id: intakeId, booking_id: bookingId, phase, route: advice.route, subject, body: bodyText } });
    setSending(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) { setMsg("Versturen lukte niet."); return; }
    // Bij samples een check-in-taak, en de vervolgafspraak, aanmaken.
    const { data: u } = await supabase.auth.getUser();
    const { data: bk } = await supabase.from("bookings").select("stylist_id,start_at").eq("id", bookingId).maybeSingle();
    const sid = (bk as { stylist_id: string | null } | null)?.stylist_id ?? null;
    const startAt = (bk as { start_at: string } | null)?.start_at ?? new Date().toISOString();
    const rows: Record<string, unknown>[] = [];
    if (advice.route === "samples") { const d = new Date(startAt); d.setDate(d.getDate() + 10); rows.push({ booking_id: bookingId, stylist_id: sid, action: "Check hoe de samples bevallen", owner: "styliste", due_date: d.toISOString().slice(0, 10), kind: "sample_checkin", created_by: u?.user?.email ?? null }); }
    if (advice.plan.what.trim()) rows.push({ booking_id: bookingId, stylist_id: sid, action: advice.plan.what.trim(), owner: advice.plan.who || "styliste", due_date: advice.plan.when || null, kind: "algemeen", created_by: u?.user?.email ?? null });
    if (rows.length) {
      const { data: existing } = await supabase.from("followup_tasks").select("action").eq("booking_id", bookingId).is("done_at", null);
      const have = new Set(((existing as { action: string }[]) ?? []).map((t) => t.action));
      const fresh = rows.filter((r) => !have.has(String(r.action)));
      if (fresh.length) await supabase.from("followup_tasks").insert(fresh);
    }
    setPreview(false); setMsg("Advies verstuurd ✓"); onSent();
  };

  const field = (label: string, el: React.ReactNode) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <label style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{label}</label>{el}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <datalist id="advice-roll-colors">{rollColors.map((c) => <option key={c.id} value={c.name} />)}</datalist>

      <div style={{ borderLeft: "3px solid var(--rd-pink-dark)", paddingLeft: 12 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 2 }}>Advies voor de klant</div>
        <p className="rd-sub" style={{ margin: "0 0 10px", fontSize: 13 }}>Dit ontvangt de klant. Schrijf alsof je het tegen haar zegt.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {field("Kort antwoord op de hulpvraag", <textarea className="rd-input" value={advice.answer} onChange={(e) => set({ answer: e.target.value })} placeholder={isSample ? "Bijv. Je zoekt warm en rustig; test deze kleuren thuis in jouw avondlicht." : "Bijv. Fijn dat je gekozen hebt. Dit is je definitieve kleur en zo bestel je 'm."} style={{ height: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />)}
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Kleuren per ruimte</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {advice.rooms.map((r, i) => (
                <div key={i} className="rd-card-white" style={{ padding: 12, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)", display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
                  {field("Ruimte", <input className="rd-input" value={r.room} onChange={(e) => setRoom(i, { room: e.target.value })} placeholder="Woonkamer" style={{ height: 40 }} />)}
                  {field("Oppervlak", <input className="rd-input" value={r.surface} onChange={(e) => setRoom(i, { surface: e.target.value })} placeholder="muren / accentwand" style={{ height: 40 }} />)}
                  {field("Kleur", <input className="rd-input" list="advice-roll-colors" value={r.color} onChange={(e) => setRoom(i, { color: e.target.value })} placeholder="Zen Den" style={{ height: 40 }} />)}
                  {field("Status", <div style={{ display: "flex", gap: 4 }}>{(["voorgesteld", "definitief"] as const).map((s) => <button key={s} className={`rd-seg${r.status === s ? " is-on" : ""}`} onClick={() => setRoom(i, { status: s })} style={{ flex: 1, fontSize: 12 }}>{s}</button>)}</div>)}
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
          {isSample && field("Sample-instructie", <textarea className="rd-input" value={advice.sample_instruction} onChange={(e) => set({ sample_instruction: e.target.value })} placeholder={DEFAULT_SAMPLE_INSTRUCTION} style={{ height: 64, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />)}
          {field("Wat de klant nu kan doen (optioneel)", <input className="rd-input" value={advice.next_step} onChange={(e) => set({ next_step: e.target.value })} placeholder="Bijv. Laat me weten welke kleur wint." style={{ height: 40 }} />)}
        </div>
      </div>

      {/* Verf: route; Sample: vaste samples-route */}
      {!isSample && (
        <div>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Hoe bestelt de klant?</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {VERF_ROUTES.map((r) => (
              <label key={r.key} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${advice.route === r.key ? "var(--rd-aubergine)" : "var(--rd-line)"}`, background: advice.route === r.key ? "var(--rd-grey-light)" : "transparent", cursor: "pointer" }}>
                <input type="radio" name={`route-${phase}`} checked={advice.route === r.key} onChange={() => set({ route: r.key })} style={{ marginTop: 3 }} />
                <span><strong style={{ fontSize: 14 }}>{r.label}</strong><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>{r.hint}</span></span>
              </label>
            ))}
          </div>
          <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 13 }}>In de mail krijgt de klant per kleur een link naar de kleurpagina; liters en varianten regelt Roll of de klant via de prijsopgave.</p>
        </div>
      )}

      {/* Producten alleen bij het sample-advies */}
      {isSample && (
        <div>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Producten in de mail</div>
          <p className="rd-sub" style={{ margin: "0 0 10px", fontSize: 13 }}>Kies wat als bestelbaar product in de mail komt (afbeelding + prijs). Suggesties komen uit de geadviseerde kleuren.</p>
          {candidates.length === 0 ? (
            <p className="rd-sub" style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>Voeg hierboven kleuren met een Roll-naam toe.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {suggestedPack && (
                <label style={{ display: "flex", gap: 10, alignItems: "center", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${hasProduct("pack", suggestedPack.id) ? "var(--rd-aubergine)" : "var(--rd-line)"}`, cursor: "pointer" }}>
                  <input type="checkbox" checked={hasProduct("pack", suggestedPack.id)} onChange={() => toggleProduct("pack", suggestedPack.id, suggestedPack.name)} />
                  <span style={{ display: "flex", gap: 2 }}>{suggestedPack.colorIds.slice(0, 5).map((id) => <span key={id} style={{ width: 14, height: 20, borderRadius: 3, background: rollColors.find((c) => c.id === id)?.hex ?? "#ccc", border: "1px solid rgba(0,0,0,.1)" }} />)}</span>
                  <span style={{ flex: 1 }}><strong style={{ fontSize: 14 }}>{suggestedPack.name}</strong> <span className="rd-chip" style={{ fontSize: 11 }}>aanbevolen</span><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>Bundel met o.a. de geadviseerde kleuren · € 10,-</span></span>
                </label>
              )}
              {candidates.map((c) => (
                <div key={c.id} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 10, border: "1px solid var(--rd-line)" }}>
                  <span style={{ width: 20, height: 20, borderRadius: 6, background: c.hex, border: "1px solid rgba(0,0,0,.12)", flex: "none" }} />
                  <span style={{ fontWeight: 700, fontSize: 14, flex: "1 1 120px", minWidth: 0 }}>{c.name}</span>
                  <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={hasProduct("sticker", c.id)} onChange={() => toggleProduct("sticker", c.id, c.name)} /> Sticker <span style={{ opacity: 0.6 }}>€ 2,50</span></label>
                  <label style={{ fontSize: 13, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={hasProduct("tester", c.id)} onChange={() => toggleProduct("tester", c.id, c.name)} /> Verftester <span style={{ opacity: 0.6 }}>€ 7,-</span></label>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Vervolgafspraak</div>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "2fr 1fr 1fr" }}>
          {field("Wat gebeurt er", <input className="rd-input" value={advice.plan.what} onChange={(e) => set({ plan: { ...advice.plan, what: e.target.value } })} placeholder={isSample ? "Bijv. Check hoe de samples bevallen" : "Bijv. Bel als de verf binnen is"} style={{ height: 40 }} />)}
          {field("Door wie", <select className="rd-input" value={advice.plan.who} onChange={(e) => set({ plan: { ...advice.plan, who: e.target.value as FollowupPlan["who"] } })} style={{ height: 40 }}><option value="">—</option>{WHO.map((w) => <option key={w.key} value={w.key}>{w.label}</option>)}</select>)}
          {field("Wanneer", <input type="date" className="rd-input" value={advice.plan.when} onChange={(e) => set({ plan: { ...advice.plan, when: e.target.value } })} style={{ height: 40 }} />)}
        </div>
      </div>

      <div style={{ borderLeft: "3px solid var(--rd-lavender-mid, #BBB1CB)", paddingLeft: 12 }}>
        <div className="rd-kicker" style={{ opacity: 0.65, marginBottom: 2 }}>Interne notities</div>
        <p className="rd-sub" style={{ margin: "0 0 8px", fontSize: 13 }}>Alleen zichtbaar voor styliste en Roll.</p>
        <textarea className="rd-input" value={advice.internal} onChange={(e) => set({ internal: e.target.value })} placeholder="Twijfels, aandachtspunten, info voor de offerte." style={{ height: 80, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-outline" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 20px" }}>{saving ? "Opslaan..." : "Concept opslaan"}</button>
        <button className="rd-btn rd-btn-primary" onClick={openPreview} style={{ width: "auto", padding: "0 20px" }}>Klantmail bekijken</button>
        {sentAt && <span style={{ fontSize: 13, opacity: 0.65 }}>Laatst verstuurd {new Date(sentAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        {msg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</span>}
      </div>

      {preview && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPreview(false)}>
          <div className="rd-card-white" style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Dit ontvangt de klant ({isSample ? "sample-advies" : "verf-advies"})</div>
            <p className="rd-sub" style={{ margin: "0 0 12px", fontSize: 13 }}>Pas de tekst gerust aan; versturen gebeurt pas als je op de knop drukt. De productkaarten of kleurlinks worden door de mailtemplate toegevoegd.</p>
            {field("Onderwerp", <input className="rd-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 40 }} />)}
            <div style={{ height: 10 }} />
            {field("Bericht", <textarea className="rd-input" value={bodyText} onChange={(e) => setBodyText(e.target.value)} style={{ height: 300, paddingTop: 10, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} />)}
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={send} disabled={sending} style={{ width: "auto", padding: "0 22px" }}>{sending ? "Versturen..." : "Advies versturen"}</button>
              <button className="rd-textlink" onClick={() => setPreview(false)}>Terug naar bewerken</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
