import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Thuisadvies in de klantkaart: adres, telefoon en voorkeuren, het stylistvoorstel (dichtstbij eerst)
// en de acties: moment vastleggen, omzetten naar online advies, of annuleren en terugbetalen.
// Terugbetalen gebeurt (voorlopig) handmatig in WooCommerce; de link staat erbij.

const WANNEER: Record<string, string> = { zsm: "Zo snel mogelijk", "2wk": "Binnen 2 weken", maand: "Binnen een maand", later: "Later" };
const DAGEN = ["maandag", "dinsdag", "woensdag", "donderdag", "vrijdag", "zaterdag"];
const DAGDELEN = ["ochtend", "middag", "avond"];
const TZ = "Europe/Amsterdam";
function nlToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const guess = new Date(`${date}T${time}:00Z`);
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: TZ })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export interface ThuisBooking {
  id: string; status: string; format: string; start_at: string; stylist_id: string | null; customer_phone: string | null; woo_order_id: string | null;
  address: { straat?: string; huisnummer?: string; postcode?: string; plaats?: string; country?: string } | null;
  preferences: { wanneer?: string; momenten?: string[]; toelichting?: string } | null;
}

export function ThuisPanel({ b, onChanged }: { b: ThuisBooking; onChanged: () => void }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylists, setStylists] = useState<{ id: string; name: string; meet_url: string | null }[]>([]);
  const [suggest, setSuggest] = useState<{ stylist_id: string; name: string; km: number; binnen: boolean }[]>([]);
  const [mode, setMode] = useState<null | "plan" | "online" | "cancel">(null);
  const [sid, setSid] = useState(b.stylist_id ?? "");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ t: string; link?: string | null; ok?: boolean } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(adm === true);
      if (adm !== true) return;
      const [{ data: st }, { data: sg }] = await Promise.all([
        supabase.from("stylists").select("id,name,meet_url").eq("active", true).order("name"),
        supabase.rpc("thuis_suggest", { p_booking_id: b.id }),
      ]);
      setStylists((st as typeof stylists) ?? []);
      const list = (sg as typeof suggest) ?? [];
      setSuggest(list);
      if (!b.stylist_id && list[0]) setSid(list[0].stylist_id);
    })();
  }, [b.id, b.stylist_id]);

  const a = b.address ?? {};
  const adres = [`${a.straat ?? ""} ${a.huisnummer ?? ""}`.trim(), `${a.postcode ?? ""} ${a.plaats ?? ""}`.trim(), a.country === "BE" ? "België" : ""].filter(Boolean).join(", ");
  const p = b.preferences ?? {};
  const momenten = new Set(p.momenten ?? []);
  const gepland = b.status === "confirmed";
  const geannuleerd = b.status === "cancelled";

  const run = async (action: string, extra: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    const { data, error } = await supabase.functions.invoke("booking", { body: { action, booking_id: b.id, ...extra } });
    setBusy(false);
    const d = data as { ok?: boolean; error?: string; refund?: number; order_url?: string | null } | null;
    if (error || !d?.ok) { setMsg({ t: d?.error ?? "Dat lukte niet. Probeer het opnieuw." }); return; }
    if (action === "thuis_plan") setMsg({ t: "Moment vastgelegd. De klant krijgt de bevestiging en de styliste een melding.", ok: true });
    if (action === "thuis_to_online") setMsg({ t: `Omgezet naar online advies. De klant krijgt een mail om zelf een moment te kiezen. Betaal nu € ${d.refund} terug in WooCommerce (het verschil).`, link: d.order_url, ok: true });
    if (action === "thuis_cancel") setMsg({ t: "Aanvraag geannuleerd. Betaal het volledige bedrag terug in WooCommerce.", link: d.order_url, ok: true });
    setMode(null);
    onChanged();
  };

  const sel: React.CSSProperties = { height: 44 };
  return (
    <section className="kk-card" style={{ marginTop: 18, borderColor: "var(--rd-pink-dark)" }} aria-label="Thuisadvies">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
        <h2 className="kk-h2" style={{ margin: 0 }}>Thuisadvies · 60 minuten</h2>
        <span className="rd-chip" style={{ fontWeight: 700 }}>{geannuleerd ? "Geannuleerd" : gepland ? "Moment staat" : "Nog bellen en inplannen"}</span>
      </div>

      <div style={{ display: "grid", gap: 16, gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 15 }}>
          <span className="kk-label">Adres</span>
          <span>{adres || "Onbekend"}</span>
          {adres && <a className="rd-textlink" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(adres)}`} target="_blank" rel="noreferrer" style={{ fontSize: 14 }}>Bekijk op de kaart</a>}
          <span className="kk-label" style={{ marginTop: 6 }}>Telefoon</span>
          {b.customer_phone ? <a className="rd-textlink" href={`tel:${b.customer_phone.replace(/\s/g, "")}`}>{b.customer_phone}</a> : <span>Onbekend</span>}
        </div>
        <div>
          <span className="kk-label">Voorkeuren{p.wanneer ? ` · ${WANNEER[p.wanneer] ?? p.wanneer}` : ""}</span>
          <div style={{ display: "grid", gridTemplateColumns: "84px repeat(3, 1fr)", gap: 4, marginTop: 6, fontSize: 12.5 }}>
            <span />
            {DAGDELEN.map((d) => <span key={d} style={{ textAlign: "center", fontWeight: 700, opacity: 0.7 }}>{d}</span>)}
            {DAGEN.map((dag) => [
              <span key={dag} style={{ fontWeight: 700, textTransform: "capitalize" }}>{dag}</span>,
              ...DAGDELEN.map((dd) => {
                const on = momenten.has(`${dag}_${dd}`);
                return <span key={`${dag}_${dd}`} aria-label={`${dag} ${dd}${on ? ": past" : ""}`} style={{ height: 22, borderRadius: 6, background: on ? "var(--rd-aubergine)" : "var(--rd-grey-light)" }} />;
              }),
            ])}
          </div>
          {p.toelichting && <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.45 }}>"{p.toelichting}"</p>}
        </div>
      </div>

      {isAdmin && !geannuleerd && (
        <>
          {suggest.length > 0 ? (
            <div style={{ fontSize: 14 }}>
              <span className="kk-label">Stylisten in de buurt</span>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 6 }}>
                {suggest.map((s, i) => (
                  <span key={s.stylist_id} className="rd-chip" style={i === 0 ? { background: "var(--rd-lime)", fontWeight: 700 } : undefined}>
                    {i === 0 ? "Voorstel: " : ""}{s.name} · {s.km} km{s.binnen ? "" : " (buiten haar reisafstand)"}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <p className="rd-sub" style={{ margin: 0, fontSize: 14 }}>Geen styliste met dit adres in haar werkgebied. Kies zelf iemand, zet om naar online advies, of annuleer en betaal terug.</p>
          )}

          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button className="rd-btn rd-btn-primary" onClick={() => setMode(mode === "plan" ? null : "plan")} style={{ width: "auto", padding: "0 20px", minHeight: 44 }}>{gepland ? "Moment wijzigen" : "Moment vastleggen"}</button>
            <button className="rd-btn rd-btn-outline" onClick={() => setMode(mode === "online" ? null : "online")} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>Omzetten naar online advies</button>
            <button className="kk-link" onClick={() => setMode(mode === "cancel" ? null : "cancel")}>Annuleren en terugbetalen</button>
          </div>

          {mode === "plan" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Styliste</span>
                <select className="rd-input" value={sid} onChange={(e) => setSid(e.target.value)} style={sel}>
                  <option value="">Kies een styliste</option>
                  {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Datum</span>
                <input className="rd-input" type="date" value={date} onChange={(e) => setDate(e.target.value)} style={sel} /></label>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Tijd</span>
                <input className="rd-input" type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} style={sel} /></label>
              <button className="rd-btn rd-btn-primary" disabled={busy || !sid || !date || !time} onClick={() => run("thuis_plan", { stylist_id: sid, start: nlToIso(date, time) })} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>{busy ? "Bezig..." : "Bevestig en mail de klant"}</button>
            </div>
          )}
          {mode === "online" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
              <p className="rd-sub" style={{ margin: 0, fontSize: 14, flexBasis: "100%" }}>De klant krijgt een mail om zelf een online moment te kiezen bij de gekozen styliste. Het verschil met de online prijs betaal je daarna terug in WooCommerce.</p>
              <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Styliste (met videolink)</span>
                <select className="rd-input" value={sid} onChange={(e) => setSid(e.target.value)} style={sel}>
                  <option value="">Kies een styliste</option>
                  {stylists.map((s) => <option key={s.id} value={s.id} disabled={!s.meet_url}>{s.name}{s.meet_url ? "" : " (geen videolink)"}</option>)}
                </select></label>
              <button className="rd-btn rd-btn-primary" disabled={busy || !sid} onClick={() => run("thuis_to_online", { stylist_id: sid })} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>{busy ? "Bezig..." : "Omzetten en mail de klant"}</button>
            </div>
          )}
          {mode === "cancel" && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
              <p className="rd-sub" style={{ margin: 0, fontSize: 14 }}>Bel de klant eerst even. Daarna annuleer je hier en betaal je het volledige bedrag terug in WooCommerce.</p>
              <button className="rd-btn rd-btn-outline" disabled={busy} onClick={() => run("thuis_cancel", {})} style={{ width: "auto", padding: "0 18px", minHeight: 44 }}>{busy ? "Bezig..." : "Annuleer de aanvraag"}</button>
            </div>
          )}
        </>
      )}
      {msg && (
        <div role="status" style={{ fontSize: 14, fontWeight: 600, color: msg.ok ? "var(--rd-aubergine)" : "var(--rd-pink-dark)" }}>
          {msg.t} {msg.link && <a className="rd-textlink" href={msg.link} target="_blank" rel="noreferrer">Open de bestelling in WooCommerce</a>}
        </div>
      )}
    </section>
  );
}
