import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { lockDocument } from "@/lib/lock-document";
import {
  Calendar, TimePicker, type Slot,
  AUB, AUB_DIM, PINK, CREME, GREEN,
  dateKey, dayFull, timeLabel, isoDate,
} from "./slots";

// Route 2: iemand kocht het advies al, en plant hier het moment (wisselt het tegoed in).
const SERVICES = [
  { key: "pre_sample", title: "Nog geen samples getest", sub: "We bepalen samen de richting.", icon: "💬", chip: "#EDE7F2" },
  { key: "post_sample", title: "Al samples getest", sub: "We kiezen de definitieve kleur.", icon: "🖌️", chip: "#E7EFE3" },
];
const modeOf = (key: string) => (key === "post_sample" ? "post" : "pre");

interface Credit {
  status: string;
  buyer_name: string | null;
  buyer_email: string | null;
  buyer_phone: string | null;
  service_key: string | null;
  booking_id: string | null;
  start_at: string | null;
}

export function PlanFlow() {
  const [params] = useSearchParams();

  const [token, setToken] = useState(params.get("token") ?? "");
  const [credit, setCredit] = useState<Credit | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ok" | "notfound" | "needcode">("loading");
  const [codeInput, setCodeInput] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [codeBusy, setCodeBusy] = useState(false);

  const [step, setStep] = useState(1);
  const [service, setService] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [day, setDay] = useState("");
  const [slot, setSlot] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [doneBooking, setDoneBooking] = useState<{ id: string; mode: string } | null>(null);

  useEffect(() => lockDocument(), []);

  const loadCredit = async (t: string): Promise<boolean> => {
    const { data: c, error } = await supabase.rpc("credit_by_token", { p_token: t });
    if (error || !c) return false;
    const cr = c as Credit;
    setToken(t);
    setCredit(cr);
    setName(cr.buyer_name ?? "");
    setEmail(cr.buyer_email ?? "");
    setPhone(cr.buyer_phone ?? "");
    setLoadState("ok");
    return true;
  };

  // Token bepalen: direct uit de URL, via de Woo-retour (?order=&key=), of anders code invoeren.
  useEffect(() => {
    (async () => {
      let t = params.get("token") ?? "";
      const order = params.get("order");
      const key = params.get("key");
      if (!t && order && key) {
        const { data } = await supabase.functions.invoke("booking", {
          body: { action: "plan_resolve", order_id: order, order_key: key },
        });
        t = (data as { token?: string } | null)?.token ?? "";
      }
      if (!t) { setLoadState("needcode"); return; }
      if (!(await loadCredit(t))) setLoadState("notfound");
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submitCode = async () => {
    setCodeBusy(true); setCodeErr(null);
    const { data } = await supabase.rpc("credit_by_code", { p_code: codeInput });
    const t = (data as { token?: string } | null)?.token;
    if (!t) { setCodeBusy(false); setCodeErr("Deze code kennen we niet. Controleer 'm en probeer opnieuw."); return; }
    const ok = await loadCredit(t);
    setCodeBusy(false);
    if (!ok) setCodeErr("Er ging iets mis bij het laden. Probeer het opnieuw.");
  };

  const loadSlots = async (svc: string) => {
    setLoadingSlots(true);
    const { data } = await supabase.rpc("available_slots", {
      p_service_key: svc, p_from: isoDate(new Date()), p_to: isoDate(new Date(Date.now() + 56 * 864e5)),
    });
    setSlots((data as Slot[]) ?? []);
    setLoadingSlots(false);
  };

  const pickService = (svc: string) => { setService(svc); setDay(""); setSlot(""); loadSlots(svc); };

  const availDays = useMemo(() => new Set(slots.map((s) => dateKey(s.start_at))), [slots]);
  const todayKey = dateKey(new Date().toISOString());
  const maxKey = dateKey(new Date(Date.now() + 56 * 864e5).toISOString());
  const emailOk = /.+@.+\..+/.test(email.trim());
  const phoneOk = phone.replace(/\D/g, "").length >= 8;

  const confirm = async () => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("booking", {
      body: { action: "book_credit", token, service_key: service, start: slot, name, email, phone },
    });
    setBusy(false);
    const bookingId = (data as { booking_id?: string } | null)?.booking_id;
    if (error || !bookingId) {
      let serverMsg: string | null = null;
      try {
        const ctx = (error as { context?: Response } | null)?.context;
        if (ctx && typeof ctx.clone === "function") serverMsg = (await ctx.clone().json())?.error ?? null;
      } catch { /* geen json */ }
      setErr(serverMsg || "Dit moment is net vergeven of er ging iets mis. Kies een ander moment.");
      setSlot(""); setStep(2); loadSlots(service);
      return;
    }
    setDoneBooking({ id: bookingId, mode: modeOf(service) });
  };

  const shell = (children: React.ReactNode) => (
    <div className="rd-root rd-lock" style={{ background: CREME, color: AUB, fontFamily: "Figtree, system-ui, sans-serif" }}>
      <div className="rd-col" style={{ maxWidth: 440 }}>{children}</div>
    </div>
  );
  const pad = { padding: "28px 22px 24px" };

  if (loadState === "loading")
    return shell(<div style={pad}><p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Laden...</p></div>);

  if (loadState === "needcode")
    return shell(
      <div style={pad}>
        <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>Roll · Kleuradvies</div>
        <h1 style={{ font: "800 26px/1.1 Figtree", letterSpacing: "-.02em", margin: "8px 0 6px" }}>Kleuradvies cadeau gekregen?</h1>
        <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)", margin: "0 0 16px" }}>
          Vul de code van je cadeaukaart in, dan plan je meteen je gesprek.
        </p>
        <input
          value={codeInput}
          onChange={(e) => setCodeInput(e.target.value)}
          placeholder="ROLL-XXXX-XXXX"
          autoCapitalize="characters"
          style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "600 16px Figtree", letterSpacing: ".04em", outline: "none", textTransform: "uppercase" }}
        />
        {codeErr && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 10 }}>{codeErr}</p>}
        <button onClick={submitCode} disabled={codeBusy || codeInput.trim().length < 4}
          style={{ width: "100%", height: 52, marginTop: 14, border: 0, borderRadius: 99, background: codeBusy || codeInput.trim().length < 4 ? AUB_DIM : AUB, color: "#fff", font: "700 16px Figtree", cursor: "pointer" }}>
          {codeBusy ? "Bezig..." : "Ga verder"}
        </button>
      </div>,
    );

  if (loadState === "notfound" || !credit)
    return shell(
      <div style={pad}>
        <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>Roll · Kleuradvies</div>
        <h1 style={{ font: "800 26px/1.1 Figtree", letterSpacing: "-.02em", margin: "8px 0 6px" }}>Link werkt niet meer</h1>
        <p style={{ fontSize: 15, color: "rgba(47,33,65,.7)" }}>
          Gebruik de link uit je bevestigingsmail, of neem contact op via <a href="mailto:hello@roll.nl" style={{ color: PINK }}>hello@roll.nl</a>.
        </p>
      </div>,
    );

  // Al ingepland (of net ingepland): toon bevestiging + intake-link.
  const scheduled = doneBooking || (credit.status === "scheduled" && credit.booking_id
    ? { id: credit.booking_id, mode: modeOf(credit.service_key ?? "pre_sample") }
    : null);
  if (scheduled) {
    const startIso = doneBooking ? slot : credit.start_at;
    return shell(
      <div style={pad}>
        <div className="rd-rise">
          <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>Roll · Kleuradvies</div>
          <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "10px 0 6px" }}>Je afspraak staat!</h1>
          {startIso && (
            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginTop: 8 }}>
              <div style={{ font: "700 16px Figtree" }}>{dayFull(startIso)} · {timeLabel(startIso)}</div>
              <div style={{ fontSize: 13, color: "rgba(47,33,65,.6)", marginTop: 2 }}>Online via videocall · 30 min</div>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 10, color: GREEN, fontWeight: 600, fontSize: 13 }}>
                <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN }} /> Bevestigd
              </div>
            </div>
          )}
          <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginTop: 12 }}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 6 }}>Bereid je gesprek voor</div>
            <p style={{ fontSize: 14, color: "rgba(47,33,65,.7)", margin: "0 0 12px" }}>
              Vul de korte intake in, dan kan je adviseur zich voorbereiden.
            </p>
            <a href={`/?booking=${scheduled.id}&mode=${scheduled.mode}`} className="rd-btn rd-btn-primary rd-btn-lg" style={{ textDecoration: "none" }}>
              Naar mijn intake
            </a>
          </div>
        </div>
      </div>,
    );
  }

  // Planflow (3 stappen)
  const prog = ["33%", "66%", "100%"][step - 1];
  let ctaOk = false, ctaLabel = "Verder", summary = "";
  let onCta: () => void = () => {};
  if (step === 1) { ctaOk = !!service; onCta = () => ctaOk && setStep(2); }
  else if (step === 2) { ctaOk = !!day && !!slot; summary = ctaOk ? `${dayFull(slot)} · ${timeLabel(slot)}` : ""; onCta = () => ctaOk && setStep(3); }
  else { ctaOk = name.trim() !== "" && emailOk && phoneOk && !busy; ctaLabel = busy ? "Bezig..." : "Afspraak vastleggen"; summary = `${dayFull(slot)} · ${timeLabel(slot)}`; onCta = confirm; }

  return shell(
    <>
      <div style={{ flex: "none", padding: "16px 22px 10px", display: "flex", alignItems: "center", gap: 10 }}>
        {step > 1 ? (
          <button onClick={() => setStep((s) => Math.max(1, s - 1))} aria-label="Terug"
            style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid rgba(47,33,65,.15)", background: "#fff", cursor: "pointer", fontSize: 15, flex: "none" }}>←</button>
        ) : <span style={{ width: 36, flex: "none" }} aria-hidden />}
        <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(47,33,65,.1)", overflow: "hidden" }}>
          <div style={{ width: prog, height: "100%", background: PINK, borderRadius: 99, transition: "width .4s" }} />
        </div>
        <span style={{ fontWeight: 600, fontSize: 12, color: "rgba(47,33,65,.55)", flex: "none" }}>{step}/3</span>
      </div>

      <div key={step} className="rd-screen-in rd-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 22px 16px" }}>
        <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>Plan je kleuradvies · 30 min</div>

        {step === 1 && (
          <div>
            <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Waar sta je nu?</h1>
            <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 18px" }}>Zo bereidt je adviseur het gesprek voor.</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {SERVICES.map((o) => (
                <button key={o.key} onClick={() => pickService(o.key)}
                  style={{ textAlign: "left", padding: 18, borderRadius: 18, cursor: "pointer", border: `2px solid ${service === o.key ? AUB : "rgba(47,33,65,.12)"}`, background: "#fff", display: "flex", gap: 14, alignItems: "center" }}>
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
            {loadingSlots ? (
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Beschikbaarheid laden...</p>
            ) : availDays.size === 0 ? (
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.6)" }}>Er is nu geen beschikbaarheid. Probeer het later opnieuw.</p>
            ) : (
              <>
                <Calendar availDays={availDays} todayKey={todayKey} maxKey={maxKey} value={day} onSelect={(k) => { setDay(k); setSlot(""); }} />
                <TimePicker slots={slots} day={day} value={slot} onSelect={setSlot} />
              </>
            )}
          </div>
        )}

        {step === 3 && (
          <div>
            <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Voor wie is het gesprek?</h1>
            <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 16px" }}>Controleer de gegevens. Cadeau? Vul dan de gegevens van de ontvanger in.</p>
            <div style={{ background: "#fff", borderRadius: 16, padding: "16px 18px", marginBottom: 16 }}>
              <div style={{ font: "700 15px Figtree" }}>{dayFull(slot)} · {timeLabel(slot)}</div>
              <div style={{ fontSize: 13, color: "rgba(47,33,65,.6)" }}>Online via videocall · 30 min</div>
            </div>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Naam" autoComplete="name"
              style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", marginBottom: 10, outline: "none" }} />
            <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="E-mailadres" type="email" autoComplete="email"
              style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", marginBottom: 10, outline: "none" }} />
            <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Telefoonnummer" type="tel" autoComplete="tel"
              style={{ width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", outline: "none" }} />
            <p style={{ fontSize: 12, color: "rgba(47,33,65,.5)", margin: "8px 2px 0" }}>De bevestiging en intake-link gaan naar dit e-mailadres.</p>
          </div>
        )}

        {err && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 14 }}>{err}</p>}
      </div>

      <div style={{ flex: "none", padding: "14px 22px calc(18px + env(safe-area-inset-bottom))", background: "linear-gradient(to top,#FBF7EE 75%,rgba(251,247,238,0))", borderTop: "1px solid rgba(47,33,65,.06)" }}>
        {summary && <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10, color: "rgba(47,33,65,.75)" }}>{summary}</div>}
        <button onClick={onCta} disabled={!ctaOk}
          style={{ width: "100%", height: 54, border: 0, borderRadius: 99, background: ctaOk ? AUB : AUB_DIM, color: "#fff", font: "700 16px Figtree", cursor: ctaOk ? "pointer" : "default", transition: "background .2s" }}>
          {ctaLabel}
        </button>
        <div style={{ textAlign: "center", fontSize: 11, color: "rgba(47,33,65,.5)", marginTop: 8 }}>Je advies is al betaald. Je legt nu alleen het moment vast.</div>
      </div>
    </>,
  );
}
