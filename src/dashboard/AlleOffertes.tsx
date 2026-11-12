import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { OffertesPage } from "./OffertesPage";
import { Tegel, euro, formatDate, getal, roep } from "./PartnersPage";

// Alle offertes voor het beheer, uit vier bronnen op één plek:
// - de offerte-tool op roll.nl (door Roll gemaakt, na een kleuradvies, of een opgeslagen verfplan);
// - offertes van stylistes voor hun eigen klanten;
// - gesprekken met Charlie waar een e-mailadres bij hoort;
// - prijsopgaven waar een e-mailadres bij hoort.
// Wat besteld of vervallen is staat in het archief; het beheer kan er ook zelf offertes in zetten.

type Soort = "roll" | "kleuradvies" | "styliste" | "verfplan" | "charlie" | "prijsopgave";
type Stand = "bezig" | "verstuurd" | "mand" | "besteld" | "vervallen";
interface Regel {
  sleutel: string; soort: Soort; id: string; naam: string; email: string; wat: string; bedrag: number | null;
  stand: Stand; standTekst: string; datum: string; door: string; intern?: string; extern?: string; zoek: string;
}
interface WpOfferte { id: number; nummer: string; titel: string; naam: string; email: string; totaal: number; status: string; statusLabel: string; herkomst: string; styliste: string; orderId: number; bijgewerkt: string; url: string }
interface WpPrijsopgave { id: number; bron: string; status: string; email: string; naam: string; ruimtes: number; m2: number; totaal: number; kleuren: string; orderId: number; bijgewerkt: string }
interface StylisteOfferte { id: string; offerte_id: number | null; nummer: string | null; customer_name: string; customer_email: string; status: string; totaal: number | null; commissie_pct: number; korting_pct: number; updated_at: string; stylists: { name: string } | null }
interface Chat { sessie: string; email: string; bron: string | null; updated_at: string; mand_op: string | null; mand_soort: string | null }
interface ChatOrder { sessie: string; totaal: number | null; status: string | null; besteld_op: string | null }

const SOORTEN: { k: Soort; naam: string; kort: string; achtergrond: string; kleur: string }[] = [
  { k: "roll", naam: "Roll", kort: "Door Roll gemaakt", achtergrond: "var(--rd-aubergine)", kleur: "#fff" },
  { k: "kleuradvies", naam: "Na kleuradvies", kort: "Na een adviesgesprek", achtergrond: "var(--rd-pink)", kleur: "var(--rd-aubergine)" },
  { k: "styliste", naam: "Styliste, eigen klant", kort: "Eigen klant van een styliste", achtergrond: "var(--rd-lavender-mid)", kleur: "var(--rd-aubergine)" },
  { k: "verfplan", naam: "Verfplan", kort: "Opgeslagen verfplan", achtergrond: "var(--rd-lime)", kleur: "var(--rd-aubergine)" },
  { k: "charlie", naam: "Charlie", kort: "Gesprek met Charlie", achtergrond: "#CFE3F1", kleur: "var(--rd-aubergine)" },
  { k: "prijsopgave", naam: "Prijsopgave", kort: "Zelf uitgerekend op de site", achtergrond: "var(--rd-beige-result)", kleur: "var(--rd-aubergine)" },
];
const soort = (k: string) => SOORTEN.find((s) => s.k === k) ?? SOORTEN[0];
const STAND: Record<Stand, { naam: string; stijl: React.CSSProperties }> = {
  bezig: { naam: "Bezig", stijl: { background: "var(--rd-lavender)", color: "inherit" } },
  verstuurd: { naam: "Verstuurd", stijl: { background: "var(--rd-aubergine)", color: "#fff" } },
  mand: { naam: "In het mandje", stijl: { background: "var(--rd-pink)", color: "var(--rd-aubergine)" } },
  besteld: { naam: "Besteld", stijl: { background: "#C9E6CE", color: "#1e4429" } },
  vervallen: { naam: "Vervallen", stijl: { background: "var(--rd-line)", color: "inherit" } },
};
const klaar = (r: Regel) => r.stand === "besteld" || r.stand === "vervallen";
const meervoud = (n: number, een: string, meer: string) => `${getal(n)} ${n === 1 ? een : meer}`;

