import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Tegel, blokKop, euro, formatDate, getal, rij, roep, type Kwartaal, type WpPartner } from "./PartnersPage";

// Commissie voor het beheer: iedereen die commissie krijgt op één plek. Stylistes komen uit onze eigen tabel
// (per bestelling), makelaars, creators en merken van roll.nl (per kwartaal, met de keuze uitbetalen of verf).
// Hier handelt Roll ook de keuze van een partner af: betaald, of het verftegoed aanmaken.

export interface CommissieRij { woo_order_id: string; stylist_id: string | null; verf_excl: number; amount: number; status: string; created_at: string; stylists: { name: string } | null }

const kwartaalStart = () => { const d = new Date(); return new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).toISOString(); };
const kwartaalNaam = () => { const d = new Date(); return `Q${Math.floor(d.getMonth() / 3) + 1} ${d.getFullYear()}`; };
const soortNaam = (s: string) => ({ makelaar: "Makelaar", creator: "Creator", merk: "Merk", styliste: "Styliste" } as Record<string, string>)[s] ?? "Partner";
const klein: React.CSSProperties = { width: "auto", minHeight: 40, padding: "0 16px", fontSize: 14 };

/** In welke stand staat een kwartaal van een partner, in woorden voor het beheer. */
function stand(k: Kwartaal): string {
  if (k.uitbetaling === "afgehandeld") return k.keuze === "verf" ? `Verftegoed gemaakt${k.afgehandeldOp ? ` op ${formatDate(k.afgehandeldOp)}` : ""}` : `Betaald${k.afgehandeldOp ? ` op ${formatDate(k.afgehandeldOp)}` : ""}`;
  if (k.uitbetaling === "factuur") return `Factuur gemeld${k.factuurNr ? ` (${k.factuurNr})` : ""}, ${k.keuze === "verf" ? "wil verftegoed" : "wil uitbetaling"}`;
  if (k.uitbetaling === "aangevraagd") return k.keuze === "verf" ? "Koos verftegoed, factuur volgt" : "Koos uitbetalen, factuur volgt";
  if (k.klaar && k.commissie > 0) return "Af te rekenen, wacht op de keuze van de partner";
  return k.commissie > 0 ? `Loopt, af te rekenen vanaf ${formatDate(k.afrekenbaar)}` : "Loopt";
}
const wachtOpRoll = (k: Kwartaal) => k.uitbetaling === "aangevraagd" || k.uitbetaling === "factuur";

/** Eén keuze van een partner afhandelen, met een bevestiging vooraf. */
function Afhandelen({ p, k, klaar }: { p: WpPartner; k: Kwartaal; klaar: (bericht: string) => void }) {
  const [vraag, setVraag] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [bericht, setBericht] = useState<string | null>(null);
  const verf = k.keuze === "verf";
  const doe = async () => {
    setBezig(true); setBericht(null);
    const { data, fout } = await roep<{ tegoedcode: string; bedragIncl: number }>("partners-beheer", { action: "uitbetaling_afhandelen", slug: p.slug, kwartaal: k.kwartaal });
    setBezig(false); setVraag(false);
    if (fout || !data) { setBericht(fout ?? "Afhandelen lukte niet."); return; }
    // De regel verdwijnt na het afhandelen uit de lijst; de bevestiging blijft bovenaan het blok staan.
    klaar(verf
      ? `${p.naam}, ${k.label}: verftegoed van ${euro(data.bedragIncl)} gemaakt, code ${data.tegoedcode.toUpperCase()}. De partner ziet de code in het eigen dashboard.`
      : `${p.naam}, ${k.label}: gemarkeerd als betaald (${euro(k.bedragIncl)} inclusief btw).`);
  };
  if (bericht) return <span style={{ fontSize: 14, fontWeight: 600, color: "var(--rd-pink-dark)" }} role="status">{bericht}</span>;
  if (vraag) {
    return (
      <span style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ fontSize: 14 }}>{verf ? `Is de factuur binnen? Dan maak ik een tegoedcode van ${euro(k.bedragIncl)}.` : `Is de factuur van ${euro(k.bedragIncl)} betaald?`}</span>
        <button className="rd-btn rd-btn-primary" style={klein} disabled={bezig} onClick={doe}>{bezig ? "Bezig..." : "Ja, bevestig"}</button>
        <button className="rd-btn rd-btn-outline" style={klein} disabled={bezig} onClick={() => setVraag(false)}>Terug</button>
      </span>
    );
  }
  return <button className="rd-btn rd-btn-primary" style={klein} onClick={() => setVraag(true)}>{verf ? "Factuur binnen, maak verftegoed" : "Markeer als betaald"}</button>;
}

