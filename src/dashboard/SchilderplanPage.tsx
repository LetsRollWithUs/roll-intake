import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

// Jouw schilderplan (de chat op roll.nl/kleurplan/?chat=1): overdrachten en gesprekken bekijken en overnemen.
// Alleen beheerders zien deze tabel (RLS is_admin). De klant krijgt een code mee in WhatsApp of mail.

const CHAT = "https://lsboujprrvhntgbvlvyu.supabase.co/functions/v1/projecthulp-chat";
const ROLL = "https://roll.nl/kleurplan/";

interface Gegeven { waarde: any; bron?: string; geaccepteerd?: boolean }
interface Vlak { id: string; soort: string; ondergrond: Record<string, Gegeven | null>; kleur: { status: string; gekozen: Gegeven | null; richting?: string; kandidaten: { naam: string }[]; favorieten: { naam: string }[] }; aantal: Gegeven | null; glans: Gegeven | null }
interface Ruimte { id: string; naam: string; buiten?: boolean; maat: { lengte: Gegeven | null; breedte: Gegeven | null; grootte: Gegeven | null }; hoogte: Gegeven | null; vlakken: Vlak[] }
interface Project { ruimtes: Ruimte[]; samples?: { naam: string }[]; packs?: { productId: number; naam: string }[]; spullen: Gegeven | null; volgorde?: Gegeven | null }
interface Bericht { rol: "klant" | "roll"; tekst: string; op?: string }
interface Rij {
  sessie: string;
  code: string | null;
  status: string | null;
  email: string | null;
  bewaard_op: string | null;
  overdracht_op: string | null;
  overdracht_kanaal: string | null;
  overgenomen_door: string | null;
  overgenomen_op: string | null;
  notitie: string | null;
  bron: string | null;
  mand_op: string | null;
  mand_soort: string | null;
  created_at: string;
  updated_at: string | null;
  project: Project;
  gesprek?: Bericht[];
}

const VELDEN = "sessie,code,status,email,bewaard_op,overdracht_op,overdracht_kanaal,overgenomen_door,overgenomen_op,notitie,bron,mand_op,mand_soort,created_at,updated_at,project";
const VLAK: Record<string, string> = { muren: "Muren", plafond: "Plafond", accent: "Accentmuur", deuren: "Deuren", kozijnen: "Kozijnen", plinten: "Plinten", lambrisering: "Lambrisering", radiatoren: "Radiatoren", kasten: "Kasten", trap: "Trap", meubel: "Meubel" };
const w = (g: Gegeven | null | undefined) => (g && g.waarde != null ? g.waarde : null);

type Fase = "open" | "bij-roll" | "afgerond" | "actief";
function fase(r: Rij): Fase {
  if (r.status === "afgerond") return "afgerond";
  if (r.status === "bij-roll") return "bij-roll";
  return r.code ? "open" : "actief";
}
const FASE: Record<Fase, { label: string; bg: string; ink: string }> = {
  open: { label: "Vraagt om hulp", bg: "var(--rd-pink)", ink: "var(--rd-aubergine)" },
  "bij-roll": { label: "Bij Roll", bg: "var(--rd-aubergine)", ink: "#fff" },
  afgerond: { label: "Afgerond", bg: "var(--rd-grey-light, #eee)", ink: "rgba(47,33,65,.7)" },
  actief: { label: "Met de bot", bg: "var(--rd-lavender)", ink: "var(--rd-aubergine)" },
};
function Pil({ r }: { r: Rij }) {
  const f = FASE[fase(r)];
  return <span className="rd-chip" style={{ background: f.bg, color: f.ink, fontWeight: 700, flex: "none" }}>{f.label}</span>;
}

