import { useEffect, useRef, useState } from "react";
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
import { KlantDossier } from "./KlantDossier";
import { NotificationsPage } from "./NotificationsPage";
import { loadNotifications } from "./notifications";

// Menubalk in roll.nl-stijl: paarse afgeronde balk, wit menu, roze Roll-logo in het midden.
const BAR_CSS = `
.rd-topbar{max-width:1120px;margin:0 auto;background:var(--rd-aubergine);color:#fff;border-radius:16px;padding:0 18px;display:grid;grid-template-columns:1fr auto 1fr;align-items:center;min-height:62px;gap:12px}
.rd-topbar nav{display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.rd-topbar .rd-nl{color:rgba(255,255,255,.82);text-decoration:none;font-weight:600;font-size:15px;padding:8px 12px;border-radius:99px;line-height:1.4;white-space:nowrap;transition:background .12s ease,color .12s ease}
.rd-topbar .rd-nl:hover{color:#fff;background:rgba(255,255,255,.08)}
.rd-topbar .rd-nl.active{color:#fff;background:rgba(255,255,255,.14)}
.rd-topbar .rd-logo{display:flex;align-items:center;text-decoration:none;padding:4px 6px}
.rd-topbar .rd-right{display:flex;align-items:center;justify-content:flex-end;gap:4px}
.rd-topbar .rd-ico{position:relative;width:40px;height:40px;border-radius:99px;display:flex;align-items:center;justify-content:center;color:#fff;text-decoration:none;transition:background .12s ease}
.rd-topbar .rd-ico:hover,.rd-topbar .rd-ico.active{background:rgba(255,255,255,.12)}
.rd-topbar .rd-badge{position:absolute;top:3px;right:3px;min-width:18px;height:18px;padding:0 5px;border-radius:99px;background:var(--rd-pink);color:var(--rd-aubergine);font-size:11px;font-weight:800;display:flex;align-items:center;justify-content:center}
.rd-topbar .rd-avatar{width:36px;height:36px;border-radius:99px;background:var(--rd-pink);color:var(--rd-aubergine);font-weight:800;font-size:13px;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer;margin-left:4px}
.rd-menu{position:absolute;right:0;top:46px;background:#fff;color:var(--rd-aubergine);border-radius:14px;box-shadow:0 10px 30px rgba(47,33,65,.18);min-width:210px;padding:6px;z-index:30;display:flex;flex-direction:column}
.rd-menu a,.rd-menu button{text-align:left;background:none;border:0;font:inherit;font-weight:600;font-size:14px;color:var(--rd-aubergine);text-decoration:none;padding:9px 12px;border-radius:10px;cursor:pointer}
.rd-menu a:hover,.rd-menu button:hover{background:var(--rd-grey-light)}
.rd-menu .rd-sep{height:1px;background:var(--rd-line);margin:4px 6px}
@media (max-width:860px){
  .rd-topbar{grid-template-columns:1fr auto;grid-template-areas:"logo right" "nav nav";padding:8px 12px 6px}
  .rd-topbar>nav{grid-area:nav;justify-content:center}
  .rd-topbar>.rd-logo{grid-area:logo;justify-self:start}
  .rd-topbar>.rd-right{grid-area:right}
  .rd-topbar .rd-nl{font-size:14px;padding:6px 10px}
}
`;

const BellIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" />
  </svg>
);
const CalendarIcon = () => (
  <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="3" y="4" width="18" height="18" rx="3" /><path d="M16 2v4M8 2v4M3 10h18" />
  </svg>
);

