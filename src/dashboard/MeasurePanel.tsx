import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import type { DbRoom, IntakeRow, OfferMeta } from "./types";
import { buildTaskPayload, RollTaskStatus, type RollTask } from "./RollHelpForm";
import { TrashIcon, iconBtn } from "./icons";
import {
  calcRoom, calcProject, emptyMeasure, STANDAARD_HOOGTE, TRAP_M2, needsVoorstrijk, needsPrimer, needsRenovlies,
  type RoomMeasure, type MaterialLine,
} from "@/lib/verfcalc";

// Maten & offerte (styliste): ruimtes komen voor-ingevuld uit de intake. De styliste past maten aan,
// kiest de kleur per vlak, zet voorstrijk/primer/renovlies aan of uit en maakt de offerte.
// Het dashboard toont m² en aantallen; blikken per kleur en prijzen komen uit de offerte-tool.

const showWalls = (r: DbRoom) => (r.surfaces ?? []).includes("muren");
const showCeiling = (r: DbRoom) => (r.surfaces ?? []).includes("plafond");
const showWood = (r: DbRoom) => (r.surfaces ?? []).some((s) => ["kozijnen", "deuren", "houtwerk"].includes(s));
const isWoodS = (s: string) => /kozijn|deur|houtwerk|plint|lak|trap/i.test(s);
const isCeilS = (s: string) => /plafond/i.test(s);
const HEX = new Map(rollColors.map((c) => [c.name.trim().toLowerCase(), c.hex]));
const hexOf = (n?: string) => HEX.get((n ?? "").trim().toLowerCase());
const g = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

type ColorEntry = { surface: string; color: string; hex?: string };
// Standaardkleuren per vlak uit het verf-advies: muren, plafond en houtwerk.
function defaultsFor(list: ColorEntry[]) {
  return {
    muur: list.find((c) => !isWoodS(c.surface) && !isCeilS(c.surface))?.color ?? "",
    plafond: list.find((c) => isCeilS(c.surface))?.color ?? "",
    hout: list.find((c) => isWoodS(c.surface))?.color ?? "",
  };
}
function withDefaults(m: RoomMeasure, d: ReturnType<typeof defaultsFor>): RoomMeasure {
  return {
    ...m,
    walls: m.walls.map((w) => ({ ...w, color: (w.color ?? "").trim() || d.muur || undefined })),
    ceiling_color: (m.ceiling_color ?? "").trim() || d.plafond || undefined,
    wood_color: (m.wood_color ?? "").trim() || d.hout || undefined,
  };
}

interface Props {
  intake: IntakeRow;
  bookingId: string;
  stylistId: string | null;
  rooms: DbRoom[];
  value: Record<string, RoomMeasure> | null;
  offerUrl: string | null;
  colorsByRoom: Record<string, ColorEntry[]>;
  task: RollTask | null;
  onSaved: (next: Record<string, RoomMeasure>) => void;
  onOffer: (url: string, meta: OfferMeta) => void;
  onTask: (t: RollTask) => void;
}

