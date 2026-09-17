import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";

function normalizeType(t: string | null): string {
  if (!t) return "";
  if (t === "pre" || t === "pre_sample") return "pre_sample";
  if (t === "post" || t === "post_sample") return "post_sample";
  return "";
}

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

const pad = (n: number) => String(n).padStart(2, "0");
const cellKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTHS = [
  "januari", "februari", "maart", "april", "mei", "juni",
  "juli", "augustus", "september", "oktober", "november", "december",
];

function Calendar({
  availDays,
  todayKey,
  maxKey,
  value,
  onSelect,
}: {
  availDays: Set<string>;
  todayKey: string;
  maxKey: string;
  value: string;
  onSelect: (key: string) => void;
}) {
  const startY = Number(todayKey.slice(0, 4));
  const startM = Number(todayKey.slice(5, 7)) - 1;
  const [cur, setCur] = useState({ y: startY, m: startM });

  const maxY = Number(maxKey.slice(0, 4));
  const maxM = Number(maxKey.slice(5, 7)) - 1;
  const canPrev = cur.y > startY || (cur.y === startY && cur.m > startM);
  const canNext = cur.y < maxY || (cur.y === maxY && cur.m < maxM);
  const shift = (d: number) => {
    const nm = cur.m + d;
    setCur({ y: cur.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
  };

  const first = new Date(cur.y, cur.m, 1);
  const offset = (first.getDay() + 6) % 7; // maandag = 0
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(offset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const btn = (dir: number, ok: boolean) => (
    <button
      onClick={() => ok && shift(dir)}
      disabled={!ok}
      aria-label={dir < 0 ? "Vorige maand" : "Volgende maand"}
      style={{
        border: 0, background: "none", cursor: ok ? "pointer" : "default",
        opacity: ok ? 1 : 0.25, fontSize: 22, padding: "0 8px", color: "var(--rd-aubergine)",
      }}
    >
      {dir < 0 ? "‹" : "›"}
    </button>
  );

  return (
    <div className="rd-card-white">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
        {btn(-1, canPrev)}
        <div style={{ fontWeight: 800, fontSize: 16 }}>
          {MONTHS[cur.m]} {cur.y}
        </div>
        {btn(1, canNext)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, textAlign: "center" }}>
        {["M", "D", "W", "D", "V", "Z", "Z"].map((d, i) => (
          <div key={i} className="rd-kicker" style={{ opacity: 0.5, padding: "4px 0" }}>
            {d}
          </div>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = cellKey(cur.y, cur.m, d);
          const enabled = availDays.has(key) && key >= todayKey && key <= maxKey;
          const selected = key === value;
          return (
            <button
              key={i}
              onClick={() => enabled && onSelect(key)}
              disabled={!enabled}
              style={{
                aspectRatio: "1 / 1", border: 0, borderRadius: 99, fontSize: 14, fontWeight: 700,
                cursor: enabled ? "pointer" : "default",
                background: selected ? "var(--rd-aubergine)" : enabled ? "var(--rd-lavender)" : "transparent",
                color: selected ? "#fff" : enabled ? "var(--rd-aubergine)" : "rgba(47,33,65,.3)",
              }}
            >
              {d}
            </button>
          );
        })}
      </div>
    </div>
  );
}

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

  const [params] = useSearchParams();
  const coupon = params.get("coupon") ?? "";

  useEffect(() => lockDocument(), []);

  // Instroom: dienst vooraf gekozen via ?type=pre|post
  useEffect(() => {
    const t = normalizeType(params.get("type"));
    if (t) chooseService(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const availDays = useMemo(() => new Set(slots.map((s) => dateKey(s.start_at))), [slots]);
  const todayKey = dateKey(new Date().toISOString());
  const maxKey = dateKey(new Date(Date.now() + 56 * 864e5).toISOString());

  const daySlots = useMemo(() => slots.filter((s) => dateKey(s.start_at) === day), [slots, day]);

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("booking", {
      body: { action: "checkout", service_key: service, start: slot, name, email, coupon: coupon || undefined },
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
                ) : availDays.size === 0 ? (
                  <p className="rd-sub">Er is nu geen beschikbaarheid. Probeer het later opnieuw.</p>
                ) : (
                  <Calendar
                    availDays={availDays}
                    todayKey={todayKey}
                    maxKey={maxKey}
                    value={day}
                    onSelect={(k) => {
                      setDay(k);
                      setSlot("");
                    }}
                  />
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
