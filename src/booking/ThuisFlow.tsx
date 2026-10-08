import { Fragment, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { getTurnstileToken, preloadTurnstile } from "@/lib/turnstile";
import { AUB, AUB_DIM, PINK, CREME } from "./slots";

// Thuisadvies aanvragen: postcodecheck, algemene voorkeursmomenten, adres en gegevens, dan betalen.
// Na betaling neemt een styliste contact op en spreken jullie samen het moment af.

const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const DAGDELEN = ["ochtend", "middag", "avond"];
const WANNEER = [
  { key: "zsm", label: "Zo snel mogelijk" },
  { key: "2wk", label: "Binnen 2 weken" },
  { key: "maand", label: "Binnen een maand" },
  { key: "later", label: "Later" },
];
const input: React.CSSProperties = { width: "100%", padding: "15px 16px", borderRadius: 14, border: "1.5px solid rgba(47,33,65,.18)", background: "#fff", font: "400 15px Figtree", outline: "none" };
const chip = (on: boolean): React.CSSProperties => ({
  padding: "10px 12px", borderRadius: 12, border: `2px solid ${on ? AUB : "rgba(47,33,65,.12)"}`, background: on ? AUB : "#fff",
  color: on ? "#fff" : AUB, font: "600 13px Figtree", cursor: "pointer", minHeight: 44,
});

type Check = "ok" | "twijfel" | "buiten" | "ongeldig";

export function ThuisFlow({ price, onOnline, onBack }: { price: number; onOnline: () => void; onBack: () => void }) {
  const [step, setStep] = useState(1);
  const [country, setCountry] = useState<"NL" | "BE">("NL");
  const [postcode, setPostcode] = useState("");
  const [check, setCheck] = useState<Check | null>(null);
  const [place, setPlace] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [wanneer, setWanneer] = useState("");
  const [momenten, setMomenten] = useState<string[]>([]);
  const [toelichting, setToelichting] = useState("");
  const [straat, setStraat] = useState("");
  const [huisnummer, setHuisnummer] = useState("");
  const [plaats, setPlaats] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { preloadTurnstile(); }, []);

  const pcOk = country === "NL" ? /^\d{4}\s?[a-zA-Z]{2}$/.test(postcode.trim()) : /^\d{4}$/.test(postcode.trim());
  const doCheck = async () => {
    setChecking(true); setErr(null);
    const { data } = await supabase.functions.invoke("booking", { body: { action: "thuis_check", country, postcode } });
    setChecking(false);
    const st = ((data as { status?: Check } | null)?.status ?? "twijfel") as Check;
    setCheck(st);
    const pl = (data as { place?: string } | null)?.place ?? null;
    setPlace(pl);
    if (pl && !plaats) setPlaats(pl);
  };
  const toggle = (m: string) => setMomenten((v) => (v.includes(m) ? v.filter((x) => x !== m) : [...v, m]));

  const emailOk = /.+@.+\..+/.test(email.trim());
  const phoneOk = phone.replace(/\D/g, "").length >= 8;

  const submit = async () => {
    setBusy(true); setErr(null);
    const turnstile_token = await getTurnstileToken("booking_checkout");
    const { data, error } = await supabase.functions.invoke("booking", {
      body: {
        action: "checkout_thuis", turnstile_token, name, email, phone,
        address: { straat, huisnummer, postcode: postcode.trim().toUpperCase(), plaats, country },
        preferences: { wanneer, momenten, toelichting },
      },
    });
    if (error || !data?.pay_url) {
      let msg: string | null = null;
      try { const ctx = (error as { context?: Response } | null)?.context; if (ctx && typeof ctx.clone === "function") msg = (await ctx.clone().json())?.error ?? null; } catch { /* geen json */ }
      setBusy(false);
      setErr(msg ?? "Er ging iets mis. Probeer het opnieuw.");
      return;
    }
    window.location.href = data.pay_url as string;
  };

  let ctaOk = false, ctaLabel = "Verder", onCta = () => {};
  if (step === 1) { ctaOk = check === "ok" || check === "twijfel"; onCta = () => ctaOk && setStep(2); }
  else if (step === 2) { ctaOk = momenten.length >= 2 && !!wanneer; onCta = () => ctaOk && setStep(3); }
  else {
    ctaOk = !!name.trim() && emailOk && phoneOk && !!straat.trim() && !!huisnummer.trim() && !!plaats.trim() && !busy;
    ctaLabel = busy ? "Bezig..." : `Naar betalen (€${price})`;
    onCta = submit;
  }

  return (
    <div className="rd-root rd-lock" style={{ background: CREME, color: AUB, fontFamily: "Figtree, system-ui, sans-serif" }}>
      <div className="rd-col" style={{ maxWidth: 440 }}>
        <div style={{ flex: "none", padding: "16px 22px 10px", display: "flex", alignItems: "center", gap: 10 }}>
          <button onClick={() => (step > 1 ? setStep(step - 1) : onBack())} aria-label="Terug"
            style={{ width: 36, height: 36, borderRadius: 99, border: "1px solid rgba(47,33,65,.15)", background: "#fff", cursor: "pointer", fontSize: 15, flex: "none" }}>←</button>
          <div style={{ flex: 1, height: 5, borderRadius: 99, background: "rgba(47,33,65,.1)", overflow: "hidden" }}>
            <div style={{ width: ["33%", "66%", "100%"][step - 1], height: "100%", background: PINK, borderRadius: 99, transition: "width .4s cubic-bezier(.2,.7,.2,1)" }} />
          </div>
          <span style={{ fontWeight: 600, fontSize: 12, color: "rgba(47,33,65,.55)", flex: "none" }}>{step}/3</span>
        </div>

        <div key={step} className="rd-screen-in rd-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "6px 22px 16px" }}>
          <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".14em", textTransform: "uppercase", color: PINK }}>Kleuradvies thuis · 60 min</div>

          {step === 1 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Komen we bij je in de buurt?</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 16px" }}>Onze stylisten komen in steeds meer regio's langs. Vul je postcode in.</p>
              <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
                {(["NL", "BE"] as const).map((c) => (
                  <button key={c} onClick={() => { setCountry(c); setCheck(null); }} style={chip(country === c)}>{c === "NL" ? "Nederland" : "België"}</button>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={postcode} onChange={(e) => { setPostcode(e.target.value); setCheck(null); }} placeholder={country === "NL" ? "1234 AB" : "1000"}
                  autoComplete="postal-code" inputMode={country === "BE" ? "numeric" : "text"} style={{ ...input, flex: 1 }} />
                <button onClick={doCheck} disabled={!pcOk || checking}
                  style={{ padding: "0 18px", borderRadius: 14, border: 0, background: pcOk ? AUB : AUB_DIM, color: "#fff", font: "700 15px Figtree", cursor: pcOk ? "pointer" : "default" }}>
                  {checking ? "..." : "Check"}
                </button>
              </div>
              {check === "ok" && (
                <div role="status" style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "#fff" }}>
                  <strong>Goed nieuws!</strong> We komen graag bij je langs{place ? ` in ${place}` : ""}.
                </div>
              )}
              {check === "twijfel" && (
                <div role="status" style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "#fff", lineHeight: 1.5 }}>
                  <strong>Je kunt je aanvraag gewoon doen.</strong> Na je aanvraag nemen we contact met je op om samen een moment te kiezen.
                </div>
              )}
              {check === "buiten" && (
                <div role="status" style={{ marginTop: 14, padding: "14px 16px", borderRadius: 14, background: "#fff", lineHeight: 1.5 }}>
                  <strong>Thuisadvies kan hier helaas nog niet.</strong> Online kleuradvies kan wel: in een videogesprek van 30 minuten kies je samen met een styliste je kleuren.
                  <button onClick={onOnline} style={{ display: "block", marginTop: 12, width: "100%", height: 48, border: 0, borderRadius: 99, background: AUB, color: "#fff", font: "700 15px Figtree", cursor: "pointer" }}>Bekijk online kleuradvies</button>
                </div>
              )}
              {check === "ongeldig" && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 12 }}>Controleer je postcode.</p>}
            </div>
          )}

          {step === 2 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Wanneer komt het je uit?</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 14px" }}>De styliste belt je om samen een moment te kiezen. Geef alvast aan wat in het algemeen goed uitkomt.</p>
              <div style={{ font: "700 14px Figtree", marginBottom: 8 }}>Wanneer wil je het advies?</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
                {WANNEER.map((w) => <button key={w.key} onClick={() => setWanneer(w.key)} style={chip(wanneer === w.key)}>{w.label}</button>)}
              </div>
              <div style={{ font: "700 14px Figtree", marginBottom: 8 }}>Welke momenten passen? <span style={{ fontWeight: 400, opacity: .6 }}>Kies er minstens twee</span></div>
              <div role="group" aria-label="Voorkeursmomenten" style={{ display: "grid", gridTemplateColumns: "88px repeat(3, 1fr)", gap: 6, alignItems: "center" }}>
                <span />
                {DAGDELEN.map((d) => <span key={d} style={{ fontSize: 12, fontWeight: 600, textAlign: "center", opacity: .7, textTransform: "capitalize" }}>{d}</span>)}
                {DAGEN.map((dag) => (
                  <Fragment key={dag}>
                    <span style={{ fontSize: 13, fontWeight: 600, textTransform: "capitalize" }}>{dag}</span>
                    {DAGDELEN.map((dd) => {
                      const m = `${dag}_${dd}`;
                      const on = momenten.includes(m);
                      return <button key={m} onClick={() => toggle(m)} aria-pressed={on} aria-label={`${dag} ${dd}`} style={{ ...chip(on), padding: 0, minHeight: 40 }}>{on ? "✓" : ""}</button>;
                    })}
                  </Fragment>
                ))}
              </div>
              <textarea value={toelichting} onChange={(e) => setToelichting(e.target.value)} rows={3} maxLength={1000}
                placeholder="Nog iets wat we moeten weten? Bijvoorbeeld: liever niet in de schoolvakantie."
                style={{ ...input, marginTop: 16, resize: "vertical", lineHeight: 1.45 }} />
            </div>
          )}

          {step === 3 && (
            <div>
              <h1 style={{ font: "800 27px/1.05 Figtree", letterSpacing: "-.02em", margin: "8px 0 4px" }}>Waar mogen we langskomen?</h1>
              <p style={{ fontSize: 14, color: "rgba(47,33,65,.65)", margin: "0 0 14px" }}>Hierna reken je veilig af.</p>
              <div style={{ background: "#fff", borderRadius: 16, padding: "14px 16px", marginBottom: 14 }}>
                <div style={{ font: "700 15px Figtree" }}>Kleuradvies thuis · 60 min · €{price}</div>
                <div style={{ fontSize: 13, color: "rgba(47,33,65,.6)", marginTop: 2 }}>Inclusief reistijd. Na je betaling nemen we binnen 2 werkdagen contact met je op.</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={straat} onChange={(e) => setStraat(e.target.value)} placeholder="Straat" autoComplete="address-line1" style={{ ...input, flex: 2 }} />
                  <input value={huisnummer} onChange={(e) => setHuisnummer(e.target.value)} placeholder="Nr." style={{ ...input, flex: 1 }} />
                </div>
                <div style={{ display: "flex", gap: 10 }}>
                  <input value={postcode} readOnly aria-label="Postcode" style={{ ...input, flex: 1, opacity: .7 }} />
                  <input value={plaats} onChange={(e) => setPlaats(e.target.value)} placeholder="Plaats" autoComplete="address-level2" style={{ ...input, flex: 2 }} />
                </div>
                <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Je naam" autoComplete="name" style={input} />
                <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Je e-mailadres" type="email" autoComplete="email" style={input} />
                <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Je telefoonnummer" type="tel" autoComplete="tel" style={input} />
              </div>
              <p style={{ fontSize: 12, color: "rgba(47,33,65,.5)", margin: "8px 2px 0" }}>De styliste belt je op dit nummer om het moment af te spreken.</p>
            </div>
          )}

          {err && <p style={{ color: PINK, fontWeight: 600, fontSize: 14, marginTop: 14 }}>{err}</p>}
        </div>

        <div style={{ flex: "none", padding: "14px 22px calc(18px + env(safe-area-inset-bottom))", background: "linear-gradient(to top,#FBF7EE 75%,rgba(251,247,238,0))", borderTop: "1px solid rgba(47,33,65,.06)" }}>
          <button onClick={onCta} disabled={!ctaOk}
            style={{ width: "100%", height: 54, border: 0, borderRadius: 99, background: ctaOk ? AUB : AUB_DIM, color: "#fff", font: "700 16px Figtree", cursor: ctaOk ? "pointer" : "default", transition: "background .2s" }}>
            {ctaLabel}
          </button>
          <div style={{ textAlign: "center", fontSize: 11, color: "rgba(47,33,65,.5)", marginTop: 8 }}>
            Na je aanvraag bellen we je binnen 2 werkdagen voor een moment.
          </div>
        </div>
      </div>
    </div>
  );
}
