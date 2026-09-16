import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_SOURCES, VERDICTS, COLOR_FAMILIES } from "@/data/intake-options";
import { ImageGrid } from "@/components/ImageGrid";
import type { ColorPick, SampleItem, SampleSource, UploadedImage, Verdict } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  hasSamples?: SampleSource;
  samples: SampleItem[];
  colors: ColorPick[];
  onHasSamples: (v: SampleSource) => void;
  onSamples: (v: SampleItem[]) => void;
  onColors: (v: ColorPick[]) => void;
}

function inkOn(hex?: string): string {
  if (!hex) return "var(--rd-aubergine)";
  const h = hex.replace("#", "");
  if (h.length < 6) return "var(--rd-aubergine)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? "#2F2141" : "#FFFFFF";
}

export function ColorsSamplesStep({
  hasSamples,
  samples,
  colors,
  onHasSamples,
  onSamples,
  onColors,
}: Props) {
  const [browseOpen, setBrowseOpen] = useState(false);
  const [q, setQ] = useState("");
  const [family, setFamily] = useState<string | null>(null);

  const showSampleList = hasSamples && hasSamples !== "nee";
  const defaultBrand = hasSamples === "roll" ? "Roll" : "";

  const addSample = () =>
    onSamples([
      ...samples,
      { id: uid(), brand: defaultBrand, name: "", verdict: "twijfel" },
    ]);
  const patchSample = (id: string, p: Partial<SampleItem>) =>
    onSamples(samples.map((s) => (s.id === id ? { ...s, ...p } : s)));
  const removeSample = (id: string) => onSamples(samples.filter((s) => s.id !== id));

  const isPicked = (rollId: string) => colors.some((c) => c.rollId === rollId);
  const toggleColor = (c: (typeof rollColors)[number]) => {
    if (isPicked(c.id)) onColors(colors.filter((x) => x.rollId !== c.id));
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

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* A. Wat heb je al geprobeerd? */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Heb je al kleuren of samples thuis?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SAMPLE_SOURCES.map((s) => (
            <button
              key={s.key}
              className={`rd-plan-chip${hasSamples === s.key ? " is-on" : ""}`}
              onClick={() => onHasSamples(s.key)}
              aria-pressed={hasSamples === s.key}
            >
              {s.label}
            </button>
          ))}
        </div>

        {showSampleList && (
          <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
            {samples.map((s) => (
              <div key={s.id} className="rd-card-white">
                <div style={{ display: "flex", gap: 8 }}>
                  <input
                    className="rd-input"
                    value={s.brand}
                    onChange={(e) => patchSample(s.id, { brand: e.target.value })}
                    placeholder="Merk"
                    aria-label="Merk"
                    style={{ flex: 1 }}
                  />
                  <button
                    className="rd-textlink"
                    onClick={() => removeSample(s.id)}
                    style={{ minHeight: 44, opacity: 0.6 }}
                  >
                    Verwijder
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
              </div>
            ))}
            <button className="rd-btn rd-btn-outline" onClick={addSample}>
              + Kleur toevoegen
            </button>
          </div>
        )}
      </div>

      {/* B. Welke Roll-kleuren overweeg je? */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Welke Roll-kleuren overweeg je?
        </div>
        {colors.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
            {colors.map((c) => (
              <button
                key={c.id}
                onClick={() => onColors(colors.filter((x) => x.id !== c.id))}
                aria-label={`${c.name} verwijderen`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 12px 6px 8px",
                  borderRadius: 99,
                  border: "1.5px solid var(--rd-lavender)",
                  background: "#fff",
                  cursor: "pointer",
                  color: "var(--rd-aubergine)",
                  fontWeight: 600,
                  fontSize: 13,
                }}
              >
                <span
                  aria-hidden
                  style={{ width: 18, height: 18, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }}
                />
                {c.name}
                <span aria-hidden style={{ opacity: 0.5 }}>
                  ×
                </span>
              </button>
            ))}
          </div>
        )}
        <button className="rd-btn rd-btn-outline" onClick={() => setBrowseOpen(true)}>
          Blader door alle Roll-kleuren
        </button>
      </div>

      {/* Overlay: alle kleuren met zoeken + families (portal, echt full-screen) */}
      {browseOpen &&
        createPortal(
        <div
          className="rd-sheet-wrap"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 60,
            background: "var(--rd-offwhite)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div
            className="rd-sheet"
            style={{
              background: "var(--rd-offwhite)",
              flex: 1,
              minHeight: 0,
              display: "flex",
              flexDirection: "column",
              padding: "calc(14px + env(safe-area-inset-top)) 16px 0",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <input
                className="rd-input"
                placeholder="Zoek op naam of familie"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="rd-textlink" onClick={() => setBrowseOpen(false)} style={{ minHeight: 44 }}>
                Klaar
              </button>
            </div>
            <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 10 }} className="rd-hide-scroll">
              <button
                className={`rd-plan-chip${family === null ? " is-on" : ""}`}
                onClick={() => setFamily(null)}
                style={{ flex: "none" }}
              >
                Alle
              </button>
              {COLOR_FAMILIES.map((f) => (
                <button
                  key={f.key}
                  className={`rd-plan-chip${family === f.key ? " is-on" : ""}`}
                  onClick={() => setFamily(f.key)}
                  style={{ flex: "none" }}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <div
              className="rd-hide-scroll"
              style={{
                flex: 1,
                minHeight: 0,
                overflowY: "auto",
                paddingBottom: "calc(20px + env(safe-area-inset-bottom))",
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                gap: 8,
                alignContent: "start",
              }}
            >
              {results.map((c) => {
                const on = isPicked(c.id);
                return (
                  <button
                    key={c.id}
                    onClick={() => toggleColor(c)}
                    aria-pressed={on}
                    style={{
                      position: "relative",
                      background: c.hex,
                      color: inkOn(c.hex),
                      border: on ? "3px solid var(--rd-pink)" : "3px solid transparent",
                      borderRadius: 14,
                      padding: "10px 8px",
                      minHeight: 72,
                      cursor: "pointer",
                      textAlign: "left",
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      boxShadow: "inset 0 0 0 1px rgba(0,0,0,.06)",
                    }}
                  >
                    {on && (
                      <span
                        aria-hidden
                        style={{
                          position: "absolute",
                          top: 6,
                          right: 6,
                          width: 22,
                          height: 22,
                          borderRadius: 99,
                          background: "var(--rd-pink)",
                          color: "var(--rd-aubergine)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontWeight: 800,
                          fontSize: 12,
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
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
