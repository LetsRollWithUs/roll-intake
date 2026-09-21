import { ImageGrid } from "@/components/ImageGrid";
import { SUN_MOMENTS, USAGE_TIMES } from "@/data/intake-options";
import type { Room, SunMoment, UsageTime, UploadedImage } from "@/lib/types";

interface Props {
  room: Room;
  index: number;
  total: number;
  patch: (id: string, p: Partial<Room>) => void;
}

export function PhotosStep({ room, index, total, patch }: Props) {
  const enough = room.photos.length >= 1;
  const sun = room.sun ?? [];

  const toggleSun = (k: SunMoment) => {
    const next = sun.includes(k) ? sun.filter((x) => x !== k) : [...sun, k];
    // Zon kiezen sluit "geen ramen" uit.
    patch(room.id, { sun: next, noWindows: next.length ? false : room.noWindows });
  };
  const setNoWindows = () =>
    patch(room.id, {
      noWindows: !room.noWindows,
      sun: !room.noWindows ? [] : sun,
      skylight: !room.noWindows ? false : room.skylight,
    });

  return (
    <div className="rd-card-white">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
        <div className="rd-row-label">{room.label}</div>
        {total > 1 && (
          <span className="rd-kicker" style={{ opacity: 0.55 }}>
            Ruimte {index + 1} van {total}
          </span>
        )}
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <span className="rd-kicker" style={{ color: enough ? "var(--rd-pink-dark)" : "rgba(47,33,65,.5)" }}>
          {room.photos.length} foto{room.photos.length === 1 ? "" : "'s"} {enough ? "✓" : "· min. 1"}
        </span>
      </div>

      <ImageGrid images={room.photos} onChange={(next: UploadedImage[]) => patch(room.id, { photos: next })} max={6} />
      <p className="rd-sub" style={{ marginTop: 8 }}>
        Eén foto is genoeg om te starten, maar meer helpt enorm: maak er het liefst een paar vanuit
        verschillende hoeken, plus een foto richting het raam. Liefst overdag en zonder filter.
      </p>

      {/* Wanneer valt de zon binnen? */}
      <div style={{ marginTop: 18 }}>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Wanneer valt de zon binnen?
        </div>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 10 }}>Meerdere antwoorden mogelijk.</p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {SUN_MOMENTS.map((m) => (
            <button
              key={m.key}
              className={`rd-plan-chip${sun.includes(m.key) ? " is-on" : ""}`}
              onClick={() => toggleSun(m.key)}
              aria-pressed={sun.includes(m.key)}
              disabled={!!room.noWindows}
              style={room.noWindows ? { opacity: 0.4 } : undefined}
            >
              {m.label}
            </button>
          ))}
        </div>

        <button
          className={`rd-plan-chip${room.skylight ? " is-on" : ""}`}
          onClick={() => patch(room.id, { skylight: !room.skylight })}
          aria-pressed={!!room.skylight}
          disabled={!!room.noWindows}
          style={{ marginTop: 10, ...(room.noWindows ? { opacity: 0.4 } : {}) }}
        >
          + Ik heb ook een dakraam
        </button>

        <div style={{ marginTop: 10 }}>
          <button
            className={`rd-plan-chip${room.noWindows ? " is-on" : ""}`}
            onClick={setNoWindows}
            aria-pressed={!!room.noWindows}
          >
            Geen ramen
          </button>
        </div>
      </div>

      {/* Wanneer gebruik je de ruimte het meest? */}
      <div style={{ marginTop: 18 }}>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 4 }}>
          Wanneer gebruik je de ruimte het meest?
        </div>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 10 }}>
          Kunstlicht en daglicht laten kleuren anders overkomen.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {USAGE_TIMES.map((u) => {
            const on = room.usage === u.key;
            return (
              <button
                key={u.key}
                onClick={() => patch(room.id, { usage: on ? undefined : (u.key as UsageTime) })}
                aria-pressed={on}
                style={{
                  textAlign: "left",
                  padding: "12px 14px",
                  borderRadius: 12,
                  cursor: "pointer",
                  border: `1.5px solid ${on ? "var(--rd-aubergine)" : "var(--rd-line)"}`,
                  background: on ? "var(--rd-aubergine)" : "#fff",
                  color: on ? "#fff" : "var(--rd-aubergine)",
                }}
              >
                <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{u.label}</span>
                {u.sub && (
                  <span style={{ display: "block", fontSize: 13, opacity: on ? 0.85 : 0.6, marginTop: 2 }}>{u.sub}</span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Verandert er nog iets in deze ruimte? (hoort bij de ruimte + foto's) */}
      <div style={{ marginTop: 18 }}>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Verandert er nog iets aan de vloer, meubels of gordijnen?
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className={`rd-plan-chip${room.otherChanges === true ? " is-on" : ""}`}
            onClick={() => patch(room.id, { otherChanges: true })}
            aria-pressed={room.otherChanges === true}
          >
            Ja
          </button>
          <button
            className={`rd-plan-chip${room.otherChanges === false ? " is-on" : ""}`}
            onClick={() => patch(room.id, { otherChanges: false, otherChangesNote: "" })}
            aria-pressed={room.otherChanges === false}
          >
            Nee, blijft zoals op de foto's
          </button>
        </div>
        {room.otherChanges === true && (
          <textarea
            className="rd-input"
            value={room.otherChangesNote ?? ""}
            onChange={(e) => patch(room.id, { otherChangesNote: e.target.value })}
            placeholder="Wat verandert er? Bijv. nieuwe eiken vloer, ander bankstel, andere gordijnen."
            style={{ height: 72, paddingTop: 10, marginTop: 10, resize: "none", lineHeight: 1.4 }}
          />
        )}
      </div>
    </div>
  );
}
