import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

// Inzichten uit Jouw schilderplan: hoe ver komen klanten, waar stoppen ze, wat vragen ze en waar had Charlie geen antwoord op.
// Alleen beheerders. Onderwerpen en "geen antwoord" bestaan vanaf de eerste beurt na de livegang van die labels.

type Bericht = { rol: "klant" | "roll"; tekst: string; uit?: { antwoord?: { vraag?: string; formulier?: { soort?: string } | null } } };
type Gesprek = {
  sessie: string;
  status: string | null;
  code: string | null;
  overdracht_op: string | null;
  mand_op: string | null;
  mand_soort: string | null;
  created_at: string;
  updated_at: string | null;
  project: { ruimtes?: { vlakken?: { kleur?: { status?: string } }[] }[]; samplekleuren?: string[] } | null;
  gesprek: Bericht[] | null;
  // Waar het gesprek vandaan komt: de knop in een mail (samplemail, quizmail) met de utm-velden van die link.
  bron: string | null;
  utm: Record<string, string> | null;
};
type Order = { order_id: number; sessie: string; status: string | null; totaal: number | null; soort: string | null };
type Beurt = { id: number; sessie: string; bericht: string | null; onderwerp: string | null; onbeantwoord: boolean | null; created_at: string; nagekeken_op: string | null };

const BETAALD = ["processing", "completed", "on-hold"];
const UUR = 3600_000;

const ONDERWERP: Record<string, string> = {
  kleur: "Kleur",
  product: "Producten",
  hoeveelheid: "Hoeveelheid verf",
  prijs: "Prijs",
  korting: "Korting",
  levering: "Levering en verzending",
  retour: "Retour",
  aanbrengen: "Schilderen en droogtijd",
  ondergrond: "Ondergrond en voorbereiding",
  advies: "Kleuradvies van een stylist",
  bestellen: "Bestellen en betalen",
  anders: "Iets anders",
};

// De laatste vraag van Charlie, in gewone woorden.
const STOP: Record<string, string> = {
  start: "Wat ga je schilderen?",
  onderdelen: "Welke onderdelen?",
  maat: "De maat van de ruimte",
  muren: "De muren nu (ondergrond)",
  ondergrond: "De muren nu (ondergrond)",
  lak: "Lakwerk: aantal, staat en glans",
  kleur: "Kleur kiezen",
  kleurroute: "Kleur: welke route?",
  "geen-idee": "Kleur: nog geen idee",
  plafond: "Het plafond",
  spullen: "Spullen en gereedschap",
  wanneer: "Wanneer ga je schilderen?",
  volgorde: "Eerst samples of verf erbij?",
  eigen: "Een eigen vraag van Charlie",
  geen: "Geen open vraag (plan bekeken)",
  onbekend: "Niet bekend (ouder gesprek)",
};

const klantBerichten = (g: Gesprek) => (g.gesprek ?? []).filter((b) => "klant" === b.rol);
const heeftRuimte = (g: Gesprek) => (g.project?.ruimtes ?? []).length > 0;
const heeftKleur = (g: Gesprek) => (g.project?.ruimtes ?? []).some((r) => (r.vlakken ?? []).some((v) => "gekozen" === v.kleur?.status));

function laatsteVraag(g: Gesprek) {
  const laatste = [...(g.gesprek ?? [])].reverse().find((b) => "roll" === b.rol);
  const a = laatste?.uit?.antwoord;
  return a?.formulier?.soort ?? a?.vraag ?? "onbekend";
}
const procent = (deel: number, geheel: number) => (geheel ? `${Math.round((deel / geheel) * 100)}%` : "0%");
const euro = (n: number) => `€ ${n.toFixed(2).replace(".", ",")}`;

