import type { Room } from "@/lib/types";
import { emptyMeasure, KAMER_VLOER, STANDAARD_HOOGTE, type KamerGrootte, type RoomMeasure } from "@/lib/verfcalc";

interface Props {
  rooms: Room[];
  setRooms: (updater: (prev: Room[]) => Room[]) => void;
  /** Klant woont er nog niet (vlag voor de hele intake). */
  nogNiet?: boolean;
  /** Antwoord op "Woon je al in de woning?" (undefined = nog niet gevraagd). */
  woontErAl?: boolean;
  onNogNiet?: (aan: boolean) => void;
  onWoontErAl?: () => void;
}

const hasWalls = (r: Room) => r.surfaces.includes("muren");
const hasCeiling = (r: Room) => r.surfaces.includes("plafond");
const hasWood = (r: Room) => r.surfaces.some((s) => ["kozijnen", "deuren", "houtwerk"].includes(s));

// Startwaarden zodat velden al "ingevuld" ogen: hoogte 2,6 m, bij deuren 1 deur.
function seed(r: Room): RoomMeasure {
  const m = emptyMeasure();
  if (hasWalls(r)) m.walls = [{ w: 0, h: STANDAARD_HOOGTE }];
  if (hasCeiling(r)) m.ceilings = [{ l: 0, b: 0 }];
  if (hasWood(r)) m.woodwork.doors = r.surfaces.includes("deuren") ? 1 : 0;
  return m;
}
const measureOf = (r: Room): RoomMeasure => r.measure ?? seed(r);

