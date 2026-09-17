import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import {
  Calendar, TimePicker, type Slot,
  dateKey, isoDate,
} from "@/booking/slots";

interface BookingRow {
  id: string;
  start_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  intake_id: string | null;
  stylist_id: string | null;
  stylists: { name: string; email: string } | null;
  services: { key: string } | null;
}
interface StylistOpt {
  id: string;
  name: string;
}

const TZ = "Europe/Amsterdam";
const fmt = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));

const serviceLabel = (key?: string) =>
  key === "post_sample" ? "Al samples getest" : key === "pre_sample" ? "Nog geen samples" : "";

export function BoekingenPage() {
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [stylists, setStylists] = useState<StylistOpt[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [myEmail, setMyEmail] = useState("");
  const [scope, setScope] = useState<"komend" | "alles">("komend");

  // acties per boeking
  const [actId, setActId] = useState<string | null>(null);
  const [actMode, setActMode] = useState<"verzet" | "over" | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const flash = (m: string) => { setMsg(m); setErr(null); setTimeout(() => setMsg(null), 2500); };

  const loadRows = async () => {
    const { data } = await supabase
      .from("bookings")
      .select(
        "id,start_at,status,customer_name,customer_email,customer_phone,intake_id,stylist_id, stylists(name,email), services(key)",
      )
      .in("status", ["confirmed"])
      .order("start_at", { ascending: true });
    setRows((data as unknown as BookingRow[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      const { data: u } = await supabase.auth.getUser();
      setIsAdmin(adm === true);
      setMyEmail((u?.user?.email ?? "").toLowerCase());
      const { data: st } = await supabase.from("stylists").select("id,name").eq("active", true).order("name");
      setStylists((st as StylistOpt[]) ?? []);
      await loadRows();
      setLoading(false);
    })();
  }, []);

  const visible = useMemo(() => {
    const now = Date.now();
    return rows.filter((r) => {
      if (!isAdmin && r.stylists?.email?.toLowerCase() !== myEmail) return false;
      if (scope === "komend" && new Date(r.start_at).getTime() < now) return false;
      return true;
    });
  }, [rows, isAdmin, myEmail, scope]);

  const closeAct = () => {
    setActId(null); setActMode(null); setSlots([]); setDay(""); setSlot(""); setTarget(""); setErr(null);
  };

  const openVerzet = async (r: BookingRow) => {
    closeAct();
    setActId(r.id); setActMode("verzet");
    setSlotsLoading(true);
    const { data } = await supabase.rpc("available_slots", {
      p_service_key: r.services?.key,
      p_from: isoDate(new Date()),
      p_to: isoDate(new Date(Date.now() + 56 * 864e5)),
    });
    setSlots((data as Slot[]) ?? []);
    setSlotsLoading(false);
  };

  const openOver = (r: BookingRow) => {
    closeAct();
    setActId(r.id); setActMode("over");
    setTarget("");
  };

  // Vuurt de "Afspraak gewijzigd"-mail; best-effort, mag de actie niet blokkeren.
  const notifyChanged = async (bookingId: string) => {
    try {
      await supabase.functions.invoke("booking", { body: { action: "booking_changed", booking_id: bookingId } });
    } catch {
      /* stil */
    }
  };

  const doReschedule = async () => {
    if (!actId || !slot) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("reschedule_booking", { p_booking_id: actId, p_new_start: slot });
    if (error) { setBusy(false); return setErr(error.message); }
    await notifyChanged(actId);
    setBusy(false);
    closeAct();
    flash("Afspraak verzet. De klant krijgt een mail met de nieuwe tijd.");
    loadRows();
  };

  const doReassign = async () => {
    if (!actId || !target) return;
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("reassign_booking", { p_booking_id: actId, p_new_stylist_id: target });
    if (error) { setBusy(false); return setErr(error.message); }
    await notifyChanged(actId);
    setBusy(false);
    closeAct();
    flash("Afspraak overgedragen. De klant krijgt een mail met de nieuwe videolink.");
    loadRows();
  };

  const availDays = useMemo(() => new Set(slots.map((s) => dateKey(s.start_at))), [slots]);
  const todayKey = dateKey(new Date().toISOString());
  const maxKey = dateKey(new Date(Date.now() + 56 * 864e5).toISOString());

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Boekingen
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        {isAdmin ? "Alle geboekte afspraken." : "Jouw geboekte afspraken."}
      </p>
      {msg && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{msg}</p>}

      <div style={{ display: "flex", gap: 8, margin: "12px 0 16px" }}>
        <button className={`rd-plan-chip${scope === "komend" ? " is-on" : ""}`} onClick={() => setScope("komend")}>
          Komend
        </button>
        <button className={`rd-plan-chip${scope === "alles" ? " is-on" : ""}`} onClick={() => setScope("alles")}>
          Alles
        </button>
      </div>

      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : visible.length === 0 ? (
        <p className="rd-sub">Geen boekingen.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {visible.map((r) => (
            <div key={r.id} className="rd-card-white">
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 15 }}>{fmt(r.start_at)}</div>
                  <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                    {r.customer_name || "Klant"} · {r.customer_email}
                  </div>
                  {r.customer_phone && (
                    <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>
                      <a href={`tel:${r.customer_phone}`} style={{ color: "inherit" }}>{r.customer_phone}</a>
                    </div>
                  )}
                  <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                    {serviceLabel(r.services?.key)}
                    {isAdmin && r.stylists?.name ? ` · ${r.stylists.name}` : ""}
                  </div>
                </div>
                {r.intake_id ? (
                  <Link to={`/beheer/${r.intake_id}`} className="rd-plan-chip" style={{ textDecoration: "none" }}>
                    Bekijk intake
                  </Link>
                ) : (
                  <span className="rd-chip" style={{ opacity: 0.7 }}>
                    Intake nog niet ingevuld
                  </span>
                )}
              </div>

              {/* Acties */}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button className="rd-plan-chip" onClick={() => (actId === r.id && actMode === "verzet" ? closeAct() : openVerzet(r))}>
                  Verzetten
                </button>
                <button className="rd-plan-chip" onClick={() => (actId === r.id && actMode === "over" ? closeAct() : openOver(r))}>
                  Overdragen
                </button>
              </div>

              {/* Verzet-paneel */}
              {actId === r.id && actMode === "verzet" && (
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(47,33,65,.08)", paddingTop: 12 }}>
                  {slotsLoading ? (
                    <p className="rd-sub" style={{ margin: 0 }}>Beschikbaarheid laden...</p>
                  ) : availDays.size === 0 ? (
                    <p className="rd-sub" style={{ margin: 0 }}>Geen beschikbaarheid gevonden.</p>
                  ) : (
                    <>
                      <Calendar availDays={availDays} todayKey={todayKey} maxKey={maxKey} value={day}
                        onSelect={(k) => { setDay(k); setSlot(""); }} />
                      <TimePicker slots={slots} day={day} value={slot} onSelect={setSlot} />
                    </>
                  )}
                  {err && <p style={{ color: "#b3261e", fontWeight: 600, fontSize: 14, marginTop: 10 }}>{err}</p>}
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    <button className="rd-btn rd-btn-outline" onClick={closeAct} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>Annuleer</button>
                    <button className="rd-btn rd-btn-primary" onClick={doReschedule} disabled={!slot || busy}
                      style={{ width: "auto", padding: "0 20px", minHeight: 44, ...(!slot || busy ? { opacity: 0.5 } : {}) }}>
                      {busy ? "Bezig..." : "Verzetten"}
                    </button>
                  </div>
                </div>
              )}

              {/* Overdragen-paneel */}
              {actId === r.id && actMode === "over" && (
                <div style={{ marginTop: 12, borderTop: "1px solid rgba(47,33,65,.08)", paddingTop: 12 }}>
                  <p className="rd-sub" style={{ marginTop: 0 }}>
                    Draag deze afspraak over aan een andere styliste. De videolink wisselt automatisch mee.
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                    <select className="rd-input" value={target} onChange={(e) => setTarget(e.target.value)} style={{ maxWidth: 260, height: 44 }}>
                      <option value="">Kies styliste...</option>
                      {stylists.filter((s) => s.id !== r.stylist_id).map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    <button className="rd-btn rd-btn-primary" onClick={doReassign} disabled={!target || busy}
                      style={{ width: "auto", padding: "0 20px", minHeight: 44, ...(!target || busy ? { opacity: 0.5 } : {}) }}>
                      {busy ? "Bezig..." : "Overdragen"}
                    </button>
                  </div>
                  {err && <p style={{ color: "#b3261e", fontWeight: 600, fontSize: 14, marginTop: 10 }}>{err}</p>}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
