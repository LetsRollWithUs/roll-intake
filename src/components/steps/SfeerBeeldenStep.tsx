import { INSPIRATIONS } from "@/data/inspiration";

interface Props {
  inspirationLikes: string[];
  onLikes: (v: string[]) => void;
}

const MAX = 2;

export function SfeerBeeldenStep({ inspirationLikes, onLikes }: Props) {
  const toggle = (id: string) => {
    if (inspirationLikes.includes(id)) {
      onLikes(inspirationLikes.filter((x) => x !== id));
    } else if (inspirationLikes.length < MAX) {
      onLikes([...inspirationLikes, id]);
    }
  };

  return (
    <div>
      <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
        Kies maximaal 2 ({inspirationLikes.length}/{MAX})
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        {INSPIRATIONS.map((img) => {
          const on = inspirationLikes.includes(img.id);
          const dim = !on && inspirationLikes.length >= MAX;
          return (
            <button
              key={img.id}
              onClick={() => toggle(img.id)}
              aria-pressed={on}
              style={{
                position: "relative",
                border: on ? "3px solid var(--rd-pink)" : "3px solid transparent",
                borderRadius: 16,
                overflow: "hidden",
                padding: 0,
                cursor: dim ? "not-allowed" : "pointer",
                background: "var(--rd-grey-light)",
                aspectRatio: "1 / 1",
                opacity: dim ? 0.45 : 1,
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
  );
}
