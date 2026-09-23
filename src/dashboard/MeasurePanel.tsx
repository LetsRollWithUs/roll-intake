import { useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { DbRoom } from "./types";
import {
  calcRoom, calcProject, emptyMeasure, STANDAARD_HOOGTE,
  type RoomMeasure, type BlikCombo, type MaterialLine,
} from "@/lib/verfcalc";

// Welke meetblokken bij een ruimte horen, afgeleid van de gekozen oppervlakken in de intake.
const showWalls = (r: DbRoom) => (r.surfaces ?? []).includes("muren");
const showCeiling = (r: DbRoom) => (r.surfaces ?? []).includes("plafond");
const showWood = (r: DbRoom) => (r.surfaces ?? []).some((s) => ["kozijnen", "deuren", "houtwerk"].includes(s));

const fmtBlik = (b: BlikCombo[]) => b.length ? b.map((x) => `${x.count}× ${String(x.size).replace(".", ",")} L`).join(" + ") : null;
const nEUR = (n: number) => String(Math.round(n * 100) / 100).replace(".", ",");

interface Props {
  intakeId: string;
  bookingId: string;
  rooms: DbRoom[];
  value: Record<string, RoomMeasure> | null;
  offerUrl: string | null;
  onSaved: (next: Record<string, RoomMeasure>) => void;
  onOffer: (url: string) => void;
}

export function MeasurePanel({ intakeId, bookingId, rooms, value, offerUrl, onSaved, onOffer }: Props) {
  const measured = rooms.filter((r) => showWalls(r) || showCeiling(r) || showWood(r));
  const [map, setMap] = useState<Record<string, RoomMeasure>>(() => {
    const m: Record<string, RoomMeasure> = {};
    for (const r of measured) m[r.id] = value?.[r.id] ?? emptyMeasure();
    return m;
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [offering, setOffering] = useState(false);
  const [offerMsg, setOfferMsg] = useState<string | null>(null);

  const setRoom = (id: string, p: Partial<RoomMeasure>) => setMap((m) => ({ ...m, [id]: { ...m[id], ...p } }));
  const project = useMemo(() => calcProject(measured.map((r) => map[r.id])), [map, measured]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from("intake").update({ room_measures: map }).eq("id", intakeId);
    setSaving(false);
    if (error) { setMsg("Opslaan mislukte."); return; }
    onSaved(map); setMsg("Maten opgeslagen ✓"); setTimeout(() => setMsg(null), 2500);
  };

  // Offerte genereren: eerst maten opslaan, dan de ruimtedata naar de offerte-tool sturen.
  const generateOffer = async () => {
    setOffering(true); setOfferMsg(null);
    const { error: se } = await supabase.from("intake").update({ room_measures: map }).eq("id", intakeId);
    if (se) { setOffering(false); setOfferMsg("Opslaan van de maten mislukte."); return; }
    onSaved(map);
    const { data, error } = await supabase.functions.invoke("booking", { body: { action: "offerte_create", intake_id: intakeId, booking_id: bookingId } });
    setOffering(false);
    const d = data as { ok?: boolean; offer_url?: string | null; skipped?: string; error?: string; payload?: { ruimtes?: unknown[] } } | null;
    if (error) { setOfferMsg("Offerte aanmaken lukte niet."); return; }
    if (d?.ok && d.offer_url) { onOffer(d.offer_url); setOfferMsg("Offerte aangemaakt ✓"); return; }
    if (d?.skipped === "offerte-tool endpoint niet gekoppeld") { setOfferMsg(`Ruimtedata staat klaar (${d.payload?.ruimtes?.length ?? 0} ruimte(s)). De offerte-tool moet nog gekoppeld worden om automatisch te versturen.`); return; }
    if (d?.skipped === "geen ruimtes met maten") { setOfferMsg("Vul eerst de maten in."); return; }
    setOfferMsg(d?.error || "Offerte niet aangemaakt.");
  };

  if (measured.length === 0) return <p className="rd-sub" style={{ margin: 0 }}>Geen ruimtes met te verven oppervlakken in de intake. Voeg oppervlakken toe bij Voorbereiding.</p>;

  const numField = (label: string, val: number, on: (n: number) => void, ph = "", w = 90) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 3 }}>
      <span style={{ fontSize: 11, opacity: 0.6 }}>{label}</span>
      <input className="rd-input" inputMode="decimal" value={val || ""} placeholder={ph}
        onChange={(e) => on(parseFloat(e.target.value.replace(",", ".")) || 0)} style={{ height: 36, width: w }} />
    </label>
  );

  const matLine = (m: MaterialLine) => (
    <div key={m.key} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 13, padding: "3px 0" }}>
      <span>{m.label}{m.note ? <span style={{ opacity: 0.55 }}> · {m.note}</span> : ""}</span>
      <span style={{ fontWeight: 700, whiteSpace: "nowrap" }}>{fmtBlik(m.blikken) ?? `${nEUR(m.liters)} L`}</span>
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>Vul de maten per ruimte in (schatting is prima). De m² en materialen rekenen live mee. De klant vult dit later zelf voor in de intake; jij hoeft dan alleen bij te stellen.</p>

      {measured.map((r) => {
        const m = map[r.id];
        const calc = calcRoom(m);
        return (
          <div key={r.id} className="rd-card-white" style={{ padding: 14, background: "var(--rd-offwhite)", border: "1px solid var(--rd-line)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{r.label}</strong>
              <span style={{ fontSize: 12, opacity: 0.65 }}>
                {calc.wall_m2 > 0 && `wand ${nEUR(calc.wall_m2)} m² · `}
                {calc.ceiling_m2 > 0 && `plafond ${nEUR(calc.ceiling_m2)} m² · `}
                {calc.woodwork_m2 > 0 && `houtwerk ${nEUR(calc.woodwork_m2)} m²`}
              </span>
            </div>

            {/* MUREN */}
            {showWalls(r) && (
              <div style={{ marginTop: 10 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6, marginBottom: 4 }}>Muren</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.walls.map((w, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      {numField("breedte (m)", w.w, (n) => setRoom(r.id, { walls: m.walls.map((x, j) => j === i ? { ...x, w: n } : x) }), "bijv. 11")}
                      <span style={{ paddingBottom: 8 }}>×</span>
                      {numField("hoogte (m)", w.h, (n) => setRoom(r.id, { walls: m.walls.map((x, j) => j === i ? { ...x, h: n } : x) }), "2,6")}
                      <button className="rd-textlink" onClick={() => setRoom(r.id, { walls: m.walls.filter((_, j) => j !== i) })} style={{ paddingBottom: 6, opacity: 0.6 }}>✕</button>
                    </div>
                  ))}
                  <button className="rd-textlink" onClick={() => setRoom(r.id, { walls: [...m.walls, { w: 0, h: STANDAARD_HOOGTE }] })} style={{ alignSelf: "flex-start" }}>+ Muurvlak (breedte × hoogte)</button>
                  <span style={{ fontSize: 12, opacity: 0.55 }}>Tel de breedtes van de te verven muren op, bijv. 4 + 3 + 4 = 11 m. Hoogte standaard 2,6 m.</span>
                </div>
                {showWalls(r) && (
                  <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 8 }}>
                    <span style={{ opacity: 0.6 }}>Ondergrond muren:</span>
                    <select className="rd-input" value={m.wall_substrate} onChange={(e) => setRoom(r.id, { wall_substrate: e.target.value as RoomMeasure["wall_substrate"] })} style={{ height: 34, width: 220 }}>
                      <option value="bestaand">Bestaande verflaag</option>
                      <option value="nieuw">Nieuw stucwerk / gipsplaat (voorstrijk)</option>
                    </select>
                  </label>
                )}
              </div>
            )}

            {/* PLAFOND */}
            {showCeiling(r) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6, marginBottom: 4 }}>Plafond</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {m.ceilings.map((c, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                      {numField("lengte (m)", c.l, (n) => setRoom(r.id, { ceilings: m.ceilings.map((x, j) => j === i ? { ...x, l: n } : x) }), "5")}
                      <span style={{ paddingBottom: 8 }}>×</span>
                      {numField("breedte (m)", c.b, (n) => setRoom(r.id, { ceilings: m.ceilings.map((x, j) => j === i ? { ...x, b: n } : x) }), "4")}
                      <button className="rd-textlink" onClick={() => setRoom(r.id, { ceilings: m.ceilings.filter((_, j) => j !== i) })} style={{ paddingBottom: 6, opacity: 0.6 }}>✕</button>
                    </div>
                  ))}
                  <button className="rd-textlink" onClick={() => setRoom(r.id, { ceilings: [...m.ceilings, { l: 0, b: 0 }] })} style={{ alignSelf: "flex-start" }}>+ Plafondvlak (lengte × breedte)</button>
                  <span style={{ fontSize: 12, opacity: 0.55 }}>Bij een L-vorm voeg je meerdere vlakken toe.</span>
                </div>
              </div>
            )}

            {/* HOUTWERK */}
            {showWood(r) && (
              <div style={{ marginTop: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: ".04em", opacity: 0.6, marginBottom: 4 }}>Houtwerk</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
                  {numField("deuren (met kozijn)", m.woodwork.doors, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, doors: n } }), "1", 130)}
                  {numField("plinten (m)", m.woodwork.plinths_m, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, plinths_m: n } }), "12", 90)}
                </div>
                <div style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 12, opacity: 0.6 }}>Raamkozijnen (breedte × hoogte)</span>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                    {m.woodwork.windows.map((wd, i) => (
                      <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        {numField("breedte (m)", wd.w, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, windows: m.woodwork.windows.map((x, j) => j === i ? { ...x, w: n } : x) } }), "1,2")}
                        <span style={{ paddingBottom: 8 }}>×</span>
                        {numField("hoogte (m)", wd.h, (n) => setRoom(r.id, { woodwork: { ...m.woodwork, windows: m.woodwork.windows.map((x, j) => j === i ? { ...x, h: n } : x) } }), "1,4")}
                        <button className="rd-textlink" onClick={() => setRoom(r.id, { woodwork: { ...m.woodwork, windows: m.woodwork.windows.filter((_, j) => j !== i) } })} style={{ paddingBottom: 6, opacity: 0.6 }}>✕</button>
                      </div>
                    ))}
                    <button className="rd-textlink" onClick={() => setRoom(r.id, { woodwork: { ...m.woodwork, windows: [...m.woodwork.windows, { w: 0, h: 0 }] } })} style={{ alignSelf: "flex-start" }}>+ Raamkozijn</button>
                  </div>
                </div>
                <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, marginTop: 8 }}>
                  <span style={{ opacity: 0.6 }}>Ondergrond houtwerk:</span>
                  <select className="rd-input" value={m.wood_substrate} onChange={(e) => setRoom(r.id, { wood_substrate: e.target.value as RoomMeasure["wood_substrate"] })} style={{ height: 34, width: 220 }}>
                    <option value="gelakt">Al gelakt</option>
                    <option value="kaal">Kaal hout of metaal (primer)</option>
                  </select>
                </label>
              </div>
            )}

            {/* Aantal lagen + materialen */}
            <div style={{ marginTop: 12, display: "flex", gap: 16, alignItems: "flex-end", flexWrap: "wrap" }}>
              {numField("lagen", m.coats, (n) => setRoom(r.id, { coats: n || 2 }), "2", 70)}
            </div>
            {calc.materials.length > 0 && (
              <div style={{ marginTop: 10, padding: "8px 12px", background: "var(--rd-grey-light)", borderRadius: 10 }}>
                <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Materialen (schatting)</div>
                {calc.materials.map(matLine)}
              </div>
            )}
          </div>
        );
      })}

      {/* Projecttotaal */}
      <div className="rd-card-white" style={{ padding: 14, border: "1.5px solid var(--rd-aubergine)" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>Totaal project</div>
        <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
          Wand {nEUR(project.wall_m2)} m² · plafond {nEUR(project.ceiling_m2)} m² · houtwerk {nEUR(project.woodwork_m2)} m²
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, padding: "3px 0" }}><span>Muurverf</span><span style={{ fontWeight: 700 }}>{nEUR(project.muurverf_liters)} L · blik en prijs per kleur (Ark)</span></div>
        {project.lak && matLine(project.lak)}
        {project.voorstrijk && matLine(project.voorstrijk)}
        {project.primer && matLine(project.primer)}
        <p className="rd-sub" style={{ margin: "8px 0 0", fontSize: 12 }}>Voorstrijk en primer worden op de opgetelde m² berekend, zodat je niet per ruimte te veel inkoopt. Prijzen komen straks live uit de webshop.</p>
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <button className="rd-btn rd-btn-outline" onClick={save} disabled={saving} style={{ width: "auto", padding: "0 20px" }}>{saving ? "Opslaan..." : "Maten opslaan"}</button>
        <button className="rd-btn rd-btn-primary" onClick={generateOffer} disabled={offering} style={{ width: "auto", padding: "0 22px" }}>{offering ? "Bezig..." : "Genereer offerte"}</button>
        {msg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{msg}</span>}
        {offerMsg && <span style={{ color: "var(--rd-aubergine)", fontWeight: 600, fontSize: 13 }}>{offerMsg}</span>}
      </div>
      {offerUrl && (
        <div style={{ fontSize: 13 }}>
          Offerte: <a href={offerUrl} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)", fontWeight: 600, wordBreak: "break-all" }}>{offerUrl}</a>
        </div>
      )}
      <p className="rd-sub" style={{ margin: 0, fontSize: 12 }}>De offerte-tool rekent de prijzen (live uit de webshop) en verstuurt de klant de mail met "alles in winkelmandje". Zet eerst de kleuren bij het verf-advies, dan komen ze mee in de offerte.</p>
    </div>
  );
}
