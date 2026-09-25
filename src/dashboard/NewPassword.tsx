import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { PasswordInput } from "./PasswordInput";

// Landingspagina van de resetlink (/beheer/nieuw-wachtwoord): de link logt tijdelijk in,
// hier kiest de gebruiker een nieuw wachtwoord.
export function NewPassword({ session, onDone }: { session: Session | null; onDone: () => void }) {
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [waited, setWaited] = useState(false);
  // Verlopen of al gebruikte link: Supabase zet een foutcode in de URL.
  const linkError = /error_code=|error=access_denied/.test(window.location.hash + window.location.search);

  useEffect(() => { const t = setTimeout(() => setWaited(true), 3000); return () => clearTimeout(t); }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    if (pw.length < 8) { setErr("Kies een wachtwoord van minstens 8 tekens."); return; }
    if (pw !== pw2) { setErr("De twee wachtwoorden zijn niet hetzelfde."); return; }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) { setErr(/same|different/i.test(error.message) ? "Kies een ander wachtwoord dan je huidige." : "Opslaan lukte niet. Vraag eventueel een nieuwe link aan."); return; }
    setDone(true);
  };

  const wrap: React.CSSProperties = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Figtree, system-ui, sans-serif", color: "var(--rd-aubergine)" };
  const head = (title: string) => (
    <>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Beheer</div>
      <h1 className="rd-h2" style={{ marginBottom: 6 }}>{title}</h1>
    </>
  );

  if (done) {
    return (
      <div style={wrap}><div style={{ width: "100%", maxWidth: 360 }}>
        {head("Wachtwoord gewijzigd")}
        <p className="rd-sub" style={{ marginTop: 0 }}>Je nieuwe wachtwoord is opgeslagen. Het werkt ook voor het Quiz-dashboard.</p>
        <button className="rd-btn rd-btn-primary rd-btn-lg" style={{ marginTop: 12 }} onClick={onDone}>Naar het dashboard</button>
      </div></div>
    );
  }

  if (!session) {
    return (
      <div style={wrap}><div style={{ width: "100%", maxWidth: 360 }}>
        {head(linkError || waited ? "Link verlopen" : "Link controleren...")}
        {(linkError || waited) && (
          <>
            <p className="rd-sub" style={{ marginTop: 0 }}>Deze link is verlopen of al gebruikt. Vraag een nieuwe aan via "Wachtwoord vergeten?" op het inlogscherm.</p>
            <button className="rd-btn rd-btn-outline rd-btn-lg" style={{ marginTop: 12 }} onClick={onDone}>Naar inloggen</button>
          </>
        )}
      </div></div>
    );
  }

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
        {head("Nieuw wachtwoord")}
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 20 }}>Voor {session.user.email}. Kies een wachtwoord van minstens 8 tekens.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <PasswordInput value={pw} onChange={setPw} placeholder="Nieuw wachtwoord" autoComplete="new-password" required minLength={8} autoFocus />
          <PasswordInput value={pw2} onChange={setPw2} placeholder="Herhaal het wachtwoord" autoComplete="new-password" required minLength={8} />
        </div>
        {err && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, marginTop: 12 }}>{err}</p>}
        <button type="submit" className="rd-btn rd-btn-primary rd-btn-lg" disabled={busy} style={{ marginTop: 16, ...(busy ? { opacity: 0.5 } : {}) }}>{busy ? "Opslaan..." : "Wachtwoord opslaan"}</button>
      </form>
    </div>
  );
}
