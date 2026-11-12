import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { KanbanPage } from "./KanbanPage";
import { Tegel, blokKop, getal, rij } from "./PartnersPage";

// Adviesgesprekken voor het beheer: geen werkbord zoals een styliste het gebruikt, maar een samenvatting.
// Hoeveel gesprekken, wat ervan komt (advies verstuurd, samples, verf gekocht) en wat aandacht vraagt.
// Het bord zelf blijft één klik verder.

interface Gesprek {
  id: string; start_at: string; status: string; customer_name: string | null; intake_id: string | null; stylist_id: string | null;
  kanban_stage: string | null; samples_besteld: boolean | null; no_show_at: string | null; format: string | null;
  stylists: { name: string } | null; adviesVerstuurd?: boolean;
}
type Periode = "30" | "kwartaal" | "alles";
const PERIODES: { k: Periode; naam: string }[] = [{ k: "30", naam: "Laatste 30 dagen" }, { k: "kwartaal", naam: "Dit kwartaal" }, { k: "alles", naam: "Alles" }];
const TZ = "Europe/Amsterdam";
const dag = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const kort = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
const pct = (deel: number, geheel: number) => (geheel > 0 ? `${Math.round((deel / geheel) * 100)}%` : "");

function tel(lijst: Gesprek[], nu: number) {
  const geweest = lijst.filter((g) => new Date(g.start_at).getTime() < nu && g.status !== "requested");
  const gevoerd = geweest.filter((g) => !g.no_show_at);
  return {
    gevoerd: gevoerd.length,
    nietVerschenen: geweest.length - gevoerd.length,
    advies: gevoerd.filter((g) => g.adviesVerstuurd).length,
    samples: gevoerd.filter((g) => g.samples_besteld).length,
    verf: gevoerd.filter((g) => g.kanban_stage === "verf").length,
    afgehaakt: gevoerd.filter((g) => g.kanban_stage === "afgehaakt").length,
    loopt: gevoerd.filter((g) => g.kanban_stage !== "verf" && g.kanban_stage !== "afgehaakt").length,
  };
}

