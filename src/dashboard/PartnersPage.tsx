import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// Partners voor het beheer (alleen beheerders): alle partijen waar Roll mee samenwerkt op één plek, per soort,
// met zoeken. Makelaars, creators en merken komen van roll.nl (edge function partners-beheer, dezelfde cijfers
// als hun eigen dashboard); stylistes uit onze eigen tabellen.

export type Soort = "styliste" | "makelaar" | "creator" | "merk" | "schilder" | "overig";
const SOORTEN: { k: Soort; een: string; meer: string }[] = [
  { k: "styliste", een: "Styliste", meer: "Stylistes" },
  { k: "makelaar", een: "Makelaar", meer: "Makelaars" },
  { k: "creator", een: "Creator", meer: "Creators" },
  { k: "merk", een: "Merk", meer: "Merken" },
];
const soortLabel = (s: string) => SOORTEN.find((x) => x.k === s)?.een ?? (s === "schilder" ? "Schilder" : "Partner");
export const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n || 0);
export const getal = (n: number) => new Intl.NumberFormat("nl-NL").format(n || 0);
/** Alleen de dag: "8 nov", met het jaar erbij als dat niet dit jaar is. */
export const formatDate = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00` : iso);
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("nl-NL", { day: "numeric", month: "short", ...(d.getFullYear() === new Date().getFullYear() ? {} : { year: "numeric" }) });
};

/** Roept een functie aan en geeft de melding van de server terug als het misgaat. */
export async function roep<T>(fn: string, body: Record<string, unknown>): Promise<{ data: T | null; fout: string | null }> {
  const { data, error } = await supabase.functions.invoke(fn, { body });
  if (error) {
    let tekst = "";
    try { tekst = (await (error as { context?: Response }).context?.json())?.error ?? ""; } catch { /* geen leesbare melding */ }
    return { data: null, fout: tekst || "Dat lukte niet. Probeer het over een minuut opnieuw." };
  }
  return { data: data as T, fout: null };
}

const STATUS_LABEL: Record<string, string> = { actief: "Actief", gepauzeerd: "Gepauzeerd", gestopt: "Gestopt" };

interface Kort { kwartaal: string; orders: number; omzet: number; commissie: number; omzetTotaal: number; commissieOpen: number; laatsteOrder: string; kaarten: number; geactiveerd: number }
interface Persoon { naam: string | null; email: string }
export interface WpPartner {
  id: string | null; slug: string; soort: Soort; type: string; naam: string; plaats: string; start: string; actief: boolean;
  afspraken: { kortingscode: string; korting: string; kortingPct: number; commissiePct: number; thuisCode: string };
  links: { voorbeeld?: string; pagina: string; beheer?: string };
  mensen?: Persoon[]; leden?: Persoon[]; kort: Kort;
  // Beheer: de stand van de code, wat er te wijzigen valt en de geschiedenis van de afspraken.
  status?: string; beheerbaar?: boolean; verwijderbaar?: boolean;
  config?: {
    voornamen: string; utmSource: string; oudeCodes: string[]; tarieven: { vanaf: string; commissie: number }[];
    letters?: string; thuisPrijs?: number; thuisVan?: number; geldigMnd?: number; koppelingMnd?: number;
    beelden?: { logo: string; foto: string; blik: string } | null;
  };
  funnel?: { kaarten: number; geactiveerd: number; geboekt: number; thuis: number; klanten: number } | null;
  totaal?: { omzet: number; commissie: number; definitief: number };
  kwartalen?: Kwartaal[];
  orders?: { nr: string; datum: string; kwartaal: string; kw: string; bron: string; advies: string; omzet: number; commissie: number; status: string }[];
  kleuren?: { naam: string; omzet: number; orders: number; liter: number; aantal: number }[];
  producten?: { naam: string; omzet: number; orders: number; liter: number; aantal: number }[];
  bezoek?: { totaal: number; dagen30: number; links: { naam: string; aantal: number }[]; orders: number; metCode: number } | null;
  // Voor het eigen dashboard van de partner.
  voornamen?: string; koppelingMnd?: number; kortingMin?: number;
  aanvraag?: { aantal: number; datum: string } | null;
  roll?: { naam: string; adres: string; kvk: string; btw: string; mail: string; factuurmail: string; btwPct: number };
}
export interface Kwartaal {
  kwartaal: string; label: string; orders: number; omzet: number; commissie: number; open: number; afrekenbaar: string; klaar: boolean;
  uitbetaling: string; keuze: string; gekozenOp?: string; kenmerk: string; bedrag: number; bedragIncl: number; tegoedcode: string; factuurNr: string; afgehandeldOp: string; factuurMailto: string;
}
interface Styliste { id: string; name: string; email: string; active: boolean }
interface Commissie { stylist_id: string | null; verf_excl: number; amount: number; status: string; created_at: string }

/** Eén regel in het overzicht, voor elke soort hetzelfde. */
interface Regel { sleutel: string; soort: Soort; naam: string; sub: string; actief: boolean; omzet: number; open: number; laatst: string; zoek: string; naar: string; meekijken: string }

const kwartaalStart = () => { const d = new Date(); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1); };
const kwartaalNaam = () => { const d = new Date(); return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`; };

