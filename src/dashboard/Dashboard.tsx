import { useEffect, useState } from "react";
import { Routes, Route, Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Login } from "./Login";
import { IntakeList } from "./IntakeList";
import { IntakeDetail } from "./IntakeDetail";
import { AdvisorsAdmin } from "./AdvisorsAdmin";

export function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdvisor, setIsAdvisor] = useState<boolean | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setIsAdvisor(null);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.rpc("is_advisor").then(({ data }) => setIsAdvisor(data === true));
  }, [session]);

  const isAdmin = !!session && (session.user.email ?? "").toLowerCase().endsWith("@roll.nl");

  const shell = (children: React.ReactNode, showLogout = true) => (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--rd-offwhite)",
        color: "var(--rd-aubergine)",
        fontFamily: "Figtree, system-ui, sans-serif",
      }}
    >
      <header
        style={{
          borderBottom: "1px solid var(--rd-line)",
          padding: "14px 20px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          maxWidth: 960,
          margin: "0 auto",
        }}
      >
        <div className="rd-kicker rd-kicker-pink">Roll · Beheer</div>
        {showLogout && session && (
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            {isAdmin && (
              <Link to="/beheer/adviseurs" className="rd-textlink" style={{ minHeight: 32, textDecoration: "none" }}>
                Adviseurs
              </Link>
            )}
            <span style={{ fontSize: 12, opacity: 0.6 }}>{session.user.email}</span>
            <button className="rd-textlink" style={{ minHeight: 32 }} onClick={() => supabase.auth.signOut()}>
              Uitloggen
            </button>
          </div>
        )}
      </header>
      <main style={{ maxWidth: 960, margin: "0 auto", padding: "22px 20px 60px" }}>{children}</main>
    </div>
  );

  if (!ready) return null;
  if (!session) return <Login />;

  if (isAdvisor === null) return shell(<p className="rd-sub">Toegang controleren...</p>);
  if (!isAdvisor)
    return shell(
      <div className="rd-card-white">
        <div className="rd-h2-sm" style={{ marginBottom: 8 }}>
          Geen toegang
        </div>
        <p className="rd-sub" style={{ marginTop: 0 }}>
          Dit account staat niet op de lijst van kleuradviseurs. Vraag de beheerder om je e-mailadres
          ({session.user.email}) toe te voegen.
        </p>
      </div>,
    );

  return shell(
    <Routes>
      <Route index element={<IntakeList />} />
      <Route path="adviseurs" element={<AdvisorsAdmin />} />
      <Route path=":id" element={<IntakeDetail />} />
    </Routes>,
  );
}
