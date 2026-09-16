import { ImageGrid } from "@/components/ImageGrid";
import { DAYLIGHT, DAYLIGHT_DIRS, USAGE_TIMES } from "@/data/intake-options";
import type { Room, DaylightKey, DaylightDir, UsageTime, UploadedImage } from "@/lib/types";

interface Props {
  rooms: Room[];
  setRooms: (updater: (prev: Room[]) => Room[]) => void;
}

export function PhotosStep({ rooms, setRooms }: Props) {
  const patch = (id: string, p: Partial<Room>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  if (rooms.length === 0) {
    return (
      <div className="rd-card-white" style={{ textAlign: "center", padding: "24px 18px" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Voeg eerst een ruimte toe bij stap 1.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rooms.map((room) => {
        const enough = room.photos.length >= 2;
        return (
          <div key={room.id} className="rd-card-white">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: 10,
              }}
            >
              <div className="rd-row-label">{room.label}</div>
              <span
                className="rd-kicker"
                style={{ color: enough ? "var(--rd-pink-dark)" : "rgba(47,33,65,.5)" }}
              >
                {room.photos.length}/2 {enough ? "✓" : "min."}
              </span>
            </div>

            <ImageGrid
              images={room.photos}
              onChange={(next: UploadedImage[]) => patch(room.id, { photos: next })}
              max={5}
            />
            <p className="rd-sub" style={{ marginTop: 8 }}>
              Voeg minimaal 2 foto's toe: een overzicht en een foto richting het raam. Liefst overdag
              en zonder filter.
            </p>

            <div style={{ marginTop: 16 }}>
              <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
                Hoeveel daglicht?
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                {DAYLIGHT.map((d) => (
                  <button
                    key={d.key}
                    className={`rd-seg${room.daylight === d.key ? " is-on" : ""}`}
                    onClick={() =>
                      patch(room.id, {
                        daylight: room.daylight === d.key ? undefined : (d.key as DaylightKey),
                      })
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
                Van welke kant komt het meeste daglicht?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {DAYLIGHT_DIRS.map((d) => (
                  <button
                    key={d.key}
                    className={`rd-plan-chip${room.daylightDir === d.key ? " is-on" : ""}`}
                    onClick={() =>
                      patch(room.id, {
                        daylightDir:
                          room.daylightDir === d.key ? undefined : (d.key as DaylightDir),
                      })
                    }
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginTop: 14 }}>
              <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
                Wanneer gebruik je deze ruimte vooral?
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {USAGE_TIMES.map((u) => (
                  <button
                    key={u.key}
                    className={`rd-plan-chip${room.usage === u.key ? " is-on" : ""}`}
                    onClick={() =>
                      patch(room.id, { usage: room.usage === u.key ? undefined : (u.key as UsageTime) })
                    }
                  >
                    {u.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
