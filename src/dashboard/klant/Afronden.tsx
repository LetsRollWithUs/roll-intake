import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { AdvicePhase, AdviceProduct, DbRoom, IntakeRow } from "../types";
import { buildMail } from "../AdviceEditor";
import { SampleComposer } from "../SampleComposer";
import { MeasurePanel } from "../MeasurePanel";
import { buildTaskPayload, RollTaskStatus, type RollTask } from "../RollHelpForm";
import { rollColors } from "@/data/roll-colors";
import { KEUZE_LABEL, TYPE_LABEL, colorLabel, summarize, type AdviceV2 } from "./advice";

// Afronden: samenvatting, persoonlijk bericht en één vraag "Hoe gaat de klant verder?".
// Elke keuze heeft één hoofdknop. Advies en bestelvoorstel gaan met één klik samen.

const HEX = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c.hex]));
const fmt = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export interface Sent { id: string; route: string; subject: string; body: string; sent_to: string | null; sent_by: string | null; sent_at: string }
type Keuze = "voorstel" | "samples" | "advies" | "roll";

// Advies of sampleadvies versturen via advies_done (Klaviyo) en de passende opvolgtaak zetten.
async function sendAdviceMail(o: { phase: "sample" | "verf"; bundle: AdvicePhase; intakeId: string; bookingId: string; subject: string; body: string }): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("booking", { body: { action: "advies_done", intake_id: o.intakeId, booking_id: o.bookingId, phase: o.phase, route: o.bundle.route, subject: o.subject, body: o.body } });
  if (error || !(data as { ok?: boolean } | null)?.ok) return false;
  const row = o.bundle.route === "samples" ? { action: "Check hoe de samples bevallen", kind: "sample_checkin", days: 10 } : o.bundle.route === "zelf" ? { action: "Check of de verf besteld is", kind: "algemeen", days: 14 } : null;
  if (row) {
    const { data: u } = await supabase.auth.getUser();
    const { data: bk } = await supabase.from("bookings").select("stylist_id").eq("id", o.bookingId).maybeSingle();
    const { data: existing } = await supabase.from("followup_tasks").select("action").eq("booking_id", o.bookingId).is("done_at", null);
    if (!((existing as { action: string }[]) ?? []).some((t) => t.action === row.action)) {
      const d = new Date(); d.setDate(d.getDate() + row.days);
      await supabase.from("followup_tasks").insert({ booking_id: o.bookingId, stylist_id: (bk as { stylist_id: string | null } | null)?.stylist_id ?? null, action: row.action, owner: "styliste", due_date: d.toISOString().slice(0, 10), kind: row.kind, created_by: u?.user?.email ?? null });
    }
  }
  return true;
}

