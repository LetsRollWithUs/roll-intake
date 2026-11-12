import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

// Offertes voor eigen klanten van een styliste (zonder Roll-adviesgesprek).
// De styliste kiest per offerte de verdeling tussen haar commissie en de korting voor de klant; de klant
// krijgt nooit meer dan 10%. Alle schrijfacties lopen via de edge function offerte-eigen; lezen via RLS.

const ORIGIN = "https://roll.nl";
export interface StylistOffer {
  id: string; stylist_id: string; customer_name: string; customer_email: string; customer_phone: string | null;
  offerte_id: number | null; nummer: string | null; versie: number; status: "concept" | "verstuurd" | "besteld" | "vervallen";
  commissie_pct: number; korting_pct: number; roll_klant: boolean;
  korting_aanvraag: "aangevraagd" | "toegekend" | "afgewezen" | null; korting_reden: string | null;
  totaal: number | null; commissie_basis: number | null; klant_url: string | null; mand_url: string | null;
  sent_at: string | null; sent_via: "mail" | "link" | null; ordered_at: string | null; woo_order_id: string | null;
  created_at: string; updated_at: string; stylists?: { name: string } | null;
}
export const OFFER_COLS = "id,stylist_id,customer_name,customer_email,customer_phone,offerte_id,nummer,versie,status,commissie_pct,korting_pct,roll_klant,korting_aanvraag,korting_reden,totaal,commissie_basis,klant_url,mand_url,sent_at,sent_via,ordered_at,woo_order_id,created_at,updated_at";
export type Paar = [number, number];
export const STANDAARD: Paar[] = [[10, 10], [15, 5], [20, 0]];

const eur = (v?: number | null) => (v == null ? "" : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));
export const pct = (n: number) => `${String(Number(n)).replace(".", ",")}%`;
export const verwachteCommissie = (o: Pick<StylistOffer, "commissie_basis" | "commissie_pct">) => (o.commissie_basis == null ? null : Math.round(o.commissie_basis * Number(o.commissie_pct)) / 100);
export const OFFER_STATUS: Record<StylistOffer["status"], string> = { concept: "Concept", verstuurd: "Verstuurd", besteld: "Besteld", vervallen: "Vervallen" };
const paarLabel = ([c, k]: Paar) => (k > 0 ? `${pct(c)} commissie voor jou, ${pct(k)} korting voor je klant` : `${pct(c)} commissie voor jou, geen korting voor je klant`);

export function StatusChip({ status }: { status: StylistOffer["status"] }) {
  const kleur = status === "besteld" ? { background: "#C9E6CE", color: "#1e4429" } : status === "verstuurd" ? { background: "var(--rd-aubergine)", color: "#fff" } : status === "vervallen" ? { background: "var(--rd-line)", color: "inherit" } : { background: "var(--rd-lavender)", color: "inherit" };
  return <span className="rd-chip" style={{ ...kleur, fontWeight: 700 }}>{OFFER_STATUS[status]}</span>;
}

async function roep<T = Record<string, unknown>>(body: Record<string, unknown>): Promise<(T & { ok?: boolean; error?: string }) | null> {
  const { data, error } = await supabase.functions.invoke("offerte-eigen", { body });
  if (error) return { ok: false, error: "Er ging iets mis. Probeer het opnieuw." } as T & { ok?: boolean; error?: string };
  return data as (T & { ok?: boolean; error?: string }) | null;
}

export async function laadVerdelingen(): Promise<Paar[]> {
  const { data } = await supabase.from("stylist_offer_settings").select("verdelingen").eq("id", true).maybeSingle();
  const ruw = (data as { verdelingen?: unknown } | null)?.verdelingen;
  const lijst = Array.isArray(ruw) ? (ruw as unknown[]).filter((p): p is Paar => Array.isArray(p) && p.length === 2).map((p) => [Number(p[0]), Number(p[1])] as Paar) : [];
  return lijst.length ? lijst : STANDAARD;
}

/* ------------------------------------------------------------------ lijst */

