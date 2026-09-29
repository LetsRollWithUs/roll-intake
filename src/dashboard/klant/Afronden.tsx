import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { AdvicePhase, AdviceProduct, AdviceRoom, IntakeRow } from "../types";
import { buildMail } from "../AdviceEditor";
import { SampleComposer } from "../SampleComposer";
import { buildTaskPayload, RollTaskStatus, type RollTask } from "../RollHelpForm";
import type { Offer, OfferVlak } from "../VoorstelPanel";
import { OfferteEditor } from "./OfferteEditor";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";

const ROLL_BY_NAME = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c]));

// Afronden: het advies uit de editor bepaalt de route.
// Eén vlak op "Eerst testen" = samples-route (C04); verf komt later na de check-in (winnaar kiezen).
// Alles bevestigd = verf-route: advies + offerte (C05 + C11), alleen advies, of Roll laten meekijken.

const eur = (v?: number | null) => (v == null ? "" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));
const fmt = (iso: string) => new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
export interface Sent { id: string; route: string; subject: string; body: string; sent_to: string | null; sent_by: string | null; sent_at: string }
type Keuze = "voorstel" | "samples" | "advies" | "roll";
const emptyPhase = (route: AdvicePhase["route"]): AdvicePhase => ({ answer: "", rooms: [], sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" }, route, products: [] });

async function sendAdviceMail(o: { phase: "sample" | "verf"; route: AdvicePhase["route"]; intakeId: string; bookingId: string; subject: string; body: string }): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("booking", { body: { action: "advies_done", intake_id: o.intakeId, booking_id: o.bookingId, phase: o.phase, route: o.route, subject: o.subject, body: o.body } });
  if (error || !(data as { ok?: boolean } | null)?.ok) return false;
  const row = o.route === "samples" ? { action: "Check hoe de samples bevallen", kind: "sample_checkin", days: 10 } : o.route === "zelf" ? { action: "Check of de verf besteld is", kind: "algemeen", days: 14 } : null;
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

export function Afronden({ intake, message, setMessage, bookingId, stylistId, stylistName, customerName, customerEmail, task, sends, onIntake, onTask, onSent, onEditOffer }: {
  intake: IntakeRow; message: string; setMessage: (v: string) => void; bookingId: string; stylistId: string | null; stylistName: string; customerName: string; customerEmail: string | null;
  task: RollTask | null; sends: Sent[];
  onIntake: (patch: Partial<IntakeRow>) => void; onTask: (t: RollTask) => void; onSent: () => void; onEditOffer: () => void;
}) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(!!intake.offer_meta?.id);
  const [keuze, setKeuze] = useState<Keuze | null>(null);
  const [reason, setReason] = useState("");
  const [context, setContext] = useState("");
  const [state, setState] = useState<{ k: Keuze; s: "busy" | "ok" | "fout"; t?: string } | null>(null);
  const [preview, setPreview] = useState<Keuze | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const mailFor = useRef<string>("");
  const [showEditor, setShowEditor] = useState(false);
  const [winBusy, setWinBusy] = useState<string | null>(null);

  useEffect(() => {
    if (!intake.offer_meta?.id) { setLoading(false); return; }
    (async () => {
      const { data } = await supabase.functions.invoke("booking", { body: { action: "offerte_get", intake_id: intake.id } });
      const d = data as { ok?: boolean; offer?: Offer } | null;
      if (d?.ok && d.offer) setOffer(d.offer);
      setLoading(false);
    })();
  }, [intake.id, intake.offer_meta?.id]);

  // Kleuren per ruimte uit de offerte (Roll-namen, ook voor nagemengde kleuren).
  const verfRooms = useMemo<AdviceRoom[]>(() => {
    const seen = new Set<string>();
    return (offer?.regels ?? []).filter((l) => l.kleurNaam && (!l.soort || l.soort === "verf")).filter((l) => { const k = `${l.ruimte}|${l.oppervlak}|${l.kleurNaam}`; if (seen.has(k)) return false; seen.add(k); return true; })
      .map((l) => ({ room: l.ruimte ?? "", surface: l.oppervlak ?? "", color: l.kleurNaam ?? "", status: "definitief", product: l.product ?? "", m2: "", liters: "", motivation: "" }));
  }, [offer]);
  const testVlakken: OfferVlak[] = (offer?.vlakken ?? []).filter((v) => v.status === "testen");
  const samplesRoute = testVlakken.length > 0;
  // Nog geen keuze gemaakt voor een oppervlak (status "kiezen"): nog geen route, eerst het advies afmaken.
  const kiezenVlakken: OfferVlak[] = (offer?.vlakken ?? []).filter((v) => v.status === "kiezen");
  const nogKiezen = !samplesRoute && kiezenVlakken.length > 0;
  const hasOffer = !!offer && verfRooms.length > 0 && !samplesRoute && offer.klaarVoorOfferte !== false;
  const blocked = !!offer && offer.kleurenOnbekend.length > 0;
  // Samplekleuren uit de testvlakken (alleen Roll-kleuren; de editor controleert dat).
  const sampleRooms: AdviceRoom[] = testVlakken.flatMap((v) => v.testKleuren.map((t) => ({ room: v.ruimte ?? "", surface: v.type ?? v.soort ?? "", color: t.naam, status: "voorgesteld" as const, product: "Muurverf", m2: "", liters: "", motivation: "" })));
  const candidates = [...new Map(testVlakken.flatMap((v) => v.testKleuren).map((t) => { const c = ROLL_BY_NAME.get(t.naam.trim().toLowerCase()); return [t.naam, { id: c?.id ?? t.naam.toLowerCase().replace(/\s+/g, "-"), name: t.naam, hex: c?.hex ?? t.hex ?? "" }] as const; })).values()];
  const savedProducts = intake.advice_sample?.products ?? [];
  // Losse kleur die in een gekozen bundel zit en bewust is weggehaald, blijft weg.
  const savedPacks = savedProducts.filter((p) => p.kind === "pack");
  const packColors = new Set(SAMPLE_PACKS.filter((pk) => savedPacks.some((p) => p.ref === pk.id)).flatMap((pk) => pk.colorIds));
  const weggehaald = (id: string) => savedProducts.length > 0 && packColors.has(id) && !savedProducts.some((p) => p.ref === id && p.kind !== "pack");
  const products: AdviceProduct[] = [...candidates.filter((c) => !weggehaald(c.id)).map((c) => ({ kind: (savedProducts.find((p) => p.ref === c.id)?.kind ?? "sticker") as AdviceProduct["kind"], ref: c.id, name: c.name })), ...savedPacks];
  const last = (routes: string[]) => sends.find((s) => routes.includes(s.route))?.sent_at ?? null;
  const verzonden = [
    ...(last(["roll", "zelf"]) ? [`Advies ${fmt(last(["roll", "zelf"])!)}`] : []),
    ...(intake.offer_sent_at ? [`Offerte ${fmt(intake.offer_sent_at)}`] : []),
    ...(last(["samples"]) ? [`Sampleadvies ${fmt(last(["samples"])!)}`] : []),
  ];
  const suggested: Keuze | null = samplesRoute ? "samples" : hasOffer && !blocked ? "voorstel" : null;
  const gekozen = keuze ?? suggested;

  const bundleFor = (k: Keuze): { phase: "sample" | "verf"; bundle: AdvicePhase } => k === "samples"
    ? { phase: "sample", bundle: { ...(intake.advice_sample ?? emptyPhase("samples")), rooms: sampleRooms, products, route: "samples", answer: message } }
    : { phase: "verf", bundle: { ...(intake.advice_verf ?? emptyPhase("roll")), rooms: verfRooms, route: k === "advies" ? "zelf" : "roll", answer: message } };
  const ensureMail = (k: Keuze) => {
    const b = bundleFor(k);
    if (mailFor.current === k) return { b, subject, body };
    const m = buildMail({ customerName, stylistName, phase: b.bundle });
    setSubject(m.subject); setBody(m.body); mailFor.current = k;
    return { b, subject: m.subject, body: m.body };
  };
  // Het vastgelegde verfadvies gelijkzetten met de offerte (voor taken en opvolging).
  const saveVerf = async (route: "zelf" | "roll") => {
    const next = { ...(intake.advice_verf ?? emptyPhase(route)), rooms: verfRooms, route, answer: message };
    await supabase.from("intake").update({ advice_verf: next, followup_route: route, advisor_summary: message.trim() || null }).eq("id", intake.id);
    onIntake({ advice_verf: next });
  };

  const send = async (k: Keuze) => {
    const m = ensureMail(k);
    setState({ k, s: "busy" });
    if (k === "voorstel" || k === "advies") await saveVerf(k === "advies" ? "zelf" : "roll");
    if (k === "samples") await saveSamples(sampleRooms, products);
    const adviceAlready = k === "voorstel" && !!last(["roll"]);
    if (!adviceAlready) {
      const ok = await sendAdviceMail({ phase: m.b.phase, route: m.b.bundle.route, intakeId: intake.id, bookingId, subject: m.subject, body: m.body });
      if (!ok) { setState({ k, s: "fout", t: "Het advies versturen lukte niet. Er is nog niets naar de klant gegaan." }); return; }
    }
    if (k === "voorstel") {
      const { data } = await supabase.functions.invoke("booking", { body: { action: "voorstel_versturen", intake_id: intake.id, booking_id: bookingId } });
      const d = data as { ok?: boolean; klant_url?: string | null; skipped?: string; kleuren_onbekend?: string[]; error?: string } | null;
      if (!d?.ok) {
        setState({ k, s: "fout", t: `Het advies is verstuurd, de offerte nog niet${d?.skipped === "kleuren onbekend" ? `: kies eerst deze kleuren in de editor: ${(d.kleuren_onbekend ?? []).join(", ")}` : ""}. Probeer het opnieuw.` });
        onSent(); return;
      }
      onIntake({ offer_status: "verstuurd", offer_sent_at: new Date().toISOString(), advisor_offer_url: d.klant_url ?? intake.advisor_offer_url });
    }
    setState({ k, s: "ok", t: k === "voorstel" ? "Advies en offerte zijn verzonden." : k === "samples" ? "Sampleadvies verzonden." : "Advies verzonden." });
    setPreview(null); onSent();
  };

  // Samplekleuren (alleen Roll-kleuren, want alleen die zijn als sample te bestellen).
  const saveSamples = async (rooms: AdviceRoom[], prods: AdviceProduct[]) => {
    const next = { ...(intake.advice_sample ?? emptyPhase("samples")), route: "samples" as const, rooms, products: prods };
    await supabase.from("intake").update({ advice_sample: next }).eq("id", intake.id);
    onIntake({ advice_sample: next });
  };

  const kiesWinnaar = async (v: OfferVlak, kleurId: number | null | undefined, naam: string) => {
    if (!kleurId) return;
    setWinBusy(`${v.vid}:${naam}`);
    const { data } = await supabase.functions.invoke("booking", { body: { action: "offerte_bevestig", intake_id: intake.id, vid: v.vid, kleurId } });
    const d = data as { ok?: boolean; offer?: Offer; error?: string } | null;
    setWinBusy(null);
    if (d?.ok && d.offer) setOffer(d.offer);
    else setState({ k: "samples", s: "fout", t: d?.error ?? "Winnaar opslaan lukte niet." });
  };

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
    if (error || !data) { setState({ k: "roll", s: "fout", t: "Overdragen lukte niet. Probeer het opnieuw." }); return; }
    setState({ k: "roll", s: "ok", t: "Overgedragen aan Roll." }); onTask(data as RollTask);
  };

  const opties: { k: Keuze; titel: string; sub: string; kan: boolean; waarom: string }[] = samplesRoute ? [
    { k: "samples", titel: "Eerst kleuren testen", sub: "Sampleadvies met stickers of testers. Verf volgt als de klant eruit is.", kan: true, waarom: "" },
    { k: "roll", titel: "Roll laten meekijken", sub: "Roll neemt contact op met de klant.", kan: true, waarom: "" },
  ] : [
    { k: "voorstel", titel: "Advies + offerte", sub: "Het verslag en de offerte met winkelmandje, in één keer.", kan: hasOffer && !blocked && !nogKiezen, waarom: !offer ? "Leg eerst het advies vast bij stap 2." : nogKiezen ? "Kies eerst per oppervlak: eerst testen of bevestigd." : blocked ? "Kies eerst de onbekende kleuren in het advies." : "Er zijn nog geen bevestigde kleuren." },
    { k: "advies", titel: "Alleen advies", sub: "Met links naar de kleuren. Voor klanten die nog even verder willen kijken.", kan: hasOffer && !nogKiezen, waarom: nogKiezen ? "Kies eerst per oppervlak: eerst testen of bevestigd." : "Er zijn nog geen bevestigde kleuren." },
    { k: "roll", titel: "Roll laten meekijken", sub: "Roll belt de klant en maakt de offerte af.", kan: true, waarom: "" },
  ];

  const Status = ({ k }: { k: Keuze }) => state?.k !== k ? null : (
    <span role="status" style={{ fontSize: 14, fontWeight: 600, color: state.s === "fout" ? "var(--rd-pink-dark)" : undefined }}>{state.s === "busy" ? "Versturen..." : state.t}</span>
  );
  const byRoom = (offer?.regels ?? []).reduce<Record<string, NonNullable<Offer["regels"]>>>((acc, l) => { const k = l.ruimte || "Overig"; (acc[k] ??= []).push(l); return acc; }, {});

  return (
    <div className="kk-main" style={{ gap: 24 }}>
      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
          <h2 className="kk-h2">1. Het advies</h2>
          <button className="rd-textlink" onClick={onEditOffer}>Advies aanpassen</button>
        </div>
        {loading ? <p className="rd-sub">Advies ophalen...</p> : !offer ? (
          <p style={{ margin: 0, fontSize: 15 }}>Het advies is nog niet vastgelegd. <button className="rd-textlink" onClick={onEditOffer}>Leg het advies vast bij stap 2</button>, of laat Roll meekijken.</p>
        ) : nogKiezen ? (
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Voor {kiezenVlakken.length === 1 ? "één oppervlak" : `${kiezenVlakken.length} oppervlakken`} is nog niets gekozen: {kiezenVlakken.map((v) => `${v.ruimte} (${(v.type || v.soort || "").toLowerCase()})`).join(", ")}. <button className="rd-textlink" onClick={onEditOffer}>Kies bij Advies</button> of het eerst getest wordt of bevestigd is.</p>
        ) : samplesRoute ? (
          <>
            <p style={{ margin: "0 0 6px", fontSize: 14 }}>Er wordt nog getest, dus de klant krijgt eerst samples. De verf volgt als de klant per oppervlak een winnaar heeft gekozen.</p>
            {(offer.vlakken ?? []).map((v) => (
              <div key={v.vid} style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 0", borderTop: "1px solid var(--rd-line)", fontSize: 14 }}>
                <span style={{ flex: "0 0 34%", minWidth: 160 }}><strong>{v.ruimte}</strong> · {(v.type || v.soort || "").toLowerCase()}</span>
                {v.status === "testen" ? (
                  <span style={{ flex: 1, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    {v.testKleuren.map((t) => (
                      <span key={t.naam} style={{ display: "inline-flex", gap: 6, alignItems: "center", padding: "4px 8px 4px 4px", borderRadius: 10, border: "1px solid var(--rd-line)", background: "#fff" }}>
                        <span aria-hidden style={{ width: 20, height: 20, borderRadius: 6, background: t.hex ?? "var(--rd-grey-light)", border: "1px solid rgba(0,0,0,.12)" }} />
                        {t.naam}
                        {last(["samples"]) && <button className="rd-textlink" style={{ fontSize: 12.5 }} disabled={!!winBusy} onClick={() => kiesWinnaar(v, t.kleurId, t.naam)}>{winBusy === `${v.vid}:${t.naam}` ? "..." : "Winnaar"}</button>}
                      </span>
                    ))}
                    <span style={{ fontSize: 12.5, opacity: 0.7 }}>eerst testen</span>
                  </span>
                ) : v.status === "kiezen" ? (
                  <span style={{ flex: 1, fontSize: 13.5, opacity: 0.7 }}>nog kiezen</span>
                ) : (
                  <span style={{ flex: 1, display: "inline-flex", gap: 6, alignItems: "center" }}>
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: v.kleurHex ?? "var(--rd-grey-light)", border: "1px solid rgba(0,0,0,.12)" }} />{v.kleurNaam ?? "geen kleur"} <span style={{ fontSize: 12.5, opacity: 0.7 }}>· bevestigd</span>
                  </span>
                )}
              </div>
            ))}
            {last(["samples"]) && <p style={{ margin: "6px 0 0", fontSize: 13.5, opacity: 0.8 }}>Check-in: heeft de klant gekozen? Klik per oppervlak op de winnende kleur. Is alles bevestigd, dan verschijnt hier de offerte.</p>}
          </>
        ) : (
          <>
            {Object.entries(byRoom).map(([room, lines]) => (
              <div key={room} style={{ padding: "8px 0", borderTop: "1px solid var(--rd-line)", fontSize: 14 }}>
                <strong>{room}</strong>
                {lines.map((l, i) => (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "3px 0" }}>
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: l.kleurHex || "transparent", border: l.kleurHex ? "1px solid rgba(0,0,0,.12)" : "none" }} />
                    <span>{[l.kleurNaam, l.product, l.variant].filter(Boolean).join(" · ")}{l.oppervlak ? <span style={{ opacity: 0.6 }}> ({l.oppervlak})</span> : null}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{l.aantal}× {eur(l.totaal)}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--rd-line)", paddingTop: 8, fontWeight: 800, fontSize: 15 }}>
              <span>Offerte {offer.nummer}{offer.korting ? ` · ${offer.korting.label}` : ""}</span><span>{eur(offer.totaal)}</span>
            </div>
            {blocked && <div style={{ marginTop: 8, fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "var(--rd-lavender)" }}><strong>Kies deze kleuren in het advies:</strong> {offer.kleurenOnbekend.join(", ")}</div>}
            <button className="rd-textlink" style={{ marginTop: 8 }} onClick={() => setShowEditor((v) => !v)}>{showEditor ? "Offerte-editor sluiten" : "Offerte bekijken en aanpassen (met prijzen)"}</button>
            {showEditor && <div style={{ marginTop: 10 }}><OfferteEditor intake={intake} bookingId={bookingId} onIntake={onIntake} modus="offerte" /></div>}
          </>
        )}
      </section>

      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        <span className="kk-h2" style={{ marginBottom: 0 }}>2. Persoonlijk bericht</span>
        <span style={{ fontSize: 13.5, opacity: 0.75 }}>Komt bovenaan de mail. Kleuren en je ondertekening voegen we zelf toe.</span>
        <textarea className="rd-input" value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Bijv. Wat fijn dat we samen je woonkamer hebben doorgenomen. Hieronder vind je je kleuren." style={{ minHeight: 90, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
      </label>

      <section style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div>
          <h2 className="kk-h2" style={{ marginBottom: 2 }}>3. Hoe gaat de klant verder?</h2>
          <span style={{ fontSize: 13.5, opacity: 0.75 }}>Handig om af te spreken: wanneer wil je schilderen, wat heb je nodig om te kiezen, en zullen we de verf voor je klaarzetten?</span>
          {verzonden.length > 0 && <div style={{ fontSize: 13.5, marginTop: 6 }}><strong>Al verstuurd:</strong> {verzonden.join(" · ")}</div>}
        </div>
        <div role="radiogroup" aria-label="Vervolgstap" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          {opties.map((o) => {
            const on = gekozen === o.k;
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

        {gekozen === "voorstel" && hasOffer && (
          <div className="kk-card">
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>De klant krijgt eerst het verslag met de kleuren, direct daarna de offerte met de knop "Alles in je winkelmandje" ({eur(offer?.totaal)}). Klopt er iets niet? <button className="rd-textlink" onClick={onEditOffer}>Pas de offerte aan</button>.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={() => { ensureMail("voorstel"); setPreview("voorstel"); }} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{last(["roll"]) ? "Verstuur de offerte" : "Verstuur advies en offerte"}</button>
              <Status k="voorstel" />
            </div>
          </div>
        )}

        {gekozen === "samples" && samplesRoute && (
          <div className="kk-card">
            <span style={{ fontSize: 14 }}>Deze testkleuren gaan als samples in de mail. Kies per kleur sticker of tester, of voeg een bundel toe.</span>
            <SampleComposer colors={candidates} value={products} onChange={(p) => saveSamples(sampleRooms, p)} />
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={() => { ensureMail("samples"); setPreview("samples"); }} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{last(["samples"]) ? "Verstuur het sampleadvies opnieuw" : "Verstuur sampleadvies"}</button>
              <Status k="samples" />
            </div>
          </div>
        )}

        {gekozen === "advies" && hasOffer && (
          <div className="kk-card">
            <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5 }}>De klant krijgt het verslag met per kleur een link, zonder offerte. Na 14 dagen krijg je een taak om te checken of de verf besteld is.</p>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={() => { ensureMail("advies"); setPreview("advies"); }} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>Verstuur advies</button>
              <Status k="advies" />
            </div>
          </div>
        )}

        {gekozen === "roll" && (
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
        note={preview === "samples" ? "De samples staan onder de tekst." : preview === "voorstel" ? "Direct daarna volgt de offerte als aparte mail." : "De kleurlinks staan onder de tekst."}
        confirmLabel={preview === "voorstel" ? (last(["roll"]) ? "Verstuur de offerte" : "Verstuur advies en offerte") : preview === "samples" ? "Verstuur sampleadvies" : "Verstuur advies"}
        busy={state?.s === "busy"} onConfirm={() => preview && void send(preview)} onClose={() => setPreview(null)} />
    </div>
  );
}
