import { useCallback, useEffect, useState } from "react";
import { Link, Navigate, Route, Routes, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { vraagWachtwoordMail } from "./Login";
import { Tegel, blokKop, euro, formatDate, getal, rij, type Kwartaal, type WpPartner } from "./PartnersPage";

// Een partner zoals het dashboard hem kent (public.partners via mijn_toegang()).
export type Partner = { id: string; slug: string; soort: "makelaar" | "creator" | "merk" | "schilder" | "overig"; naam: string };

export const SOORT_LABEL: Record<Partner["soort"], string> = {
  makelaar: "Makelaar",
  creator: "Creator",
  merk: "Merk",
  schilder: "Schilder",
  overig: "Partner",
};

/** Roept een functie aan en geeft de melding van de server terug als het misgaat. */
async function roep<T>(fn: string, body: Record<string, unknown>): Promise<{ data: T | null; fout: string | null }> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let tekst = "";
    try { tekst = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* geen leesbare melding */ }
    return { data: null, fout: tekst || "Dat lukte niet. Probeer het over een minuut opnieuw." };
  }
  return { data: data as T, fout: null };
}

/** Voluit: "31 januari 2027". */
const datumLang = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric" });
};
const meervoud = (n: number, een: string, meer: string) => `${getal(n)} ${n === 1 ? een : meer}`;
const liters = (n: number) => new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 }).format(n || 0);

function usePartner(slug: string | undefined) {
  const [p, setP] = useState<WpPartner | null>(null);
  const [meekijken, setMeekijken] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  useEffect(() => {
    if (!slug) return;
    setP(null); setFout(null);
    roep<{ partner: WpPartner; meekijken: boolean }>("partner-dashboard", { action: "cijfers", slug }).then(({ data, fout }) => {
      if (fout || !data?.partner) setFout(fout ?? "De cijfers konden niet worden opgehaald.");
      else { setP(data.partner); setMeekijken(!!data.meekijken); }
    });
  }, [slug]);
  return { p, setP, meekijken, fout };
}

