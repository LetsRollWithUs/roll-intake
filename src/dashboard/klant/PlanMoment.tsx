import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";

// Gratis advies of via via: een bestaande klant zonder afspraak (mode "plan") of een nieuwe klant
// (mode "invite") uitnodigen. Twee manieren: de klant kiest zelf een moment uit de agenda van de
// styliste (plan-mail C06), of de styliste legt het moment vast (bevestigingsmail C01). Vrije plekken
// komen uit het rooster; met "Ander moment" kan ook een tijd daarbuiten.

const TZ = "Europe/Amsterdam";
const dayLabel = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const timeLabel = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
// Lokale Nederlandse tijd (datum + hh:mm) naar een ISO-tijdstip.
function nlToIso(date: string, time: string): string | null {
  if (!date || !time) return null;
  const guess = new Date(`${date}T${time}:00Z`);
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: TZ })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime();
  return new Date(guess.getTime() - offset).toISOString();
}

export function PlanMoment({ mode, bookingId, defaultStylistId, customerName, canSelf = true, onClose, onDone }: {
  mode: "plan" | "invite"; bookingId?: string; defaultStylistId?: string | null; customerName?: string;
  canSelf?: boolean; onClose: () => void; onDone: (bookingId: string) => void;
}) {
  const [wie, setWie] = useState<"klant" | "styliste">(canSelf ? "klant" : "styliste");
  const [stylists, setStylists] = useState<{ id: string; name: string; meet_url: string | null }[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylistId, setStylistId] = useState<string>(defaultStylistId ?? "");
  const [service, setService] = useState<"pre_sample" | "post_sample">("pre_sample");
  const [slots, setSlots] = useState<string[] | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [anders, setAnders] = useState(false);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [state, setState] = useState<"idle" | "busy">("idle");
  const [err, setErr] = useState<string | null>(null);

  // Beheerder kiest uit alle stylisten; een styliste plant voor zichzelf.
  useEffect(() => {
    (async () => {
      const [{ data: adm }, { data: u }] = await Promise.all([supabase.rpc("is_admin"), supabase.auth.getUser()]);
      setIsAdmin(adm === true);
      const { data: st } = await supabase.from("stylists").select("id,name,email,meet_url").eq("active", true).order("name");
      const list = ((st as { id: string; name: string; email: string; meet_url: string | null }[]) ?? []);
      const mine = list.filter((x) => adm === true || x.email?.toLowerCase() === (u?.user?.email ?? "").toLowerCase());
      setStylists(mine);
      if (!defaultStylistId && mine.length === 1) setStylistId(mine[0].id);
    })();
  }, [defaultStylistId]);

  useEffect(() => {
    if (!stylistId) { setSlots(null); return; }
    setSlots(null); setPick(null);
    const from = new Date(); const to = new Date(); to.setDate(to.getDate() + 21);
    supabase.rpc("stylist_free_slots", { p_stylist_id: stylistId, p_from: isoDate(from), p_to: isoDate(to), p_service_key: service })
      .then(({ data }) => setSlots(((data as { start_at: string }[]) ?? []).map((x) => x.start_at)));
  }, [stylistId, service]);

  const byDay = useMemo(() => (slots ?? []).reduce<Record<string, string[]>>((acc, s) => { (acc[dayKey(s)] ??= []).push(s); return acc; }, {}), [slots]);
  const start = anders ? nlToIso(date, time) : pick;
  const zelf = wie === "klant";
  const chosen = stylists.find((s) => s.id === stylistId);
  const geenLink = !!chosen && !chosen.meet_url?.trim();

  const submit = async () => {
    setErr(null);
    if (!stylistId) { setErr("Kies een styliste."); return; }
    if (geenLink) { setErr("Deze styliste heeft nog geen videolink. Vul die eerst in bij Agenda."); return; }
    if (!zelf && !start) { setErr("Kies een moment."); return; }
    setState("busy");
    const res = zelf
      ? mode === "plan"
        ? await supabase.rpc("booking_invite_self", { p_booking_id: bookingId, p_stylist_id: stylistId, p_service_key: service })
        : await supabase.rpc("invite_customer", { p_name: name, p_email: email, p_phone: phone, p_stylist_id: stylistId, p_start: null, p_service_key: service })
      : mode === "plan"
        ? await supabase.rpc("plan_moment", { p_booking_id: bookingId, p_stylist_id: stylistId, p_start: start, p_service_key: service })
        : await supabase.rpc("invite_customer", { p_name: name, p_email: email, p_phone: phone, p_stylist_id: stylistId, p_start: start, p_service_key: service });
    if (res.error) { setState("idle"); setErr(res.error.message); return; }
    const id = (res.data as string) ?? bookingId!;
    const { data } = await supabase.functions.invoke("booking", { body: { action: "uitnodiging_verstuur", booking_id: id } });
    setState("idle");
    if (!(data as { ok?: boolean } | null)?.ok) { setErr(zelf ? "De klant staat klaar, maar de uitnodiging kon niet worden verstuurd. Probeer het via de klantkaart opnieuw." : "Het moment staat vast, maar de uitnodiging kon niet worden verstuurd. Probeer het via de klantkaart opnieuw."); onDone(id); return; }
    onDone(id);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 85, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="rd-card-white" onClick={(e) => e.stopPropagation()} style={{ width: "min(640px, 100%)", maxHeight: "92vh", overflow: "auto", padding: 22, display: "flex", flexDirection: "column", gap: 14 }}>
        <div>
          <strong style={{ fontSize: 18 }}>{mode === "plan" ? `Plan een moment${customerName ? ` met ${customerName}` : ""}` : "Klant uitnodigen"}</strong>
          <p className="rd-sub" style={{ margin: "4px 0 0", fontSize: 14 }}>Voor gratis advies of een klant via via.</p>
        </div>

        {canSelf && (
          <div role="radiogroup" aria-label="Wie kiest het moment?" style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
            {([["klant", "Klant kiest zelf een moment", "De klant krijgt een mail met een link naar jouw agenda."], ["styliste", "Ik kies een moment", "De klant krijgt een bevestiging met het moment en de videolink."]] as const).map(([k, t, sub]) => (
              <button key={k} role="radio" aria-checked={wie === k} className={`rd-plan-chip${wie === k ? " is-on" : ""}`} onClick={() => setWie(k)}
                style={{ textAlign: "left", padding: "10px 14px", minHeight: 44, display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 2, borderRadius: 14 }}>
                <strong style={{ fontSize: 14 }}>{t}</strong>
                <span style={{ fontSize: 12.5, opacity: 0.75, fontWeight: 400 }}>{sub}</span>
              </button>
            ))}
          </div>
        )}

        {mode === "invite" && (
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Naam</span><input className="rd-input" value={name} onChange={(e) => setName(e.target.value)} style={{ height: 44 }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">E-mailadres</span><input className="rd-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ height: 44 }} /></label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}><span className="kk-label">Telefoon (optioneel)</span><input className="rd-input" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ height: 44 }} /></label>
          </div>
        )}

        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="kk-label">Styliste</span>
            <select className="rd-input" value={stylistId} onChange={(e) => setStylistId(e.target.value)} disabled={!isAdmin && stylists.length <= 1} style={{ height: 44 }}>
              <option value="">Kies een styliste</option>
              {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}{s.meet_url?.trim() ? "" : " (nog geen videolink)"}</option>)}
            </select>
          </label>
          <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span className="kk-label">Soort gesprek</span>
            <select className="rd-input" value={service} onChange={(e) => setService(e.target.value as "pre_sample" | "post_sample")} style={{ height: 44 }}>
              <option value="pre_sample">Kleuradvies (nog geen samples)</option>
              <option value="post_sample">Kleuradvies na samples</option>
            </select>
          </label>
        </div>

        {geenLink && (
          <div role="status" style={{ fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "var(--rd-lavender)" }}>
            <strong>{chosen?.name} heeft nog geen videolink.</strong> Zonder link krijgt de klant geen knop om het gesprek te openen. Vul de link eerst in bij <a href="/beheer/agenda">Agenda</a>.
          </div>
        )}

        {stylistId && !zelf && !geenLink && (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
              <span className="kk-label">{anders ? "Ander moment" : "Vrije plekken in het rooster (3 weken)"}</span>
              <button className="rd-textlink" onClick={() => { setAnders((v) => !v); setPick(null); }}>{anders ? "Kies uit het rooster" : "Ander moment"}</button>
            </div>
            {anders ? (
              <div style={{ display: "flex", gap: 10, marginTop: 6, flexWrap: "wrap" }}>
                <input className="rd-input" type="date" value={date} min={isoDate(new Date())} onChange={(e) => setDate(e.target.value)} style={{ height: 44, flex: "1 1 160px" }} />
                <input className="rd-input" type="time" value={time} step={900} onChange={(e) => setTime(e.target.value)} style={{ height: 44, flex: "0 1 140px" }} />
              </div>
            ) : slots === null ? <p className="rd-sub" style={{ margin: "6px 0 0" }}>Rooster laden...</p> : slots.length === 0 ? (
              <p className="rd-sub" style={{ margin: "6px 0 0" }}>Geen vrije plekken in het rooster. Kies "Ander moment".</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6, maxHeight: 260, overflowY: "auto" }}>
                {Object.entries(byDay).map(([d, list]) => (
                  <div key={d}>
                    <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4, textTransform: "capitalize" }}>{dayLabel(list[0])}</div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {list.map((s) => <button key={s} className={`rd-plan-chip${pick === s ? " is-on" : ""}`} aria-pressed={pick === s} onClick={() => setPick(s)} style={{ minHeight: 38 }}>{timeLabel(s)}</button>)}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {err && <span role="status" style={{ fontSize: 14, fontWeight: 600, color: "var(--rd-pink-dark)" }}>{err}</span>}
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <button className="rd-btn rd-btn-primary" onClick={submit} disabled={state === "busy" || geenLink} style={{ width: "auto", padding: "0 22px", minHeight: 44 }}>{state === "busy" ? "Bezig..." : zelf ? "Verstuur uitnodiging" : mode === "plan" ? "Plan en verstuur bevestiging" : "Nodig uit"}</button>
          <button className="rd-textlink" onClick={onClose}>Annuleren</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