export function GesprekkenOverzicht() {
  const [alle, setAlle] = useState<Gesprek[] | null>(null);
  const [periode, setPeriode] = useState<Periode>("kwartaal");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id,start_at,status,customer_name,intake_id,stylist_id,kanban_stage,samples_besteld,no_show_at,format, stylists(name)")
        .in("status", ["confirmed", "paid_unplaced", "manual", "requested"])
        .order("start_at", { ascending: true });
      const lijst = (data as unknown as Gesprek[]) ?? [];
      const ids = lijst.map((g) => g.intake_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: its } = await supabase.from("intake").select("id,advisor_followup_sent_at").in("id", ids);
        const verstuurd = new Set(((its as { id: string; advisor_followup_sent_at: string | null }[]) ?? []).filter((i) => i.advisor_followup_sent_at).map((i) => i.id));
        for (const g of lijst) g.adviesVerstuurd = !!g.intake_id && verstuurd.has(g.intake_id);
      }
      setAlle(lijst);
    })();
  }, []);

  const nu = Date.now();
  const binnen = useMemo(() => {
    if (!alle) return [];
    const d = new Date();
    const vanaf = periode === "30" ? nu - 30 * 864e5 : periode === "kwartaal" ? new Date(d.getFullYear(), Math.floor(d.getMonth() / 3) * 3, 1).getTime() : 0;
    return alle.filter((g) => new Date(g.start_at).getTime() >= vanaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alle, periode]);

  if (!alle) return <p className="rd-sub">Laden...</p>;

  const t = tel(binnen, nu);
  const komend = alle.filter((g) => new Date(g.start_at).getTime() >= nu && g.status !== "requested");
  const aangevraagd = alle.filter((g) => g.status === "requested").length;
  // Gesprek is geweest, maar het advies is na twee dagen nog niet verstuurd.
  const wacht = alle.filter((g) => {
    const tijd = new Date(g.start_at).getTime();
    return g.status !== "requested" && tijd < nu - 2 * 864e5 && !g.no_show_at && !g.adviesVerstuurd && g.kanban_stage !== "verf" && g.kanban_stage !== "afgehaakt";
  }).sort((a, b) => a.start_at.localeCompare(b.start_at));

  const perStyliste = [...new Map(binnen.map((g) => [g.stylist_id ?? "?", g.stylists?.name ?? "Nog niet toegewezen"])).entries()]
    .map(([id, naam]) => ({ id, naam, ...tel(binnen.filter((g) => (g.stylist_id ?? "?") === id), nu), ingepland: komend.filter((g) => (g.stylist_id ?? "?") === id).length }))
    .filter((s) => s.gevoerd > 0 || s.ingepland > 0)
    .sort((a, b) => b.gevoerd - a.gevoerd || a.naam.localeCompare(b.naam, "nl"));

  const stappen = [
    { naam: "Gesprek gevoerd", n: t.gevoerd, uitleg: t.nietVerschenen ? `${getal(t.nietVerschenen)} keer kwam de klant niet opdagen` : "" },
    { naam: "Advies verstuurd", n: t.advies, uitleg: "Het kleuradvies staat in de mail van de klant" },
    { naam: "Samples besteld", n: t.samples, uitleg: "De klant test de kleuren thuis" },
    { naam: "Verf gekocht", n: t.verf, uitleg: "" },
  ];

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", margin: "0 0 12px" }} role="tablist" aria-label="Periode">
        {PERIODES.map((p) => <button key={p.k} role="tab" aria-selected={periode === p.k} className={`rd-plan-chip${periode === p.k ? " is-on" : ""}`} style={{ minHeight: 38 }} onClick={() => setPeriode(p.k)}>{p.naam}</button>)}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
        <Tegel label="Gesprekken gevoerd" waarde={getal(t.gevoerd)} sub={t.nietVerschenen ? `${getal(t.nietVerschenen)} niet verschenen` : undefined} />
        <Tegel label="Verf gekocht" waarde={getal(t.verf)} sub={t.gevoerd ? `${pct(t.verf, t.gevoerd)} van de gesprekken` : undefined} />
        <Tegel label="Loopt nog" waarde={getal(t.loopt)} sub={t.afgehaakt ? `${getal(t.afgehaakt)} afgehaakt` : "In opvolging"} />
        <Tegel label="Nog ingepland" waarde={getal(komend.length)} sub={aangevraagd ? `${getal(aangevraagd)} aangevraagd` : "Komende gesprekken"} />
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Van gesprek tot verf")}
        {stappen.map((s, i) => (
          <div key={s.naam} style={{ display: "grid", gridTemplateColumns: "minmax(0,1.2fr) minmax(60px,1fr) auto", gap: 12, alignItems: "center", borderTop: i ? "1px solid var(--rd-line)" : 0, padding: "8px 0" }}>
            <div style={{ minWidth: 0 }}><strong style={{ fontSize: 14 }}>{s.naam}</strong>{s.uitleg && <div style={{ fontSize: 12, opacity: 0.65 }}>{s.uitleg}</div>}</div>
            <div aria-hidden style={{ height: 10, borderRadius: 99, background: "var(--rd-grey-light)", overflow: "hidden" }}>
              <div style={{ height: "100%", borderRadius: 99, background: "var(--rd-pink)", width: `${t.gevoerd > 0 && s.n > 0 ? Math.max(2, Math.min(100, Math.round((s.n / t.gevoerd) * 100))) : 0}%` }} />
            </div>
            <span style={{ fontVariantNumeric: "tabular-nums", minWidth: 64, textAlign: "right" }}><strong style={{ fontSize: 18 }}>{getal(s.n)}</strong>{i > 0 && t.gevoerd > 0 && <span style={{ opacity: 0.6, fontSize: 13 }}> {pct(s.n, t.gevoerd)}</span>}</span>
          </div>
        ))}
      </div>

      <div className="rd-card-white" style={{ marginBottom: 10 }}>
        {blokKop("Per styliste")}
        {perStyliste.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>In deze periode zijn er geen gesprekken.</p> : perStyliste.map((s, i) => (
          <div key={s.id} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
            <strong>{s.naam}</strong>
            <span style={{ display: "flex", gap: 16, fontSize: 13, fontVariantNumeric: "tabular-nums", flexWrap: "wrap", justifyContent: "flex-end" }}>
              <span><span style={{ opacity: 0.6 }}>Gevoerd</span> <strong>{getal(s.gevoerd)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Advies verstuurd</span> <strong>{getal(s.advies)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Samples</span> <strong>{getal(s.samples)}</strong></span>
              <span><span style={{ opacity: 0.6 }}>Verf gekocht</span> <strong>{getal(s.verf)}</strong>{s.gevoerd > 0 && <span style={{ opacity: 0.6 }}> {pct(s.verf, s.gevoerd)}</span>}</span>
              <span style={{ opacity: 0.7 }}>Ingepland {getal(s.ingepland)}</span>
            </span>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        <div className="rd-card-white" style={{ flex: "1 1 300px", minWidth: 0 }}>
          {blokKop("Vraagt aandacht")}
          {wacht.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Na elk gevoerd gesprek is het advies verstuurd.</p> : (
            <>
              <p className="rd-sub" style={{ margin: "0 0 6px", fontSize: 13 }}>Het gesprek is meer dan twee dagen geleden en het advies is nog niet verstuurd.</p>
              {wacht.slice(0, 8).map((g) => (
                <div key={g.id} style={rij}>
                  <Link to={`/dashboard/gesprek/${g.id}`} style={{ color: "inherit", fontWeight: 700 }}>{g.customer_name || "Klant"}</Link>
                  <span style={{ fontSize: 13, opacity: 0.7 }}>{g.stylists?.name ?? "Nog niet toegewezen"} · {kort(g.start_at)}</span>
                </div>
              ))}
              {wacht.length > 8 && <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 13 }}>En nog {getal(wacht.length - 8)}. Zie het bord.</p>}
            </>
          )}
        </div>
        <div className="rd-card-white" style={{ flex: "1 1 300px", minWidth: 0 }}>
          {blokKop("Komende gesprekken")}
          {komend.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Er staan nu geen gesprekken ingepland.</p> : komend.slice(0, 8).map((g, i) => (
            <div key={g.id} style={i ? rij : { ...rij, borderTop: 0, paddingTop: 0 }}>
              <Link to={`/dashboard/gesprek/${g.id}`} style={{ color: "inherit", fontWeight: 700 }}>{g.customer_name || "Klant"}</Link>
              <span style={{ fontSize: 13, opacity: 0.7 }}>{g.stylists?.name ?? "Nog niet toegewezen"} · {dag(g.start_at)}{g.format === "thuis" ? " · aan huis" : ""}</span>
            </div>
          ))}
          {komend.length > 8 && <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 13 }}>En nog {getal(komend.length - 8)}.</p>}
        </div>
      </div>
    </div>
  );
}