export function CommissieBeheer({ rows, tab, naarStylistes }: { rows: CommissieRij[]; tab: "alles" | "partners"; naarStylistes: () => void }) {
  const [partners, setPartners] = useState<WpPartner[] | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  // Wat er net is afgehandeld, zodat de bevestiging (en een tegoedcode) in beeld blijft.
  const [gedaan, setGedaan] = useState<string[]>([]);

  const laad = useCallback(() => {
    roep<{ partners: WpPartner[] }>("partners-beheer", { action: "commissie" }).then(({ data, fout }) => {
      if (fout || !data?.partners) setFout("De commissie van makelaars, creators en merken kon niet worden opgehaald van roll.nl.");
      else { setFout(null); setPartners(data.partners); }
    });
  }, []);
  useEffect(() => { laad(); }, [laad]);
  const afgehandeld = useCallback((bericht: string) => { setGedaan((g) => [...g, bericht]); laad(); }, [laad]);
  const bevestigingen = gedaan.map((b, i) => (
    <div key={i} role="status" style={{ background: "var(--rd-lavender)", borderRadius: 12, padding: "10px 14px", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{b}</div>
  ));

  // Stylistes: per styliste wat er dit kwartaal bij kwam, wat openstaat en wat is betaald.
  const stylistes = useMemo(() => {
    const start = kwartaalStart();
    const per = new Map<string, { naam: string; kwartaal: number; open: number; betaald: number; controle: number }>();
    for (const r of rows) {
      if (r.status === "vervallen") continue;
      const s = per.get(r.stylist_id ?? "?") ?? { naam: r.stylists?.name ?? "Onbekend", kwartaal: 0, open: 0, betaald: 0, controle: 0 };
      if (r.created_at >= start) s.kwartaal += r.amount;
      if (r.status === "uitbetaald") s.betaald += r.amount; else s.open += r.amount;
      if (r.status === "te_controleren") s.controle += 1;
      per.set(r.stylist_id ?? "?", s);
    }
    return [...per.values()];
  }, [rows]);

  const lijst = partners ?? [];
  const partnerBetaald = (p: WpPartner) => (p.kwartalen ?? []).filter((k) => k.uitbetaling === "afgehandeld").reduce((n, k) => n + k.bedrag, 0);
  const teDoen = lijst.flatMap((p) => (p.kwartalen ?? []).filter(wachtOpRoll).map((k) => ({ p, k })));
  const wachtOpPartner = lijst.flatMap((p) => (p.kwartalen ?? []).filter((k) => !k.uitbetaling && k.klaar && k.commissie > 0).map((k) => ({ p, k })));
  const controle = stylistes.reduce((n, s) => n + s.controle, 0);

  // Bestellingen waar zowel een partner als een styliste commissie over krijgt (besluit 12 nov 2026: beiden houden het).
  const dubbel = useMemo(() => {
    const perOrder = new Map<string, CommissieRij>();
    for (const r of rows) if (r.status !== "vervallen") perOrder.set(String(r.woo_order_id), r);
    return lijst.flatMap((p) => (p.orders ?? []).filter((o) => perOrder.has(String(o.nr)) && o.commissie > 0).map((o) => ({ p, o, s: perOrder.get(String(o.nr))! })));
  }, [rows, lijst]);

  if (tab === "partners") {
    return (
      <div>
        {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{fout}</p>}
        {!partners && !fout && <p className="rd-sub">Laden...</p>}
        {bevestigingen}
        {lijst.map((p) => (
          <div key={p.slug} className="rd-card-white" style={{ marginBottom: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline", marginBottom: 6 }}>
              <span><Link to={`/dashboard/partners/${p.slug}`} style={{ color: "inherit", fontWeight: 700, fontSize: 16 }}>{p.naam}</Link> <span style={{ opacity: 0.6, fontSize: 13 }}>· {soortNaam(p.soort)} · {p.afspraken.commissiePct}%</span></span>
              <span style={{ fontSize: 14 }}>Open <strong>{euro(p.kort.commissieOpen)}</strong> <span style={{ opacity: 0.6 }}>· betaald {euro(partnerBetaald(p))}</span></span>
            </div>
            {(p.kwartalen ?? []).map((k) => (
              <div key={k.kwartaal} style={rij}>
                <span><strong>{k.label}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>· {getal(k.orders)} bestelling{k.orders === 1 ? "" : "en"} · omzet {euro(k.omzet)}</span></span>
                <span style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
                  <strong style={{ fontVariantNumeric: "tabular-nums" }}>{euro(k.commissie)}</strong>
                  {wachtOpRoll(k) ? <Afhandelen p={p} k={k} klaar={afgehandeld} /> : <span style={{ opacity: 0.7, fontSize: 13 }}>{stand(k)}</span>}
                  {k.uitbetaling === "afgehandeld" && k.tegoedcode && <span style={{ fontFamily: "monospace", fontSize: 13 }}>{k.tegoedcode.toUpperCase()}</span>}
                </span>
              </div>
            ))}
          </div>
        ))}
        <p className="rd-sub" style={{ fontSize: 13 }}>Een partner kiest per afgesloten kwartaal uitbetalen of verf en mailt de factuur naar admin@roll.nl. Hier markeer je daarna betaald, of maak je het verftegoed aan voor het bedrag inclusief btw.</p>
      </div>
    );
  }

  const ditKwartaal = stylistes.reduce((n, s) => n + s.kwartaal, 0) + lijst.reduce((n, p) => n + p.kort.commissie, 0);
  const open = stylistes.reduce((n, s) => n + s.open, 0) + lijst.reduce((n, p) => n + p.kort.commissieOpen, 0);
  const betaald = stylistes.reduce((n, s) => n + s.betaald, 0) + lijst.reduce((n, p) => n + partnerBetaald(p), 0);
  const iedereen = [
    ...stylistes.map((s) => ({ sleutel: "s" + s.naam, naam: s.naam, soort: "styliste", kwartaal: s.kwartaal, open: s.open, betaald: s.betaald, naar: "" })),
    ...lijst.map((p) => ({ sleutel: "p" + p.slug, naam: p.naam, soort: p.soort, kwartaal: p.kort.commissie, open: p.kort.commissieOpen, betaald: partnerBetaald(p), naar: `/dashboard/partners/${p.slug}` })),
  ].sort((a, b) => b.open - a.open || a.naam.localeCompare(b.naam, "nl"));

  return (
    <div>
      {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{fout} De cijfers van de stylistes staan er wel.</p>}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", margin: "4px 0 10px" }}>
        <Tegel label={`Commissie ${kwartaalNaam()}`} waarde={euro(ditKwartaal)} sub="Stylistes en partners samen" />
        <Tegel label="Nog te betalen" waarde={euro(open)} sub="Alles wat nog niet is afgehandeld" />
        <Tegel label="Betaald" waarde={euro(betaald)} sub="Tot nu toe" />
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Wacht op jou")}
        {bevestigingen}
        {teDoen.length === 0 && controle === 0 && <p className="rd-sub" style={{ margin: 0 }}>Alles is bijgewerkt.</p>}
        {teDoen.map(({ p, k }, i) => (
          <div key={p.slug + k.kwartaal} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <span><strong>{p.naam}</strong> <span style={{ opacity: 0.7, fontSize: 13 }}>· {k.label} · {stand(k)}{k.gekozenOp ? ` · gekozen op ${formatDate(k.gekozenOp)}` : ""} · kenmerk {k.kenmerk}</span></span>
            <span style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center", justifyContent: "flex-end" }}>
              <span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{euro(k.bedragIncl)}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>incl. btw</span></span>
              <Afhandelen p={p} k={k} klaar={afgehandeld} />
            </span>
          </div>
        ))}
        {controle > 0 && (
          <div style={teDoen.length ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <span><strong>Stylistes</strong> <span style={{ opacity: 0.7, fontSize: 13 }}>· {getal(controle)} bestelling{controle === 1 ? "" : "en"} te controleren</span></span>
            <button className="rd-plan-chip" style={{ minHeight: 40 }} onClick={naarStylistes}>Bekijk</button>
          </div>
        )}
        {wachtOpPartner.length > 0 && (
          <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>
            Wacht op de keuze van de partner: {wachtOpPartner.map(({ p, k }) => `${p.naam} ${k.label} (${euro(k.commissie)})`).join(", ")}.
          </p>
        )}
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Iedereen")}
        {!partners && !fout && <p className="rd-sub" style={{ margin: "0 0 6px" }}>De partners laden...</p>}
        {iedereen.length === 0 && partners && <p className="rd-sub" style={{ margin: 0 }}>Zodra er commissie is, staat die hier.</p>}
        {iedereen.map((x, i) => (
          <div key={x.sleutel} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <span>{x.naar ? <Link to={x.naar} style={{ color: "inherit", fontWeight: 700 }}>{x.naam}</Link> : <strong>{x.naam}</strong>} <span style={{ opacity: 0.6, fontSize: 13 }}>· {soortNaam(x.soort)}</span></span>
            <span style={{ display: "flex", gap: 16, fontSize: 13, fontVariantNumeric: "tabular-nums", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span><span style={{ opacity: 0.6 }}>{kwartaalNaam()}</span> <strong>{euro(x.kwartaal)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Open</span> <strong>{euro(x.open)}</strong></span>
              <span style={{ opacity: 0.7 }}>Betaald {euro(x.betaald)}</span>
            </span>
          </div>
        ))}
      </div>

      <div className="rd-card-white">
        {blokKop("Bestellingen met twee keer commissie")}
        {dubbel.length === 0 ? (
          <p className="rd-sub" style={{ margin: 0 }}>Hier komen bestellingen waar zowel een partner als een styliste commissie over krijgt, bijvoorbeeld een klant van een makelaar na een adviesgesprek. Beiden houden hun commissie.</p>
        ) : dubbel.map(({ p, o, s }, i) => {
          const samen = o.commissie + s.amount;
          return (
            <div key={p.slug + o.nr} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
              <span><strong>#{o.nr}</strong> <span style={{ opacity: 0.7, fontSize: 13 }}>· {formatDate(o.datum)} · {p.naam} {euro(o.commissie)} · {s.stylists?.name ?? "styliste"} {euro(s.amount)}</span></span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}><strong>{euro(samen)}</strong> <span style={{ opacity: 0.6, fontSize: 13 }}>samen{o.omzet > 0 ? `, ${Math.round((samen / o.omzet) * 100)}% van ${euro(o.omzet)}` : ""}</span></span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
