import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { PasswordInput } from "./PasswordInput";

/**
 * Vraagt de wachtwoordmail aan: een mail in Roll-stijl met een eenmalige link naar /dashboard/nieuw-wachtwoord.
 * Het antwoord is altijd hetzelfde, of het adres nu bekend is of niet. Geeft false als versturen niet lukte.
 */
export async function vraagWachtwoordMail(email: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("dashboard-toegang", { body: { action: "wachtwoord", email: email.trim() } });
  return !error && true === (data as { ok?: boolean } | null)?.ok;
}

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
    const ok = await vraagWachtwoordMail(email);
    setBusy(false);
    // Bewust dezelfde melding of het adres nu wel of niet bekend is (geen accounts prijsgeven).
    if (!ok) { setError("Versturen lukte niet. Probeer het over een minuut opnieuw."); return; }
    setSent(true);
  };

  const wrap: React.CSSProperties = { minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 24, fontFamily: "Figtree, system-ui, sans-serif", color: "var(--rd-aubergine)" };
  const errorEl = error && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, marginTop: 12 }}>{error}</p>;

  if (mode === "vergeten") {
    return (
      <div style={wrap}>
        <form onSubmit={sendReset} style={{ width: "100%", maxWidth: 360 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Dashboard</div>
          <h1 className="rd-h2" style={{ marginBottom: 6 }}>Wachtwoord vergeten</h1>
          {sent ? (
            <>
              <p className="rd-sub" style={{ marginTop: 0 }}>
                Als <strong>{email.trim()}</strong> bij ons bekend is, staat er binnen een paar minuten een mail met een link in je inbox. Via die link kies je een nieuw wachtwoord. Kijk ook even in je spam. Vraag je er meer dan een aan, dan werkt alleen de link in de nieuwste mail.
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
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Dashboard</div>
        <h1 className="rd-h2" style={{ marginBottom: 6 }}>Inloggen</h1>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 20 }}>Voor partners van Roll. Log in om je dashboard te openen.</p>
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
