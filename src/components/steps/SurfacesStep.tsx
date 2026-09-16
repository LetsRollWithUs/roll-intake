import { SURFACES } from "@/data/intake-options";
import type { Room, SurfaceKey } from "@/lib/types";

interface Props {
  rooms: Room[];
  setRooms: (updater: (prev: Room[]) => Room[]) => void;
}

export function SurfacesStep({ rooms, setRooms }: Props) {
  const toggle = (roomId: string, key: SurfaceKey) =>
    setRooms((prev) =>
      prev.map((r) => {
        if (r.id !== roomId) return r;
        const on = r.surfaces.includes(key);
        return { ...r, surfaces: on ? r.surfaces.filter((s) => s !== key) : [...r.surfaces, key] };
      }),
    );

  if (rooms.length === 0) {
    return (
      <div className="rd-card-white" style={{ textAlign: "center", padding: "24px 18px" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>Voeg eerst een ruimte toe bij stap 1.</p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rooms.map((room) => (
        <div key={room.id} className="rd-card-white">
          <div className="rd-row-label" style={{ marginBottom: 12 }}>
            {room.label}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {SURFACES.map((s) => {
              const on = room.surfaces.includes(s.key);
              return (
                <button
                  key={s.key}
                  className={`rd-plan-chip${on ? " is-on" : ""}`}
                  onClick={() => toggle(room.id, s.key)}
                  aria-pressed={on}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
