import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Advisor {
  email: string;
  name: string | null;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("manage-advisors", {
    body: { action, ...payload },
  });
  if (error) {
    let msg = "Er ging iets mis.";
    try {
      const b = await (error as { context?: Response }).context?.json?.();
      if (b?.error) msg = b.error;
    } catch {
      /* geen json */
    }
    throw new Error(msg);
  }
  return data;
}

export function AdvisorsAdmin() {
  const [advisors, setAdvisors] = useState<Advisor[]>([]);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const d = await call("list");
      setAdvisors((d.advisors as Advisor[]) ?? []);
    } catch (e) {
      setErr((e as Error).message);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const flash = (m: string) => {
    setMsg(m);
    setErr(null);
    setTimeout(() => setMsg(null), 3000);
  };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr(null);
    try {
      const d = await call("create", { email, name, password });
      flash(d.existed ? "Bestond al; toegang toegevoegd." : "Adviseur toegevoegd.");
      setEmail("");
      setName("");
      setPassword("");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
    setBusy(false);
  };

  const resetPw = async (adv: Advisor) => {
    const pw = window.prompt(`Nieuw wachtwoord voor ${adv.email} (min. 8 tekens):`);
    if (!pw) return;
    try {
      await call("set_password", { email: adv.email, password: pw });
      flash("Wachtwoord gewijzigd.");
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  const remove = async (adv: Advisor) => {
    if (!window.confirm(`${adv.email} verwijderen? De toegang vervalt direct.`)) return;
    try {
      await call("delete", { email: adv.email });
      flash("Adviseur verwijderd.");
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Adviseurs
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Voeg stylistes toe, wijzig hun wachtwoord of verwijder toegang. Alleen @roll.nl-beheerders
        zien deze pagina.
      </p>

      {msg && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{msg}</p>}
      {err && <p style={{ color: "#b3261e", fontWeight: 600 }}>{err}</p>}

      {/* Toevoegen */}
      <form onSubmit={add} className="rd-card-white" style={{ marginTop: 12 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
          Nieuwe adviseur
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="rd-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="E-mailadres"
            required
          />
          <input
            className="rd-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Naam (optioneel)"
          />
          <input
            className="rd-input"
            type="text"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Tijdelijk wachtwoord (min. 8 tekens)"
            minLength={8}
            required
          />
        </div>
        <button
          type="submit"
          className="rd-btn rd-btn-primary"
          disabled={busy}
          style={{ width: "auto", padding: "0 24px", marginTop: 12, ...(busy ? { opacity: 0.5 } : {}) }}
        >
          {busy ? "Bezig..." : "Adviseur toevoegen"}
        </button>
      </form>

      {/* Lijst */}
      <div style={{ marginTop: 16 }}>
        {loading ? (
          <p className="rd-sub">Laden...</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {advisors.map((a) => (
              <div
                key={a.email}
                className="rd-card-white"
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}
              >
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700 }}>{a.name || a.email}</div>
                  <div style={{ fontSize: 13, opacity: 0.7 }}>{a.email}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="rd-plan-chip" onClick={() => resetPw(a)}>
                    Wachtwoord
                  </button>
                  <button
                    className="rd-plan-chip"
                    onClick={() => remove(a)}
                    style={{ borderColor: "#b3261e", color: "#b3261e" }}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
