import { INSPIRATIONS } from "@/data/inspiration";
import { MOODS } from "@/data/intake-options";

interface Props {
  moods: string[];
  inspirationLikes: string[];
  boldness?: number;
  onMoods: (v: string[]) => void;
  onLikes: (v: string[]) => void;
  onBoldness: (v: number) => void;
}

const BOLDNESS_LABELS = ["Heel rustig", "Rustig", "Neutraal", "Gedurfd", "Heel gedurfd"];

export function SfeerStep({
  moods,
  inspirationLikes,
  boldness,
  onMoods,
  onLikes,
  onBoldness,
}: Props) {
  const toggle = (arr: string[], v: string, set: (x: string[]) => void) =>
    set(arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      {/* Moodboard uit de Roll-library */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Welke beelden spreken je aan? (meerdere mag)
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            gap: 10,
          }}
        >
          {INSPIRATIONS.map((img) => {
            const on = inspirationLikes.includes(img.id);
            return (
              <button
                key={img.id}
                onClick={() => toggle(inspirationLikes, img.id, onLikes)}
                aria-pressed={on}
                style={{
                  position: "relative",
                  border: on ? "3px solid var(--rd-pink)" : "3px solid transparent",
                  borderRadius: 16,
                  overflow: "hidden",
                  padding: 0,
                  cursor: "pointer",
                  background: "var(--rd-grey-light)",
                  aspectRatio: "1 / 1",
                }}
              >
                <img
                  src={img.src}
                  alt={img.label}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
                {on && (
                  <span
                    aria-hidden
                    style={{
                      position: "absolute",
                      top: 8,
                      right: 8,
                      width: 26,
                      height: 26,
                      borderRadius: 99,
                      background: "var(--rd-pink)",
                      color: "var(--rd-aubergine)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontWeight: 800,
                      fontSize: 14,
                    }}
                  >
                    ✓
                  </span>
                )}
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: 0,
                    padding: "16px 10px 8px",
                    background: "linear-gradient(transparent, rgba(47,33,65,.72))",
                    color: "#fff",
                    fontWeight: 700,
                    fontSize: 12,
                    textAlign: "left",
                  }}
                >
                  {img.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Sfeerwoorden */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Welke woorden passen bij je?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map((m) => {
            const on = moods.includes(m);
            return (
              <button
                key={m}
                className={`rd-plan-chip${on ? " is-on" : ""}`}
                onClick={() => toggle(moods, m, onMoods)}
                aria-pressed={on}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      {/* Durf */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Hoeveel kleur durf je aan?
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`rd-seg${boldness === n ? " is-on" : ""}`}
              onClick={() => onBoldness(n)}
              aria-label={BOLDNESS_LABELS[n - 1]}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="rd-sub" style={{ marginTop: 8 }}>
          {boldness ? BOLDNESS_LABELS[boldness - 1] : "1 = rustig en ingetogen, 5 = vol op kleur"}
        </p>
      </div>
    </div>
  );
}