// Voorvertoning van het bericht: onderwerp en tekst aanpassen. Met onConfirm verstuurt het venster zelf.
function MailPreview({ open, subject, body, setSubject, setBody, to, from, note, confirmLabel, busy, onConfirm, onClose }: {
  open: boolean; subject: string; body: string; setSubject: (v: string) => void; setBody: (v: string) => void; to: string; from: string; note: string;
  confirmLabel: string; busy?: boolean; onConfirm: () => void; onClose: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="rd-card-white" onClick={(e) => e.stopPropagation()} style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <strong style={{ fontSize: 17 }}>Controleer het bericht</strong>
          <p className="rd-sub" style={{ margin: "4px 0 0", fontSize: 13.5 }}>Aan {to} · van {from} namens Roll. {note} Interne notities gaan nooit mee.</p>
        </div>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Onderwerp</span><input className="rd-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 44 }} /></label>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Bericht</span><textarea className="rd-input" value={body} onChange={(e) => setBody(e.target.value)} style={{ height: 300, paddingTop: 10, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} /></label>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="rd-btn rd-btn-primary" onClick={onConfirm} disabled={busy} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{busy ? "Versturen..." : confirmLabel}</button>
          <button className="rd-textlink" onClick={onClose}>Terug</button>
        </div>
      </div>
    </div>,
    document.body,
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
  const partial = sum.bevestigd.length > 0 && (sum.testen.length > 0 || sum.open.length > 0);
  const suggested: Keuze | null = sum.bevestigd.length && !partial ? "voorstel" : sum.testen.length ? "samples" : sum.bevestigd.length ? "voorstel" : null;
  const [keuze, setKeuze] = useState<Keuze | null>(suggested);
  const [partialOk, setPartialOk] = useState(false);
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");
  const [state, setState] = useState<{ k: Keuze; s: "busy" | "ok" | "fout" } | null>(null);
  const [preview, setPreview] = useState<null | { k: Keuze; confirm: boolean }>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const mailFor = useRef<string>("");
  const [products, setProducts] = useState<AdviceProduct[]>(intake.advice_sample?.products ?? []);

  const last = (routes: string[]) => sends.find((s) => routes.includes(s.route))?.sent_at ?? null;
  const verzonden = [
    ...(last(["roll", "zelf"]) ? [`Advies ${fmt(last(["roll", "zelf"])!)}`] : []),
    ...(intake.offer_sent_at ? [`Bestelvoorstel ${fmt(intake.offer_sent_at)}`] : []),
    ...(last(["samples"]) ? [`Sampleadvies ${fmt(last(["samples"])!)}`] : []),
  ];

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

  const bundleFor = (k: Keuze): { phase: "sample" | "verf"; bundle: AdvicePhase } | null => {
    if (k === "samples") return intake.advice_sample ? { phase: "sample", bundle: { ...intake.advice_sample, route: "samples", products: syncedProducts, answer: advice.message } } : null;
    if (!intake.advice_verf) return null;
    return { phase: "verf", bundle: { ...intake.advice_verf, route: k === "advies" ? "zelf" : "roll", answer: advice.message } };
  };
  // Bericht klaarzetten (eenmaal per keuze), zodat een aanpassing in de voorvertoning bewaard blijft.
  const ensureMail = (k: Keuze): { b: NonNullable<ReturnType<typeof bundleFor>>; subject: string; body: string } | null => {
    const b = bundleFor(k);
    if (!b) return null;
    if (mailFor.current === k) return { b, subject, body };
    const m = buildMail({ customerName, stylistName, phase: b.bundle });
    setSubject(m.subject); setBody(m.body); mailFor.current = k;
    return { b, subject: m.subject, body: m.body };
  };
  const persistRoute = async (route: "zelf" | "roll") => {
    if (!intake.advice_verf || intake.advice_verf.route === route) return;
    const next = { ...intake.advice_verf, route };
    await supabase.from("intake").update({ advice_verf: next, followup_route: route }).eq("id", intake.id);
    onIntake({ advice_verf: next });
  };
  const sendNow = async (k: Keuze) => {
    const m = ensureMail(k);
    if (!m) return false;
    setState({ k, s: "busy" });
    if (m.b.phase === "verf") await persistRoute(m.b.bundle.route as "zelf" | "roll");
    const ok = await sendAdviceMail({ ...m.b, intakeId: intake.id, bookingId, subject: m.subject, body: m.body });
    setState({ k, s: ok ? "ok" : "fout" });
    if (ok) { setPreview(null); onSent(); }
    return ok;
  };
  // Advies + bestelvoorstel: het controlescherm verstuurt eerst het advies (C05), daarna het voorstel (C11).
  const beforeVoorstel = async () => (last(["roll"]) ? true : sendNow("voorstel"));

  const colorsByRoom: Record<string, { surface: string; color: string; hex?: string }[]> = {};
  for (const r of rooms) colorsByRoom[r.id] = (intake.advice_verf?.rooms ?? []).filter((a) => a.room_id === r.id && a.color.trim()).map((a) => ({ surface: a.surface, color: a.color, hex: HEX.get(a.color.trim().toLowerCase()) }));

  const doHandover = async () => {
    if (!reason) return;
    setState({ k: "roll", s: "busy" });
    const { data: u } = await supabase.auth.getUser();
    const why = REASONS.find((r) => r.key === reason)?.label ?? reason;
    const due = new Date(); due.setDate(due.getDate() + 1);
    const { data, error } = await supabase.from("roll_tasks").insert({
      type: reason === "maatwerk" ? "maatwerk" : "contact", booking_id: bookingId, intake_id: intake.id, stylist_id: stylistId,
      requested_by: u?.user?.email ?? null, due_date: due.toISOString().slice(0, 10), payload: buildTaskPayload(intake, [why + ".", context.trim()].filter(Boolean).join(" ")),
    }).select("id,type,status,owner,due_date,payload,result,created_at,updated_at").single();
    if (error || !data) { setState({ k: "roll", s: "fout" }); return; }
    setState({ k: "roll", s: "ok" }); onTask(data as RollTask);
  };

  const opties: { k: Keuze; titel: string; sub: string; kan: boolean; waarom?: string }[] = [
    { k: "voorstel", titel: "Advies + bestelvoorstel", sub: "Het verslag en een winkelmandje met de juiste hoeveelheden.", kan: sum.bevestigd.length > 0, waarom: "Bevestig eerst minimaal één kleur." },
    ...(sum.testen.length ? [{ k: "samples" as Keuze, titel: "Eerst kleuren testen", sub: "Sampleadvies met stickers of testers.", kan: true }] : []),
    { k: "advies", titel: "Alleen advies", sub: "Met links naar de kleuren. Voor klanten die nog even verder willen kijken.", kan: sum.bevestigd.length > 0, waarom: "Bevestig eerst minimaal één kleur." },
    { k: "roll", titel: "Roll laten meekijken", sub: "Roll belt de klant en maakt het voorstel.", kan: true },
  ];
  const Status = ({ k }: { k: Keuze }) => state?.k !== k ? null : (
    <span role="status" style={{ fontSize: 14, fontWeight: 600, color: state.s === "fout" ? "var(--rd-pink-dark)" : undefined }}>
      {state.s === "busy" ? "Versturen..." : state.s === "ok" ? (k === "roll" ? "Overgedragen aan Roll" : "Verzonden") : "Versturen mislukt · probeer het opnieuw"}
    </span>
  );
  const b = keuze && keuze !== "roll" ? bundleFor(keuze) : null;

  return (
    <div className="kk-main" style={{ gap: 24 }}>
      {/* 1. Het advies */}
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <h2 className="kk-h2">1. Het advies</h2>
          <button className="rd-textlink" onClick={onEditAdvice}>Advies aanpassen</button>
        </div>
        {[...sum.bevestigd, ...sum.testen, ...sum.open].map((x) => (
          <div key={x.surface.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "7px 0", borderTop: "1px solid var(--rd-line)", fontSize: 14 }}>
            <span style={{ flex: "0 0 38%", minWidth: 0 }}><strong>{x.room}</strong> · {x.surface.name && x.surface.name !== TYPE_LABEL[x.surface.type] ? x.surface.name.toLowerCase() : TYPE_LABEL[x.surface.type].toLowerCase()}</span>
            <span style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {x.surface.colors.length ? x.surface.colors.map((c) => <span key={c.id} style={{ display: "inline-flex", gap: 6, alignItems: "center" }}><span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: c.hex ?? "var(--rd-grey-light)", border: "1px solid rgba(0,0,0,.12)" }} />{colorLabel(c)}</span>) : <span style={{ opacity: 0.6 }}>geen kleur</span>}
            </span>
            <span style={{ fontSize: 12.5, opacity: 0.7, flex: "none" }}>{KEUZE_LABEL[x.surface.status]}</span>
          </div>
        ))}
      </section>

      {/* 2. Persoonlijk bericht */}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="kk-h2" style={{ marginBottom: 0 }}>2. Persoonlijk bericht</span>
        <span style={{ fontSize: 13.5, opacity: 0.75 }}>Komt bovenaan de mail. Kleuren, toelichtingen en je ondertekening voegen we zelf toe.</span>
        <textarea className="rd-input" value={advice.message} onChange={(e) => setMessage(e.target.value)} placeholder="Bijv. Wat fijn dat we samen je woonkamer hebben doorgenomen. Hieronder vind je je kleuren." style={{ minHeight: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
      </label>

      {/* 3. Hoe gaat de klant verder? */}
      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 className="kk-h2" style={{ marginBottom: 2 }}>3. Hoe gaat de klant verder?</h2>
          <span style={{ fontSize: 13.5, opacity: 0.75 }}>Handig om af te spreken: wanneer wil je schilderen, wat heb je nodig om te kiezen, en zullen we de verf voor je klaarzetten?</span>
          {verzonden.length > 0 && <div style={{ fontSize: 13.5, marginTop: 6 }}><strong>Al verstuurd:</strong> {verzonden.join(" · ")}</div>}
        </div>
        <div role="radiogroup" aria-label="Vervolgstap" style={{ display: "grid", gridTemplateColumns: `repeat(auto-fit, minmax(${opties.length > 3 ? 200 : 230}px, 1fr))`, gap: 10 }}>
          {opties.map((o) => {
            const on = keuze === o.k;
            return (
              <button key={o.k} role="radio" aria-checked={on} disabled={!o.kan} onClick={() => setKeuze(o.k)}
                style={{ textAlign: "left", font: "inherit", color: "inherit", cursor: o.kan ? "pointer" : "not-allowed", padding: "14px 16px", borderRadius: 16, minHeight: 96, background: on ? "#fff" : "transparent", border: `2px solid ${on ? "var(--rd-aubergine)" : "var(--rd-line)"}`, opacity: o.kan ? 1 : 0.55, display: "flex", flexDirection: "column", gap: 4 }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline" }}>
                  <strong style={{ fontSize: 15.5 }}>{o.titel}</strong>
                  {suggested === o.k && <span style={{ fontSize: 11.5, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: "var(--rd-lavender)" }}>Aanbevolen</span>}
                </span>
                <span style={{ fontSize: 13.5, opacity: 0.78, lineHeight: 1.4 }}>{o.kan ? o.sub : o.waarom}</span>
              </button>
            );
          })}
        </div>

        {/* Inhoud van de gekozen vervolgstap, met één hoofdknop */}
        {keuze === "voorstel" && (
          <div className="kk-card">
            {partial && (
              <label style={{ display: "flex", gap: 10, alignItems: "flex-start", fontSize: 14, lineHeight: 1.45, cursor: "pointer" }}>
                <input type="checkbox" checked={partialOk} onChange={(e) => setPartialOk(e.target.checked)} style={{ marginTop: 3, width: 18, height: 18 }} />
                <span>Nog niet alles is bevestigd. Het voorstel bevat alleen de bevestigde oppervlakken; <strong>niet</strong> in het voorstel: {[...sum.testen, ...sum.open].map((x) => `${x.room} (${KEUZE_LABEL[x.surface.status].toLowerCase()})`).join(", ")}.</span>
              </label>
            )}
            {(!partial || partialOk) ? (
              <>
                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
                  <span>Controleer de maten en klik op <strong>Controleer voorstel</strong>. Daarna verstuur je het advies en het voorstel met één knop.</span>
                  <button className="rd-textlink" onClick={() => { ensureMail("voorstel"); setPreview({ k: "voorstel", confirm: false }); }}>Adviesbericht bekijken of aanpassen</button>
                </div>
                <MeasurePanel key={`measure:${intake.id}`} intake={intake} bookingId={bookingId} stylistId={stylistId} rooms={rooms.filter((r) => colorsByRoom[r.id]?.length)} value={intake.room_measures}
                  offerUrl={intake.advisor_offer_url} colorsByRoom={colorsByRoom} task={task}
                  onSaved={(next) => onIntake({ room_measures: next })}
                  onOffer={(url, meta) => onIntake({ advisor_offer_url: url, offer_meta: meta })}
                  onIntake={onIntake} onTask={onTask}
                  embedded beforeSend={beforeVoorstel} sendLabel={last(["roll"]) ? "Verstuur bestelvoorstel" : "Verstuur advies en bestelvoorstel"} />
              </>
            ) : <span style={{ fontSize: 14, opacity: 0.75 }}>Vink aan om door te gaan, of kies Eerst kleuren testen.</span>}
          </div>
        )}

        {keuze === "samples" && b && (
          <div className="kk-card">
            {externalTest && <p style={{ margin: 0, fontSize: 13.5, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Voor referentiekleuren van andere merken bestaan geen stickers of testers. Beloof die niet; laat Roll meedenken over een testmogelijkheid.</p>}
            <SampleComposer colors={candidates} value={syncedProducts} onChange={saveProducts} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={() => { ensureMail("samples"); setPreview({ k: "samples", confirm: true }); }} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>Verstuur sampleadvies</button>
              <Status k="samples" />
            </div>
          </div>
        )}

        {keuze === "advies" && b && (
          <div className="kk-card">
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>De klant krijgt het verslag met per kleur een link naar de kleurpagina en de prijsopgave. Er gaat geen bestelvoorstel mee; na 14 dagen krijg je een taak om te checken of de verf besteld is.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={() => { ensureMail("advies"); setPreview({ k: "advies", confirm: true }); }} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>Verstuur advies</button>
              <Status k="advies" />
            </div>
          </div>
        )}

        {keuze === "roll" && (
          <div className="kk-card">
            {task && task.status !== "afgerond" ? <RollTaskStatus task={task} /> : (
              <>
                <p className="rd-sub" style={{ margin: 0, fontSize: 14 }}>Ruimtes, kleuren, maten en planning gaan automatisch mee. Kies de reden en vul aan wat ontbreekt. Roll neemt binnen één werkdag contact op.</p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {REASONS.map((r) => <button key={r.key} className={`rd-plan-chip${reason === r.key ? " is-on" : ""}`} aria-pressed={reason === r.key} onClick={() => setReason(r.key)} style={{ minHeight: 40 }}>{r.label}</button>)}
                </div>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="kk-label">Wat moet Roll nog weten? (optioneel)</span>
                  <input className="rd-input" value={context} onChange={(e) => setContext(e.target.value)} style={{ height: 44 }} />
                </label>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <button className="rd-btn rd-btn-primary" onClick={doHandover} disabled={!reason || state?.s === "busy"} style={{ width: "auto", padding: "0 22px", minHeight: 44, ...(!reason ? { opacity: 0.5 } : {}) }}>Draag over aan Roll</button>
                  {!reason && <span style={{ fontSize: 13, opacity: 0.7 }}>Kies eerst een reden.</span>}
                  <Status k="roll" />
                </div>
              </>
            )}
          </div>
        )}
      </section>

      <MailPreview open={!!preview} subject={subject} body={body} setSubject={setSubject} setBody={setBody}
        to={`${customerName}${customerEmail ? ` (${customerEmail})` : ""}`} from={stylistName || "Roll"}
        note={preview?.k === "samples" ? "De samples staan onder de tekst." : preview?.k === "voorstel" ? "Het bestelvoorstel volgt als aparte mail." : "De kleurlinks staan onder de tekst."}
        confirmLabel={preview?.confirm ? (preview.k === "samples" ? "Verstuur sampleadvies" : "Verstuur advies") : "Klaar"}
        busy={state?.s === "busy"}
        onConfirm={() => (preview?.confirm ? void sendNow(preview.k) : setPreview(null))} onClose={() => setPreview(null)} />
    </div>
  );
}
