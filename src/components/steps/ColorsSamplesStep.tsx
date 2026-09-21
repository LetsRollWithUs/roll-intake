import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";
import { VERDICTS, COLOR_FAMILIES } from "@/data/intake-options";
import { ImageGrid } from "@/components/ImageGrid";
import type { ColorPick, Room, SampleItem, SampleSource, UploadedImage, Verdict } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  hasSamples?: SampleSource;
  samples: SampleItem[];
  colors: ColorPick[];
  rooms: Room[];
  onHasSamples: (v: SampleSource) => void;
  onSamples: (v: SampleItem[]) => void;
  onColors: (v: ColorPick[]) => void;
}

const rollById = new Map(rollColors.map((c) => [c.id, c]));

function inkOn(hex?: string): string {
  if (!hex) return "var(--rd-aubergine)";
  const h = hex.replace("#", "");
  if (h.length < 6) return "var(--rd-aubergine)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#2F2141" : "#FFFFFF";
}

// Doel van de bladeraar: geteste samples toevoegen, of "overweeg"-kleuren kiezen.
type PickTarget = "samples" | "overweeg";

export function ColorsSamplesStep({
  hasSamples,
  samples,
  colors,
  rooms,
  onHasSamples,
  onSamples,
  onColors,
}: Props) {
  const [picker, setPicker] = useState<PickTarget | null>(null);
  const [rollTab, setRollTab] = useState<"bundels" | "losse">("bundels");
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const yes = hasSamples != null && hasSamples !== "nee";

  // ── Samples muteren ──────────────────────────────────────────────────────
  const patchSample = (id: string, p: Partial<SampleItem>) =>
    onSamples(samples.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removeSample = (id: string) => onSamples(samples.filter((s) => s.id !== id));

  const sampleHasRoll = (rollId: string) => samples.some((s) => s.rollId === rollId);
  const addRollSample = (colorId: string, packId?: string) => {
    if (sampleHasRoll(colorId)) return;
    const c = rollById.get(colorId);
    if (!c) return;
    onSamples([
      ...samples,
      { id: uid(), brand: "Roll", name: c.name, rollId: c.id, hex: c.hex, packId, verdict: "twijfel" },
    ]);
  };
  const toggleRollSample = (colorId: string) => {
    if (sampleHasRoll(colorId)) onSamples(samples.filter((s) => s.rollId !== colorId));
    else addRollSample(colorId);
  };
  const addPack = (colorIds: string[], packId: string) => {
    const toAdd = colorIds.filter((id) => !sampleHasRoll(id) && rollById.has(id));
    if (!toAdd.length) return;
    onSamples([
      ...samples,
      ...toAdd.map((id) => {
        const c = rollById.get(id)!;
        return { id: uid(), brand: "Roll", name: c.name, rollId: c.id, hex: c.hex, packId, verdict: "twijfel" as Verdict };
      }),
    ]);
  };
  const addOtherBrand = () => {
    const id = uid();
    onSamples([...samples, { id, brand: "", name: "", verdict: "twijfel" }]);
    setExpanded(id);
  };

  // ── Overweeg-kleuren ─────────────────────────────────────────────────────
  const colorPicked = (rollId: string) => colors.some((c) => c.rollId === rollId);
  const toggleColor = (c: (typeof rollColors)[number]) => {
    if (colorPicked(c.id)) onColors(colors.filter((x) => x.rollId !== c.id));
    else onColors([...colors, { id: uid(), rollId: c.id, name: c.name, hex: c.hex }]);
  };

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const fam = family ? COLOR_FAMILIES.find((f) => f.key === family) : null;
    return rollColors.filter((c) => {
      if (term) {
        const hit =
          c.name.toLowerCase().includes(term) ||
          (c.subname ?? "").toLowerCase().includes(term) ||
          (c.familyPrimary ?? "").toLowerCase().includes(term);
        if (!hit) return false;
      }
      if (fam) {
        if (fam.dark) return c.lightnessBand === "dark";
        return fam.families.includes(c.familyPrimary ?? "");
      }
      return true;
    });
  }, [q, family]);

  const closePicker = () => {
    setPicker(null);
    setQ("");
    setFamily(null);
  };

  const rollSamples = samples.filter((s) => s.rollId);
  const otherSamples = samples.filter((s) => !s.rollId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      <datalist id="roll-color-names">
        {rollColors.map((c) => (
          <option key={c.id} value={c.name} />
        ))}
      </datalist>

      {/* 1. Heb je al kleursamples getest? */}
      <div>
        <div className="rd-row-label" style={{ marginBottom: 4 }}>
          1. Heb je al kleursamples getest?
        </div>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 10 }}>
          Wat je al hebt geprobeerd helpt enorm bij het advies.
        </p>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`rd-plan-chip${hasSamples === "nee" ? " is-on" : ""}`}
            onClick={() => onHasSamples("nee")}
            aria-pressed={hasSamples === "nee"}
          >
            Nee, nog niet
          </button>
          <button
            className={`rd-plan-chip${yes ? " is-on" : ""}`}
            onClick={() => { if (!yes) onHasSamples("allebei"); }}
            aria-pressed={yes}
          >
            Ja
          </button>
        </div>

        {yes && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button
                className="rd-btn rd-btn-outline"
                onClick={() => { setRollTab("bundels"); setPicker("samples"); }}
              >
                Kies uit Roll-kleuren
              </button>
              <button className="rd-btn rd-btn-outline" onClick={addOtherBrand}>
                Van een ander merk
              </button>
            </div>

            {/* Geteste Roll-kleuren: compacte regels met een oordeel */}
            {rollSamples.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rollSamples.map((s) => {
                  const open = expanded === s.id;
                  return (
                    <div key={s.id} className="rd-card-white" style={{ padding: "10px 12px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span
                          aria-hidden
                          style={{ width: 26, height: 26, borderRadius: 8, background: s.hex, border: "1px solid rgba(0,0,0,.12)", flex: "none" }}
                        />
                        <span style={{ fontWeight: 700, fontSize: 14, flex: 1, minWidth: 0 }}>{s.name}</span>
                        <button
                          className="rd-textlink"
                          onClick={() => removeSample(s.id)}
                          aria-label={`${s.name} verwijderen`}
                          style={{ minHeight: 32, opacity: 0.5, flex: "none" }}
                        >
                          ×
                        </button>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {VERDICTS.map((v) => (
                          <button
                            key={v.key}
                            className={`rd-seg${s.verdict === v.key ? " is-on" : ""}`}
                            onClick={() => patchSample(s.id, { verdict: v.key as Verdict })}
                          >
                            {v.label}
                          </button>
                        ))}
                      </div>
                      <button
                        className="rd-textlink"
                        onClick={() => setExpanded(open ? null : s.id)}
                        style={{ minHeight: 32, fontSize: 13, opacity: 0.7, marginTop: 4 }}
                      >
                        {open ? "Minder" : "Notitie of foto toevoegen"}
                      </button>
                      {open && (
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 8 }}>
                          {rooms.length > 0 && (
                            <select
                              className="rd-input"
                              value={s.roomId ?? ""}
                              onChange={(e) => patchSample(s.id, { roomId: e.target.value || undefined })}
                              aria-label="Voor welke ruimte?"
                            >
                              <option value="">Voor welke ruimte? (optioneel)</option>
                              {rooms.map((r) => (
                                <option key={r.id} value={r.id}>{r.label}</option>
                              ))}
                            </select>
                          )}
                          <textarea
                            className="rd-input"
                            value={s.note ?? ""}
                            onChange={(e) => patchSample(s.id, { note: e.target.value })}
                            placeholder="Waarom? (optioneel) Bijv. 's middags mooi, 's avonds te roze."
                            style={{ height: 64, paddingTop: 10, resize: "none", lineHeight: 1.4 }}
                          />
                          <ImageGrid
                            images={s.photo ? [s.photo] : []}
                            onChange={(next: UploadedImage[]) => patchSample(s.id, { photo: next[0] })}
                            max={1}
                            size={64}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Andere merken: vrije invoer met merk + kleurnaam */}
            {otherSamples.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {otherSamples.map((s) => (
                  <div key={s.id} className="rd-card-white">
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input
                        className="rd-input"
                        value={s.brand}
                        onChange={(e) => patchSample(s.id, { brand: e.target.value })}
                        placeholder="Merk"
                        aria-label="Merk"
                        style={{ flex: 1 }}
                      />
                      <button
                        className={`rd-plan-chip${s.brand === "Weet ik niet" ? " is-on" : ""}`}
                        onClick={() => patchSample(s.id, { brand: s.brand === "Weet ik niet" ? "" : "Weet ik niet" })}
                        style={{ flex: "none", whiteSpace: "nowrap" }}
                      >
                        Weet ik niet
                      </button>
                    </div>
                    <input
                      className="rd-input"
                      value={s.name}
                      onChange={(e) => patchSample(s.id, { name: e.target.value })}
                      placeholder="Kleurnaam"
                      aria-label="Kleurnaam"
                      style={{ marginTop: 8 }}
                    />
                    {rooms.length > 0 && (
                      <select
                        className="rd-input"
                        value={s.roomId ?? ""}
                        onChange={(e) => patchSample(s.id, { roomId: e.target.value || undefined })}
                        aria-label="Voor welke ruimte?"
                        style={{ marginTop: 8 }}
                      >
                        <option value="">Voor welke ruimte? (optioneel)</option>
                        {rooms.map((r) => (
                          <option key={r.id} value={r.id}>{r.label}</option>
                        ))}
                      </select>
                    )}
                    <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                      {VERDICTS.map((v) => (
                        <button
                          key={v.key}
                          className={`rd-seg${s.verdict === v.key ? " is-on" : ""}`}
                          onClick={() => patchSample(s.id, { verdict: v.key as Verdict })}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <textarea
                      className="rd-input"
                      value={s.note ?? ""}
                      onChange={(e) => patchSample(s.id, { note: e.target.value })}
                      placeholder="Waarom? (optioneel) Bijv. 's middags mooi, 's avonds te roze."
                      style={{ height: 64, paddingTop: 10, marginTop: 10, resize: "none", lineHeight: 1.4 }}
                    />
                    <div style={{ marginTop: 10 }}>
                      <ImageGrid
                        images={s.photo ? [s.photo] : []}
                        onChange={(next: UploadedImage[]) => patchSample(s.id, { photo: next[0] })}
                        max={1}
                        size={64}
                      />
                    </div>
                    <button
                      className="rd-textlink"
                      onClick={() => removeSample(s.id)}
                      style={{ minHeight: 40, opacity: 0.6, alignSelf: "flex-start", marginTop: 4 }}
                    >
                      Verwijder
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 2. Welke Roll-kleuren overweeg je? */}
      <div>
        <div className="rd-row-label" style={{ marginBottom: 4 }}>
          2. Welke Roll-kleuren overweeg je?
        </div>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 10 }}>
          Optioneel: kleuren waar je nu al aan denkt.
        </p>
        {colors.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {colors.map((c) => (
              <button
                key={c.id}
                onClick={() => onColors(colors.filter((x) => x.id !== c.id))}
                aria-label={`${c.name} verwijderen`}
                style={{
                  display: "inline-flex", alignItems: "center", gap: 8,
                  padding: "6px 12px 6px 8px", borderRadius: 99,
                  border: "1.5px solid var(--rd-lavender)", background: "#fff",
                  cursor: "pointer", color: "var(--rd-aubergine)", fontWeight: 600, fontSize: 13,
                }}
              >
                <span aria-hidden style={{ width: 18, height: 18, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />
                {c.name}
                <span aria-hidden style={{ opacity: 0.5 }}>×</span>
              </button>
            ))}
          </div>
        )}
        <button className="rd-btn rd-btn-outline" onClick={() => { setRollTab("losse"); setPicker("overweeg"); }}>
          Blader door alle Roll-kleuren
        </button>
      </div>

      {/* Bladeraar (portal, full-screen) */}
      {picker &&
        createPortal(
          <div className="rd-sheet-wrap" style={{ position: "fixed", inset: 0, zIndex: 60, background: "var(--rd-offwhite)", display: "flex", flexDirection: "column" }}>
            <div
              className="rd-sheet"
              style={{
                background: "var(--rd-offwhite)", flex: 1, minHeight: 0, display: "flex", flexDirection: "column",
                padding: "calc(14px + env(safe-area-inset-top)) 16px 0",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 16, flex: 1 }}>
                  {picker === "samples" ? "Kies je geteste Roll-kleuren" : "Kies Roll-kleuren"}
                </div>
                <button className="rd-textlink" onClick={closePicker} style={{ minHeight: 44 }}>
                  Klaar
                </button>
              </div>

              {/* Switch bundels / losse kleuren (alleen bij samples) */}
              {picker === "samples" && (
                <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
                  <button className={`rd-seg${rollTab === "bundels" ? " is-on" : ""}`} onClick={() => setRollTab("bundels")}>
                    Bundels
                  </button>
                  <button className={`rd-seg${rollTab === "losse" ? " is-on" : ""}`} onClick={() => setRollTab("losse")}>
                    Losse kleuren
                  </button>
                </div>
              )}

              {picker === "samples" && rollTab === "bundels" ? (
                // Bundels: tik een bundel om alle kleuren als getest toe te voegen
                <div className="rd-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: "auto", paddingBottom: "calc(20px + env(safe-area-inset-bottom))", display: "flex", flexDirection: "column", gap: 8 }}>
                  {SAMPLE_PACKS.map((p) => {
                    const added = p.colorIds.filter((id) => sampleHasRoll(id)).length;
                    const full = added === p.colorIds.length;
                    return (
                      <button
                        key={p.id}
                        onClick={() => addPack(p.colorIds, p.id)}
                        disabled={full}
                        style={{
                          display: "flex", alignItems: "center", gap: 12, textAlign: "left",
                          background: "#fff", border: "1.5px solid var(--rd-line)", borderRadius: 14,
                          padding: "10px 12px", cursor: full ? "default" : "pointer", opacity: full ? 0.55 : 1,
                        }}
                      >
                        <span style={{ display: "flex", flex: "none" }}>
                          {p.colorIds.slice(0, 6).map((id, i) => (
                            <span
                              key={id}
                              aria-hidden
                              style={{
                                width: 18, height: 26, background: rollById.get(id)?.hex ?? "#ccc",
                                marginLeft: i === 0 ? 0 : -4, borderRadius: 4,
                                border: "1px solid rgba(0,0,0,.1)", boxShadow: "0 0 0 1px #fff",
                              }}
                            />
                          ))}
                        </span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{p.displayName}</span>
                          <span style={{ display: "block", fontSize: 12, opacity: 0.6 }}>{p.colorCount} kleuren</span>
                        </span>
                        <span className="rd-chip" style={{ flex: "none" }}>
                          {full ? "Toegevoegd ✓" : added > 0 ? `+ (${added}/${p.colorCount})` : "Toevoegen"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : (
                // Losse kleuren: zoeken + families + grid
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                    <input
                      className="rd-input"
                      placeholder="Zoek op naam of familie"
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                      style={{ flex: 1 }}
                    />
                  </div>
                  <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }} className="rd-hide-scroll">
                    <button className={`rd-plan-chip${family === null ? " is-on" : ""}`} onClick={() => setFamily(null)} style={{ flex: "none" }}>
                      Alle
                    </button>
                    {COLOR_FAMILIES.map((f) => (
                      <button key={f.key} className={`rd-plan-chip${family === f.key ? " is-on" : ""}`} onClick={() => setFamily(f.key)} style={{ flex: "none" }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div
                    className="rd-hide-scroll"
                    style={{
                      flex: 1, minHeight: 0, overflowY: "auto",
                      paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
                      display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8, alignContent: "start",
                    }}
                  >
                    {results.map((c) => {
                      const on = picker === "samples" ? sampleHasRoll(c.id) : colorPicked(c.id);
                      return (
                        <button
                          key={c.id}
                          onClick={() => (picker === "samples" ? toggleRollSample(c.id) : toggleColor(c))}
                          aria-pressed={on}
                          style={{
                            position: "relative", background: c.hex, color: inkOn(c.hex),
                            border: on ? "3px solid var(--rd-pink)" : "3px solid transparent",
                            borderRadius: 14, padding: "10px 8px", minHeight: 72, cursor: "pointer",
                            textAlign: "left", display: "flex", flexDirection: "column", justifyContent: "flex-end",
                            boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
                          }}
                        >
                          {on && (
                            <span
                              aria-hidden
                              style={{
                                position: "absolute", top: 6, right: 6, width: 22, height: 22, borderRadius: 99,
                                background: "var(--rd-pink)", color: "var(--rd-aubergine)",
                                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12,
                              }}
                            >
                              ✓
                            </span>
                          )}
                          <span style={{ fontWeight: 700, fontSize: 12, lineHeight: 1.15 }}>{c.name}</span>
                        </button>
                      );
                    })}
                    {results.length === 0 && (
                      <p className="rd-sub" style={{ gridColumn: "1 / -1" }}>
                        Geen kleur gevonden.
                      </p>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