/** Kort: welke ruimtes en onderdelen, voor in de lijst. */
function samenvatting(p: Project) {
  return (p?.ruimtes ?? []).map((r) => `${r.naam} (${r.vlakken.map((v) => (VLAK[v.soort] ?? v.soort).toLowerCase()).join(", ") || "nog niets"})`).join(" · ") || "Nog geen ruimtes";
}
function maatTekst(r: Ruimte) {
  const l = w(r.maat.lengte), b = w(r.maat.breedte);
  if (l && b) return `${String(l).replace(".", ",")} × ${String(b).replace(".", ",")} m`;
  const g = w(r.maat.grootte);
  return g ? `${({ klein: "klein", middel: "gemiddeld", groot: "groot" } as Record<string, string>)[g] ?? g} (schatting${r.maat.grootte?.bron === "gezegd" || r.maat.grootte?.geaccepteerd ? "" : ", niet bevestigd"})` : "maat onbekend";
}
function ondergrondTekst(v: Vlak) {
  const o = v.ondergrond ?? {};
  const delen = ["materiaal", "afwerking", "kleurNu", "structuur", "conditie"].map((k) => w(o[k])).filter((x) => x && x !== "goed" && x !== "glad");
  return delen.length ? delen.join(", ") : o.afwerking ? "goed, glad" : "nog niet gevraagd";
}
function kleurTekst(v: Vlak) {
  const g = w(v.kleur.gekozen);
  if (g) return g.merk ? `${g.naam} (gezocht op ${g.merk} ${g.merkKleur ?? ""})` : g.naam;
  const delen = [v.kleur.richting ? `richting ${v.kleur.richting}` : "", v.kleur.kandidaten?.length ? `twijfelt: ${v.kleur.kandidaten.map((k) => k.naam).join(", ")}` : "", v.kleur.favorieten?.length ? `favoriet: ${v.kleur.favorieten.map((k) => k.naam).join(", ")}` : ""].filter(Boolean);
  return delen.join("; ") || "kleur nog open";
}
/** Wat een medewerker moet beoordelen: vocht, bladderen, beton. */
function risico(p: Project) {
  const uit: string[] = [];
  for (const r of p?.ruimtes ?? []) for (const v of r.vlakken) {
    const c = w(v.ondergrond?.conditie), m = w(v.ondergrond?.materiaal);
    if (c === "vocht" || c === "bladdert" || m === "beton") uit.push(`${r.naam}, ${(VLAK[v.soort] ?? v.soort).toLowerCase()}: ${c === "vocht" ? "vocht of schimmel" : c === "bladdert" ? "bladdert" : "beton"}`);
  }
  return uit;
}

export function SchilderplanPage() {
  const { sessie } = useParams();
  return sessie ? <Detail sessie={sessie} /> : <Lijst />;
}

