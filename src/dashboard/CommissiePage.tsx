import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

interface Row {
  id: string;
  woo_order_id: string;
  stylist_id: string | null;
  route: "advies" | "code";
  customer_email: string | null;
  verf_excl: number;
  amount: number;
  status: string;
  conflict: boolean;
  created_at: string;
  stylists: { name: string } | null;
}
interface StylistRow { id: string; name: string; discount_code: string | null; active: boolean; commission_rate: number | null }

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n || 0);
const monthLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", month: "long", year: "numeric" }).format(new Date(iso));
const monthKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam", year: "numeric", month: "2-digit" }).format(new Date(iso));
const STATUS: Record<string, { label: string; color: string }> = {
  te_controleren: { label: "Te controleren", color: "rgba(47,33,65,.55)" },
  uitbetaalbaar: { label: "Te factureren", color: "var(--rd-pink-dark)" },
  uitbetaald: { label: "Gefactureerd · uitbetaald", color: "var(--rd-green, #5A8C4F)" },
  vervallen: { label: "Vervallen", color: "rgba(47,33,65,.35)" },
};
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  te_controleren: { to: "uitbetaalbaar", label: "Goedkeuren (te factureren)" },
  uitbetaalbaar: { to: "uitbetaald", label: "Markeer gefactureerd" },
};
const routeLabel = (r: string) => (r === "code" ? "Eigen klant (code)" : "Via Roll-advies");

