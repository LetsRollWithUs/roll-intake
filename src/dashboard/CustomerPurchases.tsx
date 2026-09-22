import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

export interface OrderItem { name: string; sku: string; qty: number; total: number; kind: "sample" | "product" }
export interface CustomerOrder { id: number; number: string; date: string | null; status: string; total: number; currency: string; items: OrderItem[] }
export interface OrdersResp { ok: boolean; orders: CustomerOrder[]; order_count: number; total_spent: number; sample_items: number; product_items: number }

export const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n || 0);
const WOO_STATUS: Record<string, string> = { processing: "Betaald", completed: "Afgerond", "on-hold": "In behandeling" };

// Wat deze klant al bij Roll kocht (samples, verf, producten) + besteed bedrag. Uit WooCommerce, op e-mail.
export function CustomerPurchases({ email, title = "Samples & aankopen" }: { email: string | null; title?: string }) {
  const [data, setData] = useState<OrdersResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: d, error } = await supabase.functions.invoke("booking", { body: { action: "customer_orders", email } });
      if (error || !(d as OrdersResp | null)?.ok) setFailed(true);
      else setData(d as OrdersResp);
      setLoading(false);
    })();
  }, [email]);

  return (
    <div className="rd-card-white" style={{ marginTop: 12 }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>{title}</div>
      {loading ? (
        <p className="rd-sub" style={{ margin: 0 }}>Aankopen ophalen...</p>
      ) : failed ? (
        <p className="rd-sub" style={{ margin: 0 }}>Kon de aankopen nu niet ophalen.</p>
      ) : !data || data.order_count === 0 ? (
        <p className="rd-sub" style={{ margin: 0 }}>Nog geen aankopen gevonden bij dit e-mailadres.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="rd-chip" style={{ background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 }}>Totaal besteed {euro(data.total_spent)}</span>
            <span className="rd-chip">{data.order_count} bestelling{data.order_count === 1 ? "" : "en"}</span>
            {data.sample_items > 0 && <span className="rd-chip">{data.sample_items} sample(s)</span>}
            {data.product_items > 0 && <span className="rd-chip">{data.product_items} product(en)</span>}
          </div>
          {data.orders.map((o) => (
            <div key={o.id} style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  #{o.number} · {formatDate(o.date)}
                  <span style={{ fontWeight: 600, opacity: 0.6 }}> · {WOO_STATUS[o.status] ?? o.status}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{euro(o.total)}</div>
              </div>
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {o.items.map((it, i) => (
                  <div key={i} style={{ fontSize: 13, opacity: 0.85, display: "flex", gap: 6, alignItems: "center" }}>
                    <span className="rd-chip" style={{ fontSize: 11, padding: "1px 7px", background: it.kind === "sample" ? "var(--rd-lavender)" : "var(--rd-grey-light)" }}>
                      {it.kind === "sample" ? "sample" : "product"}
                    </span>
                    <span>{it.qty}× {it.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