function uitWp(o: WpOfferte, eigen: Map<number, StylisteOfferte>): Regel {
  const s = (["roll", "kleuradvies", "styliste", "verfplan"].includes(o.herkomst) ? o.herkomst : "roll") as Soort;
  const so = eigen.get(o.id);
  const stand: Stand = so?.status === "vervallen" ? "vervallen" : o.status === "besteld" || o.status === "betaald" ? "besteld" : o.status === "geannuleerd" ? "vervallen" : o.status === "verstuurd" ? "verstuurd" : "bezig";
  const door = so?.stylists?.name ?? o.styliste;
  return {
    sleutel: `${s}:${o.id}`, soort: s, id: String(o.id), naam: o.naam || so?.customer_name || "", email: o.email || so?.customer_email || "",
    wat: [o.nummer, o.titel && o.titel !== o.naam ? o.titel : "", so ? `${so.commissie_pct}% commissie, ${so.korting_pct}% korting` : ""].filter(Boolean).join(" · "),
    bedrag: o.totaal > 0 ? o.totaal : null, stand, standTekst: stand === "bezig" ? "Concept" : stand === "vervallen" ? "Vervallen" : o.statusLabel || STAND[stand].naam,
    datum: o.bijgewerkt, door, intern: so ? `/dashboard/offertes/${so.id}` : undefined, extern: o.url,
    zoek: `${o.nummer} ${o.titel} ${o.naam} ${o.email} ${door} ${so?.customer_name ?? ""}`.toLowerCase(),
  };
}