export function OffertesPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<StylistOffer[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylists, setStylists] = useState<{ id: string; name: string }[]>([]);
  const [verdelingen, setVerdelingen] = useState<Paar[]>(STANDAARD);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"open" | "besteld" | "alles">("open");
  const [stylistFilter, setStylistFilter] = useState("");
  const [nieuw, setNieuw] = useState(false);
  const [form, setForm] = useState({ naam: "", email: "", telefoon: "", korting: 10, stylist: "" });
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from("stylist_offers").select(`${OFFER_COLS}, stylists(name)`).order("created_at", { ascending: false });
    setRows((data as unknown as StylistOffer[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      const [{ data: adm }, v] = await Promise.all([supabase.rpc("is_admin"), laadVerdelingen()]);
      setIsAdmin(adm === true);
      setVerdelingen(v);
      setForm((f) => ({ ...f, korting: v[0]?.[1] ?? 10 }));
      if (adm === true) {
        const { data: st } = await supabase.from("stylists").select("id,name").eq("active", true).order("name");
        setStylists((st as { id: string; name: string }[]) ?? []);
      }
      await load();
      setLoading(false);
    })();
  }, [load]);

  const maak = async () => {
    setBezig(true); setFout(null);
    const d = await roep<{ offerte?: StylistOffer }>({ action: "nieuw", naam: form.naam, email: form.email, telefoon: form.telefoon, korting_pct: form.korting, stylist_id: form.stylist || undefined });
    setBezig(false);
    if (d?.ok && d.offerte) { nav(`/dashboard/offertes/${d.offerte.id}`); return; }
    setFout(d?.error ?? "De offerte kon niet worden aangemaakt.");
  };

  const zichtbaar = useMemo(() => rows.filter((o) => (filter === "alles" ? true : filter === "besteld" ? o.status === "besteld" : o.status === "concept" || o.status === "verstuurd") && (!stylistFilter || o.stylist_id === stylistFilter)), [rows, filter, stylistFilter]);
  const som = useMemo(() => {
    const open = rows.filter((o) => (o.status === "concept" || o.status === "verstuurd") && (!stylistFilter || o.stylist_id === stylistFilter));
    const besteld = rows.filter((o) => o.status === "besteld" && (!stylistFilter || o.stylist_id === stylistFilter));
    const tel = (l: StylistOffer[]) => l.reduce((t, o) => t + (verwachteCommissie(o) ?? 0), 0);
    return { open: open.length, openCommissie: tel(open), besteld: besteld.length, besteldCommissie: tel(besteld) };
  }, [rows, stylistFilter]);

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Offertes</h1>
          <p className="rd-sub" style={{ marginTop: 0, maxWidth: 620 }}>Maak een offerte voor je eigen klanten. Jij kiest per offerte hoe je verdeelt: meer commissie voor jou, of korting voor je klant. De korting geldt op verf.</p>
        </div>
        {!nieuw && <button className="rd-btn rd-btn-primary" onClick={() => setNieuw(true)} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>Nieuwe offerte</button>}
      </div>

      {nieuw && (
        <div className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 12, margin: "12px 0" }}>
          <strong style={{ fontSize: 17 }}>Nieuwe offerte</strong>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>Naam van je klant<input className="rd-input" value={form.naam} onChange={(e) => setForm({ ...form, naam: e.target.value })} style={{ height: 44 }} autoFocus /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>E-mailadres<input className="rd-input" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} style={{ height: 44 }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>Telefoon (optioneel)<input className="rd-input" type="tel" value={form.telefoon} onChange={(e) => setForm({ ...form, telefoon: e.target.value })} style={{ height: 44 }} /></label>
            {isAdmin && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 13, fontWeight: 600 }}>Voor styliste
                <select className="rd-input" value={form.stylist} onChange={(e) => setForm({ ...form, stylist: e.target.value })} style={{ height: 44 }}>
                  <option value="">Mijzelf</option>
                  {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </label>
            )}
          </div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Verdeling</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {verdelingen.map((p) => (
                <label key={p.join("-")} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}>
                  <input type="radio" name="verdeling" checked={form.korting === p[1]} onChange={() => setForm({ ...form, korting: p[1] })} />{paarLabel(p)}
                </label>
              ))}
            </div>
            <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 13 }}>Je kunt de verdeling later nog aanpassen, tot de klant bestelt. Had je klant kort geleden een adviesgesprek via Roll, dan geldt 10% commissie zonder extra korting.</p>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <button className="rd-btn rd-btn-primary" onClick={maak} disabled={bezig} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{bezig ? "Aanmaken..." : "Offerte maken"}</button>
            <button className="rd-textlink" onClick={() => { setNieuw(false); setFout(null); }}>Annuleren</button>
            {fout && <span role="status" style={{ fontSize: 14, color: "var(--rd-pink-dark)", fontWeight: 600 }}>{fout}</span>}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", margin: "14px 0" }}>
        <div className="rd-card-white"><div style={{ fontSize: 13, opacity: 0.7 }}>Lopend</div><div style={{ fontSize: 22, fontWeight: 800 }}>{som.open}</div><div style={{ fontSize: 13 }}>Verwachte commissie {eur(som.openCommissie)}</div></div>
        <div className="rd-card-white"><div style={{ fontSize: 13, opacity: 0.7 }}>Besteld</div><div style={{ fontSize: 22, fontWeight: 800 }}>{som.besteld}</div><div style={{ fontSize: 13 }}>Commissie {eur(som.besteldCommissie)}</div></div>
      </div>

      <div style={{ display: "flex", gap: 8, margin: "12px 0 14px", flexWrap: "wrap", alignItems: "center" }}>
        {(["open", "besteld", "alles"] as const).map((f) => <button key={f} className={`rd-plan-chip${filter === f ? " is-on" : ""}`} onClick={() => setFilter(f)}>{f === "open" ? "Lopend" : f === "besteld" ? "Besteld" : "Alles"}</button>)}
        {isAdmin && stylists.length > 0 && (
          <select className="rd-input" value={stylistFilter} onChange={(e) => setStylistFilter(e.target.value)} style={{ height: 38, width: "auto" }} aria-label="Filter op styliste">
            <option value="">Alle stylistes</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      {zichtbaar.length === 0 ? <p className="rd-sub">{rows.length === 0 ? "Nog geen offertes. Maak de eerste met de knop hierboven." : "Geen offertes in deze selectie."}</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zichtbaar.map((o) => (
            <Link key={o.id} to={`/dashboard/offertes/${o.id}`} className="rd-card-white" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center", textDecoration: "none", color: "inherit" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{o.customer_name}{o.nummer ? <span style={{ fontWeight: 500, opacity: 0.6 }}> · {o.nummer}</span> : null}</div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                  {isAdmin && o.stylists?.name ? `${o.stylists.name} · ` : ""}{pct(o.commissie_pct)} commissie, {pct(o.korting_pct)} korting{o.roll_klant ? " · Roll-klant" : ""} · {formatDate(o.created_at)}
                  {o.korting_aanvraag === "aangevraagd" ? " · korting aangevraagd" : ""}
                </div>
              </div>
              <div style={{ display: "flex", gap: 14, alignItems: "center", fontSize: 14 }}>
                {o.totaal != null && <span>{eur(o.totaal)}</span>}
                {verwachteCommissie(o) != null && <span style={{ opacity: 0.75 }}>commissie {eur(verwachteCommissie(o))}</span>}
                <StatusChip status={o.status} />
              </div>
            </Link>
          ))}
        </div>
      )}

      {isAdmin && <p className="rd-sub" style={{ marginTop: 18, fontSize: 13 }}>Welke verdelingen stylistes mogen kiezen stel je in onder <Link to="/dashboard/instellingen" className="rd-textlink">Instellingen</Link>.</p>}
    </div>
  );
}

