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
interface StylistRow { id: string; name: string; discount_code: string | null; active: boolean }

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", minimumFractionDigits: 2 }).format(n || 0);
const STATUS: Record<string, { label: string; color: string }> = {
  te_controleren: { label: "Te controleren", color: "rgba(47,33,65,.55)" },
  uitbetaalbaar: { label: "Uitbetaalbaar", color: "var(--rd-pink-dark)" },
  uitbetaald: { label: "Uitbetaald", color: "var(--rd-green, #5A8C4F)" },
  vervallen: { label: "Vervallen", color: "rgba(47,33,65,.35)" },
};
const NEXT: Record<string, { to: string; label: string } | undefined> = {
  te_controleren: { to: "uitbetaalbaar", label: "Keur goed" },
  uitbetaalbaar: { to: "uitbetaald", label: "Markeer uitbetaald" },
};
const routeLabel = (r: string) => (r === "code" ? "Eigen klant (code)" : "Via Roll-advies");

export function CommissiePage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [stylists, setStylists] = useState<StylistRow[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [codeDraft, setCodeDraft] = useState<Record<string, string>>({});
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
        const { data: st } = await supabase.from("stylists").select("id,name,discount_code,active").order("name");
        const list = (st as StylistRow[]) ?? [];
        setStylists(list);
        setCodeDraft(Object.fromEntries(list.map((s) => [s.id, s.discount_code ?? ""])));
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
    const { error } = await supabase.from("stylists").update({ discount_code: code }).eq("id", id);
    flash(error ? "Code niet opgeslagen (bestaat 'ie al?)" : "Code opgeslagen ✓");
    if (!error) setStylists((prev) => prev.map((s) => (s.id === id ? { ...s, discount_code: code } : s)));
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

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>← Terug</Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 2px" }}>Commissie</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        10% verfcommissie per toegeschreven bestelling. {isAdmin ? "Beheer de codes, keur goed en markeer uitbetaald." : "Je eigen toegeschreven verforders en commissie."}
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

      {/* Codes per styliste (alleen beheerder) */}
      {isAdmin && (
        <div className="rd-card-white" style={{ marginBottom: 18 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Persoonlijke kortingscodes</div>
          <p className="rd-sub" style={{ marginTop: 0 }}>
            Voor de eigen-klant-route. Maak in WooCommerce een coupon met exact dezelfde code (klantkorting nader te bepalen); hier leggen we alleen de koppeling code → styliste vast.
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
