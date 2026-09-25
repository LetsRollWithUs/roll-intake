import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

// Team (alleen beheerders): accounts, rollen, stylistenprofiel en samenwerkingsafspraken.
// Medewerkers zien deze pagina niet en kunnen de gegevens van anderen ook niet opvragen (RLS).

interface Member {
  email: string;
  name: string | null;
  role: "beheerder" | "medewerker";
  stylist_id: string | null;
  stylist_name: string | null;
  active: boolean | null;
  meet_url: string | null;
  discount_code: string | null;
  commission_rate: number | null;
  notes: string | null;
  start_date: string | null;
  updated_at: string | null;
  updated_by: string | null;
}

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("manage-advisors", { body: { action, ...payload } });
  if (error) {
    let msg = "Er ging iets mis.";
    try {
      const b = await (error as { context?: Response }).context?.json?.();
      if (b?.error) msg = b.error;
    } catch { /* geen json */ }
    throw new Error(msg);
  }
  return data;
}

const pctText = (r: number | null) => (r == null ? "" : String(Math.round(r * 1000) / 10).replace(".", ","));
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });

export function AdvisorsAdmin() {
  const [team, setTeam] = useState<Member[]>([]);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    setMe((u?.user?.email ?? "").toLowerCase());
    const { data, error } = await supabase.rpc("admin_team");
    if (error) setErr(error.message);
    setTeam((data as Member[]) ?? []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const flash = (m: string) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 3000); };

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr(null);
    try {
      const d = await call("create", { email, name, password });
      flash(d.existed ? "Bestond al; toegang toegevoegd." : "Medewerker toegevoegd. Maak hieronder het stylistenprofiel aan.");
      setEmail(""); setName(""); setPassword("");
      load();
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  };
  const resetPw = async (m: Member) => {
    const pw = window.prompt(`Nieuw wachtwoord voor ${m.email} (min. 8 tekens):`);
    if (!pw) return;
    try { await call("set_password", { email: m.email, password: pw }); flash("Wachtwoord gewijzigd."); } catch (e) { setErr((e as Error).message); }
  };
  const remove = async (m: Member) => {
    if (!window.confirm(`${m.email} verwijderen? De toegang vervalt direct.`)) return;
    try { await call("delete", { email: m.email }); flash("Toegang verwijderd."); load(); } catch (e) { setErr((e as Error).message); }
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>← Overzicht</Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>Team</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Accounts, rollen en samenwerkingsafspraken. Alleen beheerders zien deze pagina. Medewerkers zien alleen hun eigen klanten en commissie.
      </p>
      {msg && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{msg}</p>}
      {err && <p style={{ color: "#b3261e", fontWeight: 600 }}>{err}</p>}

      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
        {loading ? <p className="rd-sub">Laden...</p> : team.map((m) => (
          <MemberCard key={m.email} m={m} me={me} onChanged={load} onFlash={flash} onError={setErr} onResetPw={() => resetPw(m)} onRemove={() => remove(m)} />
        ))}
      </div>

      <details className="rd-card-white" style={{ marginTop: 16 }}>
        <summary style={{ cursor: "pointer", fontWeight: 700 }}>+ Nieuwe medewerker</summary>
        <form onSubmit={add} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 12 }}>
          <input className="rd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mailadres" required />
          <input className="rd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" />
          <input className="rd-input" type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Tijdelijk wachtwoord (min. 8 tekens)" minLength={8} required />
          <button type="submit" className="rd-btn rd-btn-primary" disabled={busy} style={{ width: "auto", padding: "0 24px", alignSelf: "flex-start" }}>{busy ? "Bezig..." : "Toevoegen"}</button>
          <span style={{ fontSize: 12.5, opacity: 0.65 }}>Nieuwe accounts zijn medewerker. De rol wijzig je daarna in het profiel.</span>
        </form>
      </details>
    </div>
  );
}

