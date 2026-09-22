import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Stylist {
  id: string;
  email: string;
  name: string;
  active: boolean;
  meet_url: string | null;
}
// Geheimen komen niet via de tabel maar via de RPC stylist_secrets (eigen styliste of admin).
interface Secrets {
  feed_token: string;
  ical_feed_url: string | null;
  ical_synced_at: string | null;
}

const SUPA_URL =
  (import.meta.env.VITE_SUPABASE_URL as string) || "https://lsboujprrvhntgbvlvyu.supabase.co";
interface Rule {
  id?: string;
  weekday: number;
  start_time: string;
  end_time: string;
}
interface Exception {
  id: string;
  date: string;
  is_off: boolean;
  start_time: string | null;
  end_time: string | null;
}

const WEEKDAYS = [
  { n: 1, label: "Maandag" },
  { n: 2, label: "Dinsdag" },
  { n: 3, label: "Woensdag" },
  { n: 4, label: "Donderdag" },
  { n: 5, label: "Vrijdag" },
  { n: 6, label: "Zaterdag" },
  { n: 7, label: "Zondag" },
];

const hm = (t: string) => t.slice(0, 5); // 'HH:MM:SS' -> 'HH:MM'

export function AgendaPage() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selectedId, setSelectedId] = useState<string>("");
  const [byDay, setByDay] = useState<Record<number, { start: string; end: string }[]>>({});
  const [exceptions, setExceptions] = useState<Exception[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingRules, setSavingRules] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // admin: nieuwe stylist
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");

  // videogesprek-link
  const [meetUrl, setMeetUrl] = useState("");
  const [savingMeet, setSavingMeet] = useState(false);

  // eigen agenda blokkeren (iCal)
  const [icalUrl, setIcalUrl] = useState("");
  const [icalSyncedAt, setIcalSyncedAt] = useState<string | null>(null);
  const [savingIcal, setSavingIcal] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [copied, setCopied] = useState(false);
  const [secrets, setSecrets] = useState<Secrets | null>(null);

  // uitzondering toevoegen
  const [excDate, setExcDate] = useState("");
  const [excOff, setExcOff] = useState(true);
  const [excStart, setExcStart] = useState("09:00");
  const [excEnd, setExcEnd] = useState("17:00");

  const flash = (m: string) => {
    setMsg(m);
    setErr(null);
    setTimeout(() => setMsg(null), 2500);
  };

  const loadStylists = async () => {
    const { data: adm } = await supabase.rpc("is_admin");
    const { data: u } = await supabase.auth.getUser();
    const email = (u?.user?.email ?? "").toLowerCase();
    setIsAdmin(adm === true);
    setMyEmail(email);
    // Expliciete kolommen: de geheime kolommen zijn bewust niet meer leesbaar via de tabel.
    const { data } = await supabase.from("stylists").select("id,email,name,active,meet_url").order("name");
    const list = (data as Stylist[]) ?? [];
    setStylists(list);
    // Selecteer: eigen stylist indien aanwezig, anders de eerste
    const mine = list.find((s) => s.email.toLowerCase() === email);
    setSelectedId((prev) => prev || mine?.id || list[0]?.id || "");
    setLoading(false);
  };

  useEffect(() => {
    loadStylists();
  }, []);

  const loadSchedule = async (sid: string) => {
    if (!sid) return;
    const [{ data: rules }, { data: exc }] = await Promise.all([
      supabase.from("availability_rules").select("*").eq("stylist_id", sid),
      supabase
        .from("availability_exceptions")
        .select("*")
        .eq("stylist_id", sid)
        .gte("date", new Date().toISOString().slice(0, 10))
        .order("date"),
    ]);
    const grouped: Record<number, { start: string; end: string }[]> = {};
    for (const w of WEEKDAYS) grouped[w.n] = [];
    for (const r of (rules as Rule[]) ?? [])
      grouped[r.weekday].push({ start: hm(r.start_time), end: hm(r.end_time) });
    for (const n of Object.keys(grouped)) grouped[+n].sort((a, b) => a.start.localeCompare(b.start));
    setByDay(grouped);
    setExceptions((exc as Exception[]) ?? []);
  };

  useEffect(() => {
    if (selectedId) loadSchedule(selectedId);
    const s = stylists.find((x) => x.id === selectedId);
    setMeetUrl(s?.meet_url ?? "");
    // Geheimen (feed-token, agenda-link) alleen via RPC: eigen styliste of admin krijgt ze, anderen niets.
    setSecrets(null);
    setIcalUrl("");
    setIcalSyncedAt(null);
    if (!selectedId) return;
    let stale = false;
    supabase.rpc("stylist_secrets", { p_stylist_id: selectedId }).then(({ data }) => {
      if (stale) return;
      const row = (Array.isArray(data) ? data[0] : data) as Secrets | undefined;
      if (!row) return;
      setSecrets(row);
      setIcalUrl(row.ical_feed_url ?? "");
      setIcalSyncedAt(row.ical_synced_at ?? null);
    });
    return () => {
      stale = true;
    };
  }, [selectedId, stylists]);

  const saveMeetUrl = async () => {
    setSavingMeet(true);
    setErr(null);
    const { error } = await supabase.rpc("set_meet_url", { p_stylist_id: selectedId, p_url: meetUrl.trim() });
    setSavingMeet(false);
    if (error) return setErr(error.message);
    flash("Videolink opgeslagen.");
    setStylists((prev) => prev.map((s) => (s.id === selectedId ? { ...s, meet_url: meetUrl.trim() || null } : s)));
  };

  const saveIcalUrl = async () => {
    setSavingIcal(true);
    setErr(null);
    const { error } = await supabase.rpc("set_ical_feed_url", { p_stylist_id: selectedId, p_url: icalUrl.trim() });
    setSavingIcal(false);
    if (error) return setErr(error.message);
    setSecrets((p) => (p ? { ...p, ical_feed_url: icalUrl.trim() || null } : p));
    if (icalUrl.trim()) {
      flash("Agenda-link opgeslagen. Ik synchroniseer nu je afspraken.");
      syncIcal();
    } else {
      setIcalSyncedAt(null);
      flash("Agenda-link verwijderd.");
    }
  };

  const syncIcal = async () => {
    setSyncing(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("calendar-pull", { body: { stylist_id: selectedId } });
    setSyncing(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) return setErr("Synchroniseren lukte niet. Controleer de agenda-link.");
    const now = new Date().toISOString();
    setIcalSyncedAt(now);
    setSecrets((p) => (p ? { ...p, ical_synced_at: now } : p));
    flash("Agenda gesynchroniseerd.");
  };

  const canEdit = useMemo(() => {
    const s = stylists.find((x) => x.id === selectedId);
    return isAdmin || (s && s.email.toLowerCase() === myEmail);
  }, [stylists, selectedId, isAdmin, myEmail]);

  const addRange = (day: number) =>
    setByDay((p) => ({ ...p, [day]: [...(p[day] ?? []), { start: "09:00", end: "17:00" }] }));
  const setRange = (day: number, i: number, patch: Partial<{ start: string; end: string }>) =>
    setByDay((p) => ({ ...p, [day]: p[day].map((r, idx) => (idx === i ? { ...r, ...patch } : r)) }));
  const removeRange = (day: number, i: number) =>
    setByDay((p) => ({ ...p, [day]: p[day].filter((_, idx) => idx !== i) }));

  const saveRules = async () => {
    setSavingRules(true);
    setErr(null);
    const rows = WEEKDAYS.flatMap((w) =>
      (byDay[w.n] ?? [])
        .filter((r) => r.start && r.end && r.end > r.start)
        .map((r) => ({ stylist_id: selectedId, weekday: w.n, start_time: r.start, end_time: r.end })),
    );
    const del = await supabase.from("availability_rules").delete().eq("stylist_id", selectedId);
    if (del.error) {
      setErr(del.error.message);
      setSavingRules(false);
      return;
    }
    if (rows.length) {
      const ins = await supabase.from("availability_rules").insert(rows);
      if (ins.error) {
        setErr(ins.error.message);
        setSavingRules(false);
        return;
      }
    }
    setSavingRules(false);
    flash("Rooster opgeslagen.");
    loadSchedule(selectedId);
  };

  const addException = async () => {
    if (!excDate) return;
    const row = {
      stylist_id: selectedId,
      date: excDate,
      is_off: excOff,
      start_time: excOff ? null : excStart,
      end_time: excOff ? null : excEnd,
    };
    const { error } = await supabase.from("availability_exceptions").insert(row);
    if (error) return setErr(error.message);
    setExcDate("");
    flash("Uitzondering toegevoegd.");
    loadSchedule(selectedId);
  };
  const removeException = async (id: string) => {
    await supabase.from("availability_exceptions").delete().eq("id", id);
    loadSchedule(selectedId);
  };

  // admin: stylists beheren
  const addStylist = async () => {
    if (!newEmail.trim() || !newName.trim()) return;
    const { error } = await supabase
      .from("stylists")
      .insert({ email: newEmail.trim().toLowerCase(), name: newName.trim() });
    if (error) return setErr(error.message);
    setNewEmail("");
    setNewName("");
    flash("Stylist toegevoegd.");
    loadStylists();
  };
  const toggleActive = async (s: Stylist) => {
    await supabase.from("stylists").update({ active: !s.active }).eq("id", s.id);
    loadStylists();
  };
  const removeStylist = async (s: Stylist) => {
    if (!window.confirm(`${s.name} als stylist verwijderen? Rooster gaat mee weg.`)) return;
    await supabase.from("stylists").delete().eq("id", s.id);
    if (selectedId === s.id) setSelectedId("");
    loadStylists();
  };

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Terug
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Agenda & beschikbaarheid
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Stel je wekelijkse beschikbaarheid in. Klanten boeken straks op dag en tijd; het systeem
        kiest dan een vrije stylist.
      </p>
      {msg && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{msg}</p>}
      {err && <p style={{ color: "#b3261e", fontWeight: 600 }}>{err}</p>}

      {/* Admin: stylisten beheren */}
      {isAdmin && (
        <div className="rd-card-white" style={{ marginTop: 12 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
            Stylisten
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
            {stylists.map((s) => (
              <div
                key={s.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}
              >
                <div>
                  <span style={{ fontWeight: 700 }}>{s.name}</span>{" "}
                  <span style={{ fontSize: 13, opacity: 0.6 }}>{s.email}</span>
                  {!s.active && <span style={{ fontSize: 12, opacity: 0.6 }}> · inactief</span>}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="rd-plan-chip" onClick={() => toggleActive(s)}>
                    {s.active ? "Op inactief" : "Activeren"}
                  </button>
                  <button
                    className="rd-plan-chip"
                    style={{ borderColor: "#b3261e", color: "#b3261e" }}
                    onClick={() => removeStylist(s)}
                  >
                    Verwijderen
                  </button>
                </div>
              </div>
            ))}
            {stylists.length === 0 && <p className="rd-sub" style={{ margin: 0 }}>Nog geen stylisten.</p>}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input className="rd-input" placeholder="E-mail" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} style={{ flex: "1 1 180px", height: 44 }} />
            <input className="rd-input" placeholder="Naam" value={newName} onChange={(e) => setNewName(e.target.value)} style={{ flex: "1 1 140px", height: 44 }} />
            <button className="rd-btn rd-btn-primary" onClick={addStylist} style={{ width: "auto", padding: "0 20px", minHeight: 44 }}>
              Toevoegen
            </button>
          </div>
          <p className="rd-sub" style={{ marginTop: 8 }}>
            Let op: geef een stylist ook dashboard-toegang via <Link to="/beheer/adviseurs" className="rd-textlink">Adviseurs</Link> zodat ze kan inloggen.
          </p>
        </div>
      )}

      {stylists.length > 0 && (
        <>
          {/* Stylist-keuze (admin) */}
          {isAdmin && (
            <div style={{ margin: "16px 0 8px" }}>
              <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
                Rooster van
              </div>
              <select className="rd-input" value={selectedId} onChange={(e) => setSelectedId(e.target.value)} style={{ maxWidth: 320 }}>
                {stylists.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {!canEdit && (
            <p className="rd-sub">Je kunt alleen je eigen rooster wijzigen.</p>
          )}

          {/* Wekelijks rooster */}
          <div className="rd-card-white" style={{ marginTop: 12 }}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
              Wekelijks rooster
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {WEEKDAYS.map((w) => (
                <div key={w.n} style={{ display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap" }}>
                  <div style={{ width: 96, fontWeight: 700, paddingTop: 10 }}>{w.label}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}>
                    {(byDay[w.n] ?? []).length === 0 && (
                      <span style={{ opacity: 0.5, fontSize: 13, paddingTop: 10 }}>Niet beschikbaar</span>
                    )}
                    {(byDay[w.n] ?? []).map((r, i) => (
                      <div key={i} style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <input type="time" className="rd-input" value={r.start} disabled={!canEdit} onChange={(e) => setRange(w.n, i, { start: e.target.value })} style={{ width: 120, height: 40 }} />
                        <span>–</span>
                        <input type="time" className="rd-input" value={r.end} disabled={!canEdit} onChange={(e) => setRange(w.n, i, { end: e.target.value })} style={{ width: 120, height: 40 }} />
                        {canEdit && (
                          <button className="rd-textlink" onClick={() => removeRange(w.n, i)} style={{ minHeight: 40, opacity: 0.6 }}>✕</button>
                        )}
                      </div>
                    ))}
                    {canEdit && (
                      <button className="rd-textlink" onClick={() => addRange(w.n)} style={{ minHeight: 36, alignSelf: "flex-start" }}>
                        + Tijdblok
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            {canEdit && (
              <button className="rd-btn rd-btn-primary" onClick={saveRules} disabled={savingRules} style={{ width: "auto", padding: "0 24px", marginTop: 14, ...(savingRules ? { opacity: 0.5 } : {}) }}>
                {savingRules ? "Opslaan..." : "Rooster opslaan"}
              </button>
            )}
          </div>

          {/* Videogesprek-link */}
          <div className="rd-card-white" style={{ marginTop: 12 }}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
              Videogesprek-link
            </div>
            <p className="rd-sub" style={{ marginTop: 0 }}>
              Je vaste Google Meet-link voor de kleuradviesgesprekken. Deze zetten we in de
              bevestigingsmail naar de klant. Maak eenmalig een Meet aan (meet.new) en plak de link hier.
            </p>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="rd-input"
                type="url"
                placeholder="https://meet.google.com/abc-defg-hij"
                value={meetUrl}
                disabled={!canEdit}
                onChange={(e) => setMeetUrl(e.target.value)}
                style={{ flex: "1 1 260px", height: 44 }}
              />
              {canEdit && (
                <button
                  className="rd-btn rd-btn-primary"
                  onClick={saveMeetUrl}
                  disabled={savingMeet}
                  style={{ width: "auto", padding: "0 20px", minHeight: 44, ...(savingMeet ? { opacity: 0.5 } : {}) }}
                >
                  {savingMeet ? "Opslaan..." : "Opslaan"}
                </button>
              )}
            </div>
          </div>

          {/* Zet Roll in je agenda (abonneer-feed) */}
          {(() => {
            const feedToken = secrets?.feed_token;
            const feedHttps = feedToken ? `${SUPA_URL}/functions/v1/calendar-feed?token=${feedToken}` : "";
            const feedWebcal = feedHttps.replace(/^https:\/\//, "webcal://");
            const copy = async () => {
              try {
                await navigator.clipboard.writeText(feedHttps);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                setErr("Kopiëren lukte niet; selecteer de link handmatig.");
              }
            };
            return (
              <div className="rd-card-white" style={{ marginTop: 12 }}>
                <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
                  Zet Roll in je agenda
                </div>
                <p className="rd-sub" style={{ marginTop: 0 }}>
                  Abonneer je op deze persoonlijke link, dan verschijnen al je Roll-afspraken automatisch
                  in je agenda en updaten ze mee als er iets verandert. Deel de link met niemand.
                </p>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  <input className="rd-input" readOnly value={feedHttps}
                    onFocus={(e) => e.currentTarget.select()}
                    style={{ flex: "1 1 260px", height: 44, fontSize: 13 }} />
                  <button className="rd-btn rd-btn-primary" onClick={copy}
                    style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>
                    {copied ? "Gekopieerd ✓" : "Kopieer link"}
                  </button>
                  <a className="rd-btn rd-btn-outline" href={feedWebcal}
                    style={{ width: "auto", padding: "0 18px", minHeight: 44, textDecoration: "none", display: "inline-flex", alignItems: "center" }}>
                    Abonneren
                  </a>
                </div>
                <details style={{ marginTop: 10 }}>
                  <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>
                    Hoe abonneer ik me?
                  </summary>
                  <ul className="rd-sub" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                    <li><b>Google Agenda:</b> Andere agenda's → Via URL → plak de link.</li>
                    <li><b>Apple Agenda:</b> Archief → Nieuw agenda-abonnement → plak de link.</li>
                    <li><b>Outlook:</b> Agenda toevoegen → Abonneren via internet → plak de link.</li>
                  </ul>
                </details>
              </div>
            );
          })()}

          {/* Eigen agenda blokkeren (iCal) */}
          <div className="rd-card-white" style={{ marginTop: 12 }}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
              Blokkeer met je eigen agenda
            </div>
            <p className="rd-sub" style={{ marginTop: 0 }}>
              Plak de geheime iCal-link van je agenda. Afspraken daarin maken die momenten automatisch
              onbeschikbaar voor klanten. We bewaren alleen bezet-tijden, geen titels, en verversen elke 10 minuten.
            </p>
            <details style={{ marginBottom: 10 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>
                Waar vind ik die link?
              </summary>
              <ul className="rd-sub" style={{ margin: "8px 0 0", paddingLeft: 18, lineHeight: 1.5 }}>
                <li><b>Google Agenda:</b> Instellingen → je agenda → "Geheim adres in iCal-indeling".</li>
                <li><b>Outlook / Microsoft 365:</b> Agenda → Delen → Publiceren → ICS-link.</li>
                <li><b>Apple iCloud:</b> maak de agenda "openbaar" en kopieer de webcal-link.</li>
              </ul>
            </details>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <input
                className="rd-input"
                type="url"
                placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                value={icalUrl}
                disabled={!canEdit}
                onChange={(e) => setIcalUrl(e.target.value)}
                style={{ flex: "1 1 260px", height: 44 }}
              />
              {canEdit && (
                <button
                  className="rd-btn rd-btn-primary"
                  onClick={saveIcalUrl}
                  disabled={savingIcal || syncing}
                  style={{ width: "auto", padding: "0 20px", minHeight: 44, ...(savingIcal || syncing ? { opacity: 0.5 } : {}) }}
                >
                  {savingIcal ? "Opslaan..." : "Opslaan"}
                </button>
              )}
            </div>
            {canEdit && icalUrl.trim() && (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                <button className="rd-btn rd-btn-outline" onClick={syncIcal} disabled={syncing}
                  style={{ width: "auto", padding: "0 16px", minHeight: 40, ...(syncing ? { opacity: 0.5 } : {}) }}>
                  {syncing ? "Synchroniseren..." : "Synchroniseer nu"}
                </button>
                {icalSyncedAt && (
                  <span style={{ fontSize: 12, opacity: 0.6 }}>
                    Laatst gesynchroniseerd {new Date(icalSyncedAt).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "short" })}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Uitzonderingen */}
          <div className="rd-card-white" style={{ marginTop: 12 }}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
              Uitzonderingen (vrije dagen / afwijkende tijden)
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
              {exceptions.map((x) => (
                <div key={x.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 14 }}>
                    <strong>{x.date}</strong>{" "}
                    {x.is_off ? "· vrij" : `· ${hm(x.start_time ?? "")}–${hm(x.end_time ?? "")}`}
                  </span>
                  {canEdit && (
                    <button className="rd-textlink" onClick={() => removeException(x.id)} style={{ minHeight: 32, opacity: 0.6 }}>Verwijder</button>
                  )}
                </div>
              ))}
              {exceptions.length === 0 && <p className="rd-sub" style={{ margin: 0 }}>Nog geen uitzonderingen.</p>}
            </div>
            {canEdit && (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                <input type="date" className="rd-input" value={excDate} onChange={(e) => setExcDate(e.target.value)} style={{ width: 170, height: 44 }} />
                <select className="rd-input" value={excOff ? "off" : "custom"} onChange={(e) => setExcOff(e.target.value === "off")} style={{ width: 150, height: 44 }}>
                  <option value="off">Hele dag vrij</option>
                  <option value="custom">Andere tijden</option>
                </select>
                {!excOff && (
                  <>
                    <input type="time" className="rd-input" value={excStart} onChange={(e) => setExcStart(e.target.value)} style={{ width: 110, height: 44 }} />
                    <span>–</span>
                    <input type="time" className="rd-input" value={excEnd} onChange={(e) => setExcEnd(e.target.value)} style={{ width: 110, height: 44 }} />
                  </>
                )}
                <button className="rd-btn rd-btn-outline" onClick={addException} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>
                  Toevoegen
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
