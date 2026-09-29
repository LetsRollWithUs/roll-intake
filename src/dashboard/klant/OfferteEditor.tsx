import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { IntakeRow } from "../types";

// De editor van roll.nl/offerte, ingebed in de klantkaart (zelfde back-end als roll.nl/offerte).
// "Offerte maken vanuit de intake" zet ruimtes, maten en kleuren alvast klaar; daarna werkt de
// styliste in de editor zelf. De editor meldt zich via postMessage: geladen, opgeslagen, hoogte, fout.

const ORIGIN = "https://roll.nl";
export interface EditorInfo { id?: number; nummer?: string; versie?: number; status?: string; totaal?: number | null; kleurenOnbekend?: string[]; waarschuwingen?: string[]; bewerkbaar?: boolean; bijgewerkt?: string }
const eur = (v?: number | null) => (v == null ? "" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));

export function OfferteEditor({ intake, bookingId, onIntake, modus = "advies" }: { intake: IntakeRow; bookingId: string; onIntake: (p: Partial<IntakeRow>) => void; modus?: "advies" | "offerte" }) {
  const hasOffer = !!intake.offer_meta?.id;
  const [url, setUrl] = useState<string | null>(null);
  const [height, setHeight] = useState(900);
  const [info, setInfo] = useState<EditorInfo>({});
  const [state, setState] = useState<"idle" | "maken" | "laden" | "uit" | "fout">("idle");
  const [err, setErr] = useState<string | null>(null);
  const loadedAt = useRef(0);

  const openEditor = useCallback(async () => {
    setState("laden"); setErr(null);
    const { data } = await supabase.functions.invoke("booking", { body: { action: "offerte_editlink", intake_id: intake.id, modus } });
    const d = data as { ok?: boolean; url?: string; skipped?: string; error?: string } | null;
    if (d?.ok && d.url) { setUrl(d.url); loadedAt.current = Date.now(); setState("idle"); return; }
    if (d?.skipped === "offerte-tool endpoint niet gekoppeld") { setState("uit"); return; }
    setState("fout"); setErr(d?.error ?? "De editor kon niet worden geopend.");
  }, [intake.id, modus]);

  const maken = async () => {
    setState("maken"); setErr(null);
    const { data } = await supabase.functions.invoke("booking", { body: { action: "voorstel_concept", intake_id: intake.id, booking_id: bookingId, tools_in_cart: true } });
    const d = data as { ok?: boolean; offer?: { id: number; nummer: string; totaal: number | null }; skipped?: string; error?: string } | null;
    if (d?.ok && d.offer) {
      onIntake({ offer_status: "concept", offer_total: d.offer.totaal, offer_meta: { ...(intake.offer_meta ?? { tools_in_cart: true }), id: d.offer.id, nummer: d.offer.nummer } });
      await openEditor();
      return;
    }
    if (d?.skipped === "offerte-tool endpoint niet gekoppeld") { setState("uit"); return; }
    setState("fout");
    setErr(d?.skipped === "geen ruimtes met maten" ? "Er zijn nog geen ruimtes met maten. Vul ze in de editor aan, of vraag de klant om de maten." : d?.error ?? "De offerte kon niet worden gemaakt.");
  };

  // Bestaande offerte: meteen openen. Na 7 uur een verse bewerklink (die van de server is 8 uur geldig).
  useEffect(() => { if (hasOffer && !url && state === "idle") openEditor(); }, [hasOffer, url, state, openEditor]);
  useEffect(() => {
    const t = setInterval(() => { if (url && Date.now() - loadedAt.current > 7 * 3600e3) openEditor(); }, 10 * 60e3);
    return () => clearInterval(t);
  }, [url, openEditor]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== ORIGIN || !e.data || typeof e.data !== "object") return;
      const { type, ...p } = e.data as { type?: string } & Record<string, unknown>;
      if (type === "roll-offerte:hoogte" && typeof p.hoogte === "number") setHeight(Math.max(500, Math.ceil(p.hoogte) + 24));
      if (type === "roll-offerte:geladen") {
        setInfo((i) => ({ ...i, ...(p as EditorInfo) }));
        // "Nieuwe versie maken" in de editor: nieuw id aan deze intake koppelen.
        if (typeof p.id === "number" && p.id !== intake.offer_meta?.id) {
          const { data } = await supabase.functions.invoke("booking", { body: { action: "offerte_koppel", intake_id: intake.id, offer_id: p.id } });
          const d = data as { ok?: boolean; offer?: { id: number; nummer: string; totaal: number | null } } | null;
          if (d?.ok && d.offer) onIntake({ offer_status: "concept", offer_total: d.offer.totaal, offer_meta: { ...(intake.offer_meta ?? { tools_in_cart: true }), id: d.offer.id, nummer: d.offer.nummer } });
        }
      }
      if (type === "roll-offerte:opgeslagen") {
        setInfo((i) => ({ ...i, ...(p as EditorInfo) }));
        if (typeof p.totaal === "number") onIntake({ offer_total: p.totaal as number });
        // Vlakken en status meteen in de klantkaart, zodat "Volgende stap" direct klopt.
        if (Array.isArray(p.vlakken) && intake.offer_meta) {
          const meta = intake.offer_meta as typeof intake.offer_meta & { offer?: Record<string, unknown> };
          onIntake({ offer_meta: { ...meta, offer: { ...(meta.offer ?? {}), vlakken: p.vlakken, klaarVoorOfferte: p.klaarVoorOfferte } } as typeof intake.offer_meta });
        }
      }
      if (type === "roll-offerte:fout") setErr(String(p.melding ?? "Er ging iets mis in de editor."));
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [intake.id, intake.offer_meta, onIntake]);

  if (state === "uit") return <p className="rd-sub">De koppeling met de offerte-tool staat uit. Kies bij Afronden "Roll laten meekijken", dan maakt Roll de offerte.</p>;

  if (!hasOffer) {
    return (
      <div className="kk-card" style={{ alignItems: "flex-start" }}>
        <h2 className="kk-h2">Advies vastleggen</h2>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, maxWidth: 640 }}>We zetten de ruimtes en maten uit de intake alvast klaar. Kies daarna per muur, plafond en houtwerk: <strong>Bevestigd</strong> met één kleur, of <strong>Eerst testen</strong> met 1 tot 3 Roll-kleuren. Er gaat nog niets naar de klant; dat doe je bij Afronden.</p>
        <button className="rd-btn rd-btn-primary" onClick={maken} disabled={state === "maken"} style={{ width: "auto", padding: "0 24px", minHeight: 44 }}>{state === "maken" ? "Klaarzetten..." : "Advies starten vanuit de intake"}</button>
        {err && <span role="status" style={{ fontSize: 14, color: "var(--rd-pink-dark)", fontWeight: 600 }}>{err}</span>}
      </div>
    );
  }

  const onbekend = info.kleurenOnbekend ?? [];
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
        <strong>{modus === "advies" ? "Wat is het advies per oppervlak?" : `Offerte ${info.nummer ?? intake.offer_meta?.nummer ?? ""}${info.versie && info.versie > 1 ? ` · versie ${info.versie}` : ""}`}</strong>
        {modus === "offerte" && info.totaal != null && <span>Totaal {eur(info.totaal)}</span>}
        {info.bijgewerkt && <span style={{ opacity: 0.7 }}>Opgeslagen {new Date(info.bijgewerkt).toLocaleTimeString("nl-NL", { hour: "2-digit", minute: "2-digit" })}</span>}
        <button className="kk-link" onClick={openEditor} style={{ marginLeft: "auto" }}>Editor opnieuw laden</button>
      </div>
      {modus === "advies" && <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, opacity: 0.8 }}>Twijfelt de klant nog? Zet het oppervlak op <strong>Eerst testen</strong>, dan krijgt de klant samples. Is de klant zeker? Kies <strong>Bevestigd</strong>, dan maak je bij Afronden de offerte. Alles slaat automatisch op.</p>}
      {onbekend.length > 0 && <div style={{ fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "var(--rd-lavender)" }}><strong>Kies deze kleuren in de editor:</strong> {onbekend.join(", ")}</div>}
      {(info.waarschuwingen?.length ?? 0) > 0 && <div style={{ fontSize: 14, padding: "10px 12px", borderRadius: 12, border: "1px solid var(--rd-line)" }}><strong>Let op:</strong> {info.waarschuwingen!.join(" · ")}</div>}
      {err && <span role="status" style={{ fontSize: 14, color: "var(--rd-pink-dark)", fontWeight: 600 }}>{err}</span>}
      {url ? (
        <iframe title="Offerte-editor" src={url} style={{ width: "100%", height, border: "1px solid var(--rd-line)", borderRadius: 16, background: "#fff" }} />
      ) : <p className="rd-sub">{state === "fout" ? "De editor kon niet worden geopend." : "Editor laden..."}</p>}
    </div>
  );
}
