import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PasswordInput } from "./PasswordInput";

// Waar de resetlink naartoe leidt: daar kiest de gebruiker een nieuw wachtwoord.
export const RESET_REDIRECT = () => `${window.location.origin}/beheer/nieuw-wachtwoord`;

export function Login() {
  const [mode, setMode] = useState<"login" | "vergeten">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("Inloggen lukte niet. Controleer je e-mail en wachtwoord.");
  };

  const sendReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: RESET_REDIRECT() });
    setBusy(false);
    // Bewust dezelfde melding of het adres nu wel of niet bekend is (geen accounts prijsgeven).
    if (error && /rate|limit|seconds/i.test(error.message)) { setError("Er is net al een link verstuurd. Wacht een minuut en probeer het opnieuw."); return; }
    setSent(true);
  };

  const wrap: React.CSSProperties = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Figtree, system-ui, sans-serif", color: "var(--rd-aubergine)" };
  const errorEl = error && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, marginTop: 12 }}>{error}</p>;

  if (mode === "vergeten") {
    return (
      <div style={wrap}>
        <form onSubmit={sendReset} style={{ width: "100%", maxWidth: 360 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Beheer</div>
          <h1 className="rd-h2" style={{ marginBottom: 6 }}>Wachtwoord vergeten</h1>
          {sent ? (
            <>
              <p className="rd-sub" style={{ marginTop: 0 }}>
                Als <strong>{email.trim()}</strong> bij ons bekend is, staat er binnen een paar minuten een mail met een link in je inbox. Via die link kies je een nieuw wachtwoord. Kijk ook even in je spam.
              </p>
              <button type="button" className="rd-btn rd-btn-outline rd-btn-lg" style={{ marginTop: 12 }} onClick={() => { setMode("login"); setSent(false); }}>Terug naar inloggen</button>
            </>
          ) : (
            <>
              <p className="rd-sub" style={{ marginTop: 0, marginBottom: 20 }}>Vul je e-mailadres in. We sturen je een link om een nieuw wachtwoord te kiezen.</p>
              <input className="rd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mailadres" autoComplete="username" required autoFocus />
              {errorEl}
              <button type="submit" className="rd-btn rd-btn-primary rd-btn-lg" disabled={busy} style={{ marginTop: 16, ...(busy ? { opacity: 0.5 } : {}) }}>{busy ? "Bezig..." : "Stuur de link"}</button>
              <button type="button" className="rd-textlink" style={{ minHeight: 40, marginTop: 8, display: "block" }} onClick={() => { setMode("login"); setError(null); }}>Terug naar inloggen</button>
            </>
          )}
        </form>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Beheer</div>
        <h1 className="rd-h2" style={{ marginBottom: 6 }}>Inloggen</h1>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 20 }}>Voor kleuradviseurs. Log in om de intakes te bekijken.</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input className="rd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mailadres" autoComplete="username" required />
          <PasswordInput value={password} onChange={setPassword} required />
        </div>
        {errorEl}
        <button type="submit" className="rd-btn rd-btn-primary rd-btn-lg" disabled={busy} style={{ marginTop: 16, ...(busy ? { opacity: 0.5 } : {}) }}>{busy ? "Bezig..." : "Inloggen"}</button>
        <button type="button" className="rd-textlink" style={{ minHeight: 40, marginTop: 8, display: "block" }} onClick={() => { setMode("vergeten"); setError(null); }}>Wachtwoord vergeten?</button>
      </form>
    </div>
  );
}
