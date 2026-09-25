import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { RESET_REDIRECT } from "./Login";

interface Me { id: string; name: string; email: string; meet_url: string | null; discount_code?: string | null }

export function AccountPage() {
  const [email, setEmail] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylist, setStylist] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      const mail = u?.user?.email ?? "";
      setEmail(mail);
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(adm === true);
      const { data: st } = await supabase.rpc("current_stylist");
      // discount_code apart ophalen (RPC geeft die niet terug).
      const mine = ((st as Me[]) ?? [])[0] ?? null;
      if (mine) {
        const { data: s } = await supabase.from("stylists").select("discount_code").eq("id", mine.id).maybeSingle();
        mine.discount_code = (s as { discount_code: string | null } | null)?.discount_code ?? null;
      }
      setStylist(mine);
      setLoading(false);
    })();
  }, []);

  const resetPassword = async () => {
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: RESET_REDIRECT() });
    setMsg(error ? "Versturen mislukte, probeer later opnieuw." : "We hebben je een link gestuurd om je wachtwoord opnieuw in te stellen.");
  };

  if (loading) return <p className="rd-sub">Laden...</p>;

  const initials = (stylist?.name || email).trim().slice(0, 2).toUpperCase();

  return (
    <div style={{ maxWidth: 620 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Account</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>Je gegevens en instellingen.</p>

      <div className="rd-card-white" style={{ marginTop: 14, display: "flex", gap: 14, alignItems: "center" }}>
        <div style={{
          width: 52, height: 52, borderRadius: 99, background: "var(--rd-lavender)", flex: "none",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 18, color: "var(--rd-aubergine)",
        }}>{initials}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{stylist?.name || "Naamloos"}</div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{email}</div>
          <div style={{ marginTop: 4 }}>
            <span className="rd-chip">{isAdmin ? "Beheerder" : "Styliste"}</span>
          </div>
        </div>
      </div>

      {stylist && (
        <div className="rd-card-white" style={{ marginTop: 12 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Jouw instellingen</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
              <span style={{ opacity: 0.7 }}>Videolink</span>
              <span>{stylist.meet_url ? "Ingesteld ✓" : <span style={{ opacity: 0.6 }}>Nog niet ingesteld</span>}</span>
            </div>
            {stylist.discount_code && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                <span style={{ opacity: 0.7 }}>Persoonlijke kortingscode</span>
                <span style={{ fontFamily: "monospace", fontWeight: 700 }}>{stylist.discount_code}</span>
              </div>
            )}
          </div>
          <div style={{ marginTop: 12 }}>
            <Link to="/beheer/agenda" className="rd-btn rd-btn-outline" style={{ textDecoration: "none", padding: "8px 16px" }}>
              Agenda &amp; videolink beheren
            </Link>
          </div>
        </div>
      )}

      <div className="rd-card-white" style={{ marginTop: 12 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Beveiliging</div>
        <p className="rd-sub" style={{ marginTop: 0 }}>Wachtwoord vergeten of wijzigen? We sturen je een veilige link.</p>
        <button className="rd-btn rd-btn-outline" onClick={resetPassword} style={{ width: "auto", padding: "0 20px" }}>
          Wachtwoord opnieuw instellen
        </button>
        {msg && <p style={{ marginTop: 10, color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</p>}
      </div>

      <div style={{ marginTop: 16 }}>
        <button className="rd-textlink" onClick={() => supabase.auth.signOut()} style={{ minHeight: 40 }}>
          Uitloggen
        </button>
      </div>
    </div>
  );
}
