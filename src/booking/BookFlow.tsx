import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";
import {
  Calendar, TimePicker, type Slot,
  AUB, AUB_DIM, PINK, CREME,
  dateKey, dayFull, timeLabel, isoDate,
} from "./slots";

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
  const [phone, setPhone] = useState("");
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

  const emailOk = /.+@.+\..+/.test(email.trim());
  const phoneOk = phone.replace(/\D/g, "").length >= 8;

  const confirm = async () => {
    setBusy(true);
    setErr(null);
    const { data, error } = await supabase.functions.invoke("booking", {
      body: { action: "checkout", service_key: service, start: slot, name, email, phone, coupon: coupon || undefined },
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
    ctaOk = name.trim() !== "" && emailOk && phoneOk && !busy;
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
                  <TimePicker slots={slots} day={day} value={slot} onSelect={setSlot} />
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
                style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", outline: "none", marginBottom: 10 }} />
              <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Je telefoonnummer" type="tel" autoComplete="tel"
                style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", outline: "none" }} />
              <p style={{ fontSize: 12, color: "rgba(47,33,65,.5)", margin: "8px 2px 0" }}>
                Zo kunnen we je bereiken als er iets is rond je videogesprek.
              </p>
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
