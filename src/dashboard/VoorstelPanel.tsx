import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";
import { RollTaskStatus, type RollTask } from "./RollHelpForm";
import type { IntakeRow } from "./types";

// Bestelvoorstel: de styliste controleert een automatisch samengesteld voorstel en verstuurt het
// met één klik (offerte in roll.nl/offerte + Klaviyo-mail). Bij twijfel of maatwerk gaat het naar Roll.

interface Line { ruimte?: string; oppervlak?: string; soort?: string; product?: string; kleurNaam?: string; kleurHex?: string; variant?: string; aantal?: number; totaal?: number }
interface Tool { product?: string; aantal?: number; totaal?: number; inMandje?: boolean }
export interface Offer {
  id: number | null; nummer: string | null; klantUrl: string | null; mandUrl: string | null; editUrl: string | null;
  kleurenOnbekend: string[]; waarschuwingen?: string[]; regels: Line[]; tools: Tool[];
  subtotaal: number | null; korting: { label: string; bedrag: number } | null; extra: { label: string; bedrag: number }[];
  verzending: number | null; totaal: number | null;
  vlakken?: OfferVlak[]; klaarVoorOfferte?: boolean;
}
export interface OfferVlak { vid: string; ruimte?: string; type?: string; soort?: string; m2?: number | null; status?: string; kleurId?: number | null; kleurNaam?: string | null; kleurHex?: string | null; merkkleur?: boolean; testKleuren: { kleurId?: number | null; naam: string; hex?: string | null }[] }

const eur = (v: number | null | undefined) => (v == null ? "" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));
const GRENS = 1000;

interface Props {
  intake: IntakeRow;
  bookingId: string | null;
  task: RollTask | null;
  toolsInCart: boolean;
  notes: string;
  persist: () => Promise<boolean>;
  createRollTask: (type: RollTask["type"], note: string) => Promise<boolean>;
  onIntake: (patch: Partial<IntakeRow>) => void;
  // In de klantkaart: Roll-knoppen staan elders, en het advies (C05) gaat met dezelfde klik mee.
  embedded?: boolean;
  beforeSend?: () => Promise<boolean>;
  sendLabel?: string;
}