function Lijst() {
  const [rows, setRows] = useState<Rij[]>([]);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState("");
  const [scope, setScope] = useState<"open" | "bij-roll" | "afgerond" | "alle">("open");
  const [zoek, setZoek] = useState("");
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("projecthulp_chat").select(VELDEN).order("updated_at", { ascending: false, nullsFirst: false }).limit(200);
      if (error) setFout("Laden lukte niet. Ben je ingelogd als beheerder?");
      setRows((data as unknown as Rij[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const tel = (f: Fase) => rows.filter((r) => fase(r) === f).length;
  const zichtbaar = useMemo(() => {
    const z = zoek.trim().toUpperCase();
    if (z) return rows.filter((r) => (r.code ?? "").includes(z) || (r.email ?? "").toUpperCase().includes(z));
    const lijst = rows.filter((r) => scope === "alle" || fase(r) === scope);
    // Open vragen: oudste eerst, zodat niemand blijft liggen.
    return scope === "open" ? [...lijst].sort((a, b) => (a.overdracht_op ?? "").localeCompare(b.overdracht_op ?? "")) : lijst;
  }, [rows, scope, zoek]);

  return (
    <div>
      <h1 className="rd-h2" style={{ margin: "0 0 4px" }}>Schilderplan</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Gesprekken uit Jouw schilderplan. Vraagt een klant om hulp, dan staat hij hier met de code uit zijn WhatsApp of mail.
        {" "}<Link to="/beheer/nakijken" className="rd-textlink">Nakijken</Link> laat zien waar de controle Charlie tegenhield.
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <button className={`rd-plan-chip${scope === "open" && !zoek ? " is-on" : ""}`} onClick={() => { setZoek(""); setScope("open"); }}>Vraagt om hulp ({tel("open")})</button>
        <button className={`rd-plan-chip${scope === "bij-roll" && !zoek ? " is-on" : ""}`} onClick={() => { setZoek(""); setScope("bij-roll"); }}>Bij Roll ({tel("bij-roll")})</button>
        <button className={`rd-plan-chip${scope === "afgerond" && !zoek ? " is-on" : ""}`} onClick={() => { setZoek(""); setScope("afgerond"); }}>Afgerond</button>
        <button className={`rd-plan-chip${scope === "alle" && !zoek ? " is-on" : ""}`} onClick={() => { setZoek(""); setScope("alle"); }}>Alle gesprekken</button>
        <input className="rd-input" style={{ maxWidth: 220, minHeight: 44 }} placeholder="Zoek op code of e-mail" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek op code of e-mail" />
      </div>
      {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)" }}>{fout}</p>}
      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : zichtbaar.length === 0 ? (
        <p className="rd-sub">{zoek ? "Niets gevonden met deze code." : scope === "open" ? "Niemand wacht op hulp." : "Geen gesprekken."}</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {zichtbaar.map((r) => {
            const rs = risico(r.project);
            return (
              <button key={r.sessie} className="rd-card-white" onClick={() => navigate(`/beheer/schilderplan/${r.sessie}`)} style={{ textAlign: "left", border: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" }}>
                      {r.code && <span style={{ fontFamily: "monospace", fontSize: 17, fontWeight: 700, letterSpacing: ".04em" }}>{r.code}</span>}
                      <span style={{ fontSize: 13, opacity: 0.7 }}>{r.email ?? "geen e-mail"}{r.bewaard_op ? " · bewaard" : ""}{r.bron === "kopie" ? " · kopie van gedeeld plan" : ""}</span>
                    </div>
                    <div style={{ fontSize: 14, marginTop: 4 }}>{samenvatting(r.project)}</div>
                    {rs.length > 0 && <div style={{ fontSize: 13, marginTop: 4, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Beoordelen: {rs.join("; ")}</div>}
                    {r.status === "bij-roll" && r.overgenomen_op && r.updated_at && new Date(r.updated_at) > new Date(r.overgenomen_op) && <div style={{ fontSize: 13, marginTop: 4, fontWeight: 700 }}>Nieuw bericht van de klant na de overname</div>}
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>
                      {r.overdracht_op ? `Vroeg om hulp ${formatDate(r.overdracht_op)} via ${r.overdracht_kanaal === "mail" ? "mail" : "WhatsApp"}` : `Laatst actief ${formatDate(r.updated_at ?? r.created_at)}`}
                      {r.overgenomen_door ? ` · overgenomen door ${r.overgenomen_door}` : ""}
                    </div>
                  </div>
                  <Pil r={r} />
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Detail({ sessie }: { sessie: string }) {
  const [r, setR] = useState<Rij | null>(null);
  const [loading, setLoading] = useState(true);
  const [notitie, setNotitie] = useState("");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const [orders, setOrders] = useState<{ order_id: number; status: string | null; totaal: number | null; soort: string | null; besteld_op: string | null }[]>([]);

  const laad = async () => {
    const { data } = await supabase.from("projecthulp_chat").select(VELDEN + ",gesprek").eq("sessie", sessie).maybeSingle();
    const { data: os } = await supabase.from("projecthulp_chat_order").select("order_id,status,totaal,soort,besteld_op").eq("sessie", sessie).order("order_id");
    setOrders((os as any[]) ?? []);
    setR((data as unknown as Rij) ?? null);
    setNotitie((data as any)?.notitie ?? "");
    setLoading(false);
  };
  useEffect(() => { laad(); }, [sessie]);

  const zet = async (wijziging: Partial<Rij>, tekst: string) => {
    setBezig(true);
    const { error } = await supabase.from("projecthulp_chat").update(wijziging).eq("sessie", sessie);
    setBezig(false);
    if (error) { setMelding("Opslaan lukte niet."); return; }
    setMelding(tekst);
    setTimeout(() => setMelding(""), 3000);
    laad();
  };
  const neemOver = async () => {
    const { data } = await supabase.auth.getUser();
    zet({ status: "bij-roll", overgenomen_door: data.user?.email ?? "Roll", overgenomen_op: new Date().toISOString() }, "Overgenomen. De klant ziet in de chat dat Roll meekijkt.");
  };
  // Alleen lezen, zoals de klant het plan en pakket ziet (de deellink; maakt er een als die er nog niet is).
  const bekijk = async () => {
    const venster = window.open("about:blank", "_blank");
    const d = await fetch(CHAT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sessie, deel: true }) }).then((x) => x.json()).catch(() => null);
    if (d?.code && venster) venster.location.href = `${ROLL}?chat=1&deel=${d.code}`;
    else { venster?.close(); setMelding("Het plan openen lukte niet."); }
  };

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (!r) return (<div><Link to="/beheer/schilderplan" className="rd-textlink" style={{ textDecoration: "none" }}>← Schilderplan</Link><p className="rd-sub">Dit gesprek bestaat niet (meer).</p></div>);
  const rs = risico(r.project);
  const f = fase(r);

  return (
    <div>
      <Link to="/beheer/schilderplan" className="rd-textlink" style={{ textDecoration: "none" }}>← Schilderplan</Link>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap", margin: "8px 0 4px" }}>
        <h1 className="rd-h2" style={{ margin: 0 }}>{r.code ? <span style={{ fontFamily: "monospace", letterSpacing: ".04em" }}>{r.code}</span> : "Gesprek"}</h1>
        <Pil r={r} />
      </div>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        {r.email ? <a href={`mailto:${r.email}?subject=${encodeURIComponent(`Je schilderplan${r.code ? ` (code ${r.code})` : ""}`)}`}>{r.email}</a> : "Geen e-mailadres; de klant neemt contact op via WhatsApp met de code."}
        {r.overdracht_op ? ` · vroeg om hulp ${formatDate(r.overdracht_op)} via ${r.overdracht_kanaal === "mail" ? "mail" : "WhatsApp"}` : ""}
        {r.overgenomen_door ? ` · overgenomen door ${r.overgenomen_door} (${formatDate(r.overgenomen_op)})` : ""}
      </p>
      {(r.mand_op || orders.length > 0) && (
        <p className="rd-sub" style={{ marginTop: 0 }}>
          {r.mand_op ? `Klikte op bestellen ${formatDate(r.mand_op)}${r.mand_soort === "samples" ? " (samples)" : ""}` : ""}
          {orders.map((o) => ` · order ${o.order_id}: € ${Number(o.totaal ?? 0).toFixed(2).replace(".", ",")}, ${o.soort === "beide" ? "verf en samples" : o.soort ?? ""} (${o.status})`).join("")}
        </p>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "12px 0 16px" }}>
        {f !== "bij-roll" && <button className="rd-plan-chip is-on" disabled={bezig} onClick={neemOver}>Neem over</button>}
        {f !== "afgerond" && <button className="rd-plan-chip" disabled={bezig} onClick={() => zet({ status: "afgerond" }, "Afgerond.")}>Afronden</button>}
        {(f === "bij-roll" || f === "afgerond") && <button className="rd-plan-chip" disabled={bezig} onClick={() => zet({ status: "actief", overgenomen_door: null, overgenomen_op: null }, "Terug naar de bot.")}>Terug naar de bot</button>}
        <button className="rd-plan-chip" onClick={bekijk}>Bekijk plan en pakket</button>
      </div>
      {melding && <p className="rd-sub" role="status" style={{ fontWeight: 600 }}>{melding}</p>}

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
        <section className="rd-card-white">
          <div className="rd-card-title" style={{ marginBottom: 8 }}>Het plan</div>
          {rs.length > 0 && <p style={{ margin: "0 0 10px", color: "var(--rd-pink-dark)", fontWeight: 700, fontSize: 14 }}>Beoordelen: {rs.join("; ")}</p>}
          {(r.project?.ruimtes ?? []).length === 0 && <p className="rd-sub">Nog geen ruimtes.</p>}
          {(r.project?.ruimtes ?? []).map((ru) => (
            <div key={ru.id} style={{ marginBottom: 12 }}>
              <div style={{ fontWeight: 800 }}>{ru.naam}{ru.buiten ? " (buiten)" : ""}</div>
              <div style={{ fontSize: 13, opacity: 0.7 }}>{maatTekst(ru)} · muren {Number(w(ru.hoogte) ?? 2.6).toFixed(2).replace(".", ",")} m hoog</div>
              <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 14 }}>
                {ru.vlakken.map((v) => (
                  <li key={v.id} style={{ marginBottom: 4 }}>
                    <strong>{VLAK[v.soort] ?? v.soort}</strong>{w(v.aantal) ? ` (${w(v.aantal)})` : ""}: {kleurTekst(v)}
                    <div style={{ fontSize: 12.5, opacity: 0.65 }}>Nu: {ondergrondTekst(v)}{w(v.glans) ? ` · ${w(v.glans)}` : ""}</div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div style={{ fontSize: 13, opacity: 0.75 }}>
            Spullen: {w(r.project?.spullen) ?? "nog niet gevraagd"}
            {r.project?.samples?.length ? ` · samples: ${r.project.samples.map((s) => s.naam).join(", ")}` : ""}
            {r.project?.packs?.length ? ` · sample packs: ${r.project.packs.map((p) => p.naam || p.productId).join(", ")}` : ""}
            {w(r.project?.volgorde) ? ` · volgorde: ${w(r.project?.volgorde) === "verf-erbij" ? "verf alvast erbij" : "eerst samples"}` : ""}
          </div>
          <div style={{ marginTop: 14 }}>
            <label style={{ fontWeight: 700, fontSize: 14 }} htmlFor="sp-notitie">Notitie voor Roll</label>
            <textarea id="sp-notitie" className="rd-input" rows={3} style={{ width: "100%", marginTop: 6, minHeight: 80 }} value={notitie} onChange={(e) => setNotitie(e.target.value)} placeholder="Bijvoorbeeld: gebeld, stuurt foto's van de muur" />
            <button className="rd-plan-chip" style={{ marginTop: 8 }} disabled={bezig || notitie === (r.notitie ?? "")} onClick={() => zet({ notitie }, "Notitie bewaard.")}>Notitie bewaren</button>
          </div>
        </section>

        <section className="rd-card-white">
          <div className="rd-card-title" style={{ marginBottom: 8 }}>Het gesprek</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 640, overflowY: "auto" }}>
            {(r.gesprek ?? []).map((b, i) => (
              <div key={i} style={{ alignSelf: b.rol === "klant" ? "flex-end" : "flex-start", maxWidth: "85%", background: b.rol === "klant" ? "var(--rd-aubergine)" : "var(--rd-lavender)", color: b.rol === "klant" ? "#fff" : "var(--rd-aubergine)", padding: "8px 12px", borderRadius: 14, fontSize: 14, lineHeight: 1.4 }}>
                {b.tekst}
                {b.op && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>{formatDate(b.op)}</div>}
              </div>
            ))}
            {(r.gesprek ?? []).length === 0 && <p className="rd-sub">Nog geen berichten.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
