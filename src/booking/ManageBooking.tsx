import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";
import {
  Calendar, TimePicker, type Slot,
  AUB, AUB_DIM, PINK, CREME, GREEN,
  dateKey, dayFull, timeLabel, isoDate,
} from "./slots";

interface BookingInfo {
  service_key: string;
  duration_min: number;
  start_at: string;
  status: string;
  reschedule_count: number;
  customer_name: string;
  can_self_reschedule: boolean;
}

export function ManageBooking() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";

  const [info, setInfo] = useState<BookingInfo | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);

  const [picking, setPicking] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => lockDocument(), []);

  const load = async () => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    const { data, error } = await supabase.rpc("booking_by_token", { p_token: token });
    if (error || !data) setNotFound(true);
    else setInfo(data as BookingInfo);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const startPicking = async () => {
    if (!info) return;
    setPicking(true);
    setSlotsLoading(true);
    const { data } = await supabase.rpc("available_slots", {
      p_service_key: info.service_key,
      p_from: isoDate(new Date()),
      p_to: isoDate(new Date(Date.now() + 56 * 864e5)),
    });
    setSlots((data as Slot[]) ?? []);
    setSlotsLoading(false);
  };

  const availDays = useMemo(() => new Set(slots.map((s) => dateKey(s.start_at))), [slots]);
  const todayKey = dateKey(new Date().toISOString());
  const maxKey = dateKey(new Date(Date.now() + 56 * 864e5).toISOString());

  const confirmReschedule = async () => {
    if (!slot) return;
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.rpc("reschedule_by_token", { p_token: token, p_new_start: slot });
    setBusy(false);
    if (error) {
      setErr(error.message || "Verzetten lukte niet. Probeer een ander moment.");
      startPicking();
      return;
    }
    const changedId = (data as { booking_id?: string } | null)?.booking_id;
    if (changedId) {
      try {
        await supabase.functions.invoke("booking", { body: { action: "booking_changed", booking_id: changedId } });
      } catch {
        /* stil: mail-melding is niet kritiek voor de klant */
      }
    }
    setDone(true);
    setPicking(false);
    load();
  };

  const shell = (children: React.ReactNode) => (
    <div className="rd-root rd-lock" style={{ background: CREME, color: AUB, fontFamily: "Figtree, system-ui, sans-serif" }}>
      <div className="rd-col" style={{ maxWidth: 440 }}>
        <div className="rd-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "28px 22px 24px" }}>
          <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>
            Roll · Kleuradvies
          </div>
          {children}
        </div>
      </div>
    </div>
  );

  if (loading) return shell(<p style={{ fontSize: 14, color: "rgba(47,33,65,.6)", marginTop: 16 }}>Laden...</p>);

  if (notFound || !info)
    return shell(
      <>
        <h1 style={{ font: "800 26px/1.1 Figtree", letterSpacing: "-.02em", margin: "8px 0 6px" }}>Afspraak niet gevonden</h1>
        <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)" }}>
          Deze link werkt niet meer. Gebruik de link uit je bevestigingsmail, of neem contact op via{" "}
          <a href="mailto:hallo@roll.nl" style={{ color: PINK }}>hallo@roll.nl</a>.
        </p>
      </>,
    );

  return shell(
    <>
      <h1 style={{ font: "800 26px/1.1 Figtree", letterSpacing: "-.02em", margin: "8px 0 6px" }}>
        {done ? "Je afspraak is verzet" : "Je afspraak"}
      </h1>

      {/* Huidige afspraak */}
      <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginTop: 8, marginBottom: 16 }}>
        <div style={{ font: "700 16px Figtree" }}>{dayFull(info.start_at)}</div>
        <div style={{ fontSize: 14, color: "rgba(47,33,65,.65)", marginTop: 2 }}>{timeLabel(info.start_at)} · online via videocall · 30 min</div>
        {done && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, color: GREEN, fontWeight: 600, fontSize: 13 }}>
            <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN }} /> Bevestigd op het nieuwe moment
          </div>
        )}
      </div>

      {!done && !picking && (
        <>
          {info.can_self_reschedule ? (
            <>
              <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)", marginTop: 0 }}>
                Komt het toch niet uit? Je kunt zelf een nieuw moment kiezen.
              </p>
              <button onClick={startPicking}
                style={{ width: "100%", height: 52, border: 0, borderRadius: 99, background: AUB, color: "#fff", font: "700 16px Figtree", cursor: "pointer" }}>
                Afspraak verzetten
              </button>
            </>
          ) : (
            <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)" }}>
              Wil je deze afspraak verzetten? Dat kan tot 24 uur van tevoren, en maximaal twee keer. Lukt dat niet meer via deze pagina?
              Stuur even een berichtje naar <a href="mailto:hallo@roll.nl" style={{ color: PINK }}>hallo@roll.nl</a> en we helpen je verder.
            </p>
          )}
        </>
      )}

      {picking && (
        <>
          <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)", marginTop: 0 }}>Kies een nieuw moment.</p>
          {slotsLoading ? (
            <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Beschikbaarheid laden...</p>
          ) : availDays.size === 0 ? (
            <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Er is nu geen beschikbaarheid. Probeer het later opnieuw.</p>
          ) : (
            <>
              <Calendar availDays={availDays} todayKey={todayKey} maxKey={maxKey} value={day}
                onSelect={(k) => { setDay(k); setSlot(""); }} />
              <TimePicker slots={slots} day={day} value={slot} onSelect={setSlot} />
            </>
          )}
          {err && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 14 }}>{err}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => { setPicking(false); setDay(""); setSlot(""); setErr(null); }}
              style={{ flex: "0 0 auto", padding: "0 20px", height: 52, borderRadius: 99, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", color: AUB, font: "700 15px Figtree", cursor: "pointer" }}>
              Annuleer
            </button>
            <button onClick={confirmReschedule} disabled={!slot || busy}
              style={{ flex: 1, height: 52, border: 0, borderRadius: 99, background: slot && !busy ? AUB : AUB_DIM, color: "#fff", font: "700 16px Figtree", cursor: slot && !busy ? "pointer" : "default" }}>
              {busy ? "Bezig..." : "Verzetten naar dit moment"}
            </button>
          </div>
        </>
      )}

      {done && (
        <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)", marginTop: 4 }}>
          Je ontvangt een bevestiging per mail met de nieuwe tijd en de videolink.
        </p>
      )}
    </>,
  );
}