/** Adviesgesprekken: een styliste ziet haar bord; het beheer ziet eerst de samenvatting en kan door naar het bord. */
export function GesprekkenPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<"samenvatting" | "bord">("samenvatting");
  useEffect(() => { supabase.rpc("is_admin").then(({ data }) => setAdmin(data === true)); }, []);
  if (admin === null) return <p className="rd-sub">Laden...</p>;
  if (!admin) return <KanbanPage />;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12, flexWrap: "wrap", marginBottom: 12 }}>
        <div>
          {/* Het bord heeft zijn eigen kop. */}
          {tab === "samenvatting" && <h1 className="rd-h2" style={{ margin: "0 0 2px" }}>Adviesgesprekken</h1>}
          {tab === "samenvatting" && <p className="rd-sub" style={{ margin: 0 }}>Hoe de gesprekken lopen, voor alle stylistes samen.</p>}
        </div>
        <div style={{ display: "flex", gap: 8 }} role="tablist" aria-label="Weergave">
          {(["samenvatting", "bord"] as const).map((k) => <button key={k} role="tab" aria-selected={tab === k} className={`rd-plan-chip${tab === k ? " is-on" : ""}`} onClick={() => setTab(k)}>{k === "samenvatting" ? "Samenvatting" : "Bord"}</button>)}
        </div>
      </div>
      {tab === "samenvatting" ? <GesprekkenOverzicht /> : <KanbanPage />}
    </div>
  );
}