export function CommissiePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stylists, setStylists] = useState<StylistRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [codeDraft, setCodeDraft] = useState<Record<string, string>>({});
  const [rateDraft, setRateDraft] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (m: string) => { setMsg(m); setTimeout(() => setMsg(null), 2000); };

  const load = async () => {
    const { data } = await supabase
      .from("commissions")
      .select("id,woo_order_id,stylist_id,route,customer_email,verf_excl,amount,status,conflict,created_at, stylists(name)")
      .order("created_at", { ascending: false });
    setRows((data as unknown as Row[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(adm === true);
      if (adm === true) {
        const { data: st } = await supabase.from("stylists").select("id,name,discount_code,active,commission_rate").order("name");
        const list = (st as StylistRow[]) ?? [];
        setStylists(list);
        setCodeDraft(Object.fromEntries(list.map((s) => [s.id, s.discount_code ?? ""])));
        setRateDraft(Object.fromEntries(list.map((s) => [s.id, s.commission_rate != null ? String(Math.round(s.commission_rate * 1000) / 10).replace(".", ",") : ""])));
      }
      await load();
      setLoading(false);
    })();
  }, []);

  const setStatus = async (id: string, status: string) => {
    await supabase.from("commissions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
  };
  const saveCode = async (id: string) => {
    const code = (codeDraft[id] ?? "").trim() || null;
    // Percentage: leeg = standaard; anders 0 tot 100 (komma of punt).
    const raw = (rateDraft[id] ?? "").trim().replace(",", ".");
    const pct = raw === "" ? null : Number(raw);
    if (pct !== null && (!Number.isFinite(pct) || pct < 0 || pct > 100)) { flash("Vul een percentage tussen 0 en 100 in, of laat het leeg voor de standaard."); return; }
    const commission_rate = pct === null ? null : Math.round(pct * 10) / 1000;
    const { error } = await supabase.from("stylists").update({ discount_code: code, commission_rate }).eq("id", id);
    flash(error ? "Niet opgeslagen (bestaat de code al?)" : "Opgeslagen ✓");
    if (!error) setStylists((prev) => prev.map((s) => (s.id === id ? { ...s, discount_code: code, commission_rate } : s)));
  };

  const visible = useMemo(() => {
    if (statusFilter === "alles") return rows;
    if (statusFilter === "open") return rows.filter((r) => r.status === "te_controleren" || r.status === "uitbetaalbaar");
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  // Totalen per styliste (open = te_controleren + uitbetaalbaar).
  const totals = useMemo(() => {
    const map = new Map<string, { name: string; open: number; paid: number; count: number }>();
    for (const r of rows) {
      if (r.status === "vervallen") continue;
      const key = r.stylist_id ?? "?";
      const cur = map.get(key) ?? { name: r.stylists?.name ?? "Onbekend", open: 0, paid: 0, count: 0 };
      if (r.status === "uitbetaald") cur.paid += r.amount; else cur.open += r.amount;
      cur.count += 1;
      map.set(key, cur);
    }
    return [...map.values()].sort((a, b) => b.open - a.open);
  }, [rows]);

  // Per maand × styliste: te controleren / te factureren / gefactureerd, exclusief vervallen.
  const byMonth = useMemo(() => {
    const map = new Map<string, { key: string; month: string; name: string; check: number; invoice: number; paid: number; count: number }>();
    for (const r of rows) {
      if (r.status === "vervallen") continue;
      const mk = monthKey(r.created_at);
      const key = mk + "|" + (r.stylist_id ?? "?");
      const cur = map.get(key) ?? { key, month: monthLabel(r.created_at), name: r.stylists?.name ?? "Onbekend", check: 0, invoice: 0, paid: 0, count: 0 };
      if (r.status === "uitbetaald") cur.paid += r.amount;
      else if (r.status === "uitbetaalbaar") cur.invoice += r.amount;
      else cur.check += r.amount;
      cur.count += 1;
      map.set(key, cur);
    }
    // Nieuwste maand eerst, daarna op openstaand bedrag.
    return [...map.values()].sort((a, b) => (a.key < b.key ? 1 : a.key > b.key ? -1 : (b.check + b.invoice) - (a.check + a.invoice)));
  }, [rows]);

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>← Terug</Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 2px" }}>Commissie</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Verfcommissie per toegeschreven bestelling (standaard 10%, per styliste in te stellen). {isAdmin ? "Beheer de codes, keur goed en markeer uitbetaald." : "Je eigen toegeschreven verforders en commissie."}
      </p>
      {msg && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</p>}

      {/* Totalen */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "14px 0 18px" }}>
        {totals.length === 0 ? (
          <p className="rd-sub">Nog geen commissie geregistreerd.</p>
        ) : totals.map((t, i) => (
          <div key={i} className="rd-card-white" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <div style={{ fontWeight: 700 }}>{t.name} <span style={{ fontWeight: 500, opacity: 0.55, fontSize: 13 }}>· {t.count} order(s)</span></div>
            <div style={{ display: "flex", gap: 16, fontSize: 14 }}>
              <span>Openstaand <strong>{euro(t.open)}</strong></span>
              <span style={{ opacity: 0.7 }}>Uitbetaald {euro(t.paid)}</span>
            </div>
          </div>
        ))}
      </div>

      {/* Per maand (uitbetaling) */}
      {byMonth.length > 0 && (
        <div className="rd-card-white" style={{ marginBottom: 18 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Per maand</div>
          <p className="rd-sub" style={{ marginTop: 0 }}>
            Commissie per kalendermaand over de verfomzet na korting, excl. btw. Wat "te factureren" is mag je aan het einde van de maand factureren; "gefactureerd" is afgehandeld.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {byMonth.map((m) => (
              <div key={m.key} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", borderTop: "1px solid var(--rd-line)", paddingTop: 8, flexWrap: "wrap" }}>
                <span style={{ fontSize: 14 }}>
                  <span style={{ fontWeight: 700, textTransform: "capitalize" }}>{m.month}</span>
                  {isAdmin && <span style={{ opacity: 0.7 }}> · {m.name}</span>}
                  <span style={{ opacity: 0.55, fontSize: 12 }}> · {m.count} order(s)</span>
                </span>
                <span style={{ display: "flex", gap: 14, fontSize: 13, fontVariantNumeric: "tabular-nums", flexWrap: "wrap" }}>
                  {m.check > 0 && <span style={{ opacity: 0.65 }}>Te controleren {euro(m.check)}</span>}
                  <span style={{ color: "var(--rd-pink-dark)", fontWeight: 700 }}>Te factureren {euro(m.invoice)}</span>
                  <span style={{ opacity: 0.75 }}>Gefactureerd {euro(m.paid)}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Codes per styliste (alleen beheerder) */}
      {isAdmin && (
        <div className="rd-card-white" style={{ marginBottom: 18 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Per styliste: kortingscode en commissie</div>
          <p className="rd-sub" style={{ marginTop: 0 }}>
            De code is voor de eigen-klant-route: maak in WooCommerce een coupon met exact dezelfde code; hier leggen we de koppeling code → styliste vast. Het percentage geldt voor nieuwe toeschrijvingen; leeg = standaard 10%.
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {stylists.filter((s) => s.active).map((s) => (
              <div key={s.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ minWidth: 120, fontWeight: 600, fontSize: 14 }}>{s.name}</span>
                <input
                  className="rd-input"
                  value={codeDraft[s.id] ?? ""}
                  onChange={(e) => setCodeDraft((d) => ({ ...d, [s.id]: e.target.value.toUpperCase() }))}
                  placeholder="Bijv. ANNA10"
                  style={{ flex: "1 1 160px", minWidth: 0, textTransform: "uppercase" }}
                />
                <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
                  <input
                    className="rd-input"
                    inputMode="decimal"
                    value={rateDraft[s.id] ?? ""}
                    onChange={(e) => setRateDraft((d) => ({ ...d, [s.id]: e.target.value }))}
                    placeholder="10"
                    aria-label={`Commissiepercentage ${s.name}`}
                    style={{ width: 70, textAlign: "right" }}
                  />
                  % commissie
                </label>
                <button className="rd-plan-chip" onClick={() => saveCode(s.id)}>Opslaan</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
        {[["open", "Openstaand"], ["uitbetaald", "Uitbetaald"], ["vervallen", "Vervallen"], ["alles", "Alles"]].map(([k, l]) => (
          <button key={k} className={`rd-plan-chip${statusFilter === k ? " is-on" : ""}`} onClick={() => setStatusFilter(k)}>{l}</button>
        ))}
      </div>

      {/* Grootboek */}
      {visible.length === 0 ? (
        <p className="rd-sub">Geen commissieregels in deze weergave.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, color: "inherit" };
            const next = isAdmin ? NEXT[r.status] : undefined;
            return (
              <div key={r.id} className="rd-card-white">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>
                      {euro(r.amount)} <span style={{ fontWeight: 500, opacity: 0.6, fontSize: 13 }}>commissie · verf {euro(r.verf_excl)}</span>
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 3, display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {isAdmin && <span>{r.stylists?.name ?? "Onbekend"} ·</span>}
                      <span>{routeLabel(r.route)}</span>
                      <span>· #{r.woo_order_id}</span>
                      <span>· {formatDate(r.created_at)}</span>
                    </div>
                    <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                      <span className="rd-chip" style={{ background: st.color, color: "#fff", fontWeight: 700 }}>{st.label}</span>
                      {r.conflict && <span className="rd-chip" style={{ background: "var(--rd-pink-dark)", color: "#fff" }}>⚠ Controleer toeschrijving</span>}
                    </div>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 6, flexDirection: "column", flex: "none" }}>
                      {next && <button className="rd-plan-chip" onClick={() => setStatus(r.id, next.to)}>{next.label}</button>}
                      {r.status !== "vervallen" && r.status !== "uitbetaald" && (
                        <button className="rd-textlink" style={{ fontSize: 12, opacity: 0.6 }} onClick={() => setStatus(r.id, "vervallen")}>Laten vervallen</button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