export function MeasurePanel({ intake, bookingId, stylistId, rooms, value, offerUrl, colorsByRoom, task, onSaved, onOffer, onTask }: Props) {
  const intakeId = intake.id;
  const measured = rooms.filter((r) => showWalls(r) || showCeiling(r) || showWood(r));
  const [map, setMap] = useState<Record<string, RoomMeasure>>(() => {
    const m: Record<string, RoomMeasure> = {};
    for (const r of measured) m[r.id] = value?.[r.id] ?? { ...emptyMeasure(), walls: showWalls(r) ? [{ w: 0, h: STANDAARD_HOOGTE }] : [] };
    return m;
  });
  const [toolsInCart, setToolsInCart] = useState<boolean>(intake.offer_meta?.tools_in_cart ?? true);
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState(offerUrl ?? "");
  const [linkErr, setLinkErr] = useState<string | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);

  // Offerte handmatig gemaakt via roll.nl/offerte: link plakken, dan gebruikt de opvolgmail die.
  const saveLink = async () => {
    const url = linkDraft.trim();
    setLinkErr(null);
    if (url && !/^https:\/\/\S+$/i.test(url)) { setLinkErr("Plak een volledige link die begint met https://"); return; }
    setLinkBusy(true);
    const { error } = await supabase.from("intake").update({ advisor_offer_url: url || null }).eq("id", intakeId);
    setLinkBusy(false);
    if (error) { setLinkErr("Opslaan lukte niet. Probeer het nog eens."); return; }
    onOffer(url, intake.offer_meta ?? { tools_in_cart: toolsInCart });
    setLinkOpen(false);
  };

  const setRoom = (id: string, p: Partial<RoomMeasure>) => setMap((m) => ({ ...m, [id]: { ...m[id], ...p } }));
  const defaults = useMemo(() => Object.fromEntries(measured.map((r) => [r.id, defaultsFor(colorsByRoom[r.id] ?? [])])), [measured, colorsByRoom]);
  // Met de standaardkleuren ingevuld: zo rekent en bewaart het dashboard.
  const effective = useMemo(() => Object.fromEntries(measured.map((r) => [r.id, withDefaults(map[r.id], defaults[r.id])])) as Record<string, RoomMeasure>, [map, defaults, measured]);
  const project = useMemo(() => calcProject(measured.map((r) => effective[r.id])), [effective, measured]);

  const persist = async () => {
    const { error } = await supabase.from("intake").update({ room_measures: effective }).eq("id", intakeId);
    if (!error) onSaved(effective);
    return !error;
  };
  const save = async () => { setSaving(true); const ok = await persist(); setSaving(false); setMsg(ok ? "Opgeslagen ✓" : "Opslaan mislukte."); setTimeout(() => setMsg(null), 2500); };

  const createRollTask = async (type: RollTask["type"], note: string) => {
    const { data: u } = await supabase.auth.getUser();
    const due = new Date(); due.setDate(due.getDate() + 3);
    const payload = buildTaskPayload({ ...intake, room_measures: effective }, note);
    const { data, error } = await supabase.from("roll_tasks").insert({
      type, booking_id: bookingId, intake_id: intakeId, stylist_id: stylistId,
      requested_by: u?.user?.email ?? null, due_date: due.toISOString().slice(0, 10), payload,
    }).select("id,type,status,owner,due_date,payload,result,created_at,updated_at").single();
    if (error || !data) return false;
    onTask(data as RollTask);
    return true;
  };

  // "Maak offerte": de offerte-tool maakt de offerte (prijzen live). Staat de koppeling nog uit,
  // dan gaat de aanvraag als taak naar Roll, zodat er niets blijft liggen.
  const makeOffer = async () => {
    setBusy(true); setOfferMsg(null);
    if (!(await persist())) { setBusy(false); setOfferMsg("Opslaan van de maten mislukte."); return; }
    const { data } = await supabase.functions.invoke("booking", { body: { action: "offerte_create", intake_id: intakeId, booking_id: bookingId, tools_in_cart: toolsInCart, notes: notes.trim() } });
    const d = data as { ok?: boolean; offer_url?: string | null; nummer?: string; id?: number; skipped?: string; error?: string } | null;
    if (d?.ok && d.offer_url) {
      setBusy(false);
      onOffer(d.offer_url, { tools_in_cart: toolsInCart, id: d.id, nummer: d.nummer, edit_url: d.offer_url, at: new Date().toISOString() });
      setOfferMsg(`Offerte ${d.nummer ?? ""} is aangemaakt ✓`);
      return;
    }
    if (d?.skipped === "geen ruimtes met maten") { setBusy(false); setOfferMsg("Vul eerst de maten in, of laat Roll meekijken."); return; }
    const ok = await createRollTask("offerte", [notes.trim(), toolsInCart ? "Tools mee in het mandje." : "Tools los in de mail (niet in het mandje)."].filter(Boolean).join(" "));
    setBusy(false);
    const reason = d?.skipped === "offerte-tool endpoint niet gekoppeld" ? "De koppeling met de offerte-tool staat nog uit" : `De offerte-tool gaf een fout${d?.error ? ` (${d.error})` : ""}`;
    setOfferMsg(ok ? `${reason}; Roll maakt de offerte en stuurt die naar de klant.` : "Aanvragen lukte niet. Probeer het opnieuw.");
  };
  const askRoll = async () => {
    setBusy(true); setOfferMsg(null);
    await persist();
    const ok = await createRollTask("contact", ["Te groot of hele huis: Roll stelt de offerte samen met de klant.", notes.trim()].filter(Boolean).join(" "));
    setBusy(false);
    setOfferMsg(ok ? "Roll neemt contact op met de klant en stelt de offerte samen op." : "Aanvragen lukte niet. Probeer het opnieuw.");
  };

  if (measured.length === 0) return <p className="rd-sub" style={{ margin: 0 }}>Geen ruimtes met te verven oppervlakken in de intake.</p>;

  const numField = (label: string, val: number, on: (n: number) => void, ph = "", w = 84) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
      <input className="rd-input" inputMode="decimal" value={val || ""} placeholder={ph}
        onChange={(e) => on(parseFloat(e.target.value.replace(",", ".")) || 0)} style={{ height: 36, width: w }} />
    </label>
  );
  const colorField = (val: string | undefined, placeholder: string, on: (v: string) => void) => {
    const shown = (val ?? "").trim() || placeholder;
    return (
      <label style={{ display: "flex", flexDirection: "column", gap: 3, flex: "1 1 150px", minWidth: 140 }}>
        <span style={{ fontSize: 11, opacity: 0.6 }}>kleur</span>
        <span style={{ position: "relative" }}>
          <span style={{ position: "absolute", left: 9, top: 10, width: 16, height: 16, borderRadius: 5, background: hexOf(shown) ?? "transparent", border: hexOf(shown) ? "1px solid rgba(0,0,0,.15)" : "1px dashed rgba(0,0,0,.25)" }} />
          <input className="rd-input" list="mp-colors" value={val ?? ""} placeholder={placeholder || "Kleur kiezen"} onChange={(e) => on(e.target.value)} style={{ height: 36, paddingLeft: 32, width: "100%" }} />
        </span>
      </label>
    );
  };
  const fmtPack = (m: MaterialLine) => m.blikken.length
    ? m.blikken.map((b) => (m.packUnit === "m" ? `${b.count}× rol ${g(b.size)} m` : `${b.count}× ${g(b.size)} L`)).join(" + ")
    : `${g(m.amount)} ${m.unit}`;
  const matLine = (m: MaterialLine) => (
    <div key={`${m.key}-${m.color ?? ""}`} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0" }}>
      <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
        {m.color && <span style={{ width: 12, height: 12, borderRadius: 4, background: hexOf(m.color) ?? "#eee", border: "1px solid rgba(0,0,0,.12)" }} />}
        {m.label}{m.blikken.length ? <span style={{ opacity: 0.55 }}> · {g(m.amount)} {m.unit}</span> : ""}
      </span>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{m.key === "muurverf" ? `${g(m.amount)} L` : fmtPack(m)}</span>
    </div>
  );
  const toggle = (label: string, on: boolean, auto: boolean, set: (v: boolean) => void, hint: string) => (
    <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13, padding: "5px 10px", borderRadius: 99, border: `1px solid ${on ? "var(--rd-aubergine)" : "var(--rd-line)"}`, background: on ? "var(--rd-grey-light)" : "transparent", cursor: "pointer" }} title={hint}>
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      {label}{auto && <span style={{ fontSize: 11, opacity: 0.55 }}>(auto)</span>}
    </label>
  );
  const sectionLabel = (t: string) => <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6, marginBottom: 4 }}>{t}</div>;
  const extraName = { windows: "Raamkozijn", radiators: "Radiator", cabinets: "Kast" } as const;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <datalist id="mp-colors">{rollColors.map((c) => <option key={c.id} value={c.name} />)}</datalist>
      <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>De maten komen uit de intake; stel bij waar nodig (een schatting is prima). De kleuren staan al goed vanuit het verf-advies; zet per vlak een andere kleur voor bijvoorbeeld een accentwand.</p>

      {measured.map((r) => {
        const m = map[r.id];
        const d = defaults[r.id];
        const calc = calcRoom(effective[r.id]);
        return (
          <div key={r.id} className="rd-card-white" style={{ padding: 14, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)", display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{r.label}</strong>
              <span style={{ fontSize: 12, opacity: 0.65 }}>{[calc.wall_m2 > 0 && `wand ${g(calc.wall_m2)} m²`, calc.ceiling_m2 > 0 && `plafond ${g(calc.ceiling_m2)} m²`, calc.woodwork_m2 > 0 && `houtwerk ${g(calc.woodwork_m2)} m²`].filter(Boolean).join(" · ")}</span>
            </div>

            {showWalls(r) && (
              <div>
                {sectionLabel("Muren")}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.walls.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      {numField("breedte (m)", w.w, (n) => setRoom(r.id, { walls: m.walls.map((x, j) => j === i ? { ...x, w: n } : x) }), "11")}
                      {numField("hoogte (m)", w.h, (n) => setRoom(r.id, { walls: m.walls.map((x, j) => j === i ? { ...x, h: n } : x) }), "2,6")}
                      {colorField(w.color, d.muur, (v) => setRoom(r.id, { walls: m.walls.map((x, j) => j === i ? { ...x, color: v } : x) }))}
                      <button onClick={() => setRoom(r.id, { walls: m.walls.filter((_, j) => j !== i) })} aria-label="Muurvlak verwijderen" title="Verwijderen" style={iconBtn}><TrashIcon /></button>
                    </div>
                  ))}
                  <button className="rd-textlink" onClick={() => setRoom(r.id, { walls: [...m.walls, { w: 0, h: STANDAARD_HOOGTE }] })} style={{ alignSelf: "flex-start", fontSize: 13 }}>+ Muurvlak (bijv. accentwand)</button>
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                  <select className="rd-input" value={m.wall_substrate} onChange={(e) => setRoom(r.id, { wall_substrate: e.target.value as RoomMeasure["wall_substrate"] })} style={{ height: 34, width: 230, fontSize: 13 }}>
                    <option value="bestaand">Bestaande verflaag</option>
                    <option value="nieuw">Nieuw stucwerk / gipsplaat</option>
                  </select>
                  <select className="rd-input" value={m.wall_condition ?? "glad"} onChange={(e) => setRoom(r.id, { wall_condition: e.target.value as RoomMeasure["wall_condition"] })} style={{ height: 34, width: 230, fontSize: 13 }}>
                    <option value="glad">Muren glad</option>
                    <option value="oneffen">Muren oneffen</option>
                    <option value="scheuren">Scheuren / behang eraf</option>
                  </select>
                </div>
              </div>
            )}

            {showCeiling(r) && (
              <div>
                {sectionLabel("Plafond")}
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.ceilings.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end", flexWrap: "wrap" }}>
                      {numField("lengte (m)", c.l, (n) => setRoom(r.id, { ceilings: m.ceilings.map((x, j) => j === i ? { ...x, l: n } : x) }), "5")}
                      {numField("breedte (m)", c.b, (n) => setRoom(r.id, { ceilings: m.ceilings.map((x, j) => j === i ? { ...x, b: n } : x) }), "4")}
                      <button onClick={() => setRoom(r.id, { ceilings: m.ceilings.filter((_, j) => j !== i) })} aria-label="Plafondvlak verwijderen" title="Verwijderen" style={iconBtn}><TrashIcon /></button>
                    </div>
                  ))}
                  <button className="rd-textlink" onClick={() => setRoom(r.id, { ceilings: [...m.ceilings, { l: 0, b: 0 }] })} style={{ alignSelf: "flex-start", fontSize: 13 }}>+ Plafondvlak (bij L-vorm meerdere)</button>
                  {m.ceilings.length > 0 && <div style={{ maxWidth: 320 }}>{colorField(m.ceiling_color, d.plafond, (v) => setRoom(r.id, { ceiling_color: v }))}</div>}
                </div>
              </div>
            )}

            {showWood(r) && (
              <div>
                {sectionLabel("Houtwerk")}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {numField("deuren met kozijn", m.woodwork.doors, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, doors: n } }), "1", 120)}
                  {numField("plinten (m)", m.woodwork.plinths_m, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, plinths_m: n } }), "12")}
                  <label style={{ display: "flex", flexDirection: "column", gap: 3 }} title={`Standaard vaste trap: 13 treden van 80 cm met stootborden en trapbomen, ca. ${TRAP_M2} m² lakwerk (zonder leuning)`}>
                    <span style={{ fontSize: 11, opacity: 0.6 }}>trappen (standaard, {TRAP_M2} m²)</span>
                    <input className="rd-input" inputMode="numeric" value={m.woodwork.stairs || ""} placeholder="0" onChange={(e) => setRoom(r.id, { woodwork: { ...m.woodwork, stairs: parseInt(e.target.value, 10) || 0 } })} style={{ height: 36, width: 84 }} />
                  </label>
                  {colorField(m.wood_color, d.hout, (v) => setRoom(r.id, { wood_color: v }))}
                </div>
                {(["windows", "radiators", "cabinets"] as const).map((k) => (
                  m.woodwork[k].length > 0 && (
                    <div key={k} style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                      {m.woodwork[k].map((o, i) => (
                        <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                          <span style={{ fontSize: 12.5, width: 84, paddingBottom: 9 }}>{extraName[k]}</span>
                          {numField("breedte (m)", o.w, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, [k]: m.woodwork[k].map((x, j) => j === i ? { ...x, w: n } : x) } }), "1,2")}
                          {numField("hoogte (m)", o.h, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, [k]: m.woodwork[k].map((x, j) => j === i ? { ...x, h: n } : x) } }), "1,4")}
                          <button onClick={() => setRoom(r.id, { woodwork: { ...m.woodwork, [k]: m.woodwork[k].filter((_, j) => j !== i) } })} aria-label={`${extraName[k]} verwijderen`} title="Verwijderen" style={iconBtn}><TrashIcon /></button>
                        </div>
                      ))}
                    </div>
                  )
                ))}
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 6 }}>
                  {(["windows", "radiators", "cabinets"] as const).map((k) => (
                    <button key={k} className="rd-textlink" style={{ fontSize: 13 }} onClick={() => setRoom(r.id, { woodwork: { ...m.woodwork, [k]: [...m.woodwork[k], { w: 0, h: 0 }] } })}>+ {extraName[k]}</button>
                  ))}
                </div>
                <select className="rd-input" value={m.wood_substrate} onChange={(e) => setRoom(r.id, { wood_substrate: e.target.value as RoomMeasure["wood_substrate"] })} style={{ height: 34, width: 230, fontSize: 13, marginTop: 8 }}>
                  <option value="gelakt">Houtwerk al gelakt</option>
                  <option value="kaal">Kaal hout of metaal</option>
                </select>
              </div>
            )}

            {/* Voorbehandeling en lagen */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {(showWalls(r) || showCeiling(r)) && toggle("Voorstrijk", needsVoorstrijk(m), m.voorstrijk === undefined, (v) => setRoom(r.id, { voorstrijk: v }), "Standaard aan bij nieuw stucwerk of gipsplaat")}
              {showWood(r) && toggle("Primer", needsPrimer(m), m.primer === undefined, (v) => setRoom(r.id, { primer: v }), "Standaard aan bij kaal hout of metaal")}
              {showWalls(r) && toggle("Renovlies", needsRenovlies(m), m.renovlies === undefined, (v) => setRoom(r.id, { renovlies: v }), "Standaard aan bij oneffen muren, scheuren of als het behang eraf gaat")}
              <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 13 }}>
                lagen <input className="rd-input" inputMode="numeric" value={m.coats || ""} onChange={(e) => setRoom(r.id, { coats: parseInt(e.target.value, 10) || 2 })} style={{ height: 32, width: 52 }} />
              </label>
            </div>

            {calc.materials.length > 0 && (
              <div style={{ padding: "8px 12px", background: "var(--rd-grey-light)", borderRadius: 10 }}>
                <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Materialen</div>
                {calc.materials.map(matLine)}
              </div>
            )}
          </div>
        );
      })}

      {/* Projecttotaal */}
      <div className="rd-card-white" style={{ padding: 14, border: "1.5px solid var(--rd-aubergine)" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Totaal project</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>Wand {g(project.wall_m2)} m² · plafond {g(project.ceiling_m2)} m² · houtwerk {g(project.woodwork_m2)} m²</div>
        {project.paint.map(matLine)}
        {[project.voorstrijk, project.primer, project.renovlies, project.lijm].filter((x): x is MaterialLine => !!x).map(matLine)}
        <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Verf is gebundeld per kleur; voorstrijk, primer, renovlies en lijm op de opgetelde m². Blikken per kleur en prijzen maakt de offerte-tool.</p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <button className="rd-btn rd-btn-outline" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 20px" }}>{saving ? "Opslaan..." : "Opslaan"}</button>
        {msg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</span>}
      </div>

      {/* Offerte */}
      <div style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 14, display: "flex", flexDirection: "column", gap: 10 }}>
        <div className="rd-kicker rd-kicker-pink">Offerte</div>
        {offerUrl && (
          <div style={{ fontSize: 14 }}>
            Offerte{intake.offer_meta?.nummer ? ` ${intake.offer_meta.nummer}` : ""} is aangemaakt. <a href={offerUrl} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>Openen in de offerte-tool</a>
            <span style={{ fontSize: 12, opacity: 0.6 }}> (voor Roll-collega's)</span>
          </div>
        )}
        {task && <RollTaskStatus task={task} />}
        {!offerUrl && !task && (
          <>
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, cursor: "pointer" }}>
              <input type="checkbox" checked={toolsInCart} onChange={(e) => setToolsInCart(e.target.checked)} style={{ marginTop: 3 }} />
              <span><strong>Aanbevolen tools meenemen in het winkelmandje</strong><br /><span style={{ fontSize: 12.5, opacity: 0.7 }}>{toolsInCart ? "Rollers, kwasten en tape gaan mee met \"Alles in winkelmandje\"." : "De tools staan los in de mail onder \"Vergeet je tools niet\", niet in het mandje."}</span></span>
            </label>
            <input className="rd-input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Toelichting voor Roll (optioneel)" style={{ height: 38, fontSize: 13 }} />
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <button className="rd-btn rd-btn-primary" onClick={makeOffer} disabled={busy} style={{ width: "auto", padding: "0 22px" }}>{busy ? "Bezig..." : "Maak offerte"}</button>
              <button className="rd-textlink" onClick={askRoll} disabled={busy}>Te groot of hele huis? Laat Roll meekijken</button>
            </div>
            <p className="rd-sub" style={{ margin: 0, fontSize: 12 }}>De offerte-tool rekent de prijzen live uit de webshop. De klant krijgt een mail met de producten en "Alles in winkelmandje".</p>
          </>
        )}
        {offerMsg && <span style={{ color: "var(--rd-aubergine)", fontWeight: 600, fontSize: 13 }}>{offerMsg}</span>}
        {linkOpen ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <input className="rd-input" type="url" value={linkDraft} onChange={(e) => setLinkDraft(e.target.value)} placeholder="https://roll.nl/offerte/..." autoFocus style={{ height: 38, fontSize: 13, flex: "1 1 240px" }} />
              <button className="rd-btn rd-btn-outline" onClick={saveLink} disabled={linkBusy} style={{ width: "auto", padding: "0 18px", height: 38 }}>{linkBusy ? "Opslaan..." : "Link opslaan"}</button>
              <button className="rd-textlink" onClick={() => { setLinkOpen(false); setLinkDraft(offerUrl ?? ""); setLinkErr(null); }}>Annuleren</button>
            </div>
            <p className="rd-sub" style={{ margin: 0, fontSize: 12 }}>De opvolgmail voor verf stuurt de klant naar deze link. Laat leeg om de link weg te halen; de klant gaat dan naar de prijsopgave-pagina.</p>
            {linkErr && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 13 }}>{linkErr}</span>}
          </div>
        ) : (
          <button className="rd-textlink" style={{ alignSelf: "flex-start" }} onClick={() => { setLinkDraft(offerUrl ?? ""); setLinkOpen(true); }}>
            {offerUrl ? "Andere offertelink plakken" : "Offerte al gemaakt via roll.nl/offerte? Plak de link"}
          </button>
        )}
      </div>
    </div>
  );
}
