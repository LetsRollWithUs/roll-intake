import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { SURFACES } from "@/data/intake-options";
import { SampleComposer } from "./SampleComposer";
import { roomIdFor } from "./roomMatch";
import { TrashIcon, iconBtn } from "./icons";
import type { AdviceRoom, AdvicePhase, AdviceProduct } from "./types";

const colorByName = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c]));
const SURF_LABEL: Record<string, string> = Object.fromEntries(SURFACES.map((s) => [s.key, s.label]));
const emptyRoom = (room = "", surface = ""): AdviceRoom => ({ room, surface, color: "", status: "voorgesteld", product: "Muurverf", m2: "", liters: "", motivation: "" });
const isWood = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
// Rijen voorvullen vanuit de intake: één regel per ruimte met het belangrijkste oppervlak.
function seedRooms(roomSeeds: RoomSeed[]): AdviceRoom[] {
  if (!roomSeeds.length) return [emptyRoom()];
  return roomSeeds.map((r) => {
    const s = r.surfaces ?? [];
    const primary = s.includes("muren") ? "muren" : s[0];
    return { ...emptyRoom(r.label, primary ? SURF_LABEL[primary] ?? primary : ""), room_id: r.id };
  });
}
export interface RoomSeed { id: string; label: string; surfaces: string[] }
const DEFAULT_SAMPLE_INSTRUCTION =
  "Test de samples op twee plekken in de ruimte en bekijk ze op verschillende momenten van de dag, zeker in het licht waarin je de ruimte het meest gebruikt.";

const VERF_ROUTES: { key: "zelf" | "roll"; label: string; hint: string }[] = [
  { key: "zelf", label: "Klant bestelt zelf", hint: "De mail linkt per kleur naar de kleurpagina op roll.nl." },
  { key: "roll", label: "Roll maakt een offerte", hint: "Maak de offerte hieronder bij Maten & offerte." },
];

export function buildMail(opts: { customerName: string; stylistName: string; phase: AdvicePhase }): { subject: string; body: string } {
  const a = opts.phase;
  const first = (opts.customerName || "").trim().split(/\s+/)[0] || "";
  const lines: string[] = [`Hoi ${first || "daar"},`, ""];
  if (a.answer.trim()) { lines.push(a.answer.trim()); lines.push(""); }
  const rooms = a.rooms.filter((r) => r.room.trim() || r.color.trim());
  if (rooms.length) {
    lines.push(a.route === "samples" ? "De kleuren die ik je aanraad om te testen:" : "Jouw kleuren:");
    for (const r of rooms) {
      const where = [r.room, r.surface].filter((x) => x.trim()).join(", ");
      lines.push(`- ${where || "Ruimte"}: ${r.color || "nog te kiezen"}${r.motivation.trim() ? `. ${r.motivation.trim()}` : ""}`);
    }
    lines.push("");
  }
  if (a.route === "samples") {
    lines.push(a.sample_instruction?.trim() || DEFAULT_SAMPLE_INSTRUCTION);
    lines.push("Je bestelt de samples via de knoppen in deze mail.");
  } else if (a.route === "zelf") {
    lines.push("Je bestelt de verf via de kleurpagina's in deze mail. Twijfel je over de hoeveelheid? Gebruik de prijsopgave of stuur me een berichtje.");
  } else {
    lines.push("Roll maakt een offerte voor je op basis van je ruimtes. Je hoort binnenkort van ons.");
  }
  if (a.next_step?.trim()) { lines.push(""); lines.push(a.next_step.trim()); }
  lines.push("", "Veel plezier met kiezen!", opts.stylistName ? `${opts.stylistName}, kleuradviseur bij Roll` : "Team Roll");
  return { subject: a.route === "samples" ? "Jouw kleuradvies en samples van Roll" : "Jouw kleuradvies van Roll", body: lines.join("\n") };
}

interface Props {
  intakeId: string;
  phase: "sample" | "verf";
  value: AdvicePhase | null;
  bookingId: string;
  customerName: string;
  stylistName: string;
  roomSeeds: RoomSeed[];
  sentAt: string | null;
  onSaved: (bundle: AdvicePhase) => void;
  onSent: () => void;
}

