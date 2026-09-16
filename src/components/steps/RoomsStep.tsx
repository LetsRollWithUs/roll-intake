import { ROOM_TYPES, SURFACES } from "@/data/intake-options";
import type { Room, SurfaceKey } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  rooms: Room[];
  setRooms: (updater: (prev: Room[]) => Room[]) => void;
}

function defaultLabel(typeKey: string, existing: Room[]): string {
  const type = ROOM_TYPES.find((t) => t.key === typeKey);
  const base = type && type.key !== "anders" ? type.label : "Ruimte";
  const sameType = existing.filter((r) => r.typeKey === typeKey);
  if (sameType.length === 0) return base;
  return `${base} ${sameType.length + 1}`;
}

export function RoomsStep({ rooms, setRooms }: Props) {
  const addRoom = (typeKey: string) => {
    setRooms((prev) => [
      ...prev,
      {
        id: uid(),
        typeKey,
        label: defaultLabel(typeKey, prev),
        surfaces: ["muren"],
        photos: [],
      },
    ]);
  };

  const removeRoom = (id: string) => setRooms((prev) => prev.filter((r) => r.id !== id));

  const patchRoom = (id: string, patch: Partial<Room>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const toggleSurface = (room: Room, key: SurfaceKey) => {
    const on = room.surfaces.includes(key);
    patchRoom(room.id, {
      surfaces: on ? room.surfaces.filter((s) => s !== key) : [...room.surfaces, key],
    });
  };

  const countFor = (typeKey: string) => rooms.filter((r) => r.typeKey === typeKey).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Kiezer: tik om een ruimte toe te voegen, meerdere keren mag */}
      <div>
        {ROOM_TYPES.map((t) => {
          const n = countFor(t.key);
          return (
            <button key={t.key} className="rd-row" onClick={() => addRoom(t.key)}>
              <span className="rd-row-label">{t.label}</span>
              <span className="rd-ring" aria-hidden style={n > 0 ? { borderColor: "var(--rd-pink)", background: "var(--rd-pink)" } : undefined}>
                {n > 0 ? n : "+"}
              </span>
            </button>
          );
        })}
      </div>

      {/* Toegevoegde ruimtes met naam en vlakken */}
      {rooms.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.55 }}>
            Jouw ruimtes ({rooms.length})
          </div>
          {rooms.map((room) => (
            <div key={room.id} className="rd-card-white">
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <input
                  className="rd-input"
                  value={room.label}
                  onChange={(e) => patchRoom(room.id, { label: e.target.value })}
                  aria-label="Naam van de ruimte"
                  style={{ flex: 1 }}
                />
                <button
                  className="rd-textlink"
                  onClick={() => removeRoom(room.id)}
                  aria-label="Ruimte verwijderen"
                  style={{ minHeight: 44, opacity: 0.6 }}
                >
                  Verwijder
                </button>
              </div>
              <div style={{ marginTop: 12 }}>
                <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
                  Wat wil je schilderen?
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {SURFACES.map((s) => {
                    const on = room.surfaces.includes(s.key);
                    return (
                      <button
                        key={s.key}
                        className={`rd-plan-chip${on ? " is-on" : ""}`}
                        onClick={() => toggleSurface(room, s.key)}
                        aria-pressed={on}
                      >
                        {s.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