export function Tegel({ label, waarde, sub }: { label: string; waarde: string; sub?: string }) {
  return (
    <div className="rd-card-white" style={{ flex: "1 1 150px", minWidth: 0 }}>
      <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.6 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.2, marginTop: 2, fontVariantNumeric: "tabular-nums" }}>{waarde}</div>
      {sub && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// Elke soort een eigen kleur en een eigen icoon, zodat je in een lange lijst meteen ziet wie wat is.
const SOORT_STIJL: Record<string, { achtergrond: string; kleur: string; pad: React.ReactNode }> = {
  // kwast
  styliste: { achtergrond: "var(--rd-pink)", kleur: "var(--rd-aubergine)", pad: <><path d="M18.4 2.6a2 2 0 0 1 3 3L11 16l-4 1 1-4z" /><path d="M7 17c-2 0-3.5 1.5-3.5 3.5 0 .5-.5 1-1.5 1 1.5 1 6 1.5 6-2.5" /></> },
  // huis
  makelaar: { achtergrond: "var(--rd-lime)", kleur: "var(--rd-aubergine)", pad: <><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M10 20v-6h4v6" /></> },
  // ster
  creator: { achtergrond: "var(--rd-aubergine)", kleur: "#fff", pad: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.500l1.2-6L3.300 9.300l6.100-.7z" /> },
  // label
  merk: { achtergrond: "var(--rd-lavender-mid)", kleur: "var(--rd-aubergine)", pad: <><path d="M20.6 13.4l-7.200 7.200a2 2 0 0 1-2.800 0L3 13V3h10l7.600 7.600a2 2 0 0 1 0 2.800z" /><circle cx="7.500" cy="7.500" r="1.300" /></> },
  // verfroller
  schilder: { achtergrond: "var(--rd-beige-result)", kleur: "var(--rd-aubergine)", pad: <><rect x="3" y="3" width="15" height="6" rx="1.500" /><path d="M18 6h3v6h-9v3" /><rect x="10.500" y="15" width="3" height="6" rx="1" /></> },
};

export function SoortChip({ soort }: { soort: string }) {
  const st = SOORT_STIJL[soort] ?? { achtergrond: "var(--rd-lavender)", kleur: "var(--rd-aubergine)", pad: <circle cx="12" cy="12" r="4" /> };
  return (
    <span className="rd-chip" style={{ padding: "3px 9px 3px 7px", fontSize: 11, background: st.achtergrond, color: st.kleur, display: "inline-flex", alignItems: "center", gap: 4 }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.200" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{st.pad}</svg>
      {soortLabel(soort)}
    </span>
  );
}

async function laadStylistes(): Promise<{ stylistes: Styliste[]; commissies: Commissie[] }> {
  const [{ data: st }, { data: co }] = await Promise.all([
    supabase.from("stylists").select("id,name,email,active").order("name"),
    supabase.from("commissions").select("stylist_id,verf_excl,amount,status,created_at"),
  ]);
  return { stylistes: (st as Styliste[]) ?? [], commissies: (co as Commissie[]) ?? [] };
}

function stylisteCijfers(id: string, commissies: Commissie[]) {
  const start = kwartaalStart().toISOString();
  let omzet = 0, open = 0, betaald = 0, laatst = "";
  for (const c of commissies) {
    if (c.stylist_id !== id || c.status === "vervallen") continue;
    if (c.created_at >= start) omzet += Number(c.verf_excl) || 0;
    if (c.status === "uitbetaald") betaald += Number(c.amount) || 0; else open += Number(c.amount) || 0;
    if (c.created_at > laatst) laatst = c.created_at;
  }
  return { omzet, open, betaald, laatst };
}

export function PartnersPage() {
  const [tab, setTab] = useState<Soort | "alle">("alle");
  const [zoek, setZoek] = useState("");
  const [wp, setWp] = useState<WpPartner[] | null>(null);
  const [wpFout, setWpFout] = useState<string | null>(null);
  const [st, setSt] = useState<{ stylistes: Styliste[]; commissies: Commissie[] } | null>(null);
  const [admin, setAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      setAdmin(adm === true);
      if (adm !== true) return;
      laadStylistes().then(setSt);
      const { data, error } = await supabase.functions.invoke("partners-beheer", { body: { action: "lijst" } });
      if (error || !(data as { partners?: WpPartner[] } | null)?.partners) { setWp([]); setWpFout("De makelaars, creators en merken konden niet worden opgehaald van roll.nl. Stylistes staan er wel."); return; }
      setWp((data as { partners: WpPartner[] }).partners);
    })();
  }, []);

  const regels = useMemo<Regel[]>(() => {
    const uit: Regel[] = [];
    for (const s of st?.stylistes ?? []) {
      const c = stylisteCijfers(s.id, st?.commissies ?? []);
      uit.push({ sleutel: `s:${s.id}`, soort: "styliste", naam: s.name, sub: s.email, actief: s.active, omzet: c.omzet, open: c.open, laatst: c.laatst, zoek: `${s.name} ${s.email}`.toLowerCase(), naar: `/dashboard/partners/styliste/${s.id}`, meekijken: `/dashboard?als=${s.id}` });
    }
    for (const p of wp ?? []) {
      const mails = [...(p.mensen ?? []), ...(p.leden ?? [])].map((m) => `${m.naam ?? ""} ${m.email}`).join(" ");
      uit.push({
        sleutel: `p:${p.slug}`, soort: p.soort, naam: p.naam, sub: [p.plaats, p.afspraken.kortingscode ? `code ${p.afspraken.kortingscode}` : ""].filter(Boolean).join(" · "),
        actief: p.actief && (p.status ?? "actief") === "actief", omzet: p.kort.omzet, open: p.kort.commissieOpen, laatst: p.kort.laatsteOrder,
        zoek: `${p.naam} ${p.plaats} ${p.slug} ${p.afspraken.kortingscode} ${p.afspraken.thuisCode} ${mails}`.toLowerCase(), naar: `/dashboard/partners/${p.slug}`,
        meekijken: `/dashboard/partner/${p.slug}`,
      });
    }
    return uit.sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
  }, [st, wp]);

  const term = zoek.trim().toLowerCase();
  const gevonden = regels.filter((r) => !term || term.split(/\s+/).every((t) => r.zoek.includes(t)));
  const zichtbaar = gevonden.filter((r) => tab === "alle" || r.soort === tab);
  const aantal = (k: Soort | "alle") => gevonden.filter((r) => k === "alle" || r.soort === k).length;

  if (admin === null) return <p className="rd-sub">Laden...</p>;
  if (!admin) return <p className="rd-sub">Deze pagina is alleen voor beheerders.</p>;

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="rd-h2" style={{ margin: "0 0 2px" }}>Partners</h1>
          <p className="rd-sub" style={{ margin: 0 }}>Iedereen waar Roll mee samenwerkt. Zoek op naam, plaats, kortingscode of e-mailadres. Met "Kijk mee" zie je het dashboard zoals de partner het zelf ziet.</p>
        </div>
        <Link to="/dashboard/partners/nieuw" className="rd-btn rd-btn-primary" style={{ width: "auto", minHeight: 44, padding: "0 18px", fontSize: 15, textDecoration: "none" }}>Nieuwe partner</Link>
      </div>

      <input className="rd-input" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek een partner" aria-label="Zoek een partner" style={{ margin: "10px 0 12px", background: "#fff" }} />

      <div style={{ display: "flex", gap: 8, marginBottom: 14, flexWrap: "wrap" }} role="tablist" aria-label="Soort partner">
        {([{ k: "alle" as const, meer: "Alle" }, ...SOORTEN]).map((s) => (
          <button key={s.k} role="tab" aria-selected={tab === s.k} className={`rd-plan-chip${tab === s.k ? " is-on" : ""}`} onClick={() => setTab(s.k)}>
            {s.meer} <span style={{ opacity: 0.6, fontWeight: 500 }}>{aantal(s.k)}</span>
          </button>
        ))}
      </div>

      {wpFout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{wpFout}</p>}
      {(!st || !wp) && <p className="rd-sub">Laden...</p>}

      {st && wp && zichtbaar.length === 0 && (
        <p className="rd-sub">{term ? `Niets gevonden voor "${zoek.trim()}".` : tab === "merk" ? "Nog geen merken." : "Nog geen partners in deze soort."}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {zichtbaar.map((r) => (
          <div key={r.sleutel} className="rd-card-white" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            {/* De naam opent de beheerpagina; "Kijk mee" opent het dashboard zoals deze partner het zelf ziet. */}
            <Link to={r.naar} style={{ textDecoration: "none", color: "inherit", minWidth: 0, flex: "1 1 240px", opacity: r.actief ? 1 : 0.55 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{r.naam}</span>
                <SoortChip soort={r.soort} />
                {!r.actief && <span style={{ fontSize: 12, opacity: 0.7 }}>{r.soort === "styliste" ? "Niet actief" : "Code staat uit"}</span>}
              </div>
              {r.sub && <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>{r.sub}</div>}
            </Link>
            <div style={{ display: "flex", gap: 18, fontSize: 13, fontVariantNumeric: "tabular-nums", flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              <span><span style={{ opacity: 0.6 }}>Omzet {kwartaalNaam()}</span> <strong>{euro(r.omzet)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Commissie open</span> <strong>{euro(r.open)}</strong></span>
              <span style={{ opacity: 0.6 }}>{r.laatst ? `Laatste bestelling ${formatDate(r.laatst)}` : "Nog geen bestelling"}</span>
              <Link to={r.meekijken} className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, padding: "0 12px", fontSize: 13, textDecoration: "none" }} title={`Het dashboard zoals ${r.naam} het ziet`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M2 12s3.600-7 10-7 10 7 10 7-3.600 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>
                Kijk mee
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export const rij: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", borderTop: "1px solid var(--rd-line)", padding: "8px 0", flexWrap: "wrap", fontSize: 14 };
export const blokKop = (t: string) => <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>{t}</div>;

/** Eén makelaar, creator of merk: afspraken, cijfers, commissie per kwartaal, bestellingen en mensen. */
export function PartnerDetail() {
  const { slug } = useParams();
  const [p, setP] = useState<WpPartner | null>(null);
  const [fout, setFout] = useState<string | null>(null);

  const laad = useCallback(() => {
    supabase.functions.invoke("partners-beheer", { body: { action: "detail", slug } }).then(({ data, error }) => {
      const partner = (data as { partner?: WpPartner } | null)?.partner;
      if (error || !partner) setFout("Deze partner kon niet worden opgehaald. Alleen beheerders zien deze pagina.");
      else setP(partner);
    });
  }, [slug]);
  useEffect(() => { setP(null); setFout(null); laad(); }, [laad]);

  const terug = <Link to="/dashboard/partners" className="rd-textlink" style={{ textDecoration: "none" }}>← Partners</Link>;
  if (fout) return <div>{terug}<p className="rd-sub">{fout}</p></div>;
  if (!p) return <div>{terug}<p className="rd-sub">Laden...</p></div>;

  const creator = p.type === "creator";
  const orders = p.orders ?? [];

  return (
    <div>
      {terug}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0 2px" }}>
        <h1 className="rd-h2" style={{ margin: 0 }}>{p.naam}</h1>
        <SoortChip soort={p.soort} />
        {p.status && p.status !== "actief" && <span className="rd-chip" style={{ padding: "3px 9px", fontSize: 11, background: "var(--rd-pink)" }}>{STATUS_LABEL[p.status] ?? p.status}: de code staat uit</span>}
      </div>
      <p className="rd-sub" style={{ marginTop: 0 }}>{[p.plaats, p.start ? `Partner sinds ${formatDate(p.start)}` : ""].filter(Boolean).join(" · ")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        <Link className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} to={`/dashboard/partner/${p.slug}`}>Bekijk als partner</Link>
        {p.links.pagina && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.pagina} target="_blank" rel="noreferrer">Pagina voor klanten</a>}
        {p.beheerbaar && <Link className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} to={`/dashboard/partners/${p.slug}/wijzig`}>Wijzigen</Link>}
        {p.links.voorbeeld && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.voorbeeld} target="_blank" rel="noreferrer">Voorbeeld met verzonnen cijfers</a>}
        {p.links.beheer && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.beheer} target="_blank" rel="noreferrer">Beheer in WordPress</a>}
        <Link className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} to="/dashboard/commissie">Commissie en uitbetalen</Link>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Tegel label={`Omzet ${p.kort.kwartaal}`} waarde={euro(p.kort.omzet)} sub={`${getal(p.kort.orders)} bestelling${p.kort.orders === 1 ? "" : "en"}`} />
        <Tegel label={`Commissie ${p.kort.kwartaal}`} waarde={euro(p.kort.commissie)} sub={`${p.afspraken.commissiePct}% over de omzet`} />
        <Tegel label="Commissie nog open" waarde={euro(p.kort.commissieOpen)} sub="Alle kwartalen samen" />
        <Tegel label="Omzet totaal" waarde={euro(p.totaal?.omzet ?? p.kort.omzetTotaal)} sub={p.totaal ? `${euro(p.totaal.commissie)} commissie` : undefined} />
      </div>

      {p.funnel && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <Tegel label="Cadeaukaarten uitgegeven" waarde={getal(p.funnel.kaarten)} />
          <Tegel label="Geactiveerd" waarde={getal(p.funnel.geactiveerd)} />
          <Tegel label="Advies geboekt" waarde={getal(p.funnel.geboekt)} sub={p.funnel.thuis ? `${getal(p.funnel.thuis)} aan huis` : undefined} />
          <Tegel label="Klanten met een bestelling" waarde={getal(p.funnel.klanten)} />
        </div>
      )}

      {p.bezoek && (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <Tegel label="Bezoek via de links" waarde={getal(p.bezoek.totaal)} sub={`${getal(p.bezoek.dagen30)} in de laatste 30 dagen`} />
          <Tegel label="Bestellingen via een link" waarde={getal(p.bezoek.orders ?? 0)} sub={`${getal(p.bezoek.metCode ?? 0)} daarvan met de code`} />
        </div>
      )}

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Afspraken")}
        <div style={{ ...rij, borderTop: 0, paddingTop: 0 }}><span>Kortingscode</span><strong>{p.afspraken.kortingscode || "geen"}</strong></div>
        <div style={rij}><span>Korting voor de klant</span><span>{p.afspraken.korting}</span></div>
        <div style={rij}><span>Commissie voor de partner</span><span>{p.afspraken.commissiePct}%</span></div>
        {p.afspraken.thuisCode && <div style={rij}><span>Code voor advies aan huis</span><strong>{p.afspraken.thuisCode}</strong></div>}
        {p.afspraken.thuisCode && !!p.config?.thuisVan && <div style={rij}><span>Kleuradvies aan huis</span><span>{euro(p.config.thuisPrijs ?? 0)} in plaats van {euro(p.config.thuisVan)}</span></div>}
        {!creator && !!p.config?.geldigMnd && <div style={rij}><span>Cadeaukaart en koppeling</span><span style={{ textAlign: "right" }}>kaart {p.config.geldigMnd} maanden geldig · klant {p.config.koppelingMnd} maanden gekoppeld</span></div>}
        {(p.config?.tarieven ?? []).length > 1 && <div style={rij}><span>Commissie door de tijd</span><span style={{ textAlign: "right" }}>{(p.config?.tarieven ?? []).map((t) => `${t.commissie}% vanaf ${formatDate(t.vanaf)}`).join(" · ")}</span></div>}
        {(p.config?.oudeCodes ?? []).length > 0 && <div style={rij}><span>Eerdere codes</span><span style={{ textAlign: "right" }}>{(p.config?.oudeCodes ?? []).join(", ")} <span style={{ opacity: 0.6, fontSize: 13 }}>· staan uit, tellen nog mee</span></span></div>}
        {creator && p.config?.utmSource && <div style={rij}><span>Link om te delen</span><span style={{ textAlign: "right", overflowWrap: "anywhere" }}>roll.nl/?utm_source={p.config.utmSource} <span style={{ opacity: 0.6, fontSize: 13 }}>· zet er &amp;utm_content=naam-van-de-post achter om per post te meten</span></span></div>}
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Commissie per kwartaal")}
        {(p.kwartalen ?? []).map((k, i) => (
          <div key={k.kwartaal} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <span><strong>{k.label}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>· {getal(k.orders)} bestelling{k.orders === 1 ? "" : "en"}{k.open ? ` · ${k.open} nog in de retourtermijn` : ""}</span></span>
            <span style={{ display: "flex", gap: 14, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
              <span style={{ opacity: 0.7 }}>Omzet {euro(k.omzet)}</span>
              <strong>{euro(k.commissie)}</strong>
              <span style={{ opacity: 0.7 }}>{k.uitbetaling === "afgehandeld" ? "Afgehandeld" : k.uitbetaling === "factuur" ? "Factuur binnen" : k.uitbetaling === "aangevraagd" ? `Aangevraagd${k.keuze === "verf" ? " als verftegoed" : ""}` : `Afrekenen vanaf ${formatDate(k.afrekenbaar)}`}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop(`Bestellingen (${getal(orders.length)})`)}
        {orders.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Nog geen bestellingen via deze partner.</p> : orders.slice(0, 30).map((o, i) => (
          <div key={o.nr + i} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <span>#{o.nr} <span style={{ opacity: 0.6, fontSize: 13 }}>· {formatDate(o.datum)} · {o.bron}{o.advies ? ` · advies ${o.advies}` : ""}</span></span>
            <span style={{ display: "flex", gap: 14, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
              <span style={{ opacity: 0.7 }}>{euro(o.omzet)}</span>
              <strong>{euro(o.commissie)}</strong>
              <span style={{ opacity: 0.7 }}>{o.status}</span>
            </span>
          </div>
        ))}
        {orders.length > 30 && <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 13 }}>De laatste 30 van {getal(orders.length)}.</p>}
      </div>

      {creator && ((p.kleuren ?? []).length > 0 || (p.producten ?? []).length > 0) && (
        <div className="rd-card-white" style={{ marginBottom: 10 }}>
          {blokKop("Meest verkocht")}
          {(p.kleuren ?? []).slice(0, 5).map((k, i) => (
            <div key={"k" + k.naam} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}><span>{k.naam} <span style={{ opacity: 0.6, fontSize: 13 }}>· {getal(k.liter)} liter</span></span><span>{euro(k.omzet)}</span></div>
          ))}
          {(p.producten ?? []).slice(0, 5).map((k) => (
            <div key={"p" + k.naam} style={rij}><span>{k.naam} <span style={{ opacity: 0.6, fontSize: 13 }}>· {getal(k.aantal)} stuks</span></span><span>{euro(k.omzet)}</span></div>
          ))}
        </div>
      )}

      {(p.bezoek?.links ?? []).length > 0 && (
        <div className="rd-card-white" style={{ marginBottom: 10 }}>
          {blokKop("Bezoek per link")}
          {(p.bezoek?.links ?? []).map((l, i) => (
            <div key={l.naam} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}><span>{l.naam}</span><span style={{ fontVariantNumeric: "tabular-nums" }}>{getal(l.aantal)}</span></div>
          ))}
        </div>
      )}

      {!creator && p.config?.beelden && <Beelden p={p} herlaad={laad} />}
      {!creator && p.config?.letters && <Kaartcodes p={p} herlaad={laad} />}

      <Toegang p={p} herlaad={laad} />

      {p.verwijderbaar && <Verwijder p={p} />}
    </div>
  );
}

/** Maakt van een gekozen foto een compact bestand: hooguit `max` pixels breed of hoog. Een png blijft png (doorzichtig logo). */
async function verklein(bestand: File, max: number): Promise<string> {
  const png = bestand.type === "image/png";
  const beeld = await createImageBitmap(bestand);
  const schaal = Math.min(1, max / Math.max(beeld.width, beeld.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(beeld.width * schaal);
  canvas.height = Math.round(beeld.height * schaal);
  canvas.getContext("2d")!.drawImage(beeld, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL(png ? "image/png" : "image/jpeg", 0.86).split(",")[1] ?? "";
}

const BEELDEN: { k: "logo" | "foto" | "blik"; naam: string; uitleg: string; max: number }[] = [
  { k: "logo", naam: "Logo", uitleg: "Onder de naam bij \"Van wie je cadeau komt\". Het liefst een png met doorzichtige achtergrond.", max: 600 },
  { k: "foto", naam: "Foto van het team", uitleg: "Liggend. Staat groot bij \"Van wie je cadeau komt\" en klein bovenaan, in zwart-wit.", max: 1600 },
  { k: "blik", naam: "Foto van het cadeaublik", uitleg: "Vierkant. Staat bovenaan de cadeaupagina.", max: 1600 },
];

/** De beelden op de cadeaupagina van een makelaar. Een nieuw beeld staat er direct. */
function Beelden({ p, herlaad }: { p: WpPartner; herlaad: () => void }) {
  const [bezig, setBezig] = useState<string | null>(null);
  const [bericht, setBericht] = useState<string | null>(null);
  const kies = async (soort: (typeof BEELDEN)[number], bestand: File | undefined) => {
    if (!bestand) return;
    setBericht(null);
    if (!["image/jpeg", "image/png", "image/webp"].includes(bestand.type)) { setBericht("Kies een jpg-, png- of webp-afbeelding."); return; }
    setBezig(soort.k);
    try {
      const data = await verklein(bestand, soort.max);
      const { fout } = await roep("partners-beheer", { action: "partner_beeld", slug: p.slug, soort: soort.k, data });
      setBericht(fout ?? `${soort.naam} is geplaatst.`);
      if (!fout) herlaad();
    } catch { setBericht("Dit bestand kon niet worden gelezen. Kies een andere afbeelding."); }
    setBezig(null);
  };
  return (
    <div className="rd-card-white" style={{ marginBottom: 10 }}>
      {blokKop("Beelden op de cadeaupagina")}
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {BEELDEN.map((b) => {
          const url = p.config?.beelden?.[b.k] ?? "";
          return (
            <div key={b.k} style={{ flex: "1 1 200px", minWidth: 0 }}>
              <div style={{ height: 120, borderRadius: 12, background: b.k === "logo" ? "var(--rd-aubergine)" : "var(--rd-grey-light)", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                {url ? <img src={url} alt={b.naam} style={b.k === "logo" ? { maxWidth: "60%", maxHeight: 60 } : { width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 13, opacity: 0.6 }}>Nog geen beeld</span>}
              </div>
              <div style={{ fontWeight: 700, fontSize: 14, marginTop: 8 }}>{b.naam}</div>
              <div style={{ fontSize: 12, opacity: 0.65, margin: "2px 0 8px" }}>{b.uitleg}</div>
              <label className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", minHeight: 36, padding: "0 12px", fontSize: 13, cursor: "pointer", opacity: bezig ? 0.5 : 1 }}>
                {bezig === b.k ? "Bezig..." : url ? "Vervang" : "Kies een bestand"}
                <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} disabled={!!bezig} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; kies(b, f); }} />
              </label>
            </div>
          );
        })}
      </div>
      {bericht && <p style={{ margin: "10px 0 0", color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }} role="status">{bericht}</p>}
      {p.links.pagina && <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Bekijk het resultaat op <a href={p.links.pagina} target="_blank" rel="noreferrer" style={{ color: "inherit", fontWeight: 600 }}>{p.links.pagina.replace(/^https?:\/\//, "")}</a>.</p>}
    </div>
  );
}

/** Nieuwe cadeaukaartcodes voor een makelaar. De codes zijn alleen direct na het maken te zien en te bewaren. */
function Kaartcodes({ p, herlaad }: { p: WpPartner; herlaad: () => void }) {
  const [aantal, setAantal] = useState(25);
  const [test, setTest] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [codes, setCodes] = useState<{ code: string; link: string }[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [blok, setBlok] = useState("");
  const [blokBericht, setBlokBericht] = useState<string | null>(null);
  const blokkeer = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = blok.trim().toUpperCase();
    if (!code || !window.confirm(`Kaartcode ${code} blokkeren? De kaart is daarna niet meer te activeren.`)) return;
    setBezig(true); setBlokBericht(null);
    const { data, fout } = await roep<{ al?: boolean }>("partners-beheer", { action: "code_blokkeren", slug: p.slug, code });
    setBezig(false);
    setBlokBericht(fout ?? (data?.al ? `${code} was al geblokkeerd.` : `${code} is geblokkeerd.`));
    if (!fout) setBlok("");
  };
  const maak = async () => {
    setBezig(true); setFout(null);
    const { data, fout } = await roep<{ codes: { code: string; link: string }[] }>("partners-beheer", { action: "partner_codes", slug: p.slug, aantal, test });
    setBezig(false);
    if (fout || !data?.codes) { setFout(fout ?? "Codes maken lukte niet."); return; }
    setCodes(data.codes); herlaad();
  };
  const bewaar = () => {
    if (!codes) return;
    const csv = "code;qr_link\n" + codes.map((c) => `${c.code};${c.link}`).join("\n") + "\n";
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = `roll-${p.slug}-cadeaucodes-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const klein: React.CSSProperties = { width: "auto", minHeight: 44, padding: "0 18px", fontSize: 15 };
  return (
    <div className="rd-card-white" style={{ marginBottom: 10 }}>
      {blokKop("Cadeaukaarten")}
      <p style={{ fontSize: 14, margin: "0 0 10px" }}>
        {getal(p.funnel?.kaarten ?? 0)} kaarten in omloop, {getal(p.funnel?.geactiveerd ?? 0)} geactiveerd. Elke kaart heeft een eigen code die begint met {p.config?.letters}.
      </p>
      {codes ? (
        <>
          <p style={{ fontSize: 14, fontWeight: 600, margin: "0 0 8px" }}>{getal(codes.length)} nieuwe codes. Bewaar ze nu: daarna zijn ze niet meer op te vragen.</p>
          <textarea readOnly rows={Math.min(8, codes.length)} value={codes.map((c) => c.code).join("\n")} className="rd-input" style={{ height: "auto", padding: 12, fontFamily: "monospace", fontSize: 14, background: "#fff" }} aria-label="Nieuwe kaartcodes" />
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
            <button className="rd-btn rd-btn-primary" style={klein} onClick={bewaar}>Bewaar als bestand met QR-links</button>
            <button className="rd-btn rd-btn-outline" style={klein} onClick={() => setCodes(null)}>Klaar</button>
          </div>
        </>
      ) : (
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ fontSize: 14 }} htmlFor="kc-aantal">Aantal</label>
          <select id="kc-aantal" className="rd-input" style={{ width: "auto", minWidth: 84, background: "#fff" }} value={aantal} onChange={(e) => setAantal(Number(e.target.value))}>
            {[5, 10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <button className="rd-btn rd-btn-primary" style={klein} disabled={bezig} onClick={maak}>{bezig ? "Bezig..." : "Maak codes"}</button>
          <label style={{ fontSize: 13, display: "inline-flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={test} onChange={(e) => setTest(e.target.checked)} /> Proefcodes (tellen niet mee)</label>
        </div>
      )}
      {fout && <p style={{ margin: "10px 0 0", color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }} role="alert">{fout}</p>}
      <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Het bestand bevat per kaart de code en de link voor de QR-code.</p>
      <form onSubmit={blokkeer} style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 12, paddingTop: 12, borderTop: "1px solid var(--rd-line)" }}>
        <label style={{ fontSize: 14 }} htmlFor="kc-blok">Kaart zoekgeraakt?</label>
        <input id="kc-blok" className="rd-input" style={{ width: 190, background: "#fff", textTransform: "uppercase", fontFamily: "monospace" }} value={blok} onChange={(e) => setBlok(e.target.value)} placeholder={`${p.config?.letters ?? "AB"}-XXXX-XXXX`} maxLength={14} autoComplete="off" spellCheck={false} />
        <button type="submit" className="rd-btn rd-btn-outline" style={klein} disabled={bezig || !blok.trim()}>Blokkeer deze code</button>
      </form>
      {blokBericht && <p style={{ margin: "8px 0 0", color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }} role="status">{blokBericht}</p>}
    </div>
  );
}

/** Een proefpartner of een vergissing weghalen. Kan alleen zolang er geen bestellingen zijn. */
function Verwijder({ p }: { p: WpPartner }) {
  const navigate = useNavigate();
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const weg = async () => {
    if (!window.confirm(`${p.naam} verwijderen? De kortingscode ${p.afspraken.kortingscode.toUpperCase()} verdwijnt uit de webshop.`)) return;
    setBezig(true); setFout(null);
    const { fout } = await roep("partners-beheer", { action: "partner_verwijderen", slug: p.slug });
    setBezig(false);
    if (fout) setFout(fout); else navigate("/dashboard/partners");
  };
  return (
    <p className="rd-sub" style={{ margin: "14px 0 0", fontSize: 13 }}>
      Proefpartner of een vergissing? <button className="rd-textlink" style={{ minHeight: 0, fontSize: 13 }} disabled={bezig} onClick={weg}>{bezig ? "Bezig..." : "Verwijder deze partner"}</button>. Dat kan zolang er geen bestellingen zijn.
      {fout && <span style={{ display: "block", color: "var(--rd-pink-dark)", fontWeight: 600, marginTop: 6 }}>{fout}</span>}
    </p>
  );
}

const vandaag = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const alleenCode = (v: string) => v.replace(/[^A-Za-z0-9]/g, "").toLowerCase().slice(0, 30);
const veldKop: React.CSSProperties = { display: "block", fontSize: 14, fontWeight: 700, marginBottom: 4 };
const veldUitleg: React.CSSProperties = { fontSize: 13, opacity: 0.65, margin: "4px 0 0" };

const alleenAdres = (v: string) => v.toLowerCase().normalize("NFD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

/** Een makelaar, creator of merk aanmaken of wijzigen. De webshop maakt de codes en past ze aan. */
export function PartnerForm() {
  const { slug } = useParams();
  const nieuw = !slug;
  const navigate = useNavigate();
  const [oud, setOud] = useState<WpPartner | null>(null);
  const [laadFout, setLaadFout] = useState<string | null>(null);
  const [soort, setSoort] = useState<"makelaar" | "creator" | "merk">("creator");
  const [plaats, setPlaats] = useState("");
  const [adres, setAdres] = useState("");
  const [adresZelf, setAdresZelf] = useState(false);
  const [letters, setLetters] = useState("");
  const [lettersZelf, setLettersZelf] = useState(false);
  const [thuisPrijs, setThuisPrijs] = useState("100");
  const [naam, setNaam] = useState("");
  const [voornamen, setVoornamen] = useState("");
  const [code, setCode] = useState("");
  const [korting, setKorting] = useState("10");
  const [commissie, setCommissie] = useState("10");
  const [vanaf, setVanaf] = useState(vandaag());
  const [start, setStart] = useState(vandaag());
  const [status, setStatus] = useState("actief");
  const [tag, setTag] = useState("");
  const [tagZelf, setTagZelf] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    if (nieuw) return;
    supabase.functions.invoke("partners-beheer", { body: { action: "detail", slug } }).then(({ data, error }) => {
      const p = (data as { partner?: WpPartner } | null)?.partner;
      if (error || !p) { setLaadFout("Deze partner kon niet worden opgehaald."); return; }
      setOud(p);
      setSoort(p.type === "makelaar" ? "makelaar" : p.soort === "merk" ? "merk" : "creator");
      setPlaats(p.plaats ?? ""); setThuisPrijs(String(p.config?.thuisPrijs ?? 100));
      setNaam(p.naam); setVoornamen(p.config?.voornamen ?? ""); setCode(p.afspraken.kortingscode);
      setKorting(String(p.afspraken.kortingPct)); setCommissie(String(p.afspraken.commissiePct));
      setStatus(p.status ?? "actief"); setTag(p.config?.utmSource ?? "");
    });
  }, [nieuw, slug]);

  const terug = <Link to={nieuw ? "/dashboard/partners" : `/dashboard/partners/${slug}`} className="rd-textlink" style={{ textDecoration: "none" }}>← {nieuw ? "Partners" : "Terug"}</Link>;
  if (laadFout) return <div>{terug}<p className="rd-sub">{laadFout}</p></div>;
  if (!nieuw && !oud) return <div>{terug}<p className="rd-sub">Laden...</p></div>;
  if (oud && !oud.beheerbaar) return <div>{terug}<p className="rd-sub">Deze partner is hier niet te wijzigen.</p></div>;

  const k = Number(korting.replace(",", ".")) || 0;
  const c = Number(commissie.replace(",", ".")) || 0;
  const codeAnders = !!oud && alleenCode(code) !== oud.afspraken.kortingscode.toLowerCase();
  const commissieAnders = !!oud && Math.abs(c - oud.afspraken.commissiePct) > 0.001;
  const tagNu = tagZelf || !nieuw ? tag : alleenCode(naam);
  const makelaar = soort === "makelaar";
  const adresNu = adresZelf ? adres : alleenAdres(naam);
  const lettersNu = lettersZelf ? letters : adresNu.replace(/[^a-z]/g, "").slice(0, 2).toUpperCase();

  const bewaar = async (e: React.FormEvent) => {
    e.preventDefault();
    setBezig(true); setFout(null);
    const { data, fout } = await roep<{ slug: string }>("partners-beheer", {
      action: "partner_opslaan", slug: slug ?? "", soort, naam: naam.trim(), voornamen: voornamen.trim(), kortingscode: alleenCode(code),
      korting: k, commissie: c, commissieVanaf: commissieAnders ? vanaf : "", start: nieuw ? start : "", status, utmSource: nieuw && !makelaar ? tagNu : "",
      plaats: plaats.trim(), ...(makelaar ? { thuisPrijs: thuisPrijs.replace(",", "."), ...(nieuw ? { adres: adresNu, letters: lettersNu } : {}) } : {}),
    });
    setBezig(false);
    if (fout || !data?.slug) { setFout(fout ?? "Opslaan lukte niet."); return; }
    navigate(`/dashboard/partners/${data.slug}`);
  };

  const veld: React.CSSProperties = { background: "#fff" };
  return (
    <form onSubmit={bewaar} style={{ maxWidth: 620 }}>
      {terug}
      <h1 className="rd-h2" style={{ margin: "8px 0 2px" }}>{nieuw ? "Nieuwe partner" : `${oud?.naam} wijzigen`}</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>{nieuw ? "Een makelaar met cadeaukaarten en een cadeaupagina, of een creator of merk met een eigen kortingscode. Allemaal met commissie." : "Wijzigingen gelden direct in de webshop."}</p>

      <div className="rd-card-white" style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <span style={veldKop}>Soort</span>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} role="radiogroup" aria-label="Soort partner">
            {(nieuw ? (["makelaar", "creator", "merk"] as const) : makelaar ? (["makelaar"] as const) : (["creator", "merk"] as const)).map((x) => (
              <button type="button" key={x} role="radio" aria-checked={soort === x} className={`rd-plan-chip${soort === x ? " is-on" : ""}`} onClick={() => { setSoort(x); if (nieuw && (x === "makelaar") !== (soort === "makelaar")) { setKorting(x === "makelaar" ? "5" : "10"); setCommissie(x === "makelaar" ? "5" : "10"); } }}>{x === "makelaar" ? "Makelaar" : x === "creator" ? "Creator" : "Merk"}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={veldKop} htmlFor="pf-naam">Naam</label>
          <input id="pf-naam" className="rd-input" style={veld} value={naam} onChange={(e) => setNaam(e.target.value)} maxLength={60} required autoComplete="off" />
        </div>
        <div>
          <label style={veldKop} htmlFor="pf-aanhef">Aanhef in het dashboard</label>
          <input id="pf-aanhef" className="rd-input" style={veld} value={voornamen} onChange={(e) => setVoornamen(e.target.value)} maxLength={60} placeholder={naam || "Bijvoorbeeld de voornamen"} autoComplete="off" />
          <p style={veldUitleg}>{makelaar ? `De voornamen. Het dashboard opent met "Hoi ${voornamen.trim() || naam.trim() || "..."}" en op de cadeaupagina staat "Cadeau van ${voornamen.trim() || naam.trim() || "..."}".` : `Het dashboard opent met "Hoi ${voornamen.trim() || naam.trim() || "..."}".`}</p>
        </div>
        <div>
          <label style={veldKop} htmlFor="pf-plaats">Plaats{makelaar ? "" : " (mag leeg)"}</label>
          <input id="pf-plaats" className="rd-input" style={veld} value={plaats} onChange={(e) => setPlaats(e.target.value)} maxLength={60} autoComplete="off" />
        </div>
      </div>

      {makelaar && (
        <div className="rd-card-white" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 16 }}>
          {nieuw && (
            <>
              <div>
                <label style={veldKop} htmlFor="pf-adres">Adres van de cadeaupagina</label>
                <input id="pf-adres" className="rd-input" style={{ ...veld, fontFamily: "monospace" }} value={adresNu} onChange={(e) => { setAdresZelf(true); setAdres(alleenAdres(e.target.value)); }} maxLength={40} required autoComplete="off" spellCheck={false} />
                <p style={veldUitleg}>De klant activeert het cadeau op roll.nl/makelaar/{adresNu || "naam"}/. Dit adres staat in de QR-codes op de kaarten en kan later niet meer worden gewijzigd.</p>
              </div>
              <div>
                <label style={veldKop} htmlFor="pf-letters">Letters van de kaartcodes</label>
                <input id="pf-letters" className="rd-input" style={{ ...veld, maxWidth: 120, textTransform: "uppercase", fontFamily: "monospace" }} value={lettersNu} onChange={(e) => { setLettersZelf(true); setLetters(e.target.value.replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase()); }} minLength={2} maxLength={3} required autoComplete="off" />
                <p style={veldUitleg}>Elke kaartcode begint hiermee, bijvoorbeeld {lettersNu || "AB"}-K7M4-XR2P. Ligt daarna vast.</p>
              </div>
            </>
          )}
          <div>
            <label style={veldKop} htmlFor="pf-thuis">Kleuradvies aan huis: prijs voor de klant (€)</label>
            <input id="pf-thuis" className="rd-input" style={{ ...veld, maxWidth: 160 }} inputMode="decimal" value={thuisPrijs} onChange={(e) => setThuisPrijs(e.target.value)} required />
            <p style={veldUitleg}>Normaal € {oud?.config?.thuisVan ?? 175}. Het verschil is een cadeau van de makelaar, met een eigen code die de webshop aanmaakt. Het online kleuradvies op de cadeaukaart is altijd gratis voor de klant.</p>
          </div>
        </div>
      )}

      <div className="rd-card-white" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 16 }}>
        <div>
          <label style={veldKop} htmlFor="pf-code">Kortingscode</label>
          <input id="pf-code" className="rd-input" style={{ ...veld, textTransform: "uppercase", fontFamily: "monospace" }} value={code} onChange={(e) => setCode(alleenCode(e.target.value))} minLength={4} maxLength={30} required autoComplete="off" spellCheck={false} />
          <p style={veldUitleg}>{codeAnders
            ? `De oude code ${oud!.afspraken.kortingscode.toUpperCase()} gaat uit. Bestellingen die ermee zijn gedaan blijven meetellen voor de commissie.`
            : makelaar
              ? "4 tot 30 letters en cijfers. Deze code staat op het kaartje in het cadeaublik en mag ook los worden gedeeld: korting op verf en materialen, niet op kleuradvies, niet te combineren met andere codes."
              : "4 tot 30 letters en cijfers. De webshop maakt de code zelf aan: op alle producten, niet op kleuradvies en verzending, niet te combineren met andere codes."}</p>
        </div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div style={{ flex: "1 1 180px" }}>
            <label style={veldKop} htmlFor="pf-korting">Korting voor de klant (%)</label>
            <input id="pf-korting" className="rd-input" style={veld} inputMode="decimal" value={korting} onChange={(e) => setKorting(e.target.value)} required />
          </div>
          <div style={{ flex: "1 1 180px" }}>
            <label style={veldKop} htmlFor="pf-commissie">Commissie voor de partner (%)</label>
            <input id="pf-commissie" className="rd-input" style={veld} inputMode="decimal" value={commissie} onChange={(e) => setCommissie(e.target.value)} required />
          </div>
        </div>
        <p style={{ ...veldUitleg, margin: 0, ...(k > 10 ? { opacity: 1, color: "var(--rd-pink-dark)", fontWeight: 600 } : {}) }}>
          {k > 20 ? "Let op: dit is meer dan Black Friday (20%), de hoogste korting van Roll."
            : k > 10 ? "Let op: dit is meer dan de 10% van Luz and Moon. Black Friday is 20%."
            : "Ter vergelijking: sampleklanten krijgen € 10, Arens geeft 5%, Luz and Moon 10% en Black Friday is 20%."}
        </p>
        {commissieAnders && (
          <div>
            <label style={veldKop} htmlFor="pf-vanaf">Nieuwe commissie geldt vanaf</label>
            <input id="pf-vanaf" className="rd-input" style={{ ...veld, maxWidth: 220 }} type="date" value={vanaf} min={vandaag()} onChange={(e) => setVanaf(e.target.value)} required />
            <p style={veldUitleg}>Bestellingen van voor die datum houden {oud!.afspraken.commissiePct}%.</p>
          </div>
        )}
        {nieuw && (
          <div>
            <label style={veldKop} htmlFor="pf-start">Startdatum</label>
            <input id="pf-start" className="rd-input" style={{ ...veld, maxWidth: 220 }} type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
            <p style={veldUitleg}>Bestellingen vanaf deze datum tellen mee.</p>
          </div>
        )}
      </div>

      <div className="rd-card-white" style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 16 }}>
        {nieuw && makelaar ? (
          <p style={{ ...veldUitleg, margin: 0 }}>Een cadeaukaart is 12 maanden geldig en een klant blijft 12 maanden aan de makelaar gekoppeld. Na het aanmaken plaats je op de pagina van de partner het logo en de foto's, maak je de kaartcodes en geef je mensen toegang.</p>
        ) : nieuw ? (
          <div>
            <label style={veldKop} htmlFor="pf-tag">Naam in de links</label>
            <input id="pf-tag" className="rd-input" style={{ ...veld, fontFamily: "monospace" }} value={tagNu} onChange={(e) => { setTagZelf(true); setTag(alleenCode(e.target.value)); }} maxLength={40} autoComplete="off" spellCheck={false} />
            <p style={veldUitleg}>Voor het meten van bezoek: de partner deelt links als roll.nl/?utm_source={tagNu || "naam"}. Dit kan later niet meer worden gewijzigd.</p>
          </div>
        ) : (
          <div>
            <label style={veldKop} htmlFor="pf-status">Stand</label>
            <select id="pf-status" className="rd-input" style={{ ...veld, maxWidth: 320 }} value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="actief">Actief: de code werkt</option>
              <option value="gepauzeerd">Gepauzeerd: de code staat tijdelijk uit</option>
              <option value="gestopt">Gestopt: de code staat uit</option>
            </select>
            <p style={veldUitleg}>Bij gepauzeerd en gestopt {makelaar ? "werken de kortingscode en de code voor aan huis niet voor klanten. Cadeaukaarten die al zijn uitgedeeld blijven geldig: dat cadeau is van de klant." : "werkt de code niet voor klanten."} De cijfers en de commissie blijven staan en de partner kan blijven inloggen om af te rekenen.</p>
          </div>
        )}
      </div>

      {fout && <p style={{ margin: "12px 0 0", color: "var(--rd-pink-dark)", fontWeight: 600 }} role="alert">{fout}</p>}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 14 }}>
        <button type="submit" className="rd-btn rd-btn-primary" style={{ width: "auto", padding: "0 24px" }} disabled={bezig}>{bezig ? "Bezig..." : nieuw ? "Maak de partner aan" : "Sla op"}</button>
        <Link to={nieuw ? "/dashboard/partners" : `/dashboard/partners/${slug}`} className="rd-btn rd-btn-outline" style={{ width: "auto", padding: "0 24px", textDecoration: "none" }}>Annuleer</Link>
      </div>
      {nieuw && !makelaar && <p className="rd-sub" style={{ fontSize: 13 }}>Na het aanmaken geef je op de pagina van de partner mensen toegang tot het dashboard.</p>}
    </form>
  );
}

/** Wie er bij deze partner in het dashboard mag: toegang geven (met een uitnodiging per mail), opnieuw uitnodigen en intrekken. */
function Toegang({ p, herlaad }: { p: WpPartner; herlaad: () => void }) {
  const [naam, setNaam] = useState("");
  const [email, setEmail] = useState("");
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState<string | null>(null);
  const leden = p.leden ?? [];
  // Accounts op roll.nl van voor de verhuizing, die nog niet in het dashboard staan.
  const oud = (p.mensen ?? []).filter((m) => !leden.some((l) => l.email.toLowerCase() === m.email.toLowerCase()));

  const doe = async (action: string, adres: string, voornaam: string, klaar: (verstuurd: boolean) => string) => {
    setBezig(true); setBericht(null);
    const { data, error } = await supabase.functions.invoke("partners-beheer", { body: { action, slug: p.slug, email: adres, naam: voornaam } });
    setBezig(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) { setBericht("Dat lukte niet. Controleer het e-mailadres en probeer het opnieuw."); return; }
    setBericht(klaar((data as { verstuurd?: boolean }).verstuurd !== false));
    herlaad();
  };
  const uitnodiging = (adres: string) => (verstuurd: boolean) => verstuurd ? `De uitnodiging is gemaild naar ${adres}.` : `${adres} heeft toegang, maar de mail versturen lukte niet. Probeer "Stuur uitnodiging opnieuw".`;
  const klein: React.CSSProperties = { minHeight: 36, padding: "0 12px", fontSize: 13 };

  return (
    <div className="rd-card-white">
      {blokKop("Mensen met toegang")}
      {leden.length === 0 && <p className="rd-sub" style={{ margin: "0 0 4px" }}>Nog niemand. Geef hieronder iemand van {p.naam} toegang.</p>}
      {leden.map((m, i) => (
        <div key={m.email} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
          <span>{m.naam || m.email} {m.naam && m.naam.toLowerCase() !== m.email.toLowerCase() && <span style={{ opacity: 0.6, fontSize: 13 }}>· {m.email}</span>}</span>
          <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            <button className="rd-plan-chip" style={klein} disabled={bezig} onClick={() => doe("lid_uitnodigen", m.email, m.naam ?? "", uitnodiging(m.email))}>Stuur uitnodiging opnieuw</button>
            <button className="rd-plan-chip" style={klein} disabled={bezig} onClick={() => { if (window.confirm(`Toegang van ${m.email} intrekken?`)) doe("lid_verwijderen", m.email, "", () => `De toegang van ${m.email} is ingetrokken.`); }}>Intrekken</button>
          </span>
        </div>
      ))}
      {oud.map((m) => (
        <div key={"oud" + m.email} style={rij}>
          <span>{m.naam && m.naam.toLowerCase() !== m.email.toLowerCase() ? `${m.naam} · ` : ""}{m.email} <span style={{ opacity: 0.6, fontSize: 13 }}>· had een account op roll.nl, nog niet uitgenodigd</span></span>
          <button className="rd-plan-chip" style={klein} disabled={bezig} onClick={() => { setEmail(m.email); setNaam(m.naam && m.naam.toLowerCase() !== m.email.toLowerCase() ? m.naam.split(" ")[0] : ""); }}>Vul in</button>
        </div>
      ))}

      <form
        onSubmit={(e) => { e.preventDefault(); const adres = email.trim().toLowerCase(); doe("lid_toevoegen", adres, naam.trim(), uitnodiging(adres)).then(() => { setEmail(""); setNaam(""); }); }}
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 14 }}
      >
        <input className="rd-input" style={{ flex: "1 1 130px", minWidth: 0, background: "#fff" }} value={naam} onChange={(e) => setNaam(e.target.value)} placeholder="Voornaam" aria-label="Voornaam" autoComplete="off" />
        <input className="rd-input" style={{ flex: "2 1 200px", minWidth: 0, background: "#fff" }} type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mailadres" aria-label="E-mailadres" autoComplete="off" required />
        <button type="submit" className="rd-btn rd-btn-primary" style={{ width: "auto", minHeight: 50, padding: "0 18px", fontSize: 15 }} disabled={bezig}>{bezig ? "Bezig..." : "Geef toegang en mail de uitnodiging"}</button>
      </form>
      {bericht && <p style={{ margin: "10px 0 0", color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }} role="status">{bericht}</p>}
      <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Wie toegang krijgt, ontvangt een mail met een link om een wachtwoord te kiezen en logt daarna in op roll.nl/dashboard. De link werkt een uur; daarna kan diegene zelf een nieuwe aanvragen via "Wachtwoord vergeten?".</p>
    </div>
  );
}

/** Eén styliste vanuit het partneroverzicht: cijfers en de weg naar haar werkplek. */
export function StylisteDetail() {
  const { id } = useParams();
  const [d, setD] = useState<{ stylistes: Styliste[]; commissies: Commissie[] } | null>(null);
  const [gesprekken, setGesprekken] = useState<number | null>(null);

  useEffect(() => {
    laadStylistes().then(setD);
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("stylist_id", id!).eq("status", "confirmed").gte("start_at", kwartaalStart().toISOString())
      .then(({ count }) => setGesprekken(count ?? 0));
  }, [id]);

  const terug = <Link to="/dashboard/partners" className="rd-textlink" style={{ textDecoration: "none" }}>← Partners</Link>;
  if (!d) return <div>{terug}<p className="rd-sub">Laden...</p></div>;
  const s = d.stylistes.find((x) => x.id === id);
  if (!s) return <div>{terug}<p className="rd-sub">Deze styliste is niet gevonden.</p></div>;
  const c = stylisteCijfers(s.id, d.commissies);
  const knop: React.CSSProperties = { display: "inline-flex", alignItems: "center", textDecoration: "none" };

  return (
    <div>
      {terug}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", margin: "8px 0 2px" }}>
        <h1 className="rd-h2" style={{ margin: 0 }}>{s.name}</h1>
        <SoortChip soort="styliste" />
        {!s.active && <span style={{ fontSize: 13, opacity: 0.7 }}>Niet actief</span>}
      </div>
      <p className="rd-sub" style={{ marginTop: 0 }}>{s.email}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        <Link className="rd-plan-chip" style={knop} to={`/dashboard?als=${s.id}`}>Bekijk als {s.name.split(" ")[0]}</Link>
        <Link className="rd-plan-chip" style={knop} to="/dashboard/commissie">Commissie</Link>
        <Link className="rd-plan-chip" style={knop} to="/dashboard/adviseurs">Beheren</Link>
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <Tegel label={`Gesprekken ${kwartaalNaam()}`} waarde={gesprekken === null ? "..." : getal(gesprekken)} />
        <Tegel label={`Verfomzet ${kwartaalNaam()}`} waarde={euro(c.omzet)} sub="Toegeschreven bestellingen" />
        <Tegel label="Commissie nog open" waarde={euro(c.open)} />
        <Tegel label="Commissie uitbetaald" waarde={euro(c.betaald)} sub={c.laatst ? `Laatste bestelling ${formatDate(c.laatst)}` : "Nog geen bestelling"} />
      </div>
    </div>
  );
}