export function MatenStep({ rooms, setRooms, nogNiet, woontErAl, onNogNiet, onWoontErAl }: Props) {
  const measured = rooms.filter((r) => hasWalls(r) || hasCeiling(r) || hasWood(r));
  const patch = (roomId: string, fn: (m: RoomMeasure) => RoomMeasure) =>
    setRooms((prev) => prev.map((r) => (r.id === roomId ? { ...r, measure: fn(measureOf(r)) } : r)));

  // "Maten weet ik nog niet" geldt alleen voor die ruimte: de klant kan net niet thuis zijn.
  // We denken mee met een optionele schatting van de kamergrootte, en vragen één keer of de
  // klant er al woont. Alleen bij "nog niet" past de rest van de intake zich aan.
  const leeg = (r: Room, x: RoomMeasure, alles: boolean): RoomMeasure => {
    const s = seed(r);
    // Woont de klant er nog niet, dan staan ondergrond en staat ook op "Weet ik nog niet",
    // tenzij de klant ze al zelf had gekozen.
    const kies = <T,>(v: T | undefined, standaard: T) => (alles && (v ?? standaard) === standaard ? "onbekend" : v ?? standaard);
    return {
      ...s,
      wall_substrate: kies(x.wall_substrate, "bestaand") as RoomMeasure["wall_substrate"],
      wall_condition: kies(x.wall_condition, "glad") as RoomMeasure["wall_condition"],
      wood_substrate: kies(x.wood_substrate, "gelakt") as RoomMeasure["wood_substrate"],
      woodwork: { ...s.woodwork, doors: 0 },
      unknown: true,
      geschat: alles ? undefined : x.geschat,
    };
  };
  const zetOnbekend = (r: Room, aan: boolean) =>
    patch(r.id, (x) => {
      const keuzes = { wall_substrate: x.wall_substrate, wall_condition: x.wall_condition, wood_substrate: x.wood_substrate };
      return aan ? leeg(r, x, false) : { ...seed(r), ...keuzes };
    });
  // Schatting op kamergrootte: muurbreedte ≈ omtrek van een vierkante vloer, plafond = vloer.
  const schat = (r: Room, g: KamerGrootte) =>
    patch(r.id, (x) => {
      if (x.geschat === g) return { ...x, geschat: undefined, walls: seed(r).walls, ceilings: seed(r).ceilings };
      const zijde = Math.sqrt(KAMER_VLOER[g]);
      const r1 = (n: number) => Math.round(n * 10) / 10;
      return {
        ...x,
        geschat: g,
        walls: hasWalls(r) ? [{ w: r1(4 * zijde), h: STANDAARD_HOOGTE }] : x.walls,
        ceilings: hasCeiling(r) ? [{ l: r1(zijde), b: r1(zijde) }] : x.ceilings,
      };
    });
  // "Nog niet": alle ruimtes op weet-ik-nog-niet, en foto's/lichtinval worden optioneel.
  const woontErNogNiet = () => {
    const ids = new Set(measured.map((x) => x.id));
    setRooms((prev) => prev.map((x) => (ids.has(x.id) ? { ...x, measure: leeg(x, measureOf(x), true) } : x)));
    onNogNiet?.(true);
  };
  const vraagWonen = woontErAl === undefined && !nogNiet;
  const eersteOnbekend = measured.find((x) => x.measure?.unknown)?.id;

  if (measured.length === 0) {
    return (
      <div className="rd-card-white" style={{ textAlign: "center", padding: "24px 18px" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Kies eerst bij stap 2 wat je wilt schilderen.</p>
      </div>
    );
  }

  const num = (label: string, val: number, on: (n: number) => void, ph = "", hint?: string) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, flex: "1 1 120px", minWidth: 0 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <input className="rd-input" inputMode="decimal" value={val || ""} placeholder={ph}
        onChange={(e) => on(parseFloat(e.target.value.replace(",", ".")) || 0)} style={{ height: 46 }} />
      {hint && <span style={{ fontSize: 12, opacity: 0.6 }}>{hint}</span>}
    </label>
  );

  const chip = (aan: boolean, label: string, on: () => void) => (
    <button type="button" className={`rd-plan-chip${aan ? " is-on" : ""}`} aria-pressed={aan} onClick={on}
      style={{ fontSize: 13, padding: "6px 12px", minHeight: 0 }}>
      {label}
    </button>
  );
  const vinkje = (r: Room, m: RoomMeasure) => {
    const aan = !!m.unknown;
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <label style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 13, opacity: 0.75, cursor: "pointer", alignSelf: "flex-start" }}>
          <input type="checkbox" checked={aan} onChange={(e) => zetOnbekend(r, e.target.checked)}
            style={{ width: 16, height: 16, margin: 0, accentColor: "var(--rd-purple, #6267AF)" }} />
          Maten weet ik nog niet
        </label>
        {aan && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <span style={{ fontSize: 13 }}>Weet je ongeveer hoe groot de ruimte is? Dan rekenen we daarmee.</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {(["klein", "gemiddeld", "groot"] as KamerGrootte[]).map((g) =>
                chip(m.geschat === g, `${g[0].toUpperCase()}${g.slice(1)} (± ${KAMER_VLOER[g]} m²)`, () => schat(r, g)))}
            </div>
          </div>
        )}
        {aan && vraagWonen && eersteOnbekend === r.id && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", borderRadius: 12, background: "var(--rd-grey-light, #F4F1F7)" }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>Woon je al in de woning?</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {chip(false, "Ja, ik weet het nu even niet", () => onWoontErAl?.())}
              {chip(false, "Nog niet, we gaan er wonen", woontErNogNiet)}
            </div>
          </div>
        )}
        {aan && woontErAl === true && eersteOnbekend === r.id && (
          <span style={{ fontSize: 12, opacity: 0.65 }}>Geen probleem. Je antwoorden blijven bewaard, dus je kunt de intake ook later op dit apparaat afmaken.</span>
        )}
      </div>
    );
  };

  const keuze = <K extends "wall_substrate" | "wall_condition" | "wood_substrate">(
    r: Room, m: RoomMeasure, k: K, label: string, opties: [NonNullable<RoomMeasure[K]>, string][], standaard: NonNullable<RoomMeasure[K]>,
  ) => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
      <select className="rd-input" value={(m[k] ?? standaard) as string}
        onChange={(e) => patch(r.id, (x) => ({ ...x, [k]: e.target.value }))} style={{ height: 46 }}>
        {opties.map(([v, t]) => <option key={v} value={v}>{t}</option>)}
        <option value="onbekend">Weet ik nog niet</option>
      </select>
    </label>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {nogNiet && (
        <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>
          Je woont er nog niet, dus we hebben het voor alle ruimtes aangevinkt; de maten kijken we samen na. Weet je ze van een ruimte wel, bijvoorbeeld uit de plattegrond? Vink het daar uit. Foto's en lichtinval mag je straks ook overslaan.
        </p>
      )}
      {measured.map((r) => {
        const m = measureOf(r);
        const onb = !!m.unknown;
        // Het vinkje staat onder de eerste maatvelden van de ruimte.
        const plek = hasWalls(r) ? "muren" : hasCeiling(r) ? "plafond" : "hout";
        return (
          <div key={r.id} className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="rd-row-label">{r.label}</div>

            {hasWalls(r) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Muren</div>
                {!onb && (
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    {num("Totale breedte (m)", m.walls[0]?.w ?? 0, (n) => patch(r.id, (x) => ({ ...x, walls: [{ w: n, h: x.walls[0]?.h || STANDAARD_HOOGTE }] })), "bijv. 11", "Tel de breedtes van de te verven muren op, bijv. 4 + 3 + 4 = 11 m.")}
                    {num("Hoogte (m)", m.walls[0]?.h ?? STANDAARD_HOOGTE, (n) => patch(r.id, (x) => ({ ...x, walls: [{ w: x.walls[0]?.w ?? 0, h: n }] })), "2,6", "Standaard 2,6 m. Anders? Pas het aan.")}
                  </div>
                )}
                {plek === "muren" && vinkje(r, m)}
                {keuze(r, m, "wall_substrate", "Ondergrond muren", [["bestaand", "Er zit al verf op"], ["nieuw", "Nieuw stucwerk of gipsplaat"]], "bestaand")}
                {keuze(r, m, "wall_condition", "Staat van de muren", [["glad", "Glad"], ["oneffen", "Oneffen"], ["scheuren", "Scheuren, of het behang gaat eraf"]], "glad")}
              </div>
            )}

            {hasCeiling(r) && (!onb || plek === "plafond") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Plafond</div>
                {!onb && (
                  <>
                    {m.ceilings.map((c, i) => (
                      <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                        {num("Lengte (m)", c.l, (n) => patch(r.id, (x) => ({ ...x, ceilings: x.ceilings.map((y, j) => j === i ? { ...y, l: n } : y) })), "5")}
                        {num("Breedte (m)", c.b, (n) => patch(r.id, (x) => ({ ...x, ceilings: x.ceilings.map((y, j) => j === i ? { ...y, b: n } : y) })), "4")}
                        {m.ceilings.length > 1 && <button className="rd-textlink" onClick={() => patch(r.id, (x) => ({ ...x, ceilings: x.ceilings.filter((_, j) => j !== i) }))} style={{ paddingBottom: 12, opacity: 0.6 }}>✕</button>}
                      </div>
                    ))}
                    <button className="rd-textlink" onClick={() => patch(r.id, (x) => ({ ...x, ceilings: [...x.ceilings, { l: 0, b: 0 }] }))} style={{ alignSelf: "flex-start" }}>+ Nog een vlak (bij een L-vorm)</button>
                  </>
                )}
                {plek === "plafond" && vinkje(r, m)}
              </div>
            )}

            {hasWood(r) && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>Houtwerk</div>
                {!onb && (
                  <>
                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      {num("Deuren (met kozijn)", m.woodwork.doors, (n) => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, doors: n } })), "1")}
                      {num("Plinten (m)", m.woodwork.plinths_m, (n) => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, plinths_m: n } })), "bijv. 12", "Lengte van de plinten samen.")}
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <span style={{ fontSize: 13, fontWeight: 600 }}>Raamkozijnen (breedte × hoogte)</span>
                      {m.woodwork.windows.map((wd, i) => (
                        <div key={i} style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" }}>
                          {num("Breedte (m)", wd.w, (n) => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, windows: x.woodwork.windows.map((y, j) => j === i ? { ...y, w: n } : y) } })), "1,2")}
                          {num("Hoogte (m)", wd.h, (n) => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, windows: x.woodwork.windows.map((y, j) => j === i ? { ...y, h: n } : y) } })), "1,4")}
                          <button className="rd-textlink" onClick={() => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, windows: x.woodwork.windows.filter((_, j) => j !== i) } }))} style={{ paddingBottom: 12, opacity: 0.6 }}>✕</button>
                        </div>
                      ))}
                      <button className="rd-textlink" onClick={() => patch(r.id, (x) => ({ ...x, woodwork: { ...x.woodwork, windows: [...x.woodwork.windows, { w: 0, h: 0 }] } }))} style={{ alignSelf: "flex-start" }}>+ Raamkozijn</button>
                    </div>
                  </>
                )}
                {plek === "hout" && vinkje(r, m)}
                {keuze(r, m, "wood_substrate", "Staat van het houtwerk", [["gelakt", "Al gelakt"], ["kaal", "Kaal hout of metaal"]], "gelakt")}
              </div>
            )}
          </div>
        );
      })}

      <p className="rd-sub" style={{ margin: 0, textAlign: "center" }}>
        Een schatting is prima, het hoeft niet exact. We gebruiken je maten om het gesprek goed voor te bereiden; kloppen ze niet helemaal, dan passen we het samen aan.
      </p>
    </div>
  );
}