function MemberCard({ m, me, onChanged, onFlash, onError, onResetPw, onRemove }: {
  m: Member; me: string; onChanged: () => void; onFlash: (t: string) => void; onError: (t: string) => void; onResetPw: () => void; onRemove: () => void;
}) {
  const [sName, setSName] = useState(m.stylist_name ?? m.name ?? "");
  const [meet, setMeet] = useState(m.meet_url ?? "");
  const [code, setCode] = useState(m.discount_code ?? "");
  const [active, setActive] = useState(m.active ?? true);
  const [pct, setPct] = useState(pctText(m.commission_rate));
  const [start, setStart] = useState(m.start_date ?? "");
  const [notes, setNotes] = useState(m.notes ?? "");
  const [saving, setSaving] = useState(false);
  const isMe = m.email.toLowerCase() === me;

  const setRole = async (role: string) => {
    if (!window.confirm(role === "beheerder" ? `${m.email} beheerder maken? Diegene ziet dan alle klanten, commissies en afspraken.` : `${m.email} terugzetten naar medewerker?`)) return;
    const { error } = await supabase.rpc("set_advisor_role", { p_email: m.email, p_role: role });
    if (error) { onError(error.message); return; }
    onFlash("Rol gewijzigd."); onChanged();
  };
  const createProfile = async () => {
    const { error } = await supabase.from("stylists").insert({ email: m.email.toLowerCase(), name: (m.name || m.email.split("@")[0]).trim(), active: true });
    if (error) { onError(error.message); return; }
    onFlash("Stylistenprofiel aangemaakt."); onChanged();
  };
  const save = async () => {
    if (!m.stylist_id) return;
    const raw = pct.trim().replace(",", ".");
    const p = raw === "" ? null : Number(raw);
    if (p !== null && (!Number.isFinite(p) || p < 0 || p > 100)) { onError("Vul een commissiepercentage tussen 0 en 100 in, of laat het leeg voor de standaard (10%)."); return; }
    setSaving(true);
    const { error: e1 } = await supabase.from("stylists")
      .update({ name: sName.trim() || m.email, meet_url: meet.trim() || null, discount_code: code.trim().toUpperCase() || null, active })
      .eq("id", m.stylist_id);
    const { error: e2 } = await supabase.from("stylist_agreements").upsert({
      stylist_id: m.stylist_id, commission_rate: p === null ? null : Math.round(p * 10) / 1000,
      notes: notes.trim() || null, start_date: start || null, updated_at: new Date().toISOString(), updated_by: me || null,
    });
    setSaving(false);
    const e = e1 ?? e2;
    if (e) { onError(e.message.includes("duplicate") ? "Deze kortingscode is al in gebruik." : e.message); return; }
    onFlash("Opgeslagen."); onChanged();
  };

  const label = (t: string) => <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{t}</span>;
  const pctShown = m.commission_rate != null ? `${pctText(m.commission_rate)}%` : "10% (standaard)";

  return (
    <details className="rd-card-white" style={{ padding: 0, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontWeight: 700, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            {m.stylist_name || m.name || m.email}
            <span className="rd-chip" style={{ fontSize: 11, background: m.role === "beheerder" ? "var(--rd-aubergine)" : "var(--rd-grey-light)", color: m.role === "beheerder" ? "#fff" : "var(--rd-aubergine)", fontWeight: 700 }}>{m.role}</span>
            {!m.stylist_id && <span className="rd-chip" style={{ fontSize: 11, background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 }}>geen stylistenprofiel</span>}
            {m.stylist_id && m.active === false && <span className="rd-chip" style={{ fontSize: 11 }}>inactief</span>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>{m.email}{m.stylist_id ? ` · commissie ${pctShown}` : ""}</div>
        </div>
        <span style={{ fontSize: 12.5, fontWeight: 700, color: "var(--rd-pink-dark)" }}>Profiel &amp; afspraken</span>
      </summary>

      <div style={{ padding: "0 18px 18px", display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {label("Rol")}
          <select className="rd-input" value={m.role} onChange={(e) => setRole(e.target.value)} disabled={isMe} style={{ height: 36, width: 180 }} title={isMe ? "Je kunt je eigen rol niet wijzigen" : undefined}>
            <option value="medewerker">Medewerker</option>
            <option value="beheerder">Beheerder</option>
          </select>
          <span style={{ fontSize: 12.5, opacity: 0.65 }}>{m.role === "beheerder" ? "Ziet en beheert alles, ook het team en de afspraken." : "Ziet alleen de eigen klanten, taken en commissie."}</span>
        </div>

        {!m.stylist_id ? (
          <div style={{ padding: "10px 12px", borderRadius: 10, background: "var(--rd-grey-light)", fontSize: 13.5, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{ flex: "1 1 280px" }}>Nog geen stylistenprofiel. Zonder profiel kan deze medewerker geen afspraken krijgen en is er geen commissie in te stellen.</span>
            <button className="rd-btn rd-btn-primary" onClick={createProfile} style={{ width: "auto", padding: "0 16px", height: 36 }}>Maak profiel aan</button>
          </div>
        ) : (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Naam in het dashboard")}<input className="rd-input" value={sName} onChange={(e) => setSName(e.target.value)} style={{ height: 38 }} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Videolink")}<input className="rd-input" value={meet} onChange={(e) => setMeet(e.target.value)} placeholder="https://meet.google.com/..." style={{ height: 38 }} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Persoonlijke kortingscode")}<input className="rd-input" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Bijv. ANNA10" style={{ height: 38, textTransform: "uppercase" }} /></label>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13.5, paddingTop: 20 }}><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Actief (kan geboekt worden)</label>
            </div>

            <div style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="rd-kicker rd-kicker-pink">Samenwerkingsafspraken</div>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Commissie op verf")}
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}><input className="rd-input" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="10" style={{ height: 38, width: 80, textAlign: "right" }} />%</span>
                </label>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Samenwerking sinds")}<input className="rd-input" type="date" value={start} onChange={(e) => setStart(e.target.value)} style={{ height: 38 }} /></label>
              </div>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Afspraken")}
                <textarea className="rd-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Bijv. vergoeding en facturatie, beschikbaarheid per week, afspraken over eigen klanten en vervolgadvies." style={{ height: 110, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
              </label>
              <span style={{ fontSize: 12, opacity: 0.6 }}>
                Leeg percentage = standaard 10%. Een nieuw percentage geldt voor nieuwe toeschrijvingen; bestaande commissieregels houden hun percentage. Alleen beheerders zien deze afspraken.
                {m.updated_at ? ` Laatst bijgewerkt ${fmtDate(m.updated_at)}${m.updated_by ? ` door ${m.updated_by}` : ""}.` : ""}
              </span>
            </div>
            <button className="rd-btn rd-btn-primary" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 22px", alignSelf: "flex-start" }}>{saving ? "Opslaan..." : "Opslaan"}</button>
          </>
        )}

        <div style={{ display: "flex", gap: 8, borderTop: "1px solid var(--rd-line)", paddingTop: 12 }}>
          <button className="rd-plan-chip" onClick={onResetPw}>Wachtwoord wijzigen</button>
          {!isMe && <button className="rd-plan-chip" onClick={onRemove} style={{ borderColor: "#b3261e", color: "#b3261e" }}>Toegang verwijderen</button>}
        </div>
      </div>
    </details>
  );
}