/* ---------------------------------------------------------------- detail */

export function OfferteDetail() {
  const { id } = useParams();
  const [o, setO] = useState<StylistOffer | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verdelingen, setVerdelingen] = useState<Paar[]>(STANDAARD);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState<string | null>(null);
  const [height, setHeight] = useState(900);
  const [msg, setMsg] = useState<{ soort: "goed" | "fout"; tekst: string } | null>(null);
  const [bezig, setBezig] = useState<string | null>(null);
  const [reden, setReden] = useState("");
  const [vraagOpen, setVraagOpen] = useState(false);
  const [regels, setRegels] = useState<number | null>(null);
  const loadedAt = useRef(0);
  const ververstimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openEditor = useCallback(async (oid: string) => {
    const d = await roep<{ url?: string }>({ action: "editlink", id: oid });
    if (d?.ok && d.url) { setUrl(d.url); loadedAt.current = Date.now(); } else setMsg({ soort: "fout", tekst: d?.error ?? "De editor kon niet worden geopend." });
  }, []);
  const ververs = useCallback(async (oid: string) => {
    const d = await roep<{ offerte?: StylistOffer; offer?: { regels?: unknown[] } }>({ action: "ververs", id: oid });
    if (d?.ok && d.offerte) { setO((cur) => ({ ...(cur ?? d.offerte!), ...d.offerte! })); setRegels(d.offer?.regels?.length ?? 0); }
  }, []);

  useEffect(() => {
    if (!id) return;
    (async () => {
      const [{ data: adm }, v, { data }] = await Promise.all([supabase.rpc("is_admin"), laadVerdelingen(), supabase.from("stylist_offers").select(`${OFFER_COLS}, stylists(name)`).eq("id", id).maybeSingle()]);
      setIsAdmin(adm === true); setVerdelingen(v);
      const rij = data as unknown as StylistOffer | null;
      setO(rij); setLoading(false);
      if (rij?.offerte_id) { await Promise.all([openEditor(rij.id), ververs(rij.id)]); }
    })();
  }, [id, openEditor, ververs]);

  // Na 7 uur een verse bewerklink (die van de server is 8 uur geldig).
  useEffect(() => {
    const t = setInterval(() => { if (url && o && Date.now() - loadedAt.current > 7 * 3600e3) openEditor(o.id); }, 10 * 60e3);
    return () => clearInterval(t);
  }, [url, o, openEditor]);

  useEffect(() => {
    const onMsg = async (e: MessageEvent) => {
      if (e.origin !== ORIGIN || !e.data || typeof e.data !== "object" || !o) return;
      const { type, ...p } = e.data as { type?: string } & Record<string, unknown>;
      if (type === "roll-offerte:hoogte" && typeof p.hoogte === "number") setHeight(Math.max(500, Math.ceil(p.hoogte) + 24));
      // "Nieuwe versie maken" in de editor: het nieuwe id aan deze offerte koppelen.
      if (type === "roll-offerte:geladen" && typeof p.id === "number" && p.id !== o.offerte_id) {
        const d = await roep<{ offerte?: StylistOffer }>({ action: "koppel", id: o.id, offerte_id: p.id });
        if (d?.ok && d.offerte) setO((cur) => ({ ...(cur as StylistOffer), ...d.offerte! }));
      }
      // Opgeslagen: het totaal en de verwachte commissie even later bijwerken.
      if (type === "roll-offerte:opgeslagen") {
        if (ververstimer.current) clearTimeout(ververstimer.current);
        ververstimer.current = setTimeout(() => ververs(o.id), 1200);
      }
      if (type === "roll-offerte:fout") setMsg({ soort: "fout", tekst: String(p.melding ?? "Er ging iets mis in de editor.") });
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [o, ververs]);

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (!o) return <div><Link to="/dashboard/offertes" className="rd-textlink" style={{ textDecoration: "none" }}>← Offertes</Link><p className="rd-sub">Deze offerte bestaat niet of is niet van jou.</p></div>;

  const vast = o.status === "besteld" || o.status === "vervallen";
  const actie = async (naam: string, body: Record<string, unknown>, goed: string) => {
    setBezig(naam); setMsg(null);
    const d = await roep<{ offerte?: StylistOffer; klant_url?: string }>({ id: o.id, ...body });
    setBezig(null);
    if (d?.ok) { if (d.offerte) setO((cur) => ({ ...(cur as StylistOffer), ...d.offerte! })); setMsg({ soort: "goed", tekst: goed }); return d; }
    setMsg({ soort: "fout", tekst: d?.error ?? "Dat lukte niet. Probeer het opnieuw." });
    return null;
  };
  const kiesVerdeling = async (p: Paar) => {
    const d = await actie("verdeling", { action: "verdeling", korting_pct: p[1] }, "Verdeling aangepast.");
    if (d && url) openEditor(o.id); // de editor toont de korting pas na opnieuw laden
  };
  const kopieerLink = async () => {
    const d = await actie("link", { action: "versturen", via: "link" }, "Link gekopieerd. Stuur hem zelf naar je klant.");
    const link = d?.klant_url ?? o.klant_url;
    if (d && link) { try { await navigator.clipboard.writeText(link); } catch { window.prompt("Link voor je klant", link); } }
  };
  const besluit = async (p: number) => {
    setBezig("besluit"); setMsg(null);
    const { data: taak } = await supabase.from("roll_tasks").select("id").eq("offer_id", o.id).eq("type", "korting").neq("status", "afgerond").order("created_at", { ascending: false }).limit(1).maybeSingle();
    const d = taak ? await roep({ action: "korting_besluit", task_id: (taak as { id: string }).id, pct: p }) : { ok: false, error: "De aanvraag is niet gevonden." };
    setBezig(null);
    if (d?.ok) { setMsg({ soort: "goed", tekst: p > 0 ? `${p}% korting toegekend.` : "Aanvraag afgewezen." }); await ververs(o.id); const { data } = await supabase.from("stylist_offers").select(OFFER_COLS).eq("id", o.id).maybeSingle(); if (data) setO((cur) => ({ ...(cur as StylistOffer), ...(data as unknown as StylistOffer) })); if (url) openEditor(o.id); }
    else setMsg({ soort: "fout", tekst: d?.error ?? "Dat lukte niet." });
  };
  const commissie = verwachteCommissie(o);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div>
        <Link to="/dashboard/offertes" className="rd-textlink" style={{ textDecoration: "none" }}>← Offertes</Link>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginTop: 6 }}>
          <h1 className="rd-h2" style={{ margin: 0 }}>{o.customer_name}</h1>
          <StatusChip status={o.status} />
        </div>
        <p className="rd-sub" style={{ margin: "4px 0 0" }}>
          Offerte {o.nummer ?? ""}{o.versie > 1 ? ` · versie ${o.versie}` : ""} · <a href={`mailto:${o.customer_email}`} style={{ color: "inherit" }}>{o.customer_email}</a>{o.customer_phone ? ` · ${o.customer_phone}` : ""}{isAdmin && o.stylists?.name ? ` · ${o.stylists.name}` : ""}
        </p>
      </div>

      <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
        <div className="rd-card-white">
          <div style={{ fontSize: 13, opacity: 0.7 }}>Totaal voor de klant</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{o.totaal != null ? eur(o.totaal) : "nog leeg"}</div>
          <div style={{ fontSize: 13 }}>{o.korting_pct > 0 ? `Met ${pct(o.korting_pct)} korting op de verf` : "Zonder korting"}</div>
        </div>
        <div className="rd-card-white">
          <div style={{ fontSize: 13, opacity: 0.7 }}>Jouw commissie bij bestelling</div>
          <div style={{ fontSize: 22, fontWeight: 800 }}>{commissie != null ? eur(commissie) : "nog leeg"}</div>
          <div style={{ fontSize: 13 }}>{pct(o.commissie_pct)} over het bedrag zonder btw en verzending</div>
        </div>
      </div>

      {/* Verdeling */}
      <div className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>Verdeling</strong>
        {o.roll_klant ? (
          <>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>Deze klant had kort geleden een adviesgesprek via Roll. Daarom geldt hier <strong>10% commissie</strong> en geen extra korting. {o.korting_pct > 0 ? `Roll heeft ${pct(o.korting_pct)} korting toegekend.` : "De klant krijgt wel de samplekorting van de winkel."}</p>
            {!vast && o.korting_aanvraag !== "aangevraagd" && o.korting_pct === 0 && (
              vraagOpen ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Waarom heeft deze klant korting nodig?
                    <textarea className="rd-input" value={reden} onChange={(e) => setReden(e.target.value)} rows={3} style={{ height: "auto", padding: 10, marginTop: 4 }} placeholder="Bijvoorbeeld: twijfelt tussen ons en een ander merk, groot project." />
                  </label>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <button className="rd-btn rd-btn-primary" disabled={bezig === "vraag"} onClick={async () => { const d = await actie("vraag", { action: "korting_aanvragen", reden }, "Aanvraag verstuurd. Roll laat het je weten."); if (d) setVraagOpen(false); }} style={{ width: "auto", padding: "0 20px", minHeight: 40 }}>{bezig === "vraag" ? "Versturen..." : "Aanvraag versturen"}</button>
                    <button className="rd-textlink" onClick={() => setVraagOpen(false)}>Annuleren</button>
                  </div>
                </div>
              ) : <div><button className="rd-plan-chip" onClick={() => setVraagOpen(true)}>Korting aanvragen bij Roll</button></div>
            )}
          </>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {verdelingen.concat(verdelingen.some((p) => p[1] === o.korting_pct && p[0] === o.commissie_pct) ? [] : [[o.commissie_pct, o.korting_pct] as Paar]).map((p) => {
              const aan = p[1] === o.korting_pct && p[0] === o.commissie_pct;
              return <label key={p.join("-")} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15, opacity: vast && !aan ? 0.5 : 1 }}><input type="radio" name="verdeling" checked={aan} disabled={vast || bezig === "verdeling"} onChange={() => kiesVerdeling(p)} />{paarLabel(p)}</label>;
            })}
            <span className="rd-sub" style={{ fontSize: 13 }}>{vast ? "De verdeling staat vast." : "Aanpassen kan tot de klant bestelt. Andere kortingscodes werken niet naast deze korting."}</span>
          </div>
        )}
        {o.korting_aanvraag === "aangevraagd" && <div style={{ fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "var(--rd-lavender)" }}><strong>Korting aangevraagd bij Roll.</strong> {o.korting_reden}</div>}
        {o.korting_aanvraag === "afgewezen" && <div style={{ fontSize: 14 }}>Roll heeft de aanvraag voor korting niet toegekend.</div>}
        {isAdmin && o.korting_aanvraag === "aangevraagd" && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button className="rd-plan-chip is-on" disabled={bezig === "besluit"} onClick={() => besluit(10)}>10% toekennen</button>
            <button className="rd-plan-chip is-on" disabled={bezig === "besluit"} onClick={() => besluit(5)}>5% toekennen</button>
            <button className="rd-plan-chip" disabled={bezig === "besluit"} onClick={() => besluit(0)}>Afwijzen</button>
          </div>
        )}
      </div>

      {/* Versturen */}
      <div className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <strong>{o.status === "besteld" ? "Besteld" : "Naar je klant"}</strong>
        {o.status === "besteld" ? (
          <p style={{ margin: 0, fontSize: 15 }}>Je klant heeft besteld{o.ordered_at ? ` op ${formatDate(o.ordered_at)}` : ""}{o.woo_order_id ? ` (order ${o.woo_order_id})` : ""}. Je commissie staat bij <Link to="/dashboard/commissie" style={{ color: "inherit" }}>Commissie</Link>.</p>
        ) : o.status === "vervallen" ? (
          <p style={{ margin: 0, fontSize: 15 }}>Deze offerte is vervallen.</p>
        ) : (
          <>
            <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5 }}>{o.sent_at ? `Verstuurd op ${formatDate(o.sent_at)} (${o.sent_via === "link" ? "link gedeeld" : "per mail"}). Aangepast? Stuur hem gerust opnieuw.` : "Klaar met invullen? Stuur de offerte per mail, of kopieer de link en deel hem zelf."}</p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <button className="rd-btn rd-btn-primary" disabled={!!bezig || regels === 0} onClick={() => actie("mail", { action: "versturen", via: "mail" }, `Verstuurd naar ${o.customer_email}.`)} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{bezig === "mail" ? "Versturen..." : "Verstuur per mail"}</button>
              <button className="rd-plan-chip" disabled={!!bezig || regels === 0} onClick={kopieerLink}>{bezig === "link" ? "Bezig..." : "Kopieer link"}</button>
              {o.klant_url && o.sent_at && <a href={o.klant_url} target="_blank" rel="noreferrer" className="rd-textlink">Bekijk als klant</a>}
              <button className="rd-textlink" style={{ marginLeft: "auto" }} disabled={!!bezig} onClick={() => { if (window.confirm("Deze offerte laten vervallen?")) actie("vervallen", { action: "vervallen" }, "De offerte is vervallen."); }}>Laat vervallen</button>
            </div>
            {regels === 0 && <span className="rd-sub" style={{ fontSize: 13 }}>Vul eerst hieronder de ruimtes, maten en kleuren in.</span>}
          </>
        )}
        {msg && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: msg.soort === "fout" ? "var(--rd-pink-dark)" : "#1e6b34" }}>{msg.tekst}</span>}
      </div>

      {/* Editor */}
      {o.status !== "vervallen" && (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", fontSize: 14 }}>
            <strong>De offerte</strong>
            <button className="rd-textlink" onClick={() => openEditor(o.id)} style={{ marginLeft: "auto" }}>Editor opnieuw laden</button>
          </div>
          {url ? <iframe title="Offerte-editor" src={url} style={{ width: "100%", height, border: "1px solid var(--rd-line)", borderRadius: 16, background: "#fff" }} /> : <p className="rd-sub">Editor laden...</p>}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------- blok startscherm */

// Kort overzicht voor het startscherm van de styliste: lopende offertes en wat ze opleveren.
export function MijnOffertes({ stylistId }: { stylistId: string | null }) {
  const [rows, setRows] = useState<StylistOffer[] | null>(null);
  useEffect(() => {
    if (!stylistId) { setRows([]); return; }
    let weg = false;
    supabase.from("stylist_offers").select(OFFER_COLS).eq("stylist_id", stylistId).in("status", ["concept", "verstuurd", "besteld"]).order("updated_at", { ascending: false }).limit(50)
      .then(({ data }) => { if (!weg) setRows((data as unknown as StylistOffer[]) ?? []); });
    return () => { weg = true; };
  }, [stylistId]);
  if (rows === null) return null;
  const lopend = rows.filter((o) => o.status !== "besteld");
  const besteld = rows.filter((o) => o.status === "besteld");
  const verwacht = lopend.reduce((t, o) => t + (verwachteCommissie(o) ?? 0), 0);
  return (
    <section style={{ marginTop: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <div className="rd-kicker rd-kicker-pink">Offertes voor eigen klanten</div>
        <Link to="/dashboard/offertes" className="rd-textlink" style={{ fontSize: 13 }}>{rows.length ? "Alle offertes" : "Offerte maken"}</Link>
      </div>
      {rows.length === 0 ? (
        <div className="rd-card-white" style={{ padding: "12px 16px" }}><span style={{ fontSize: 14, opacity: 0.7 }}>Nog geen offertes. Heb je een eigen klant? Maak een offerte en kies zelf de verdeling tussen commissie en korting.</span></div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <div className="rd-card-white" style={{ padding: "12px 16px", display: "flex", gap: 18, flexWrap: "wrap", fontSize: 14 }}>
            <span><strong>{lopend.length}</strong> lopend</span>
            <span>Verwachte commissie <strong>{eur(verwacht)}</strong></span>
            <span style={{ opacity: 0.7 }}>{besteld.length} besteld</span>
          </div>
          {lopend.slice(0, 4).map((o) => (
            <Link key={o.id} to={`/dashboard/offertes/${o.id}`} className="rd-card-white" style={{ textDecoration: "none", color: "inherit", padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{o.customer_name}</div>
                <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{o.totaal != null ? eur(o.totaal) : "nog leeg"} · {pct(o.commissie_pct)} commissie, {pct(o.korting_pct)} korting</div>
              </div>
              <StatusChip status={o.status} />
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}
