import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
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

interface Kort { kwartaal: string; orders: number; omzet: number; commissie: number; omzetTotaal: number; commissieOpen: number; laatsteOrder: string; kaarten: number; geactiveerd: number }
interface Persoon { naam: string | null; email: string }
export interface WpPartner {
  id: string | null; slug: string; soort: Soort; type: string; naam: string; plaats: string; start: string; actief: boolean;
  afspraken: { kortingscode: string; korting: string; kortingPct: number; commissiePct: number; thuisCode: string };
  links: { voorbeeld?: string; pagina: string; beheer?: string };
  mensen?: Persoon[]; leden?: Persoon[]; kort: Kort;
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
  uitbetaling: string; keuze: string; kenmerk: string; bedrag: number; bedragIncl: number; tegoedcode: string; factuurNr: string; afgehandeldOp: string; factuurMailto: string;
}
interface Styliste { id: string; name: string; email: string; active: boolean }
interface Commissie { stylist_id: string | null; verf_excl: number; amount: number; status: string; created_at: string }

/** Eén regel in het overzicht, voor elke soort hetzelfde. */
interface Regel { sleutel: string; soort: Soort; naam: string; sub: string; actief: boolean; omzet: number; open: number; laatst: string; zoek: string; naar: string }

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

export function SoortChip({ soort }: { soort: string }) {
  return <span className="rd-chip" style={{ padding: "3px 9px", fontSize: 11 }}>{soortLabel(soort)}</span>;
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
      uit.push({ sleutel: `s:${s.id}`, soort: "styliste", naam: s.name, sub: s.email, actief: s.active, omzet: c.omzet, open: c.open, laatst: c.laatst, zoek: `${s.name} ${s.email}`.toLowerCase(), naar: `/dashboard/partners/styliste/${s.id}` });
    }
    for (const p of wp ?? []) {
      const mails = [...(p.mensen ?? []), ...(p.leden ?? [])].map((m) => `${m.naam ?? ""} ${m.email}`).join(" ");
      uit.push({
        sleutel: `p:${p.slug}`, soort: p.soort, naam: p.naam, sub: [p.plaats, p.afspraken.kortingscode ? `code ${p.afspraken.kortingscode}` : ""].filter(Boolean).join(" · "),
        actief: p.actief, omzet: p.kort.omzet, open: p.kort.commissieOpen, laatst: p.kort.laatsteOrder,
        zoek: `${p.naam} ${p.plaats} ${p.slug} ${p.afspraken.kortingscode} ${p.afspraken.thuisCode} ${mails}`.toLowerCase(), naar: `/dashboard/partners/${p.slug}`,
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
      <h1 className="rd-h2" style={{ margin: "0 0 2px" }}>Partners</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>Iedereen waar Roll mee samenwerkt. Zoek op naam, plaats, kortingscode of e-mailadres.</p>

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
          <Link key={r.sleutel} to={r.naar} className="rd-card-white" style={{ textDecoration: "none", color: "inherit", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, flexWrap: "wrap", opacity: r.actief ? 1 : 0.55 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 700, fontSize: 16 }}>{r.naam}</span>
                <SoortChip soort={r.soort} />
                {!r.actief && <span style={{ fontSize: 12, opacity: 0.7 }}>Niet actief</span>}
              </div>
              {r.sub && <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>{r.sub}</div>}
            </div>
            <div style={{ display: "flex", gap: 18, fontSize: 13, fontVariantNumeric: "tabular-nums", flexWrap: "wrap", alignItems: "baseline" }}>
              <span><span style={{ opacity: 0.6 }}>Omzet {kwartaalNaam()}</span> <strong>{euro(r.omzet)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Commissie open</span> <strong>{euro(r.open)}</strong></span>
              <span style={{ opacity: 0.6 }}>{r.laatst ? `Laatste bestelling ${formatDate(r.laatst)}` : "Nog geen bestelling"}</span>
            </div>
          </Link>
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
      </div>
      <p className="rd-sub" style={{ marginTop: 0 }}>{[p.plaats, p.start ? `Partner sinds ${formatDate(p.start)}` : ""].filter(Boolean).join(" · ")}</p>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "8px 0 16px" }}>
        <Link className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} to={`/dashboard/partner/${p.slug}`}>Bekijk als partner</Link>
        {p.links.pagina && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.pagina} target="_blank" rel="noreferrer">Pagina voor klanten</a>}
        {p.links.voorbeeld && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.voorbeeld} target="_blank" rel="noreferrer">Voorbeeld met verzonnen cijfers</a>}
        {p.links.beheer && <a className="rd-plan-chip" style={{ display: "inline-flex", alignItems: "center", textDecoration: "none" }} href={p.links.beheer} target="_blank" rel="noreferrer">Codes en uitbetalingen</a>}
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

      <Toegang p={p} herlaad={laad} />
    </div>
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