export function VoorstelPanel({ intake, bookingId, task, toolsInCart, notes, persist, createRollTask, onIntake, embedded, beforeSend, sendLabel }: Props) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [korting, setKorting] = useState<{ label: string; pct: number } | null>(null);
  const [off, setOff] = useState(false); // koppeling met de offerte-tool staat (nog) uit
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [twijfel, setTwijfel] = useState("");

  const sent = intake.offer_status === "verstuurd" || intake.offer_status === "besteld";

  const controleer = async () => {
    setBusy("controle"); setMsg(null); setOff(false);
    if (!(await persist())) { setBusy(null); setMsg("Opslaan van de maten mislukte."); return; }
    const { data } = await supabase.functions.invoke("booking", { body: { action: "voorstel_concept", intake_id: intake.id, booking_id: bookingId, tools_in_cart: toolsInCart, notes: notes.trim() } });
    setBusy(null);
    const d = data as { ok?: boolean; offer?: Offer; korting?: { label: string; pct: number } | null; skipped?: string; error?: string } | null;
    setKorting(d?.korting ?? null);
    if (d?.ok && d.offer) { setOffer(d.offer); onIntake({ offer_status: "concept", offer_total: d.offer.totaal }); return; }
    if (d?.skipped === "geen ruimtes met maten") { setMsg("Vul eerst de maten in, of laat Roll het voorstel maken."); return; }
    setOff(true);
    if (d?.error) setMsg(`De offerte-tool gaf een fout (${d.error}).`);
  };

  const verstuur = async () => {
    setBusy("versturen"); setMsg(null);
    if (beforeSend && !(await beforeSend())) { setBusy(null); setMsg("Het advies versturen lukte niet. Er is nog niets naar de klant gegaan; probeer het opnieuw."); return; }
    const { data } = await supabase.functions.invoke("booking", { body: { action: "voorstel_versturen", intake_id: intake.id, booking_id: bookingId } });
    setBusy(null);
    const d = data as { ok?: boolean; offer?: Offer; klant_url?: string | null; skipped?: string; kleuren_onbekend?: string[]; error?: string } | null;
    if (d?.ok) {
      onIntake({ offer_status: "verstuurd", offer_sent_at: new Date().toISOString(), offer_total: d.offer?.totaal ?? null, advisor_offer_url: d.klant_url ?? intake.advisor_offer_url });
      setOffer(null);
      setMsg("Verstuurd. De klant krijgt het bestelvoorstel nu per mail.");
      return;
    }
    if (d?.skipped === "kleuren onbekend") { setMsg(`Deze kleuren herkent de offerte-tool niet: ${(d.kleuren_onbekend ?? []).join(", ")}. Laat Roll het voorstel afmaken.`); return; }
    setMsg(`${beforeSend ? "Het advies is verstuurd, het bestelvoorstel nog niet. " : ""}Versturen lukte niet${d?.error ? ` (${d.error})` : ""}. Probeer het opnieuw of laat Roll het oppakken.`);
  };

  const naarRoll = async (type: RollTask["type"], note: string, done: string) => {
    setBusy(type); setMsg(null);
    await persist();
    const ok = await createRollTask(type, [note, notes.trim(), toolsInCart ? "Tools mee in het mandje." : "Tools los in de mail."].filter(Boolean).join(" "));
    setBusy(null);
    setMsg(ok ? done : "Aanvragen lukte niet. Probeer het opnieuw.");
    if (ok) setOffer(null);
  };

  if (task && !offer) return <RollTaskStatus task={task} />;

  if (sent && !offer) {
    return (
      <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 6 }}>
        <div>
          <strong>Bestelvoorstel {intake.offer_status === "besteld" ? "besteld" : "verstuurd"}</strong>
          {intake.offer_sent_at ? ` op ${formatDate(intake.offer_sent_at)}` : ""}{intake.offer_total != null ? ` · ${eur(Number(intake.offer_total))}` : ""}
        </div>
        {msg && <span style={{ fontWeight: 600, fontSize: 13 }}>{msg}</span>}
        <button className="rd-textlink" style={{ alignSelf: "flex-start" }} onClick={controleer} disabled={!!busy}>{busy ? "Bezig..." : "Nieuw voorstel samenstellen"}</button>
      </div>
    );
  }

  const blocked = !!offer && offer.kleurenOnbekend.length > 0;
  const groot = (offer?.totaal ?? 0) > GRENS;
  const byRoom = offer ? offer.regels.reduce<Record<string, Line[]>>((acc, l) => { const k = l.ruimte || "Overig"; (acc[k] ??= []).push(l); return acc; }, {}) : {};

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {!offer && !off && (
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button className="rd-btn rd-btn-primary" onClick={controleer} disabled={!!busy} style={{ width: "auto", padding: "0 22px" }}>{busy === "controle" ? "Voorstel samenstellen..." : "Controleer voorstel"}</button>
          {!embedded && <button className="rd-textlink" onClick={() => naarRoll("contact", "Styliste vraagt Roll het project door te spreken en het voorstel te maken.", "Roll neemt contact op met de klant en maakt het voorstel.")} disabled={!!busy}>Te ingewikkeld? Roll neemt contact op</button>}
        </div>
      )}

      {off && (
        <div style={{ fontSize: 13.5, background: "var(--rd-lavender)", borderRadius: 10, padding: "10px 12px", display: "flex", flexDirection: "column", gap: 8 }}>
          <span>De koppeling met de offerte-tool staat nog uit. Roll maakt het voorstel en stuurt het naar de klant.{korting ? " De Sample korting (10%) gaat mee: de klant kocht samples." : ""}</span>
          <button className="rd-btn rd-btn-primary" onClick={() => naarRoll("offerte", korting ? "Klant kocht samples: Sample korting 10% toepassen." : "", "Roll maakt het voorstel en stuurt het naar de klant.")} disabled={!!busy} style={{ width: "auto", padding: "0 20px", alignSelf: "flex-start" }}>{busy === "offerte" ? "Bezig..." : "Vraag Roll het voorstel te maken"}</button>
        </div>
      )}

      {offer && (
        <div style={{ border: "1px solid var(--rd-line)", borderRadius: 12, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
            <strong>Bestelvoorstel{offer.nummer ? ` ${offer.nummer}` : ""}</strong>
            {offer.editUrl && <a href={offer.editUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Openen in roll.nl/offerte</a>}
          </div>

          {blocked && (
            <div style={{ fontSize: 13.5, background: "var(--rd-lavender)", borderRadius: 10, padding: "10px 12px" }}>
              <strong>Deze kleur{offer.kleurenOnbekend.length > 1 ? "en herkent" : " herkent"} de offerte-tool niet:</strong> {offer.kleurenOnbekend.join(", ")}. Laat Roll het voorstel afmaken.
            </div>
          )}

          {(offer.waarschuwingen?.length ?? 0) > 0 && (
            <div style={{ fontSize: 13, border: "1px solid var(--rd-line)", borderRadius: 10, padding: "8px 12px" }}>
              <strong>Let op:</strong>
              <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>{offer.waarschuwingen!.map((w, i) => <li key={i}>{w}</li>)}</ul>
              <span style={{ fontSize: 12, opacity: 0.7 }}>Klopt iets niet of twijfel je? Laat Roll meekijken.</span>
            </div>
          )}

          {Object.entries(byRoom).map(([room, lines]) => (
            <div key={room}>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>{room}</div>
              {lines.map((l, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto auto", gap: 8, alignItems: "center", fontSize: 13, padding: "3px 0" }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: l.kleurHex || "transparent", border: l.kleurHex ? "1px solid rgba(0,0,0,.12)" : "none" }} />
                  <span>{[l.product, l.kleurNaam, l.variant].filter(Boolean).join(" · ")}{l.oppervlak ? <span style={{ opacity: 0.6 }}> ({l.oppervlak})</span> : null}</span>
                  <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{l.aantal ?? ""}×</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 72, textAlign: "right" }}>{eur(l.totaal)}</span>
                </div>
              ))}
            </div>
          ))}

          {offer.tools.length > 0 && (
            <div>
              <div style={{ fontWeight: 700, fontSize: 13.5, marginBottom: 4 }}>Tools</div>
              {offer.tools.map((t, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 8, fontSize: 13, padding: "3px 0" }}>
                  <span>{t.product}{t.inMandje === false ? <span style={{ opacity: 0.6 }}> (los in de mail)</span> : null}</span>
                  <span style={{ opacity: 0.75, fontVariantNumeric: "tabular-nums" }}>{t.aantal ?? ""}×</span>
                  <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 72, textAlign: "right" }}>{eur(t.totaal)}</span>
                </div>
              ))}
            </div>
          )}

          <div style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 8, fontSize: 13.5, display: "flex", flexDirection: "column", gap: 3, fontVariantNumeric: "tabular-nums" }}>
            {offer.subtotaal != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Subtotaal</span><span>{eur(offer.subtotaal)}</span></div>}
            {offer.korting && <div style={{ display: "flex", justifyContent: "space-between" }}><span>{offer.korting.label}</span><span>-{eur(offer.korting.bedrag)}</span></div>}
            {offer.extra.map((e, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between" }}><span>{e.label}</span><span>{e.bedrag ? `-${eur(e.bedrag)}` : ""}</span></div>)}
            {offer.verzending != null && <div style={{ display: "flex", justifyContent: "space-between" }}><span>Verzending</span><span>{offer.verzending ? eur(offer.verzending) : "gratis"}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 15 }}><span>Totaal</span><span>{eur(offer.totaal)}</span></div>
            {!offer.korting && korting && <span style={{ fontSize: 12, opacity: 0.7 }}>Sample korting wordt toegepast in het winkelmandje.</span>}
          </div>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="rd-btn rd-btn-primary" onClick={verstuur} disabled={!!busy || blocked} style={{ width: "auto", padding: "0 22px", ...(blocked ? { opacity: 0.5 } : {}) }}>{busy === "versturen" ? "Versturen..." : sendLabel ?? "Verstuur voorstel"}</button>
            <button className="rd-textlink" onClick={() => setOffer(null)} disabled={!!busy}>Maten of kleuren aanpassen</button>
          </div>

          {!embedded && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid var(--rd-line)", paddingTop: 10 }}>
            {groot && (
              <button className="rd-btn rd-btn-outline" onClick={() => naarRoll("maatwerk", `Voorstel boven ${eur(GRENS)} (${eur(offer.totaal)}): Roll maakt een maatwerkofferte met extra korting.`, "Roll maakt een maatwerkofferte met extra korting en neemt contact op met de klant.")} disabled={!!busy} style={{ width: "auto", padding: "0 18px", alignSelf: "flex-start" }}>
                Maatwerk met extra korting door Roll
              </button>
            )}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input className="rd-input" value={twijfel} onChange={(e) => setTwijfel(e.target.value)} placeholder="Twijfel over ondergrond, maten, kleur of product? Korte reden" style={{ height: 38, fontSize: 13, flex: "1 1 240px" }} />
              <button className="rd-textlink" onClick={() => naarRoll("contact", `Twijfel: ${twijfel.trim() || "styliste wil dat Roll meekijkt"}.`, "Roll belt de klant kort en verstuurt daarna het voorstel.")} disabled={!!busy}>Roll neemt contact op</button>
            </div>
            {blocked && <button className="rd-textlink" style={{ alignSelf: "flex-start" }} onClick={() => naarRoll("offerte", `Onbekende kleur(en): ${offer.kleurenOnbekend.join(", ")}.`, "Roll maakt het voorstel af en stuurt het naar de klant.")} disabled={!!busy}>Laat Roll het voorstel afmaken</button>}
          </div>
          )}
        </div>
      )}

      {msg && <span style={{ color: "var(--rd-aubergine)", fontWeight: 600, fontSize: 13 }}>{msg}</span>}
    </div>
  );
}
