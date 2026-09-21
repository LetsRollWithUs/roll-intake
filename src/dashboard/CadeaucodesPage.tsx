import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

interface Credit {
  id: string;
  redeem_code: string | null;
  status: string;
  buyer_name: string | null;
  buyer_email: string | null;
  occasion: string | null;
  gift_message: string | null;
  manage_token: string;
  created_at: string;
  scheduled_at: string | null;
}

const STATUS: Record<string, { label: string; color: string }> = {
  paid: { label: "Open", color: "var(--rd-pink-dark)" },
  scheduled: { label: "Ingepland", color: "var(--rd-green, #5A8C4F)" },
  refunded: { label: "Terugbetaald", color: "rgba(47,33,65,.5)" },
};

const PLAN_BASE = "https://intake.roll.nl";

export function CadeaucodesPage() {
  const [rows, setRows] = useState<Credit[]>([]);
  const [loading, setLoading] = useState(true);
  const [scope, setScope] = useState<"open" | "alles">("open");
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("advice_credits")
        .select("id,redeem_code,status,buyer_name,buyer_email,occasion,gift_message,manage_token,created_at,scheduled_at")
        .order("created_at", { ascending: false });
      setRows((data as Credit[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const visible = rows.filter((r) => (scope === "open" ? r.status === "paid" : true));

  const copy = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 2000);
    } catch {
      /* handmatig selecteren */
    }
  };

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Cadeaucodes
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Codes van gekochte kleuradviezen. Print de code op de kaart of stuur de planlink; de ontvanger
        wisselt 'm in op intake.roll.nl/plan.
      </p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
        <button className={`rd-plan-chip${scope === "open" ? " is-on" : ""}`} onClick={() => setScope("open")}>
          Open ({rows.filter((r) => r.status === "paid").length})
        </button>
        <button className={`rd-plan-chip${scope === "alles" ? " is-on" : ""}`} onClick={() => setScope("alles")}>
          Alles
        </button>
      </div>

      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : visible.length === 0 ? (
        <p className="rd-sub">Geen cadeaucodes.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => {
            const st = STATUS[r.status] ?? { label: r.status, color: "inherit" };
            const planUrl = `${PLAN_BASE}/plan?token=${r.manage_token}`;
            return (
              <div key={r.id} className="rd-card-white">
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, letterSpacing: ".04em" }}>
                      {r.redeem_code ?? "—"}
                    </div>
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 4 }}>
                      {r.buyer_name || "Koper"}{r.buyer_email ? ` · ${r.buyer_email}` : ""}
                    </div>
                    {r.occasion && (
                      <div style={{ fontSize: 13, marginTop: 4 }}>
                        <span className="rd-chip">🎁 {r.occasion}</span>
                      </div>
                    )}
                    {r.gift_message && (
                      <div style={{ fontSize: 13, opacity: 0.75, marginTop: 6, fontStyle: "italic" }}>"{r.gift_message}"</div>
                    )}
                    <div style={{ fontSize: 12, opacity: 0.55, marginTop: 6 }}>Gekocht {formatDate(r.created_at)}</div>
                  </div>
                  <span className="rd-chip" style={{ background: st.color, color: "#fff", fontWeight: 700, flex: "none" }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  {r.redeem_code && (
                    <button className="rd-plan-chip" onClick={() => copy(r.redeem_code!, `${r.id}-code`)}>
                      {copied === `${r.id}-code` ? "Gekopieerd ✓" : "Kopieer code"}
                    </button>
                  )}
                  <button className="rd-plan-chip" onClick={() => copy(planUrl, `${r.id}-link`)}>
                    {copied === `${r.id}-link` ? "Gekopieerd ✓" : "Kopieer planlink"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
