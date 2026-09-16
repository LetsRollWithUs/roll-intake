import { useMemo, useState } from "react";
import { rollColors } from "@/data/roll-colors";
import type { ColorPick } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  colors: ColorPick[];
  inspirationNote: string;
  onColors: (v: ColorPick[]) => void;
  onNote: (v: string) => void;
}

// Lichte kleur → donkere inkt, donkere kleur → witte inkt.
function inkOn(hex?: string): string {
  if (!hex) return "var(--rd-aubergine)";
  const h = hex.replace("#", "");
  if (h.length < 6) return "var(--rd-aubergine)";
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.62 ? "#2F2141" : "#FFFFFF";
}

export function ColorsStep({ colors, inspirationNote, onColors, onNote }: Props) {
  const [q, setQ] = useState("");

  const results = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = term
      ? rollColors.filter(
          (c) =>
            c.name.toLowerCase().includes(term) ||
            (c.subname ?? "").toLowerCase().includes(term) ||
            (c.familyPrimary ?? "").toLowerCase().includes(term),
        )
      : rollColors;
    return list.slice(0, term ? 60 : 18);
  }, [q]);

  const isPicked = (id: string) => colors.some((c) => c.rollId === id);

  const toggle = (c: (typeof rollColors)[number]) => {
    if (isPicked(c.id)) {
      onColors(colors.filter((x) => x.rollId !== c.id));
    } else {
      onColors([
        ...colors,
        { id: uid(), rollId: c.id, name: c.name, hex: c.hex, verdict: "houden" },
      ]);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      {colors.length > 0 && (
        <div>
          <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
            Jouw kleuren ({colors.length})
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
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
                  style={{
                    width: 18,
                    height: 18,
                    borderRadius: 99,
                    background: c.hex,
                    border: "1px solid rgba(0,0,0,.1)",
                  }}
                />
                {c.name}
                <span aria-hidden style={{ opacity: 0.5 }}>
                  ×
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div>
        <input
          className="rd-input"
          placeholder="Zoek een Roll-kleur op naam of familie"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Zoek een Roll-kleur"
        />
        <div
          style={{
            marginTop: 12,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 8,
          }}
        >
          {results.map((c) => {
            const on = isPicked(c.id);
            return (
              <button
                key={c.id}
                onClick={() => toggle(c)}
                aria-pressed={on}
                style={{
                  position: "relative",
                  background: c.hex,
                  color: inkOn(c.hex),
                  border: on ? "3px solid var(--rd-pink)" : "3px solid transparent",
                  borderRadius: 14,
                  padding: "10px 8px",
                  minHeight: 74,
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
        </div>
        {results.length === 0 && (
          <p className="rd-sub">Geen kleur gevonden. Probeer een andere zoekterm.</p>
        )}
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Andere inspiratie of wensen (optioneel)
        </div>
        <textarea
          className="rd-input"
          value={inspirationNote}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Bijvoorbeeld een Pinterest-link, een merk of een kleur die je juist wilt vermijden."
          style={{ height: 96, paddingTop: 12, paddingBottom: 12, resize: "none", lineHeight: 1.4 }}
        />
      </div>
    </div>
  );
}