export function AdviceEditor({ intakeId, phase, value, bookingId, customerName, stylistName, roomSeeds, sentAt, onSaved, onSent }: Props) {
  const isSample = phase === "sample";
  const init: AdvicePhase = value ?? {
    answer: "", rooms: seedRooms(roomSeeds),
    sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" },
    route: isSample ? "samples" : "zelf", products: [],
  };
  const [advice, setAdvice] = useState<AdvicePhase>(init);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);
  const [subject, setSubject] = useState("");
  const [bodyText, setBodyText] = useState("");
  const [sending, setSending] = useState(false);

  const set = (p: Partial<AdvicePhase>) => setAdvice((a) => ({ ...a, ...p }));
  const setRoom = (i: number, p: Partial<AdviceRoom>) => setAdvice((a) => ({ ...a, rooms: a.rooms.map((r, idx) => (idx === i ? { ...r, ...p } : r)) }));
  const addRoom = () => setAdvice((a) => {
    // Bij samples: nieuwe regel in dezelfde ruimte als de laatste, voor een extra testkleur.
    const last = a.rooms[a.rooms.length - 1];
    const row = isSample && last ? { ...emptyRoom(last.room, last.surface), room_id: last.room_id } : emptyRoom();
    return { ...a, rooms: [...a.rooms, row] };
  });
  const delRoom = (i: number) => setAdvice((a) => ({ ...a, rooms: a.rooms.filter((_, idx) => idx !== i) }));
  const flash = (t: string) => { setMsg(t); setTimeout(() => setMsg(null), 2500); };

  const candidates = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; hex: string }>();
    for (const r of advice.rooms) { const c = colorByName.get((r.color ?? "").trim().toLowerCase()); if (c && !seen.has(c.id)) seen.set(c.id, { id: c.id, name: c.name, hex: c.hex }); }
    return [...seen.values()];
  }, [advice.rooms]);
  // Sample-producten volgen de kleuren in de rijen (standaard sticker); bundels blijven staan.
  const syncedProducts = useMemo<AdviceProduct[]>(() => {
    if (!isSample) return advice.products;
    const kindOf = new Map(advice.products.filter((p) => p.kind !== "pack").map((p) => [p.ref, p.kind]));
    return [
      ...candidates.map((c) => ({ kind: kindOf.get(c.id) ?? "sticker", ref: c.id, name: c.name }) as AdviceProduct),
      ...advice.products.filter((p) => p.kind === "pack"),
    ];
  }, [advice.products, candidates, isSample]);

  const outcome = isSample ? "samples_needed" : advice.route === "zelf" ? "color_chosen" : "followup_needed";
  const persist = async () => {
    // Status en product volgen uit de fase en het oppervlak; de styliste hoeft ze niet te kiezen.
    const rooms = advice.rooms
      .filter((r) => r.room.trim() || r.color.trim())
      .map((r) => ({ ...r, status: (isSample ? "voorgesteld" : "definitief") as AdviceRoom["status"], product: isWood(r.surface) ? "Lak" : "Muurverf" }));
    const clean = { ...advice, rooms, products: syncedProducts };
    const patch: Record<string, unknown> = {
      [`advice_${phase}`]: clean,
      followup_route: clean.route,
      advisor_summary: clean.answer.trim() || null,
      advisor_advice: clean.rooms.map((r) => ({ room: [r.room, r.surface].filter((x) => x.trim()).join(" · "), color: r.color, product: r.product, liters: r.liters, m2: r.m2 })),
      advisor_outcome: outcome,
      advisor_updated_at: new Date().toISOString(),
    };
    const { error } = await supabase.from("intake").update(patch).eq("id", intakeId);
    if (!error) onSaved(clean);
    return !error;
  };
  const save = async () => { setSaving(true); const ok = await persist(); setSaving(false); flash(ok ? "Concept opgeslagen ✓" : "Opslaan mislukte."); };

  const openPreview = async () => {
    if (!(await persist())) { flash("Opslaan mislukte."); return; }
    const m = buildMail({ customerName, stylistName, phase: advice });
    setSubject(m.subject); setBodyText(m.body); setPreview(true);
  };
  const send = async () => {
    setSending(true);
    const { data, error } = await supabase.functions.invoke("booking", { body: { action: "advies_done", intake_id: intakeId, booking_id: bookingId, phase, route: advice.route, subject, body: bodyText } });
    setSending(false);
    if (error || !(data as { ok?: boolean } | null)?.ok) { flash("Versturen lukte niet."); return; }
    // Opvolgtaak automatisch: samples -> check-in na het gesprek, zelf bestellen -> check of de verf besteld is.
    const { data: u } = await supabase.auth.getUser();
    const { data: bk } = await supabase.from("bookings").select("stylist_id,start_at").eq("id", bookingId).maybeSingle();
    const sid = (bk as { stylist_id: string | null } | null)?.stylist_id ?? null;
    const startAt = (bk as { start_at: string } | null)?.start_at ?? new Date().toISOString();
    const row = (() => {
      if (advice.route === "samples") { const d = new Date(startAt); d.setDate(d.getDate() + 10); return { action: "Check hoe de samples bevallen", kind: "sample_checkin", due: d }; }
      if (advice.route === "zelf") { const d = new Date(); d.setDate(d.getDate() + 14); return { action: "Check of de verf besteld is", kind: "algemeen", due: d }; }
      return null;
    })();
    if (row) {
      const { data: existing } = await supabase.from("followup_tasks").select("action").eq("booking_id", bookingId).is("done_at", null);
      if (!((existing as { action: string }[]) ?? []).some((t) => t.action === row.action)) {
        await supabase.from("followup_tasks").insert({ booking_id: bookingId, stylist_id: sid, action: row.action, owner: "styliste", due_date: row.due.toISOString().slice(0, 10), kind: row.kind, created_by: u?.user?.email ?? null });
      }
    }
    setPreview(false); flash("Advies verstuurd ✓"); onSent();
  };

  const label = (t: string) => <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>{t}</span>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
      <datalist id="advice-roll-colors">{rollColors.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <datalist id={`advice-rooms-${phase}`}>{roomSeeds.map((r) => <option key={r.id} value={r.label} />)}</datalist>

      {/* Kleuren per ruimte */}
      <div>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 2 }}>{isSample ? "Kleuren om te testen" : "Definitieve kleuren"}</div>
        <p className="rd-sub" style={{ margin: "0 0 10px", fontSize: 13 }}>{isSample ? "Per ruimte de kleuren die de klant thuis test. Meerdere kleuren voor één ruimte? Voeg een regel toe." : "Per ruimte en oppervlak de gekozen kleur."}</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {advice.rooms.map((r, i) => {
            const c = colorByName.get((r.color ?? "").trim().toLowerCase());
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: isSample ? "minmax(120px,1fr) minmax(160px,1.4fr) auto" : "minmax(110px,1fr) minmax(110px,1fr) minmax(140px,1.2fr) auto", gap: 8, alignItems: "center", padding: "8px 10px", borderRadius: 12, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)" }}>
                <input className="rd-input" list={`advice-rooms-${phase}`} value={r.room} onChange={(e) => setRoom(i, { room: e.target.value, room_id: roomIdFor(e.target.value, roomSeeds) ?? r.room_id })} placeholder="Ruimte" aria-label="Ruimte" style={{ height: 38 }} />
                {!isSample && <input className="rd-input" value={r.surface} onChange={(e) => setRoom(i, { surface: e.target.value })} placeholder="Oppervlak" aria-label="Oppervlak" style={{ height: 38 }} />}
                <div style={{ position: "relative" }}>
                  {c && <span style={{ position: "absolute", left: 10, top: 11, width: 16, height: 16, borderRadius: 5, background: c.hex, border: "1px solid rgba(0,0,0,.15)" }} />}
                  <input className="rd-input" list="advice-roll-colors" value={r.color} onChange={(e) => setRoom(i, { color: e.target.value })} placeholder="Kleur" aria-label="Kleur" style={{ height: 38, paddingLeft: c ? 32 : undefined }} />
                </div>
                <button onClick={() => delRoom(i)} aria-label="Regel verwijderen" title="Verwijderen" style={iconBtn}><TrashIcon /></button>
                {!isSample && <input className="rd-input" value={r.motivation} onChange={(e) => setRoom(i, { motivation: e.target.value })} placeholder="Waarom deze kleur hier werkt (optioneel, komt in de mail)" aria-label="Toelichting" style={{ height: 34, gridColumn: "1 / -1", fontSize: 13 }} />}
              </div>
            );
          })}
          <button className="rd-textlink" onClick={addRoom} style={{ minHeight: 34, alignSelf: "flex-start" }}>{isSample ? "+ Kleur toevoegen" : "+ Ruimte of oppervlak"}</button>
        </div>
      </div>

      {isSample && <SampleComposer colors={candidates} value={syncedProducts} onChange={(p) => set({ products: p })} />}

      {!isSample && (
        <div>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Hoe bestelt de klant?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {VERF_ROUTES.map((r) => (
              <label key={r.key} style={{ flex: "1 1 220px", display: "flex", gap: 10, alignItems: "flex-start", padding: "8px 10px", borderRadius: 10, border: `1.5px solid ${advice.route === r.key ? "var(--rd-aubergine)" : "var(--rd-line)"}`, background: advice.route === r.key ? "var(--rd-grey-light)" : "transparent", cursor: "pointer" }}>
                <input type="radio" name={`route-${phase}`} checked={advice.route === r.key} onChange={() => set({ route: r.key })} style={{ marginTop: 3 }} />
                <span><strong style={{ fontSize: 14 }}>{r.label}</strong><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>{r.hint}</span></span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Eén bericht */}
      <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
        {label("Persoonlijk bericht aan de klant")}
        <textarea className="rd-input" value={advice.answer} onChange={(e) => set({ answer: e.target.value })}
          placeholder={isSample ? "Bijv. Je zoekt warm en rustig; deze kleuren passen mooi bij jouw avondlicht." : "Bijv. Wat fijn dat je gekozen hebt. Zo bestel je je verf."}
          style={{ height: 80, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
        <span style={{ fontSize: 12, opacity: 0.6 }}>De kleuren, {isSample ? "de testtips" : "de bestellinks"} en je ondertekening voegen we zelf toe. Je ziet alles in de preview.</span>
      </label>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-outline" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 20px" }}>{saving ? "Opslaan..." : "Opslaan"}</button>
        <button className="rd-btn rd-btn-primary" onClick={openPreview} style={{ width: "auto", padding: "0 20px" }}>Bekijk en verstuur</button>
        {sentAt && <span style={{ fontSize: 13, opacity: 0.65 }}>Verstuurd {new Date(sentAt).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>}
        {msg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</span>}
      </div>

      {preview && createPortal(
        <div style={{ position: "fixed", inset: 0, zIndex: 80, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }} onClick={() => setPreview(false)}>
          <div className="rd-card-white" style={{ width: "min(680px, 100%)", maxHeight: "90vh", overflow: "auto", padding: 20 }} onClick={(e) => e.stopPropagation()}>
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Dit ontvangt de klant ({isSample ? "sample-advies" : "verf-advies"})</div>
            <p className="rd-sub" style={{ margin: "0 0 12px", fontSize: 13 }}>Pas de tekst gerust aan; er gaat pas iets weg als je op versturen drukt. {isSample ? "De samples" : "De kleurlinks"} staan onder de tekst in de mail.</p>
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Onderwerp")}<input className="rd-input" value={subject} onChange={(e) => setSubject(e.target.value)} style={{ height: 40 }} /></label>
            <div style={{ height: 10 }} />
            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>{label("Bericht")}<textarea className="rd-input" value={bodyText} onChange={(e) => setBodyText(e.target.value)} style={{ height: 300, paddingTop: 10, resize: "vertical", lineHeight: 1.5, fontFamily: "inherit" }} /></label>
            <div style={{ display: "flex", gap: 10, marginTop: 14, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={send} disabled={sending} style={{ width: "auto", padding: "0 22px" }}>{sending ? "Versturen..." : "Advies versturen"}</button>
              <button className="rd-textlink" onClick={() => setPreview(false)}>Terug</button>
            </div>
          </div>
        </div>, document.body)}
    </div>
  );
}
