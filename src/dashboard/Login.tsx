import { useState } from "react";
import { supabase } from "@/lib/supabase";

export function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) setError("Inloggen lukte niet. Controleer je e-mail en wachtwoord.");
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Figtree, system-ui, sans-serif",
        color: "var(--rd-aubergine)",
      }}
    >
      <form onSubmit={submit} style={{ width: "100%", maxWidth: 360 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>
          Roll · Beheer
        </div>
        <h1 className="rd-h2" style={{ marginBottom: 6 }}>
          Inloggen
        </h1>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 20 }}>
          Voor kleuradviseurs. Log in om de intakes te bekijken.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="rd-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mailadres"
            autoComplete="username"
            required
          />
          <input
            className="rd-input"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Wachtwoord"
            autoComplete="current-password"
            required
          />
        </div>
        {error && (
          <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, marginTop: 12 }}>
            {error}
          </p>
        )}
        <button
          type="submit"
          className="rd-btn rd-btn-primary rd-btn-lg"
          disabled={busy}
          style={{ marginTop: 16, ...(busy ? { opacity: 0.5 } : {}) }}
        >
          {busy ? "Bezig..." : "Inloggen"}
        </button>
      </form>
    </div>
  );
}
