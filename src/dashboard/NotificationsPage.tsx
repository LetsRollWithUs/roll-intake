import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { loadNotifications, KIND_LABEL, type Notif } from "./notifications";

const ORDER: Notif["kind"][] = ["vandaag", "plan", "advies", "versturen", "taak", "opvolgen", "check", "roll", "melding"];

export function NotificationsPage() {
  const [items, setItems] = useState<Notif[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      const admin = adm === true;
      setIsAdmin(admin);
      const { data: st } = await supabase.rpc("current_stylist");
      const mine = ((st as { id: string }[]) ?? [])[0] ?? null;
      // Beheerder ziet alles; styliste alleen haar eigen acties.
      setItems(await loadNotifications({ isAdmin: admin, stylistId: admin ? null : mine?.id ?? null }));
      setLoading(false);
    })();
  }, []);

  if (loading) return <p className="rd-sub">Laden...</p>;

  const groups = ORDER.map((k) => ({ kind: k, list: items.filter((i) => i.kind === k) })).filter((g) => g.list.length);

  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Notificaties</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        {items.length === 0 ? "Niets open. Lekker bezig." : `${items.length} openstaande actie${items.length === 1 ? "" : "s"}.`}
      </p>
      {groups.map((g) => (
        <section key={g.kind} style={{ marginTop: 16 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>{KIND_LABEL[g.kind]}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {g.list.map((n) => (
              <Link key={n.id} to={n.to ?? "/beheer"} className="rd-card-white" style={{ textDecoration: "none", padding: "12px 16px", display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{n.title}</div>
                  {n.sub && <div style={{ fontSize: 13, opacity: 0.65, marginTop: 2 }}>{n.sub}</div>}
                </div>
                <span aria-hidden style={{ opacity: 0.4, flex: "none" }}>→</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
      {isAdmin && (
        <p className="rd-sub" style={{ marginTop: 20 }}>
          Systeemmeldingen afhandelen doe je onder <Link to="/beheer/meldingen" className="rd-textlink">Meldingen</Link>.
        </p>
      )}
    </div>
  );
}
