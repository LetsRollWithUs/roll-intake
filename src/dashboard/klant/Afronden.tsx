import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { AdvicePhase, AdviceProduct, DbRoom, IntakeRow } from "../types";
import { buildMail } from "../AdviceEditor";
import { SampleComposer } from "../SampleComposer";
import { MeasurePanel } from "../MeasurePanel";
import { buildTaskPayload, RollTaskStatus, type RollTask } from "../RollHelpForm";
import { rollColors } from "@/data/roll-colors";
import { KEUZE_LABEL, TYPE_LABEL, colorLabel, summarize, type AdviceV2 } from "./advice";

const HEX = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c.hex]));
const fmt = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface Sent { id: string; route: string; subject: string; body: string; sent_to: string | null; sent_by: string | null; sent_at: string }

// Verslag of sampleadvies versturen: voorvertoning met onderwerp en tekst, daarna advies_done (Klaviyo).
function SendAdvice({ phase, bundle, intakeId, bookingId, customerName, customerEmail, stylistName, label, lastSent, onSent }: {
  phase: "sample" | "verf"; bundle: AdvicePhase; intakeId: string; bookingId: string; customerName: string; customerEmail: string | null;
  stylistName: string; label: string; lastSent: string | null; onSent: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "ok" | "fout">("idle");
  const start = () => { const m = buildMail({ customerName, stylistName, phase: bundle }); setSubject(m.subject); setBody(m.body); setOpen(true); };
  const send = async () => {
    setState("busy");
    const { data, error } = await supabase.functions.invoke("booking", { body: { action: "advies_done", intake_id: intakeId, booking_id: bookingId, phase, route: bundle.route, subject, body } });
    if (error || !(data as { ok?: boolean } | null)?.ok) { setState("fout"); return; }
    // Opvolgtaak: samples -> check-in na 10 dagen; zelf bestellen -> check na 14 dagen.
    const row = bundle.route === "samples" ? { action: "Check hoe de samples bevallen", kind: "sample_checkin", days: 10 } : bundle.route === "zelf" ? { action: "Check of de verf besteld is", kind: "algemeen", days: 14 } : null;
    if (row) {
      const { data: u } = await supabase.auth.getUser();
      const { data: bk } = await supabase.from("bookings").select("stylist_id").eq("id", bookingId).maybeSingle();
      const { data: existing } = await supabase.from("followup_tasks").select("action").eq("booking_id", bookingId).is("done_at", null);
      if (!((existing as { action: string }[]) ?? []).some((t) => t.action === row.action)) {
        const d = new Date(); d.setDate(d.getDate() + row.days);
        await supabase.from("followup_tasks").insert({ booking_id: bookingId, stylist_id: (bk as { stylist_id: string | null } | null)?.stylist_id ?? null, action: row.action, owner: "styliste", due_date: d.toISOString().slice(0, 10), kind: row.kind, created_by: u?.user?.email ?? null });
      }
    }
    setState("ok"); setOpen(false); onSent();
  };
  return (
    <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <button className="rd-btn rd-btn-primary" onClick={start} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{label}</button>
      {state === "ok" && <span role="status" style={{ fontSize: 14, fontWeight: 600 }}>Verzonden naar Klaviyo</span>}
      {state === "fout" && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: "var(--rd-pink-dark)" }}>Versturen mislukt · probeer het opnieuw</span>}
      {state === "idle" && lastSent && <span style={{ fontSize: 13, opacity: 0.7 }}>Eerder verstuurd {fmt(lastSent)}</span>}
      {open && createPortal(
        <div role="dialog" aria-modal="true" onClick={() => setOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div className="rd-card-white" onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <strong style={{ fontSize: 17 }}>Controleer het bericht</strong>
              <p className="rd-sub" style={{ margin: "4px 0 0", fontSize: 13.5 }}>Aan {customerName}{customerEmail ? ` (${customerEmail})` : ""} · van {stylistName || "Roll"} namens Roll. {phase === "sample" ? "De samples" : "De kleuren en bestellinks"} staan onder de tekst. Interne notities gaan nooit mee.</p>
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Onderwerp</span><input className="rd-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 44 }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Bericht</span><textarea className="rd-input" value={body} onChange={(e) => setBody(e.target.value)} style={{ height: 300, paddingTop: 10, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} /></label>
            <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
              <button className="rd-btn rd-btn-primary" onClick={send} disabled={state === "busy"} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{state === "busy" ? "Versturen..." : label}</button>
              <button className="rd-textlink" onClick={() => setOpen(false)}>Terug</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}

const REASONS = [
  { key: "ondergrond", label: "Onduidelijke ondergrond of renovlies" },
  { key: "hoeveelheid", label: "Maten of hoeveelheden onzeker" },
  { key: "kleur", label: "Kleur of leverbaarheid onzeker" },
  { key: "product", label: "Productkeuze (lak, trap, buiten)" },
  { key: "maatwerk", label: "Groot project: maatwerk met extra korting" },
  { key: "anders", label: "Iets anders" },
];

export function Afronden({ intake, advice, setMessage, bookingId, stylistId, stylistName, customerName, customerEmail, rooms, task, sends, onIntake, onTask, onSent, onEditAdvice }: {
  intake: IntakeRow; advice: AdviceV2; setMessage: (v: string) => void; bookingId: string; stylistId: string | null; stylistName: string; customerName: string; customerEmail: string | null;
  rooms: DbRoom[]; task: RollTask | null; sends: Sent[];
  onIntake: (patch: Partial<IntakeRow>) => void; onTask: (t: RollTask) => void; onSent: () => void; onEditAdvice: () => void;
}) {
  const sum = useMemo(() => summarize(advice), [advice]);
  const [partial, setPartial] = useState<"wacht" | "alleen" | null>(null);
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");
  const [handover, setHandover] = useState<"idle" | "busy" | "ok" | "fout">("idle");
  const [products, setProducts] = useState<AdviceProduct[]>(intake.advice_sample?.products ?? []);
  const last = (routes: string[]) => sends.find((s) => routes.includes(s.route))?.sent_at ?? null;

  const suggestion = sum.bevestigd.length && !sum.testen.length && !sum.open.length ? "verf" : sum.testen.length ? "samples" : sum.bevestigd.length ? "verf" : "open";

  // Samplekandidaten: alleen Roll-kleuren zijn als sample te bestellen.
  const candidates = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; hex: string }>();
    for (const t of sum.testen) for (const c of t.surface.colors) if (c.source === "roll" && c.hex && !c.id.startsWith("vrij:") && !seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name, hex: c.hex });
    return [...seen.values()];
  }, [sum.testen]);
  const externalTest = sum.testen.some((t) => t.surface.colors.some((c) => c.source === "ark"));
  const syncedProducts = useMemo<AdviceProduct[]>(() => {
    const kindOf = new Map(products.filter((p) => p.kind !== "pack").map((p) => [p.ref, p.kind]));
    return [...candidates.map((c) => ({ kind: kindOf.get(c.id) ?? "sticker", ref: c.id, name: c.name }) as AdviceProduct), ...products.filter((p) => p.kind === "pack")];
  }, [products, candidates]);
  const saveProducts = async (p: AdviceProduct[]) => {
    setProducts(p);
    if (intake.advice_sample) {
      const next = { ...intake.advice_sample, products: p };
      await supabase.from("intake").update({ advice_sample: next }).eq("id", intake.id);
      onIntake({ advice_sample: next });
    }
  };
  const sampleBundle: AdvicePhase | null = intake.advice_sample ? { ...intake.advice_sample, products: syncedProducts, answer: advice.message } : null;
  const verfBundle: AdvicePhase | null = intake.advice_verf ? { ...intake.advice_verf, answer: advice.message } : null;
  const setVerfRoute = async (route: "zelf" | "roll") => {
    if (!intake.advice_verf) return;
    const next = { ...intake.advice_verf, route };
    await supabase.from("intake").update({ advice_verf: next, followup_route: route }).eq("id", intake.id);
    onIntake({ advice_verf: next });
  };

  const colorsByRoom: Record<string, { surface: string; color: string; hex?: string }[]> = {};
  for (const r of rooms) colorsByRoom[r.id] = (intake.advice_verf?.rooms ?? []).filter((a) => a.room_id === r.id && a.color.trim()).map((a) => ({ surface: a.surface, color: a.color, hex: HEX.get(a.color.trim().toLowerCase()) }));

  const doHandover = async () => {
    if (!reason) return;
    setHandover("busy");
    const { data: u } = await supabase.auth.getUser();
    const why = REASONS.find((r) => r.key === reason)?.label ?? reason;
    const due = new Date(); due.setDate(due.getDate() + 1);
    const { data, error } = await supabase.from("roll_tasks").insert({
      type: reason === "maatwerk" ? "maatwerk" : "contact", booking_id: bookingId, intake_id: intake.id, stylist_id: stylistId,
      requested_by: u?.user?.email ?? null, due_date: due.toISOString().slice(0, 10), payload: buildTaskPayload(intake, [why + ".", context.trim()].filter(Boolean).join(" ")),
    }).select("id,type,status,owner,due_date,payload,result,created_at,updated_at").single();
    if (error || !data) { setHandover("fout"); return; }
    setHandover("ok"); onTask(data as RollTask);
  };

  const Item = ({ room, s }: { room: string; s: typeof sum.bevestigd[number]["surface"] }) => (
    <div style={{ display: "flex", gap: 10, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--rd-line)", fontSize: 14 }}>
      <span style={{ flex: "0 0 38%", minWidth: 0 }}><strong>{room}</strong> · {s.type === "accent" ? `accentwand ${s.name}`.trim() : TYPE_LABEL[s.type].toLowerCase()}</span>
      <span style={{ flex: 1, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        {s.colors.length ? s.colors.map((c) => <span key={c.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: c.hex ?? "var(--rd-grey-light)", border: "1px solid rgba(0,0,0,.12)" }} />{colorLabel(c)}</span>) : <span style={{ opacity: 0.6 }}>geen kleur</span>}
      </span>
      <span style={{ fontSize: 12.5, opacity: 0.7, flex: "none" }}>{KEUZE_LABEL[s.status]}</span>
    </div>
  );

  return (
    <div className="kk-main" style={{ gap: 22 }}>
      {/* Samenvatting */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <h2 className="kk-h2">Het advies</h2>
          <button className="rd-textlink" onClick={onEditAdvice}>Advies aanpassen</button>
        </div>
        {[...sum.bevestigd, ...sum.testen, ...sum.open].map((x) => <Item key={x.surface.id} room={x.room} s={x.surface} />)}
        <div style={{ marginTop: 12, padding: "12px 14px", borderRadius: 12, background: "var(--rd-grey-light)", fontSize: 14, lineHeight: 1.5 }}>
          <strong>Voorgestelde uitkomst: </strong>
          {suggestion === "verf" ? "klaar voor verf. Verstuur het advies en het bestelvoorstel." : suggestion === "samples" ? `eerst kleuren testen${sum.bevestigd.length ? ", en de bevestigde oppervlakken kunnen al in een voorstel" : ""}.` : "er staat nog niets vast. Leg eerst per oppervlak de kleur en keuze vast."}
          <div style={{ marginTop: 6, fontSize: 13.5, opacity: 0.8 }}>Handig om af te spreken: wanneer wil je schilderen? Wat heb je nodig om te kiezen? Zullen we de verf en benodigdheden voor je klaarzetten?</div>
        </div>
      </section>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="kk-label">Persoonlijk bericht aan de klant</span>
        <span style={{ fontSize: 13, opacity: 0.7 }}>Komt bovenaan het verslag. Kleuren, toelichtingen en je ondertekening voegen we zelf toe.</span>
        <textarea className="rd-input" value={advice.message} onChange={(e) => setMessage(e.target.value)} placeholder="Bijv. Wat fijn dat we samen je woonkamer hebben doorgenomen. Hieronder vind je je kleuren." style={{ minHeight: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
      </label>

      {/* Eerst kleuren testen */}
      {sum.testen.length > 0 && sampleBundle && (
        <section className="kk-card">
          <h2 className="kk-h2">Eerst kleuren testen</h2>
          <p className="rd-sub" style={{ margin: 0, fontSize: 14 }}>De testkleuren gaan als samples in de mail. Kies per kleur sticker of tester.</p>
          {externalTest && <p style={{ margin: 0, fontSize: 13.5, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Voor referentiekleuren van andere merken bestaan geen stickers of testers. Beloof die niet; laat Roll meedenken over een testmogelijkheid.</p>}
          <SampleComposer colors={candidates} value={syncedProducts} onChange={saveProducts} />
          <SendAdvice phase="sample" bundle={sampleBundle} intakeId={intake.id} bookingId={bookingId} customerName={customerName} customerEmail={customerEmail} stylistName={stylistName} label="Verstuur sampleadvies" lastSent={last(["samples"])} onSent={onSent} />
        </section>
      )}

      {/* Klaar voor verf */}
      {sum.bevestigd.length > 0 && verfBundle && (
        <section className="kk-card">
          <h2 className="kk-h2">Klaar voor verf</h2>
          <div role="radiogroup" aria-label="Hoe bestelt de klant?" style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {([["roll", "Bestelvoorstel met winkelmandje"], ["zelf", "Klant bestelt zelf via de kleurpagina's"]] as const).map(([k, t]) => (
              <button key={k} role="radio" aria-checked={verfBundle.route === k} className={`rd-plan-chip${verfBundle.route === k ? " is-on" : ""}`} onClick={() => setVerfRoute(k)} style={{ minHeight: 44 }}>{t}</button>
            ))}
          </div>
          <SendAdvice phase="verf" bundle={verfBundle} intakeId={intake.id} bookingId={bookingId} customerName={customerName} customerEmail={customerEmail} stylistName={stylistName} label="Verstuur advies" lastSent={last(["zelf", "roll"])} onSent={onSent} />

          {verfBundle.route === "roll" && (
            <div style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Bestelvoorstel</h3>
              {(sum.testen.length > 0 || sum.open.length > 0) && (
                <div style={{ fontSize: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--rd-line)" }}>
                  <strong>Nog niet alles is bevestigd.</strong> Niet in het voorstel: {[...sum.testen, ...sum.open].map((x) => `${x.room} (${x.surface.type === "accent" ? "accentwand" : TYPE_LABEL[x.surface.type].toLowerCase()}, ${KEUZE_LABEL[x.surface.status].toLowerCase()})`).join(", ")}.
                  <div role="radiogroup" style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                    <button role="radio" aria-checked={partial === "wacht"} className={`rd-plan-chip${partial === "wacht" ? " is-on" : ""}`} onClick={() => setPartial("wacht")}>Wacht met het voorstel</button>
                    <button role="radio" aria-checked={partial === "alleen"} className={`rd-plan-chip${partial === "alleen" ? " is-on" : ""}`} onClick={() => setPartial("alleen")}>Voorstel met alleen de bevestigde oppervlakken</button>
                  </div>
                </div>
              )}
              {(sum.testen.length === 0 && sum.open.length === 0) || partial === "alleen" ? (
                <MeasurePanel key={`measure:${intake.id}`} intake={intake} bookingId={bookingId} stylistId={stylistId} rooms={rooms.filter((r) => colorsByRoom[r.id]?.length)} value={intake.room_measures}
                  offerUrl={intake.advisor_offer_url} colorsByRoom={colorsByRoom} task={task}
                  onSaved={(next) => onIntake({ room_measures: next })}
                  onOffer={(url, meta) => onIntake({ advisor_offer_url: url, offer_meta: meta })}
                  onIntake={onIntake} onTask={onTask} />
              ) : partial === "wacht" ? <p style={{ margin: 0, fontSize: 14 }}>Het voorstel wacht tot de andere ruimtes zijn bevestigd.</p> : null}
            </div>
          )}
        </section>
      )}

      {/* Roll moet meekijken */}
      <section className="kk-card">
        <h2 className="kk-h2">Roll laten meekijken</h2>
        {task && task.status !== "afgerond" ? <RollTaskStatus task={task} /> : (
          <>
            <p className="rd-sub" style={{ margin: 0, fontSize: 14 }}>Ruimtes, kleuren, maten en planning gaan automatisch mee. Kies alleen de reden en vul aan wat ontbreekt. Roll neemt binnen één werkdag contact op.</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {REASONS.map((r) => <button key={r.key} className={`rd-plan-chip${reason === r.key ? " is-on" : ""}`} aria-pressed={reason === r.key} onClick={() => setReason(r.key)} style={{ minHeight: 40 }}>{r.label}</button>)}
            </div>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="kk-label">Wat moet Roll nog weten? (optioneel)</span>
              <input className="rd-input" value={context} onChange={(e) => setContext(e.target.value)} style={{ height: 44 }} />
            </label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="rd-btn rd-btn-outline" onClick={doHandover} disabled={!reason || handover === "busy"} style={{ width: "auto", padding: "0 20px", minHeight: 44, ...(!reason ? { opacity: 0.5 } : {}) }}>{handover === "busy" ? "Bezig..." : "Draag over aan Roll"}</button>
              {!reason && <span style={{ fontSize: 13, opacity: 0.7 }}>Kies eerst een reden.</span>}
              {handover === "fout" && <span style={{ fontSize: 14, fontWeight: 600, color: "var(--rd-pink-dark)" }}>Overdragen lukte niet · probeer het opnieuw</span>}
            </div>
          </>
        )}
      </section>
    </div>
  );
}
