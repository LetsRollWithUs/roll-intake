import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";

const SERVICES = [
  { key: "pre_sample", label: "Ik heb nog geen samples getest", sub: "We bepalen samen de richting en welke kleuren je test." },
  { key: "post_sample", label: "Ik heb al samples getest", sub: "We helpen je de definitieve kleur kiezen." },
];

interface Slot {
  start_at: string;
  free: number;
}

const TZ = "Europe/Amsterdam";
const dateKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dateLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

const isoDate = (d: Date) => d.toISOString().slice(0, 10);

export function BookFlow() {
  const [service, setService] = useState<string>("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => lockDocument(), []);

  const loadSlots = async (svc: string) => {
    setLoading(true);
    setErr(null);
    const from = new Date();
    const to = new Date(Date.now() + 56 * 864e5); // 8 weken
    const { data, error } = await supabase.rpc("available_slots", {
      p_service_key: svc,
      p_from: isoDate(from),
      p_to: isoDate(to),
    });
    if (error) setErr("Kon beschikbaarheid niet laden.");
    setSlots((data as Slot[]) ?? []);
    setLoading(false);
  };

  const chooseService = (svc: string) => {
    setService(svc);
    setDay("");
    setSlot("");
    loadSlots(svc);
  };

  const days = useMemo(() => {
    const map = new Map<string, string>(); // key -> first iso of that day
    for (const s of slots) {
      const k = dateKey(s.start_at);
      if (!map.has(k)) map.set(k, s.start_at);
    }
    return Array.from(map.entries()).map(([k, iso]) => ({ key: k, iso }));
  }, [slots]);

  const daySlots = useMemo(() => slots.filter((s) => dateKey(s.start_at) === day), [slots, day]);

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("booking", {
      body: { action: "checkout", service_key: service, start: slot, name, email },
    });
    setBusy(false);
    if (error || !data?.pay_url) {
      setErr("Dit tijdstip is net vergeven of er ging iets mis. Kies een ander moment.");
      setSlot("");
      loadSlots(service);
      return;
    }
    // Door naar de WooCommerce-betaalpagina. Het slot is 10 minuten gereserveerd.
    window.location.href = data.pay_url as string;
  };

  const emailOk = /.+@.+\..+/.test(email.trim());

  return (
    <div
      className="rd-root"
      style={{ background: "var(--rd-offwhite)", color: "var(--rd-aubergine)", overflowY: "auto" }}
    >
      <div className="rd-col" style={{ padding: "28px 22px 60px" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>
          Roll · Kleuradvies
        </div>

        {(
          <>
            <h1 className="rd-h2" style={{ marginBottom: 6 }}>
              Boek je persoonlijk kleuradvies
            </h1>
            <p className="rd-sub" style={{ marginTop: 0, marginBottom: 18 }}>
              30 minuten, online. Kies een moment; wij koppelen er een beschikbare kleuradviseur aan.
            </p>

            {/* 1. Service */}
            <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 8 }}>
              Waar sta je nu?
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {SERVICES.map((s) => (
                <button
                  key={s.key}
                  className="rd-card-white"
                  onClick={() => chooseService(s.key)}
                  style={{
                    textAlign: "left",
                    cursor: "pointer",
                    border: service === s.key ? "2px solid var(--rd-pink)" : "2px solid transparent",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: 16 }}>{s.label}</div>
                  <div className="rd-sub" style={{ marginTop: 4 }}>
                    {s.sub}
                  </div>
                </button>
              ))}
            </div>

            {/* 2. Dag + tijd */}
            {service && (
              <div style={{ marginTop: 24 }}>
                <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 8 }}>
                  Kies een dag
                </div>
                {loading ? (
                  <p className="rd-sub">Beschikbaarheid laden...</p>
                ) : days.length === 0 ? (
                  <p className="rd-sub">Er is nu geen beschikbaarheid. Probeer het later opnieuw.</p>
                ) : (
                  <div
                    className="rd-hide-scroll"
                    style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 6 }}
                  >
                    {days.map((d) => (
                      <button
                        key={d.key}
                        className={`rd-plan-chip${day === d.key ? " is-on" : ""}`}
                        onClick={() => {
                          setDay(d.key);
                          setSlot("");
                        }}
                        style={{ flex: "none", whiteSpace: "nowrap" }}
                      >
                        {dateLabel(d.iso)}
                      </button>
                    ))}
                  </div>
                )}

                {day && (
                  <div style={{ marginTop: 18 }}>
                    <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 8 }}>
                      Kies een tijd
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0,1fr))", gap: 8 }}>
                      {daySlots.map((s) => (
                        <button
                          key={s.start_at}
                          className={`rd-seg${slot === s.start_at ? " is-on" : ""}`}
                          onClick={() => setSlot(s.start_at)}
                        >
                          {timeLabel(s.start_at)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 3. Gegevens + bevestigen */}
            {slot && (
              <div className="rd-card-white" style={{ marginTop: 22 }}>
                <div style={{ fontWeight: 700, marginBottom: 10 }}>
                  {dateLabel(slot)} · {timeLabel(slot)}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <input className="rd-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Je naam" autoComplete="name" />
                  <input className="rd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Je e-mailadres" autoComplete="email" />
                </div>
                <button
                  className="rd-btn rd-btn-primary rd-btn-lg"
                  onClick={confirm}
                  disabled={busy || !name.trim() || !emailOk}
                  style={{ marginTop: 14, ...(busy || !name.trim() || !emailOk ? { opacity: 0.4 } : {}) }}
                >
                  {busy ? "Bezig..." : "Naar betalen (€30)"}
                </button>
                <p className="rd-sub" style={{ marginTop: 8, textAlign: "center" }}>
                  Je tijdstip wordt 10 minuten voor je gereserveerd terwijl je betaalt.
                </p>
              </div>
            )}

            {err && (
              <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, marginTop: 14 }}>{err}</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
