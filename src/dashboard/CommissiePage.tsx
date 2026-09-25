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
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
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
      await load();
      setLoading(false);
    })();
  }, []);

  const setStatus = async (id: string, status: string) => {
    await supabase.from("commissions").update({ status, updated_at: new Date().toISOString() }).eq("id", id);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
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

      {isAdmin && (
        <p className="rd-sub" style={{ margin: "0 0 14px", fontSize: 13 }}>
          Commissiepercentages, kortingscodes en samenwerkingsafspraken beheer je per medewerker onder <Link to="/beheer/adviseurs" className="rd-textlink">Team</Link>.
        </p>
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
