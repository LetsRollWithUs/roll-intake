import { useEffect, useState } from "react";
import { Routes, Route, NavLink, Link } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { Login } from "./Login";
import { IntakeList } from "./IntakeList";
import { IntakeDetail } from "./IntakeDetail";
import { AdvisorsAdmin } from "./AdvisorsAdmin";
import { AgendaPage } from "./AgendaPage";
import { BoekingenPage } from "./BoekingenPage";
import { AlertsPage } from "./AlertsPage";
import { CadeaucodesPage } from "./CadeaucodesPage";
import { StylistHome } from "./StylistHome";
import { OnboardingPage } from "./OnboardingPage";
import { CommissiePage } from "./CommissiePage";
import { AccountPage } from "./AccountPage";
import { KanbanPage } from "./KanbanPage";

interface NavItem { to: string; label: string; end?: boolean }

export function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdvisor, setIsAdvisor] = useState<boolean | null>(null);
  const [alertCount, setAlertCount] = useState(0);

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

  // Aantal openstaande meldingen (beheerder) voor het belletje.
  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("system_alerts").select("id", { count: "exact", head: true }).is("acknowledged_at", null)
      .then(({ count }) => setAlertCount(count ?? 0));
  }, [isAdmin]);

  const navMain: NavItem[] = isAdmin
    ? [
        { to: "/beheer", label: "Overzicht", end: true },
        { to: "/beheer/gesprekken", label: "Gesprekken" },
        { to: "/beheer/boekingen", label: "Boekingen" },
        { to: "/beheer/commissie", label: "Commissie" },
        { to: "/beheer/agenda", label: "Agenda" },
        { to: "/beheer/cadeaucodes", label: "Cadeaucodes" },
        { to: "/beheer/adviseurs", label: "Adviseurs" },
        { to: "/beheer/start", label: "Als styliste" },
        { to: "/beheer/onboarding", label: "Uitleg" },
      ]
    : [
        { to: "/beheer", label: "Start", end: true },
        { to: "/beheer/gesprekken", label: "Gesprekken" },
        { to: "/beheer/commissie", label: "Commissie" },
        { to: "/beheer/agenda", label: "Agenda" },
        { to: "/beheer/onboarding", label: "Uitleg" },
      ];

  const navLinkStyle = ({ isActive }: { isActive: boolean }): React.CSSProperties => ({
    textDecoration: "none",
    fontWeight: 600,
    fontSize: 14,
    padding: "6px 12px",
    borderRadius: 99,
    lineHeight: 1.6,
    color: isActive ? "var(--rd-aubergine)" : "rgba(47,33,65,.62)",
    background: isActive ? "var(--rd-lavender)" : "transparent",
    whiteSpace: "nowrap",
  });

  const initials = (session?.user.email ?? "?").trim().slice(0, 2).toUpperCase();

  const shell = (children: React.ReactNode, chrome = true) => (
    <div style={{ minHeight: "100dvh", background: "var(--rd-offwhite)", color: "var(--rd-aubergine)", fontFamily: "Figtree, system-ui, sans-serif" }}>
      {chrome && session && (
        <header style={{ position: "sticky", top: 0, zIndex: 20, background: "var(--rd-offwhite)", borderBottom: "1px solid var(--rd-line)" }}>
          <div style={{ maxWidth: 1040, margin: "0 auto", padding: "12px 20px", display: "flex", alignItems: "center", gap: 16 }}>
            <Link to="/beheer" style={{ textDecoration: "none", display: "flex", alignItems: "baseline", gap: 8, flex: "none" }}>
              <span style={{ fontWeight: 800, fontSize: 20, letterSpacing: "-.02em", color: "var(--rd-aubergine)" }}>Roll</span>
              <span className="rd-kicker rd-kicker-pink" style={{ fontSize: 11 }}>kleuradvies</span>
            </Link>
            <nav style={{ display: "flex", alignItems: "center", gap: 2, flexWrap: "wrap", flex: 1 }}>
              {navMain.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.end} style={navLinkStyle}>{n.label}</NavLink>
              ))}
            </nav>
            <div style={{ display: "flex", alignItems: "center", gap: 6, flex: "none" }}>
              {isAdmin && (
                <NavLink to="/beheer/meldingen" title="Meldingen" style={{ position: "relative", textDecoration: "none", width: 38, height: 38, borderRadius: 99, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18 }}>
                  <span aria-hidden>🔔</span>
                  {alertCount > 0 && (
                    <span style={{ position: "absolute", top: 2, right: 2, minWidth: 17, height: 17, padding: "0 4px", borderRadius: 99, background: "var(--rd-pink-dark)", color: "#fff", fontSize: 10, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center" }}>{alertCount}</span>
                  )}
                </NavLink>
              )}
              <NavLink to="/beheer/account" title="Account" style={({ isActive }) => ({
                textDecoration: "none", width: 38, height: 38, borderRadius: 99, flex: "none",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13,
                background: isActive ? "var(--rd-pink)" : "var(--rd-lavender)", color: "var(--rd-aubergine)",
              })}>{initials}</NavLink>
            </div>
          </div>
        </header>
      )}
      <main style={{ maxWidth: 1040, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
    </div>
  );

  if (!ready) return null;
  if (!session) return <Login />;

  if (isAdvisor === null) return shell(<p className="rd-sub">Toegang controleren...</p>, false);
  if (!isAdvisor)
    return shell(
      <div className="rd-card-white" style={{ maxWidth: 520, margin: "40px auto 0" }}>
        <div className="rd-h2-sm" style={{ marginBottom: 8 }}>Geen toegang</div>
        <p className="rd-sub" style={{ marginTop: 0 }}>
          Dit account staat niet op de lijst van kleuradviseurs. Vraag de beheerder om je e-mailadres
          ({session.user.email}) toe te voegen.
        </p>
        <button className="rd-textlink" style={{ minHeight: 40, marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Uitloggen</button>
      </div>,
      false,
    );

  return shell(
    <Routes>
      <Route index element={isAdmin ? <IntakeList /> : <StylistHome />} />
      <Route path="start" element={<StylistHome />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route path="commissie" element={<CommissiePage />} />
      <Route path="gesprekken" element={<KanbanPage />} />
      <Route path="intakes" element={<IntakeList />} />
      <Route path="boekingen" element={<BoekingenPage />} />
      <Route path="agenda" element={<AgendaPage />} />
      <Route path="adviseurs" element={<AdvisorsAdmin />} />
      <Route path="meldingen" element={<AlertsPage />} />
      <Route path="cadeaucodes" element={<CadeaucodesPage />} />
      <Route path=":id" element={<IntakeDetail />} />
    </Routes>,
  );
}
