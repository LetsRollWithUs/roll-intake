import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface BookingRow {
  id: string;
  start_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  intake_id: string | null;
  stylists: { name: string; email: string } | null;
  services: { key: string } | null;
}

const TZ = "Europe/Amsterdam";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const serviceLabel = (key?: string) =>
  key === "post_sample" ? "Al samples getest" : key === "pre_sample" ? "Nog geen samples" : "";

export function BoekingenPage() {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [scope, setScope] = useState<"komend" | "alles">("komend");

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      const { data: u } = await supabase.auth.getUser();
      setIsAdmin(adm === true);
      setMyEmail((u?.user?.email ?? "").toLowerCase());
      const { data } = await supabase
        .from("bookings")
        .select(
          "id,start_at,status,customer_name,customer_email,intake_id, stylists(name,email), services(key)",
        )
        .in("status", ["confirmed"])
        .order("start_at", { ascending: true });
      setRows((data as unknown as BookingRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (!isAdmin && r.stylists?.email?.toLowerCase() !== myEmail) return false;
      if (scope === "komend" && new Date(r.start_at).getTime() < now) return false;
      return true;
    });
  }, [rows, isAdmin, myEmail, scope]);

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Boekingen
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        {isAdmin ? "Alle geboekte afspraken." : "Jouw geboekte afspraken."}
      </p>

      <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
        <button className={`rd-plan-chip${scope === "komend" ? " is-on" : ""}`} onClick={() => setScope("komend")}>
          Komend
        </button>
        <button className={`rd-plan-chip${scope === "alles" ? " is-on" : ""}`} onClick={() => setScope("alles")}>
          Alles
        </button>
      </div>

      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : visible.length === 0 ? (
        <p className="rd-sub">Geen boekingen.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => (
            <div
              key={r.id}
              className="rd-card-white"
              style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{fmt(r.start_at)}</div>
                <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                  {r.customer_name || "Klant"} · {r.customer_email}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  {serviceLabel(r.services?.key)}
                  {isAdmin && r.stylists?.name ? ` · ${r.stylists.name}` : ""}
                </div>
              </div>
              {r.intake_id ? (
                <Link to={`/beheer/${r.intake_id}`} className="rd-plan-chip" style={{ textDecoration: "none" }}>
                  Bekijk intake
                </Link>
              ) : (
                <span className="rd-chip" style={{ opacity: 0.7 }}>
                  Intake nog niet ingevuld
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