export function AlleOffertes() {
  const [wp, setWp] = useState<{ offertes: WpOfferte[]; prijsopgaven: WpPrijsopgave[] } | null>(null);
  const [wpFout, setWpFout] = useState<string | null>(null);
  const [eigen, setEigen] = useState<StylisteOfferte[] | null>(null);
  const [chats, setChats] = useState<{ chats: Chat[]; orders: ChatOrder[] } | null>(null);
  const [archief, setArchief] = useState<Set<string>>(new Set());
  const [weergave, setWeergave] = useState<"lopend" | "archief">("lopend");
  const [filter, setFilter] = useState<Soort | "alle">("alle");
  const [zoek, setZoek] = useState("");

  const laadArchief = useCallback(async () => {
    const { data } = await supabase.from("offerte_archief").select("soort,sleutel");
    setArchief(new Set(((data as { soort: string; sleutel: string }[]) ?? []).map((a) => `${a.soort}:${a.sleutel}`)));
  }, []);

  useEffect(() => {
    roep<{ offertes: WpOfferte[]; prijsopgaven: WpPrijsopgave[] }>("offertes-overzicht", {}).then(({ data, fout }) => {
      if (fout || !data?.offertes) { setWp({ offertes: [], prijsopgaven: [] }); setWpFout("De offertes en prijsopgaven van roll.nl konden niet worden opgehaald. De offertes van stylistes en de gesprekken met Charlie staan er wel."); }
      else setWp(data);
    });
    supabase.from("stylist_offers").select("id,offerte_id,nummer,customer_name,customer_email,status,totaal,commissie_pct,korting_pct,updated_at, stylists(name)").order("updated_at", { ascending: false })
      .then(({ data }) => setEigen((data as unknown as StylisteOfferte[]) ?? []));
    (async () => {
      const { data: c } = await supabase.from("projecthulp_chat").select("sessie,email,bron,updated_at,mand_op,mand_soort").not("email", "is", null).neq("email", "").order("updated_at", { ascending: false }).limit(300);
      const lijst = (c as Chat[]) ?? [];
      const { data: o } = lijst.length ? await supabase.from("projecthulp_chat_order").select("sessie,totaal,status,besteld_op").in("sessie", lijst.map((x) => x.sessie)) : { data: [] };
      setChats({ chats: lijst, orders: (o as ChatOrder[]) ?? [] });
    })();
    laadArchief();
  }, [laadArchief]);

  const regels = useMemo<Regel[]>(() => {
    const perOfferte = new Map<number, StylisteOfferte>();
    for (const s of eigen ?? []) if (s.offerte_id) perOfferte.set(Number(s.offerte_id), s);
    const uit: Regel[] = (wp?.offertes ?? []).map((o) => uitWp(o, perOfferte));
    // Offertes van stylistes die roll.nl niet teruggaf (ouder dan de lijst, of de koppeling lag eruit).
    const gezien = new Set((wp?.offertes ?? []).map((o) => o.id));
    for (const s of eigen ?? []) {
      if (s.offerte_id && gezien.has(Number(s.offerte_id))) continue;
      const stand: Stand = s.status === "besteld" ? "besteld" : s.status === "vervallen" ? "vervallen" : s.status === "verstuurd" ? "verstuurd" : "bezig";
      uit.push({
        sleutel: `styliste:${s.offerte_id ?? s.id}`, soort: "styliste", id: String(s.offerte_id ?? s.id), naam: s.customer_name, email: s.customer_email,
        wat: [s.nummer ?? "", `${s.commissie_pct}% commissie, ${s.korting_pct}% korting`].filter(Boolean).join(" · "), bedrag: s.totaal, stand, standTekst: stand === "bezig" ? "Concept" : STAND[stand].naam,
        datum: s.updated_at, door: s.stylists?.name ?? "", intern: `/dashboard/offertes/${s.id}`, zoek: `${s.nummer ?? ""} ${s.customer_name} ${s.customer_email} ${s.stylists?.name ?? ""}`.toLowerCase(),
      });
    }
    const orderVan = new Map((chats?.orders ?? []).map((o) => [o.sessie, o]));
    for (const c of chats?.chats ?? []) {
      const o = orderVan.get(c.sessie);
      const stand: Stand = o ? "besteld" : c.mand_op ? "mand" : "bezig";
      uit.push({
        sleutel: `charlie:${c.sessie}`, soort: "charlie", id: c.sessie, naam: "", email: c.email,
        wat: c.bron && c.bron !== "onbekend" ? `Kwam via ${c.bron === "samplemail" ? "de samplemail" : c.bron === "quizmail" ? "de mail na de kleurenscan" : c.bron}` : "",
        bedrag: o?.totaal ?? null, stand, standTekst: stand === "mand" ? `In het mandje${c.mand_soort === "samples" ? " (samples)" : ""}` : STAND[stand].naam,
        datum: c.updated_at, door: "", intern: `/dashboard/schilderplan/${c.sessie}`, zoek: c.email.toLowerCase(),
      });
    }
    for (const g of wp?.prijsopgaven ?? []) {
      const stand: Stand = g.status === "besteld" ? "besteld" : g.status === "mand" ? "mand" : g.status === "gemaild" ? "verstuurd" : "bezig";
      uit.push({
        sleutel: `prijsopgave:${g.id}`, soort: "prijsopgave", id: String(g.id), naam: g.naam, email: g.email,
        wat: [g.ruimtes ? meervoud(g.ruimtes, "ruimte", "ruimtes") : "", g.m2 ? `${getal(Math.round(g.m2))} m²` : "", g.kleuren].filter(Boolean).join(" · "),
        bedrag: g.totaal > 0 ? g.totaal : null, stand, standTekst: stand === "verstuurd" ? "Prijsopgave gemaild" : STAND[stand].naam,
        datum: g.bijgewerkt, door: "", zoek: `${g.naam} ${g.email} ${g.kleuren}`.toLowerCase(),
      });
    }
    return uit.sort((a, b) => (a.datum < b.datum ? 1 : -1));
  }, [wp, eigen, chats]);

  const inArchief = useCallback((r: Regel) => klaar(r) || archief.has(r.sleutel), [archief]);
  const term = zoek.trim().toLowerCase();
  const inWeergave = regels.filter((r) => (weergave === "archief") === inArchief(r) && (!term || term.split(/\s+/).every((t) => r.zoek.includes(t))));
  const zichtbaar = inWeergave.filter((r) => filter === "alle" || r.soort === filter);
  const lopend = regels.filter((r) => !inArchief(r));

  const zetArchief = async (r: Regel, erin: boolean) => {
    const [s, ...rest] = r.sleutel.split(":");
    const sleutel = rest.join(":");
    setArchief((oud) => { const n = new Set(oud); if (erin) n.add(r.sleutel); else n.delete(r.sleutel); return n; });
    if (erin) {
      const { data: u } = await supabase.auth.getUser();
      await supabase.from("offerte_archief").upsert({ soort: s, sleutel, archived_by: u?.user?.email ?? null });
    } else await supabase.from("offerte_archief").delete().eq("soort", s).eq("sleutel", sleutel);
  };

  const laden = !wp || !eigen || !chats;
  const knop: React.CSSProperties = { minHeight: 34, padding: "0 12px", fontSize: 13, display: "inline-flex", alignItems: "center", textDecoration: "none" };

  return (
    <div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Tegel label="Lopend" waarde={getal(lopend.length)} sub={`Samen ${euro(lopend.reduce((n, r) => n + (r.bedrag ?? 0), 0))}`} />
        <Tegel label="Verstuurd of in het mandje" waarde={getal(lopend.filter((r) => r.stand === "verstuurd" || r.stand === "mand").length)} sub="Wacht op de klant" />
        <Tegel label="Besteld" waarde={getal(regels.filter((r) => r.stand === "besteld").length)} sub={`Samen ${euro(regels.filter((r) => r.stand === "besteld").reduce((n, r) => n + (r.bedrag ?? 0), 0))}`} />
      </div>

      <input className="rd-input" type="search" value={zoek} onChange={(e) => setZoek(e.target.value)} placeholder="Zoek op naam, e-mailadres of nummer" aria-label="Zoek een offerte" style={{ margin: "4px 0 10px", background: "#fff" }} />

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 8 }} role="tablist" aria-label="Lopend of archief">
        {(["lopend", "archief"] as const).map((w) => (
          <button key={w} role="tab" aria-selected={weergave === w} className={`rd-plan-chip${weergave === w ? " is-on" : ""}`} onClick={() => setWeergave(w)}>
            {w === "lopend" ? "Lopend" : "Archief"} <span style={{ opacity: 0.6, fontWeight: 500 }}>{getal(regels.filter((r) => (w === "archief") === inArchief(r)).length)}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }} role="tablist" aria-label="Soort offerte">
        {([{ k: "alle" as const, naam: "Alle soorten" }, ...SOORTEN]).map((s) => {
          const n = inWeergave.filter((r) => s.k === "alle" || r.soort === s.k).length;
          return (
            <button key={s.k} role="tab" aria-selected={filter === s.k} className={`rd-plan-chip${filter === s.k ? " is-on" : ""}`} style={{ minHeight: 36, padding: "0 12px", fontSize: 13, opacity: n === 0 && filter !== s.k ? 0.5 : 1 }} onClick={() => setFilter(s.k)}>
              {s.naam} <span style={{ opacity: 0.6, fontWeight: 500 }}>{getal(n)}</span>
            </button>
          );
        })}
      </div>

      {wpFout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{wpFout}</p>}
      {laden && <p className="rd-sub">Laden...</p>}
      {!laden && zichtbaar.length === 0 && (
        <p className="rd-sub">{term ? `Niets gevonden voor "${zoek.trim()}".` : weergave === "archief" ? "Het archief is leeg voor deze soort." : "Geen lopende offertes van deze soort."}</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {zichtbaar.slice(0, 200).map((r) => {
          const s = soort(r.soort);
          const handmatig = archief.has(r.sleutel);
          return (
            <div key={r.sleutel} className="rd-card-white" style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
              <div style={{ minWidth: 0, flex: "1 1 260px" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  <span style={{ fontWeight: 700, fontSize: 15, overflowWrap: "anywhere" }}>{r.naam || r.email}</span>
                  <span className="rd-chip" style={{ padding: "3px 9px", fontSize: 11, background: s.achtergrond, color: s.kleur }} title={s.kort}>{s.naam}</span>
                </div>
                <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2, overflowWrap: "anywhere" }}>
                  {[r.naam ? r.email : "", r.door ? `door ${r.door}` : "", r.wat].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end", fontSize: 14 }}>
                {r.bedrag != null && <strong style={{ fontVariantNumeric: "tabular-nums" }}>{euro(r.bedrag)}</strong>}
                <span className="rd-chip" style={{ ...STAND[r.stand].stijl, fontWeight: 700 }}>{r.standTekst}</span>
                <span style={{ fontSize: 13, opacity: 0.6 }}>{formatDate(r.datum)}</span>
                {r.intern ? <Link className="rd-plan-chip" style={knop} to={r.intern}>Open</Link>
                  : r.extern ? <a className="rd-plan-chip" style={knop} href={r.extern} target="_blank" rel="noreferrer">Open op roll.nl</a>
                  : <a className="rd-plan-chip" style={knop} href={`mailto:${r.email}`}>Mail</a>}
                {!klaar(r) && <button className="rd-textlink" style={{ minHeight: 0, fontSize: 13 }} onClick={() => zetArchief(r, !handmatig)}>{handmatig ? "Terugzetten" : "Naar archief"}</button>}
              </div>
            </div>
          );
        })}
      </div>
      {zichtbaar.length > 200 && <p className="rd-sub" style={{ fontSize: 13 }}>De nieuwste 200 van {getal(zichtbaar.length)}. Zoek op naam of e-mailadres om een oudere te vinden.</p>}
      <p className="rd-sub" style={{ fontSize: 13, marginTop: 14 }}>
        Bij Charlie en de prijsopgave staan alleen klanten die een e-mailadres hebben achtergelaten. Besteld en vervallen gaat vanzelf naar het archief.
      </p>
    </div>
  );
}

/** Offertes: een styliste ziet haar eigen offertes; het beheer ziet alles en kan door naar de werkweergave van stylistes. */
export function OffertesBeheer() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"alle" | "stylistes">("alle");
  useEffect(() => { supabase.rpc("is_admin").then(({ data }) => setAdmin(data === true)); }, []);
  if (admin === null) return <p className="rd-sub">Laden...</p>;
  if (!admin) return <OffertesPage />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          {tab === "alle" && <h1 className="rd-h2" style={{ margin: "0 0 2px" }}>Offertes</h1>}
          {tab === "alle" && <p className="rd-sub" style={{ margin: 0 }}>Alles op één plek: van Roll, van stylistes, uit Charlie en uit de prijsopgave.</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }} role="tablist" aria-label="Weergave">
          {(["alle", "stylistes"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`rd-plan-chip${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{k === "alle" ? "Alle offertes" : "Eigen klanten van stylistes"}</button>)}
        </div>
      </div>
      {tab === "alle" ? <AlleOffertes /> : <OffertesPage />}
    </div>
  );
}
