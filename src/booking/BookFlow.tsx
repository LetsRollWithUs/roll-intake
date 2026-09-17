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
  { key: "pre_sample", title: "Nog geen samples getest", sub: "We bepalen samen de richting.", icon: "💬", chip: "#EDE7F2" },
  { key: "post_sample", title: "Al samples getest", sub: "We kiezen de definitieve kleur.", icon: "🖌️", chip: "#E7EFE3" },
];

interface Slot {
  start_at: string;
  free: number;
}

// Design-tokens (handoff v1)
const AUB = "#2F2141";
const AUB_DIM = "#B9B2C0";
const GREEN = "#5A8C4F";
const GREEN_BG = "rgba(90,140,79,.14)";
const PINK = "#B24A78";
const CREME = "#FBF7EE";

const TZ = "Europe/Amsterdam";
const dateKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const dayFull = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const hourOf = (iso: string) =>
  Number(new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));

const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
const cellKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function Calendar({
  availDays, todayKey, maxKey, value, onSelect,
}: {
  availDays: Set<string>; todayKey: string; maxKey: string; value: string; onSelect: (k: string) => void;
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
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const nav = (dir: number, ok: boolean) => (
    <button onClick={() => ok && shift(dir)} disabled={!ok} aria-label={dir < 0 ? "Vorige maand" : "Volgende maand"}
      style={{ width: 32, height: 32, borderRadius: 99, border: "1px solid rgba(47,33,65,.12)", background: "#fff", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.35, color: AUB, fontSize: 16 }}>
      {dir < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <div style={{ background: "#fff", borderRadius: 18, padding: "16px 16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        {nav(-1, canPrev)}
        <span style={{ fontWeight: 800, fontSize: 15 }}>{MONTHS[cur.m]} {cur.y}</span>
        {nav(1, canNext)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center", fontWeight: 600, fontSize: 10, color: "rgba(47,33,65,.4)", marginBottom: 6 }}>
        {["M", "D", "W", "D", "V", "Z", "Z"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = cellKey(cur.y, cur.m, d);
          const enabled = availDays.has(key) && key >= todayKey && key <= maxKey;
          const selected = key === value;
          return (
            <button key={i} onClick={() => enabled && onSelect(key)} disabled={!enabled}
              aria-label={`${d} ${MONTHS[cur.m]}${enabled ? ", beschikbaar" : ", niet beschikbaar"}`}
              style={{
                aspectRatio: "1 / 1", border: 0, borderRadius: 99, fontSize: 13, position: "relative",
                fontWeight: enabled ? 700 : 400, cursor: enabled ? "pointer" : "default",
                background: selected ? AUB : enabled ? GREEN_BG : "transparent",
                color: selected ? "#fff" : enabled ? AUB : "rgba(47,33,65,.3)",
              }}>
              {d}
              {enabled && !selected && (
                <span style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 99, background: GREEN }} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontWeight: 500, fontSize: 11, color: "rgba(47,33,65,.55)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN }} />beschikbaar</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: AUB }} />gekozen</span>
      </div>
    </div>
  );
}

export function BookFlow() {
  const [params] = useSearchParams();
  const coupon = params.get("coupon") ?? "";
  const preType = normalizeType(params.get("type"));

  const [step, setStep] = useState<number>(preType ? 2 : 1);
  const [service, setService] = useState<string>(preType);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState<string>("");
  const [slot, setSlot] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => lockDocument(), []);

  const loadSlots = async (svc: string) => {
    setLoading(true);
    setErr(null);
    const { data, error } = await supabase.rpc("available_slots", {
      p_service_key: svc,
      p_from: isoDate(new Date()),
      p_to: isoDate(new Date(Date.now() + 56 * 864e5)),
    });
    if (error) setErr("Kon beschikbaarheid niet laden.");
    setSlots((data as Slot[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (preType) loadSlots(preType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickService = (svc: string) => {
    setService(svc);
    setDay("");
    setSlot("");
    loadSlots(svc);
  };

  const availDays = useMemo(() => new Set(slots.map((s) => dateKey(s.start_at))), [slots]);
  const todayKey = dateKey(new Date().toISOString());
  const maxKey = dateKey(new Date(Date.now() + 56 * 864e5).toISOString());

  // Tijden van de gekozen dag, gegroepeerd per dagdeel
  const dayParts = useMemo(() => {
    const list = slots.filter((s) => dateKey(s.start_at) === day);
    const groups: { label: string; slots: Slot[] }[] = [
      { label: "Ochtend", slots: [] },
      { label: "Middag", slots: [] },
      { label: "Avond", slots: [] },
    ];
    for (const s of list) {
      const h = hourOf(s.start_at);
      groups[h < 12 ? 0 : h < 17 ? 1 : 2].slots.push(s);
    }
    return groups.filter((g) => g.slots.length > 0);
  }, [slots, day]);

  const emailOk = /.+@.+\..+/.test(email.trim());

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
      setStep(2);
      loadSlots(service);
      return;
    }
    window.location.href = data.pay_url as string;
  };

  // Voortgang + CTA per stap
  const prog = ["33%", "66%", "100%"][step - 1];
  const canBack = step > 1;
  const back = () => setStep((s) => Math.max(1, s - 1));

  let ctaLabel = "Verder";
  let ctaOk = false;
  let onCta = () => {};
  let summary = "";
  if (step === 1) {
    ctaOk = !!service;
    ctaLabel = "Verder";
    onCta = () => ctaOk && setStep(2);
  } else if (step === 2) {
    ctaOk = !!day && !!slot;
    ctaLabel = "Verder";
    summary = ctaOk ? `${dayFull(slot)} · ${timeLabel(slot)}` : "";
    onCta = () => ctaOk && setStep(3);
  } else {
    ctaOk = name.trim() !== "" && emailOk && !busy;
    ctaLabel = busy ? "Bezig..." : "Naar betalen (€30)";
    summary = `${dayFull(slot)} · ${timeLabel(slot)}`;
    onCta = confirm;
  }

  return (
    <div
      className="rd-root rd-lock"
      style={{ background: CREME, color: AUB, fontFamily: "Figtree, system-ui, sans-serif" }}
    >
      <div className="rd-col" style={{ maxWidth: 440 }}>
        {/* Kop: terug + voortgang */}
        <div style={{ flex: "none", padding: "16px 22px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          {canBack ? (
            <button onClick={back} aria-label="Terug"
              style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid rgba(47,33,65,.15)", background: "#fff", cursor: "pointer", fontSize: 15, flex: "none" }}>
              ←
            </button>
          ) : (
            <span style={{ width: 36, flex: "none" }} aria-hidden />
          )}
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(47,33,65,.1)", overflow: "hidden" }}>
            <div style={{ width: prog, height: "100%", background: PINK, borderRadius: 99, transition: "width .4s cubic-bezier(.2,.7,.2,1)" }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 12, color: "rgba(47,33,65,.55)", flex: "none" }}>{step}/3</span>
        </div>

        {/* Body */}
        <div key={step} className="rd-screen-in rd-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 22px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>
            Kleuradvies · 30 min
          </div>

          {step === 1 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Waar sta je nu?</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 18px" }}>Zo bereidt je adviseur het gesprek voor.</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {SERVICES.map((o) => (
                  <button key={o.key} onClick={() => pickService(o.key)}
                    style={{
                      textAlign: "left", padding: 18, borderRadius: 18, cursor: "pointer",
                      border: `2px solid ${service === o.key ? AUB : "rgba(47,33,65,.12)"}`,
                      background: "#fff", display: "flex", gap: 14, alignItems: "center",
                    }}>
                    <span style={{ width: 44, height: 44, borderRadius: 12, background: o.chip, flex: "none", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>{o.icon}</span>
                    <span style={{ flex: 1 }}>
                      <span style={{ display: "block", font: "700 16px Figtree" }}>{o.title}</span>
                      <span style={{ display: "block", fontSize: 13, color: "rgba(47,33,65,.6)", marginTop: 2 }}>{o.sub}</span>
                    </span>
                    <span style={{ color: "rgba(47,33,65,.35)", fontSize: 18 }}>→</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Kies een moment</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 16px" }}>Alleen beschikbare dagen zijn aantikbaar.</p>
              {loading ? (
                <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Beschikbaarheid laden...</p>
              ) : availDays.size === 0 ? (
                <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Er is nu geen beschikbaarheid. Probeer het later opnieuw.</p>
              ) : (
                <>
                  <Calendar availDays={availDays} todayKey={todayKey} maxKey={maxKey} value={day}
                    onSelect={(k) => { setDay(k); setSlot(""); }} />
                  {day && (
                    <div style={{ marginTop: 20 }}>
                      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(47,33,65,.5)", marginBottom: 10 }}>
                        Tijd · {dayFull(slots.find((s) => dateKey(s.start_at) === day)!.start_at)}
                      </div>
                      {dayParts.map((p) => (
                        <div key={p.label} style={{ marginBottom: 12 }}>
                          <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(47,33,65,.6)", marginBottom: 6 }}>{p.label}</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
                            {p.slots.map((s) => {
                              const on = slot === s.start_at;
                              return (
                                <button key={s.start_at} onClick={() => setSlot(s.start_at)}
                                  style={{
                                    padding: "11px 0", borderRadius: 12, minHeight: 44, cursor: "pointer",
                                    border: `1.5px solid ${on ? AUB : "rgba(47,33,65,.15)"}`,
                                    background: on ? AUB : "#fff", color: on ? "#fff" : AUB, font: "600 13px Figtree",
                                  }}>
                                  {timeLabel(s.start_at)}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Nog je gegevens</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 16px" }}>Hierna reken je veilig af.</p>
              <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", display: "flex", gap: 14, alignItems: "center", marginBottom: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 99, background: "#DAD4E3", flex: "none", display: "flex", alignItems: "center", justifyContent: "center", font: "700 16px Figtree", color: AUB }}>RA</div>
                <div style={{ flex: 1 }}>
                  <div style={{ font: "700 15px Figtree" }}>{dayFull(slot)} · {timeLabel(slot)}</div>
                  <div style={{ fontSize: 13, color: "rgba(47,33,65,.6)" }}>Online via videocall · 30 min</div>
                </div>
                <button onClick={() => setStep(2)} style={{ background: "none", border: 0, font: "600 12px Figtree", color: PINK, textDecoration: "underline", cursor: "pointer" }}>Wijzig</button>
              </div>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Je naam" autoComplete="name"
                style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", marginBottom: 10, outline: "none" }} />
              <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Je e-mailadres" type="email" autoComplete="email"
                style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", outline: "none" }} />
            </div>
          )}

          {err && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 14 }}>{err}</p>}
        </div>

        {/* Voet: samenvatting + CTA */}
        <div style={{ flex: "none", padding: "14px 22px calc(18px + env(safe-area-inset-bottom))", background: "linear-gradient(to top,#FBF7EE 75%,rgba(251,247,238,0))", borderTop: "1px solid rgba(47,33,65,.06)" }}>
          {summary && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "rgba(47,33,65,.75)" }}>{summary}</div>}
          <button onClick={onCta} disabled={!ctaOk}
            style={{ width: "100%", height: 54, border: 0, borderRadius: 99, background: ctaOk ? AUB : AUB_DIM, color: "#fff", font: "700 16px Figtree", cursor: ctaOk ? "pointer" : "default", transition: "background .2s" }}>
            {ctaLabel}
          </button>
          <div style={{ textAlign: "center", fontSize: 11, color: "rgba(47,33,65,.5)", marginTop: 8 }}>
            Je moment blijft 10 min gereserveerd tijdens betalen
          </div>
        </div>
      </div>
    </div>
  );
}