const rij = { display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0", borderTop: "1px solid rgba(47,33,65,.1)", alignItems: "baseline" } as const;
const knopRij = { ...rij, width: "100%", background: "none", borderLeft: 0, borderRight: 0, borderBottom: 0, cursor: "pointer", font: "inherit", color: "inherit", textAlign: "left" } as const;

export function InzichtenPage() {
  const [gesprekken, setGesprekken] = useState<Gesprek[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [beurten, setBeurten] = useState<Beurt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState("");
  const [dagen, setDagen] = useState<7 | 30 | 0>(30);
  const [openStop, setOpenStop] = useState("");
  const [openOnderwerp, setOpenOnderwerp] = useState("");
  const [openMail, setOpenMail] = useState("");
  const [email, setEmail] = useState("");

  const laad = async () => {
    const [g, o, b] = await Promise.all([
      supabase.from("projecthulp_chat").select("sessie,status,code,overdracht_op,mand_op,mand_soort,created_at,updated_at,project,gesprek,bron,utm")
        .not("sessie", "like", "test%").order("created_at", { ascending: false }).limit(1000),
      supabase.from("projecthulp_chat_order").select("order_id,sessie,status,totaal,soort").limit(2000),
      supabase.from("projecthulp_chat_log").select("id,sessie,bericht,onderwerp,onbeantwoord,created_at,nagekeken_op")
        .not("onderwerp", "is", null).not("sessie", "like", "test%").order("created_at", { ascending: false }).limit(3000),
    ]);
    if (g.error || o.error || b.error) setFout("Laden lukte niet. Ben je ingelogd als beheerder?");
    setGesprekken((g.data as unknown as Gesprek[]) ?? []);
    setOrders((o.data as Order[]) ?? []);
    setBeurten((b.data as Beurt[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    laad();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "Roll"));
  }, []);

  const opgelost = async (b: Beurt) => {
    const { error } = await supabase.from("projecthulp_chat_log").update({ nagekeken_op: new Date().toISOString(), nagekeken_door: email }).eq("id", b.id);
    if (error) { setFout("Opslaan lukte niet."); return; }
    laad();
  };

  const nu = Date.now();
  const vanaf = dagen ? nu - dagen * 24 * UUR : 0;

  const cijfers = useMemo(() => {
    const echt = gesprekken.filter((g) => klantBerichten(g).length > 0 && new Date(g.created_at).getTime() >= vanaf);
    const sessies = new Set(echt.map((g) => g.sessie));
    const betaald = orders.filter((o) => sessies.has(o.sessie) && BETAALD.includes(o.status ?? ""));
    const metOrder = new Set(betaald.map((o) => o.sessie));
    const omzet = betaald.reduce((som, o) => som + Number(o.totaal ?? 0), 0);

    // Gestopt: geen klik op bestellen, geen order, geen hulpvraag, en al minstens een uur stil.
    const gestopt = echt.filter((g) => !g.mand_op && !metOrder.has(g.sessie) && !g.overdracht_op
      && !["bij-roll", "afgerond"].includes(g.status ?? "")
      && nu - new Date(g.updated_at ?? g.created_at).getTime() > UUR);
    const stopGroepen = new Map<string, Gesprek[]>();
    for (const g of gestopt) {
      const k = laatsteVraag(g);
      stopGroepen.set(k, [...(stopGroepen.get(k) ?? []), g]);
    }

    const periodeBeurten = beurten.filter((b) => new Date(b.created_at).getTime() >= vanaf);
    const onderwerpen = new Map<string, Beurt[]>();
    for (const b of periodeBeurten) {
      if (!b.onderwerp || "geen" === b.onderwerp) continue;
      onderwerpen.set(b.onderwerp, [...(onderwerpen.get(b.onderwerp) ?? []), b]);
    }

    // Uit de mails: elke klik op de verfplan-knop maakt een gesprek, ook als de klant daarna niets doet.
    const betaaldOp = new Set(orders.filter((o) => BETAALD.includes(o.status ?? "")).map((o) => o.sessie));
    const uitMail = gesprekken.filter((g) => g.bron && new Date(g.created_at).getTime() >= vanaf);
    const mails = new Map<string, Gesprek[]>();
    for (const g of uitMail) {
      const k = `${g.utm?.utm_content ?? "zonder utm_content"} · ${g.bron}`;
      mails.set(k, [...(mails.get(k) ?? []), g]);
    }

    return {
      mails: [...mails.entries()].sort((a, b) => b[1].length - a[1].length).map(([k, lijst]) => ({
        k, lijst,
        gestart: lijst.filter((g) => klantBerichten(g).length > 0).length,
        kleur: lijst.filter(heeftKleur).length,
        mand: lijst.filter((g) => g.mand_op).length,
        besteld: lijst.filter((g) => betaaldOp.has(g.sessie)).length,
      })),
      betaaldOp,
      trechter: [
        { label: "Gesprek gestart", n: echt.length },
        { label: "Plan gestart (ruimte gekozen)", n: echt.filter(heeftRuimte).length },
        { label: "Kleur gekozen", n: echt.filter(heeftKleur).length },
        { label: "Klikte op bestellen", n: echt.filter((g) => g.mand_op).length },
        { label: "Betaalde bestelling", n: metOrder.size },
      ],
      start: echt.length,
      omzet,
      samples: betaald.filter((o) => "samples" === o.soort).length,
      verf: betaald.filter((o) => "samples" !== o.soort).length,
      hulp: echt.filter((g) => g.overdracht_op).length,
      gestopt: gestopt.length,
      stopGroepen: [...stopGroepen.entries()].sort((a, b) => b[1].length - a[1].length),
      onderwerpen: [...onderwerpen.entries()].sort((a, b) => b[1].length - a[1].length),
      open: periodeBeurten.filter((b) => b.onbeantwoord && !b.nagekeken_op),
    };
  }, [gesprekken, orders, beurten, vanaf, nu]);

  return (
    <div>
      <h1 className="rd-h2" style={{ margin: "0 0 4px" }}>Inzichten chat</h1>
      <p className="rd-sub" style={{ marginTop: 0, maxWidth: 720 }}>
        Hoe ver klanten komen met Charlie, waar ze stoppen, wat ze vragen en waar hij geen antwoord op had.
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button className={`rd-plan-chip${7 === dagen ? " is-on" : ""}`} onClick={() => setDagen(7)}>7 dagen</button>
        <button className={`rd-plan-chip${30 === dagen ? " is-on" : ""}`} onClick={() => setDagen(30)}>30 dagen</button>
        <button className={`rd-plan-chip${0 === dagen ? " is-on" : ""}`} onClick={() => setDagen(0)}>Alles</button>
      </div>
      {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)" }}>{fout}</p>}
      {loading ? <p className="rd-sub">Laden...</p> : (
        <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", alignItems: "start" }}>
          <section className="rd-card-white">
            <div className="rd-card-title" style={{ marginBottom: 8 }}>Hoe ver komen klanten?</div>
            {cijfers.trechter.map((t) => (
              <div key={t.label} style={rij}>
                <span>{t.label}</span>
                <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{t.n} <span style={{ fontWeight: 400, opacity: 0.6 }}>({procent(t.n, cijfers.start)})</span></span>
              </div>
            ))}
            <p className="rd-sub" style={{ marginBottom: 0 }}>
              Omzet {euro(cijfers.omzet)} · {cijfers.samples} {1 === cijfers.samples ? "bestelling" : "bestellingen"} alleen samples · {cijfers.verf} met verf · {cijfers.hulp} vroeg om hulp
            </p>
          </section>

          <section className="rd-card-white">
            <div className="rd-card-title" style={{ marginBottom: 8 }}>Waar stopt het? ({cijfers.gestopt})</div>
            <p className="rd-sub" style={{ marginTop: 0 }}>De laatste vraag van Charlie in gesprekken die al een uur stil zijn, zonder bestelling of hulpvraag.</p>
            {0 === cijfers.stopGroepen.length && <p className="rd-sub">Nog niets te zien.</p>}
            {cijfers.stopGroepen.map(([k, lijst]) => (
              <div key={k}>
                <button style={knopRij} aria-expanded={openStop === k} onClick={() => setOpenStop(openStop === k ? "" : k)}>
                  <span>{STOP[k] ?? k}</span>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{lijst.length} <span style={{ fontWeight: 400, opacity: 0.6 }}>({procent(lijst.length, cijfers.gestopt)})</span></span>
                </button>
                {openStop === k && lijst.slice(0, 20).map((g) => {
                  const kb = klantBerichten(g);
                  return (
                    <div key={g.sessie} style={{ fontSize: 13, padding: "4px 0 8px" }}>
                      <span style={{ opacity: 0.6 }}>{formatDate(g.updated_at ?? g.created_at)}{g.bron ? ` · ${g.bron}` : ""}: </span>
                      "{kb[kb.length - 1]?.tekst}" <Link to={`/beheer/schilderplan/${g.sessie}`} className="rd-textlink">Bekijk</Link>
                    </div>
                  );
                })}
              </div>
            ))}
          </section>

          <section className="rd-card-white">
            <div className="rd-card-title" style={{ marginBottom: 8 }}>Wat vragen mensen?</div>
            {0 === cijfers.onderwerpen.length && <p className="rd-sub">Nog geen vragen met een onderwerp.</p>}
            {cijfers.onderwerpen.map(([k, lijst]) => {
              const mis = lijst.filter((b) => b.onbeantwoord).length;
              return (
                <div key={k}>
                  <button style={knopRij} aria-expanded={openOnderwerp === k} onClick={() => setOpenOnderwerp(openOnderwerp === k ? "" : k)}>
                    <span>{ONDERWERP[k] ?? k}</span>
                    <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{lijst.length}{mis > 0 && <span style={{ fontWeight: 400, opacity: 0.6 }}> ({mis} geen antwoord)</span>}</span>
                  </button>
                  {openOnderwerp === k && lijst.slice(0, 20).map((b) => (
                    <div key={b.id} style={{ fontSize: 13, padding: "4px 0 8px" }}>
                      "{b.bericht}" <Link to={`/beheer/schilderplan/${b.sessie}`} className="rd-textlink">Bekijk</Link>
                    </div>
                  ))}
                </div>
              );
            })}
          </section>

          <section className="rd-card-white">
            <div className="rd-card-title" style={{ marginBottom: 8 }}>Uit de mails</div>
            <p className="rd-sub" style={{ marginTop: 0 }}>Klikken op de verfplan-knop in een mail, per mail (utm_content) en bron. Een klik telt ook als de klant daarna niets deed.</p>
            {0 === cijfers.mails.length && <p className="rd-sub">Nog geen klikken uit een mail.</p>}
            {cijfers.mails.map((m) => (
              <div key={m.k}>
                <button style={knopRij} aria-expanded={openMail === m.k} onClick={() => setOpenMail(openMail === m.k ? "" : m.k)}>
                  <span>{m.k}</span>
                  <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{m.lijst.length} <span style={{ fontWeight: 400, opacity: 0.6 }}>klik{1 === m.lijst.length ? "" : "ken"}</span></span>
                </button>
                <div style={{ fontSize: 13, opacity: 0.75, padding: "0 0 6px" }}>
                  {m.gestart} gestart · {m.kleur} kleur gekozen · {m.mand} klikte op bestellen · {m.besteld} besteld ({procent(m.besteld, m.lijst.length)})
                </div>
                {openMail === m.k && m.lijst.slice(0, 30).map((g) => (
                  <div key={g.sessie} style={{ fontSize: 13, padding: "4px 0 8px" }}>
                    <span style={{ opacity: 0.6 }}>{formatDate(g.created_at)} · {g.bron}{g.utm?.utm_content ? ` · ${g.utm.utm_content}` : ""}: </span>
                    {cijfers.betaaldOp.has(g.sessie) ? "besteld" : g.mand_op ? "klikte op bestellen" : heeftKleur(g) ? "kleur gekozen" : klantBerichten(g).length ? "gestart" : "alleen geopend"}
                    {(g.project?.samplekleuren ?? []).length > 0 && <span style={{ opacity: 0.6 }}> · samples: {(g.project?.samplekleuren ?? []).slice(0, 5).join(", ")}</span>}
                    {" "}<Link to={`/beheer/schilderplan/${g.sessie}`} className="rd-textlink">Bekijk</Link>
                  </div>
                ))}
              </div>
            ))}
          </section>

          <section className="rd-card-white">
            <div className="rd-card-title" style={{ marginBottom: 8 }}>Geen antwoord van Charlie ({cijfers.open.length})</div>
            <p className="rd-sub" style={{ marginTop: 0 }}>
              Zet het antwoord in de <Link to="/beheer/kennisbank" className="rd-textlink">kennisbank</Link> en markeer de vraag als opgelost.
            </p>
            {0 === cijfers.open.length && <p className="rd-sub">Geen open vragen.</p>}
            {cijfers.open.slice(0, 50).map((b) => (
              <div key={b.id} style={{ ...rij, flexWrap: "wrap" }}>
                <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                  <div style={{ fontSize: 15 }}>"{b.bericht}"</div>
                  <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>
                    {ONDERWERP[b.onderwerp ?? ""] ?? b.onderwerp} · {formatDate(b.created_at)} · <Link to={`/beheer/schilderplan/${b.sessie}`} className="rd-textlink">Bekijk het gesprek</Link>
                  </div>
                </div>
                <button className="rd-plan-chip" onClick={() => opgelost(b)}>Opgelost</button>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  );
}