export function Dashboard() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [isAdvisor, setIsAdvisor] = useState<boolean | null>(null);
  const [stylistName, setStylistName] = useState<string | null>(null);
  const [notifCount, setNotifCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setReady(true); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => { setSession(s); setIsAdvisor(null); });
    return () => sub.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.rpc("is_advisor").then(({ data }) => setIsAdvisor(data === true));
  }, [session]);

  const isAdmin = !!session && (session.user.email ?? "").toLowerCase().endsWith("@roll.nl");

  // Belletje: aantal openstaande acties (styliste: eigen; beheerder: alles incl. systeemmeldingen).
  useEffect(() => {
    if (!session || isAdvisor !== true) return;
    (async () => {
      const { data: st } = await supabase.rpc("current_stylist");
      const mine = ((st as { id: string; name: string }[]) ?? [])[0] ?? null;
      setStylistName(mine?.name ?? null);
      const list = await loadNotifications({ isAdmin, stylistId: isAdmin ? null : mine?.id ?? null });
      setNotifCount(list.length);
    })();
  }, [session, isAdvisor, isAdmin]);

  // Profielmenu sluiten bij klik buiten.
  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [menuOpen]);

  const initials = (() => {
    const src = stylistName || session?.user.email || "?";
    const p = src.trim().split(/[\s@.]+/).filter(Boolean);
    return ((p[0]?.[0] ?? "?") + (p.length > 1 && stylistName ? p[p.length - 1][0] : "")).toUpperCase();
  })();

  const shell = (children: React.ReactNode, chrome = true) => (
    <div style={{ minHeight: "100dvh", background: "var(--rd-offwhite)", color: "var(--rd-aubergine)", fontFamily: "Figtree, system-ui, sans-serif" }}>
      <style>{BAR_CSS}</style>
      {chrome && session && (
        <header style={{ position: "sticky", top: 0, zIndex: 20, padding: "12px 12px 0", background: "var(--rd-offwhite)" }}>
          <div className="rd-topbar">
            <nav>
              <NavLink to="/beheer" end className={({ isActive }) => `rd-nl${isActive ? " active" : ""}`}>Overzicht</NavLink>
              <NavLink to="/beheer/gesprekken" className={({ isActive }) => `rd-nl${isActive ? " active" : ""}`}>Adviesgesprekken</NavLink>
              <NavLink to="/beheer/commissie" className={({ isActive }) => `rd-nl${isActive ? " active" : ""}`}>Commissie</NavLink>
            </nav>
            <Link to="/beheer" className="rd-logo" aria-label="Roll advies">
              <img src="/roll-advies-logo.png" alt="Roll advies" style={{ height: 46, width: "auto", display: "block" }} />
            </Link>
            <div className="rd-right">
              <NavLink to="/beheer/onboarding" className={({ isActive }) => `rd-nl${isActive ? " active" : ""}`}>Uitleg</NavLink>
              <NavLink to="/beheer/notificaties" title="Notificaties" className={({ isActive }) => `rd-ico${isActive ? " active" : ""}`}>
                <BellIcon />
                {notifCount > 0 && <span className="rd-badge">{notifCount > 99 ? "99+" : notifCount}</span>}
              </NavLink>
              <NavLink to="/beheer/agenda" title="Agenda" className={({ isActive }) => `rd-ico${isActive ? " active" : ""}`}><CalendarIcon /></NavLink>
              <div ref={menuRef} style={{ position: "relative" }}>
                <button className="rd-avatar" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen} title="Profiel">{initials}</button>
                {menuOpen && (
                  <div className="rd-menu" role="menu" onClick={() => setMenuOpen(false)}>
                    <div style={{ padding: "6px 12px 8px", fontSize: 12, opacity: 0.6 }}>{session.user.email}</div>
                    <Link to="/beheer/account">Mijn profiel</Link>
                    <Link to="/beheer/agenda">Agenda &amp; beschikbaarheid</Link>
                    {isAdmin && (
                      <>
                        <div className="rd-sep" />
                        <Link to="/beheer/intakes">Alle intakes</Link>
                        <Link to="/beheer/boekingen">Boekingen</Link>
                        <Link to="/beheer/cadeaucodes">Cadeaucodes</Link>
                        <Link to="/beheer/adviseurs">Adviseurs</Link>
                        <Link to="/beheer/meldingen">Systeemmeldingen</Link>
                      </>
                    )}
                    <div className="rd-sep" />
                    <button onClick={() => supabase.auth.signOut()}>Uitloggen</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>
      )}
      <main style={{ maxWidth: 1120, margin: "0 auto", padding: "24px 20px 64px" }}>{children}</main>
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
          Dit account staat niet op de lijst van kleuradviseurs. Vraag de beheerder om je e-mailadres ({session.user.email}) toe te voegen.
        </p>
        <button className="rd-textlink" style={{ minHeight: 40, marginTop: 8 }} onClick={() => supabase.auth.signOut()}>Uitloggen</button>
      </div>,
      false,
    );

  return shell(
    <Routes>
      <Route index element={<StylistHome />} />
      <Route path="start" element={<StylistHome />} />
      <Route path="gesprekken" element={<KanbanPage />} />
      <Route path="klant/:bookingId" element={<KlantDossier />} />
      <Route path="commissie" element={<CommissiePage />} />
      <Route path="notificaties" element={<NotificationsPage />} />
      <Route path="account" element={<AccountPage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route path="agenda" element={<AgendaPage />} />
      <Route path="intakes" element={<IntakeList />} />
      <Route path="boekingen" element={<BoekingenPage />} />
      <Route path="adviseurs" element={<AdvisorsAdmin />} />
      <Route path="meldingen" element={<AlertsPage />} />
      <Route path="cadeaucodes" element={<CadeaucodesPage />} />
      <Route path=":id" element={<IntakeDetail />} />
    </Routes>,
  );
}