const knopRij: React.CSSProperties = { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" };
const knop: React.CSSProperties = { width: "auto", minHeight: 44, padding: "0 18px", fontSize: 15, textDecoration: "none", display: "inline-flex", alignItems: "center" };
const melding: React.CSSProperties = { background: "var(--rd-lavender)", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 600, marginBottom: 12 };

/** Het dashboard van één partner: cijfers, commissie per kwartaal met de keuze, bestellingen en de eigen code. */
export function PartnerDashboard({ slug: vast }: { slug?: string }) {
  const params = useParams();
  const slug = vast ?? params.slug;
  const { p, setP, meekijken, fout } = usePartner(slug);
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState<string | null>(null);
  const [actieFout, setActieFout] = useState<string | null>(null);
  // Een keuze voor een kwartaal is eenmalig: eerst laten bevestigen.
  const [vraag, setVraag] = useState<{ kw: string; keuze: "geld" | "verf" } | null>(null);
  const [aantal, setAantal] = useState(25);

  const doe = useCallback(async (body: Record<string, unknown>, klaar: string) => {
    setBezig(true); setActieFout(null); setBericht(null);
    const { data, fout } = await roep<{ partner: WpPartner }>("partner-dashboard", { ...body, slug });
    setBezig(false); setVraag(null);
    if (fout || !data?.partner) { setActieFout(fout ?? "Dat lukte niet."); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setP(data.partner); setBericht(klaar);
    // De bevestiging staat bovenaan; breng die in beeld.
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [slug, setP]);

  if (fout) return <p className="rd-sub">{fout}</p>;
  if (!p) return <p className="rd-sub">Je cijfers laden...</p>;

  const creator = p.type === "creator";
  const code = (p.afspraken.kortingscode || "").toUpperCase();
  const orders = p.orders ?? [];
  const factuurmail = p.roll?.factuurmail ?? "admin@roll.nl";
  const f = p.funnel;

  const kwartaal = (k: Kwartaal, i: number) => {
    const afrekening = <Link className="rd-textlink" to={`/dashboard/afrekening/${p.slug}/${k.kwartaal}`} style={{ fontSize: 14, minHeight: 0 }}>Afrekening bekijken</Link>;
    let voet: React.ReactNode;
    if (k.uitbetaling === "afgehandeld") {
      voet = (
        <>
          <span className="rd-chip">{k.keuze === "verf" ? "Verftegoed klaar" : `Betaald op ${datumLang(k.afgehandeldOp)}`}</span>
          {k.keuze === "verf" && k.tegoedcode && <span style={{ fontSize: 14 }}>Tegoedcode: <strong style={{ fontFamily: "monospace" }}>{k.tegoedcode.toUpperCase()}</strong> ({euro(k.bedragIncl)})</span>}
        </>
      );
    } else if (k.uitbetaling === "factuur") {
      voet = (
        <>
          <span className="rd-chip">Factuur ontvangen{k.factuurNr ? ` · ${k.factuurNr}` : ""}</span>
          <span style={{ fontSize: 14, opacity: 0.7 }}>{k.keuze === "verf" ? "We maken jullie verftegoed aan." : "We betalen binnen 14 dagen."}</span>
        </>
      );
    } else if (k.uitbetaling === "aangevraagd") {
      voet = (
        <div style={{ width: "100%" }}>
          <p style={{ fontSize: 14, margin: "0 0 10px" }}>
            <strong>Gekozen: {k.keuze === "verf" ? "omzetten in verf" : "uitbetalen"}.</strong> Mail nu jullie factuur van {euro(k.bedragIncl)} inclusief btw naar <strong>{factuurmail}</strong>, met kenmerk {k.kenmerk}. {k.keuze === "verf" ? "Daarna maken wij jullie verftegoed aan." : "Wij betalen binnen 14 dagen."}
          </p>
          <div style={knopRij}>
            <a className="rd-btn rd-btn-primary" style={knop} href={k.factuurMailto}>Mail de factuur</a>
            <Link className="rd-btn rd-btn-outline" style={knop} to={`/dashboard/afrekening/${p.slug}/${k.kwartaal}`}>Afrekening</Link>
          </div>
        </div>
      );
    } else if (k.klaar && k.commissie > 0 && !meekijken) {
      voet = vraag?.kw === k.kwartaal ? (
        <div style={{ width: "100%" }}>
          <p style={{ fontSize: 14, margin: "0 0 10px" }}>
            {vraag.keuze === "verf"
              ? <>Jullie zetten de commissie over {k.label} om in verftegoed: <strong>{euro(k.bedragIncl)}</strong> inclusief btw.</>
              : <>Jullie laten de commissie over {k.label} uitbetalen: <strong>{euro(k.commissie)}</strong> exclusief btw.</>}{" "}
            De keuze geldt voor het hele kwartaal.
          </p>
          <div style={knopRij}>
            <button className="rd-btn rd-btn-primary" style={knop} disabled={bezig} onClick={() => doe({ action: "keuze", kwartaal: k.kwartaal, keuze: vraag.keuze }, `Dank je, jullie keuze is doorgegeven. Mail nu jullie factuur naar ${factuurmail}.`)}>{bezig ? "Bezig..." : "Bevestig"}</button>
            <button className="rd-btn rd-btn-outline" style={knop} disabled={bezig} onClick={() => setVraag(null)}>Terug</button>
          </div>
        </div>
      ) : (
        <div style={knopRij}>
          <button className="rd-btn rd-btn-primary" style={knop} onClick={() => setVraag({ kw: k.kwartaal, keuze: "geld" })}>Laat uitbetalen</button>
          <button className="rd-btn rd-btn-outline" style={knop} onClick={() => setVraag({ kw: k.kwartaal, keuze: "verf" })}>Zet om in verf</button>
        </div>
      );
    } else {
      voet = <span className="rd-chip">{k.commissie > 0 ? `Af te rekenen vanaf ${datumLang(k.afrekenbaar)}` : "Loopt nog"}</span>;
    }
    return (
      <div key={k.kwartaal} style={{ borderTop: i ? "1px solid var(--rd-line)" : 0, padding: i ? "12px 0" : "0 0 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
          <strong style={{ fontSize: 16 }}>{k.label}</strong>
          <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums" }}>{euro(k.commissie)}</strong>
        </div>
        <div style={{ fontSize: 13, opacity: 0.65, marginBottom: 8 }}>{meervoud(k.orders, "bestelling", "bestellingen")} · grondslag {euro(k.omzet)}</div>
        <div style={{ ...knopRij, gap: 12 }}>
          {voet}
          {k.orders > 0 && k.uitbetaling !== "aangevraagd" && afrekening}
        </div>
      </div>
    );
  };

  return (
    <div>
      {meekijken && (
        <div style={melding}>
          Je kijkt mee als beheerder: zo ziet {p.naam} het dashboard. Kiezen en aanvragen kan alleen de partner zelf.{" "}
          <Link to={`/dashboard/partners/${p.slug}`} style={{ color: "inherit" }}>Terug naar het beheer</Link>
        </div>
      )}
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Partnerdashboard · {p.naam}</div>
      <h1 className="rd-h2" style={{ margin: "0 0 2px" }}>Hoi {p.voornamen || p.naam}</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>{creator ? "Zo doet jullie code het." : "Zo doen jullie kleurcadeaus het."}</p>

      {bericht && <div style={melding} role="status">{bericht}</div>}
      {actieFout && <div style={{ ...melding, background: "#fff", color: "var(--rd-pink-dark)" }} role="alert">{actieFout}</div>}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "12px 0 10px" }}>
        <Tegel label="Jullie commissie" waarde={euro(p.totaal?.commissie ?? 0)} sub={`waarvan ${euro(p.totaal?.definitief ?? 0)} definitief`} />
        {creator ? (
          <>
            <Tegel label="Bestellingen" waarde={getal(orders.length)} sub={`met jullie code ${code}`} />
            <Tegel label="Omzet via jullie code" waarde={euro(p.totaal?.omzet ?? 0)} sub="exclusief btw, na korting" />
          </>
        ) : (
          <>
            <Tegel label="Kleuradviezen" waarde={getal(f?.geboekt ?? 0)} sub={`online gesprekken geboekt${f?.thuis ? `, plus ${getal(f.thuis)} aan huis` : ""}`} />
            <Tegel label="Verfbestellingen" waarde={getal(f?.klanten ?? 0)} sub={`samen ${euro(p.totaal?.omzet ?? 0)} exclusief btw`} />
          </>
        )}
      </div>

      {f && (
        <div className="rd-card-white" style={{ marginBottom: 10 }}>
          {blokKop("Van kaart tot verf")}
          {[
            { naam: "Kaarten in omloop", n: f.kaarten, uitleg: "De cadeaublikken die jullie kunnen uitdelen" },
            { naam: "Geactiveerd", n: f.geactiveerd, uitleg: "Klanten die hun cadeau hebben geactiveerd" },
            { naam: "Gesprek geboekt", n: f.geboekt, uitleg: "Online kleuradvies ingepland" },
            { naam: "Verf besteld", n: f.klanten, uitleg: "Bestellingen met verf of materialen" },
          ].map((s, i) => (
            <div key={s.naam} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(60px,1fr) auto", gap: 12, alignItems: "center", borderTop: i ? "1px solid var(--rd-line)" : 0, padding: "8px 0" }}>
              <div style={{ minWidth: 0 }}><strong style={{ fontSize: 14 }}>{s.naam}</strong><div style={{ fontSize: 12, opacity: 0.65 }}>{s.uitleg}</div></div>
              <div aria-hidden style={{ height: 10, borderRadius: 99, background: "var(--rd-grey-light)", overflow: "hidden" }}>
                <div style={{ height: "100%", borderRadius: 99, background: "var(--rd-pink)", width: `${f.kaarten > 0 && s.n > 0 ? Math.max(2, Math.min(100, Math.round((s.n / f.kaarten) * 100))) : 0}%` }} />
              </div>
              <strong style={{ fontSize: 18, fontVariantNumeric: "tabular-nums", minWidth: 28, textAlign: "right" }}>{getal(s.n)}</strong>
            </div>
          ))}
        </div>
      )}

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Commissie per kwartaal")}
        {(p.kwartalen ?? []).map(kwartaal)}
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop(creator ? "Bestellingen met jullie code" : "Bestellingen via jullie cadeau")}
        {orders.length === 0
          ? <p className="rd-sub" style={{ margin: 0 }}>Zodra een klant met jullie {creator ? "" : "cadeau of "}code bestelt, verschijnt die hier.</p>
          : orders.slice(0, 50).map((o, i) => (
            <div key={o.nr + i} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
              <span><strong>#{o.nr}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>· {formatDate(o.datum)} · {o.bron === "Aan huis" ? "Kleuradvies aan huis" : `${o.bron}${o.advies === "online" ? " · online advies" : ""}`}</span></span>
              <span style={{ display: "flex", gap: 12, fontVariantNumeric: "tabular-nums", flexWrap: "wrap", alignItems: "baseline" }}>
                <span><strong>{euro(o.commissie)}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>van {euro(o.omzet)}</span></span>
                <span className="rd-chip" style={{ padding: "3px 9px", fontSize: 11 }}>{o.status}</span>
              </span>
            </div>
          ))}
      </div>

      {creator && ((p.kleuren ?? []).length > 0 || (p.producten ?? []).length > 0) && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="rd-card-white" style={{ flex: "1 1 280px", minWidth: 0 }}>
            {blokKop("Top 10 kleuren")}
            {(p.kleuren ?? []).length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Hier komen de kleuren die het meest worden besteld.</p> : (p.kleuren ?? []).slice(0, 10).map((k, i) => (
              <div key={k.naam} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
                <span><strong>{i + 1}. {k.naam}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>· {meervoud(k.orders, "bestelling", "bestellingen")}</span></span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{liters(k.liter)} L</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>{euro(k.omzet)}</span></span>
              </div>
            ))}
          </div>
          <div className="rd-card-white" style={{ flex: "1 1 280px", minWidth: 0 }}>
            {blokKop("Wat er nog meer wordt besteld")}
            {(p.producten ?? []).length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Hier komen de andere producten die worden besteld.</p> : (p.producten ?? []).map((k, i) => (
              <div key={k.naam} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
                <strong>{k.naam}</strong>
                <span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{getal(k.aantal)}×</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>{euro(k.omzet)}</span></span>
              </div>
            ))}
          </div>
          <p className="rd-sub" style={{ margin: 0, fontSize: 13, flexBasis: "100%" }}>Over de bestellingen met jullie code, na retouren. Bedragen exclusief btw.</p>
        </div>
      )}

      {p.bezoek && (
        <div className="rd-card-white" style={{ marginBottom: 10 }}>
          {blokKop("Bezoek via jullie links")}
          <div style={{ display: "flex", gap: 24, flexWrap: "wrap", marginBottom: 6 }}>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{getal(p.bezoek.totaal)}</div><div style={{ fontSize: 12, opacity: 0.65 }}>bezoeken, {getal(p.bezoek.dagen30)} in de laatste 30 dagen</div></div>
            <div><div style={{ fontSize: 24, fontWeight: 800 }}>{getal(p.bezoek.orders)}</div><div style={{ fontSize: 12, opacity: 0.65 }}>bestellingen via een link, {getal(p.bezoek.metCode)} daarvan met jullie code</div></div>
          </div>
          {(p.bezoek.links ?? []).length === 0
            ? <p className="rd-sub" style={{ margin: 0 }}>Zodra iemand via een link met jullie tag binnenkomt, zie je dat hier per print.</p>
            : (p.bezoek.links ?? []).map((l) => (
              <div key={l.naam} style={rij}><strong>{l.naam}</strong><span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{getal(l.aantal)}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>{l.aantal === 1 ? "bezoek" : "bezoeken"}</span></span></div>
            ))}
          <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Dit meet het bezoek. De commissie volgt de kortingscode: een bestelling via een link telt mee voor de commissie als jullie code is gebruikt. Bestellingen via een link zien we alleen als de bezoeker cookies toestaat, dus het echte aantal ligt hoger.</p>
        </div>
      )}

      {creator ? (
        <div className="rd-card-white" style={{ marginBottom: 10 }}>
          {blokKop("Jullie code")}
          <div style={{ ...rij, borderTop: 0, paddingTop: 0 }}><span>Code voor jullie volgers</span><span><strong style={{ fontFamily: "monospace" }}>{code}</strong> · {p.afspraken.korting}</span></div>
          <p className="rd-sub" style={{ margin: "6px 0 0", fontSize: 14 }}>
            {p.kortingMin
              ? `De code geldt op roll.nl bij een bestelling met verf. Samples tellen niet mee voor de € ${getal(p.kortingMin)}, en de code is niet te combineren met andere kortingscodes.`
              : "De code geldt op alle producten van Roll, zonder minimum. Niet op kleuradvies en verzending, en niet te combineren met andere kortingscodes."}
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div className="rd-card-white" style={{ flex: "1 1 280px", minWidth: 0 }}>
            {blokKop("Nieuwe kaarten")}
            <p style={{ fontSize: 14, margin: "0 0 8px" }}>Bijna door jullie cadeaublikken heen? Vraag nieuwe aan, wij maken de codes en sturen ze op.</p>
            {p.aanvraag && p.aanvraag.aantal > 0 && <p className="rd-sub" style={{ margin: "0 0 8px", fontSize: 13 }}>Laatste aanvraag: {getal(p.aanvraag.aantal)} stuks op {datumLang(p.aanvraag.datum)}.</p>}
            {!meekijken && (
              <div style={knopRij}>
                <label style={{ fontSize: 14 }} htmlFor="pd-kaarten">Aantal</label>
                <select id="pd-kaarten" className="rd-input" style={{ width: "auto", minWidth: 80 }} value={aantal} onChange={(e) => setAantal(Number(e.target.value))}>
                  <option value={10}>10</option><option value={25}>25</option><option value={50}>50</option>
                </select>
                <button className="rd-btn rd-btn-primary" style={knop} disabled={bezig} onClick={() => doe({ action: "kaarten", aantal }, "Dank je, we sturen jullie de nieuwe kaarten zo snel mogelijk.")}>Vraag aan</button>
              </div>
            )}
          </div>
          <div className="rd-card-white" style={{ flex: "1 1 280px", minWidth: 0 }}>
            {blokKop("Jullie link en code")}
            <div style={{ ...rij, borderTop: 0, paddingTop: 0 }}><span>Cadeaupagina</span><a href={p.links.pagina} target="_blank" rel="noreferrer" style={{ color: "inherit", fontWeight: 600, overflowWrap: "anywhere" }}>{p.links.pagina.replace(/^https?:\/\//, "")}</a></div>
            <div style={rij}><span>Kortingscode voor iedereen</span><span><strong style={{ fontFamily: "monospace" }}>{code}</strong> · {p.afspraken.korting}</span></div>
          </div>
        </div>
      )}

      <details className="rd-card-white">
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>Zo werkt jullie commissie</summary>
        <div style={{ fontSize: 14, lineHeight: 1.55 }}>
          <p>Jullie ontvangen <strong>{p.afspraken.commissiePct}%</strong> van de verf en materialen die klanten via jullie {creator ? "" : "cadeau of "}code bestellen, exclusief btw, na korting en retouren. Adviesgesprekken en verzendkosten tellen niet mee.</p>
          {creator
            ? <p>Een bestelling telt mee als jullie code {code} is gebruikt. Een bestelling is definitief 30 dagen na levering, als de retourtermijn voorbij is. Daarna verandert de commissie niet meer.</p>
            : <p>Een klant blijft {p.koppelingMnd ?? 12} maanden aan jullie gekoppeld, ook bij latere bestellingen. Een bestelling is definitief 30 dagen na levering, als de retourtermijn voorbij is. Daarna verandert de commissie niet meer.</p>}
          <p style={{ marginBottom: 0 }}>Per afgesloten kwartaal kiezen jullie: <strong>uitbetalen</strong>, of <strong>omzetten in verf</strong> als tegoed bij Roll. Daarna mailen jullie een factuur op basis van de afrekening, met {p.roll?.btwPct ?? 21}% btw, naar {factuurmail}. Bij uitbetalen betalen wij binnen 14 dagen; bij verf krijgen jullie een tegoedcode ter waarde van het bedrag inclusief btw.</p>
        </div>
      </details>
    </div>
  );
}

/** Afdrukbare afrekening van één kwartaal, om te bewaren als pdf en als basis voor de factuur. */
export function PartnerAfrekening() {
  const { slug, kw } = useParams();
  const { p, fout } = usePartner(slug);
  if (fout) return <p className="rd-sub">{fout}</p>;
  if (!p) return <p className="rd-sub">De afrekening laden...</p>;
  const k = (p.kwartalen ?? []).find((x) => x.kwartaal === kw);
  if (!k) return <div><Link to="/dashboard" className="rd-textlink" style={{ textDecoration: "none" }}>← Terug naar het dashboard</Link><p className="rd-sub">Voor dit kwartaal is er geen afrekening.</p></div>;
  const orders = (p.orders ?? []).filter((o) => o.kw === kw).sort((a, b) => a.datum.localeCompare(b.datum));
  const r = p.roll;
  // Zelfde afronding als op roll.nl: eerst het bedrag inclusief btw, de btw is het verschil.
  const incl = Math.round(k.commissie * (100 + (r?.btwPct ?? 21))) / 100;
  const btw = Math.round((incl - k.commissie) * 100) / 100;
  const cel: React.CSSProperties = { textAlign: "left", padding: "8px 6px", borderBottom: "1px solid var(--rd-line)" };
  const rechts: React.CSSProperties = { ...cel, textAlign: "right", fontVariantNumeric: "tabular-nums" };
  const kop: React.CSSProperties = { ...cel, fontSize: 11, textTransform: "uppercase", letterSpacing: ".06em", opacity: 0.7 };

  return (
    <div style={{ maxWidth: 760, margin: "0 auto" }}>
      <style>{`@media print{header,.pa-knoppen{display:none!important}body,#root>div{background:#fff!important}.pa-blad{box-shadow:none!important;padding:0!important}main{padding:0!important}}`}</style>
      <div className="pa-knoppen" style={{ ...knopRij, justifyContent: "space-between", marginBottom: 12 }}>
        <Link to={`/dashboard/partner/${p.slug}`} className="rd-textlink" style={{ textDecoration: "none" }}>← Terug naar het dashboard</Link>
        <button className="rd-btn rd-btn-primary" style={knop} onClick={() => window.print()}>Afdrukken of bewaren als pdf</button>
      </div>
      <div className="rd-card-white pa-blad" style={{ padding: 28, fontSize: 14, lineHeight: 1.5 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div>
            <div className="rd-kicker rd-kicker-pink">Afrekening commissie</div>
            <h1 className="rd-h2" style={{ margin: "0 0 4px" }}>{k.label}</h1>
            <div>Kenmerk {k.kenmerk} · opgemaakt op {datumLang(new Date().toISOString())}</div>
          </div>
          <div>
            <div className="rd-kicker rd-kicker-pink">Commissie</div>
            <div style={{ fontSize: 30, fontWeight: 900, lineHeight: 1.1 }}>{euro(k.commissie)}</div>
            <div>exclusief btw</div>
          </div>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "20px 0" }}>
          <div style={{ flex: "1 1 220px", background: "var(--rd-offwhite)", borderRadius: 12, padding: "12px 14px" }}><div className="rd-kicker rd-kicker-pink">Partner</div><strong>{p.naam}</strong>{p.plaats && <><br />{p.plaats}</>}</div>
          {r && <div style={{ flex: "1 1 220px", background: "var(--rd-offwhite)", borderRadius: 12, padding: "12px 14px" }}><div className="rd-kicker rd-kicker-pink">Roll</div><strong>{r.naam}</strong><br />{r.adres}<br />KVK {r.kvk} · btw {r.btw}</div>}
        </div>

        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr><th style={kop}>Datum</th><th style={kop}>Bestelling</th><th style={kop}>Via</th><th style={{ ...kop, textAlign: "right" }}>Grondslag</th><th style={{ ...kop, textAlign: "right" }}>Commissie</th></tr></thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.nr}><td style={cel}>{datumLang(o.datum)}</td><td style={cel}>#{o.nr}</td><td style={cel}>{o.bron}</td><td style={rechts}>{euro(o.omzet)}</td><td style={rechts}>{euro(o.commissie)}</td></tr>
              ))}
              <tr style={{ fontWeight: 800 }}><td style={{ ...cel, borderBottom: 0 }} colSpan={3}>Totaal</td><td style={{ ...rechts, borderBottom: 0 }}>{euro(k.omzet)}</td><td style={{ ...rechts, borderBottom: 0 }}>{euro(k.commissie)}</td></tr>
            </tbody>
          </table>
        </div>

        <table style={{ borderCollapse: "collapse", margin: "18px 0 0 auto", minWidth: "min(320px, 100%)" }}>
          <tbody>
            <tr><td style={cel}>Commissie exclusief btw</td><td style={rechts}>{euro(k.commissie)}</td></tr>
            <tr><td style={cel}>Btw {r?.btwPct ?? 21}%</td><td style={rechts}>{euro(btw)}</td></tr>
            <tr style={{ fontWeight: 800, fontSize: 16 }}><td style={{ ...cel, borderBottom: 0 }}>Te factureren inclusief btw</td><td style={{ ...rechts, borderBottom: 0 }}>{euro(incl)}</td></tr>
          </tbody>
        </table>

        {r && (
          <div style={{ background: "var(--rd-lavender)", borderRadius: 12, padding: "12px 14px", marginTop: 20 }}>
            <div className="rd-kicker rd-kicker-pink">Factureer aan</div>
            <p style={{ margin: "6px 0 0" }}><strong>{r.naam}</strong><br />{r.adres}<br />KVK {r.kvk} · btw {r.btw}<br />Mail de factuur naar <strong>{r.factuurmail}</strong></p>
            <p style={{ margin: "6px 0 0" }}>Vermeld kenmerk <strong>{k.kenmerk}</strong>. {k.keuze === "verf" ? `Jullie kozen voor verftegoed: na ontvangst van de factuur maken wij een tegoedcode van ${euro(incl)} aan, te gebruiken op roll.nl.` : "Wij betalen binnen 14 dagen na ontvangst van de factuur."}</p>
          </div>
        )}

        <p style={{ fontSize: 12, opacity: 0.75, margin: "18px 0 0" }}>
          Commissie: {p.afspraken.commissiePct}% over de netto productomzet exclusief btw, na korting en retouren, zonder adviesgesprekken en verzendkosten.
          {k.keuze ? ` Gekozen afhandeling: ${k.keuze === "verf" ? "omzetten in verftegoed" : "uitbetalen"}.` : ""}
          {" "}Bestellingen die nog niet 30 dagen geleverd zijn, kunnen door een retour nog wijzigen. Vragen? {r?.mail ?? "hello@roll.nl"}.
        </p>
      </div>
    </div>
  );
}

/** Account van een partner: met welk adres je bent ingelogd en een nieuw wachtwoord kiezen. */
function PartnerAccount({ email, partners }: { email: string; partners: Partner[] }) {
  const [msg, setMsg] = useState<string | null>(null);
  const reset = async () => {
    setMsg(null);
    const ok = await vraagWachtwoordMail(email);
    setMsg(ok ? "We hebben je een link gemaild om een nieuw wachtwoord te kiezen." : "Versturen lukte niet, probeer het later opnieuw.");
  };
  return (
    <div style={{ maxWidth: 620 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Account</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>Je bent ingelogd als {email}.</p>
      <div className="rd-card-white" style={{ marginTop: 14 }}>
        {blokKop("Jouw dashboard")}
        {partners.map((p, i) => (
          <div key={p.id} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}><strong>{p.naam}</strong><span style={{ opacity: 0.7 }}>{SOORT_LABEL[p.soort]}</span></div>
        ))}
      </div>
      <div className="rd-card-white" style={{ marginTop: 12 }}>
        {blokKop("Wachtwoord")}
        <p className="rd-sub" style={{ marginTop: 0 }}>Een nieuw wachtwoord kiezen? We mailen je een veilige link.</p>
        <button className="rd-btn rd-btn-outline" onClick={reset} style={{ width: "auto", padding: "0 20px" }}>Stuur mij de link</button>
        {msg && <p style={{ marginTop: 10, color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</p>}
      </div>
      <p className="rd-sub" style={{ fontSize: 14 }}>Iemand toevoegen of een vraag? Mail naar <a href="mailto:hello@roll.nl" style={{ color: "inherit", fontWeight: 600 }}>hello@roll.nl</a>.</p>
    </div>
  );
}

// Wat iemand ziet die bij een partner hoort en geen styliste is: het eigen dashboard, de afrekeningen en het account.
export function PartnerHome({ partners, email }: { partners: Partner[]; email: string }) {
  return (
    <Routes>
      <Route index element={<PartnerDashboard slug={partners[0].slug} />} />
      <Route path="partner/:slug" element={<PartnerDashboard />} />
      <Route path="afrekening/:slug/:kw" element={<PartnerAfrekening />} />
      <Route path="account" element={<PartnerAccount email={email} partners={partners} />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
