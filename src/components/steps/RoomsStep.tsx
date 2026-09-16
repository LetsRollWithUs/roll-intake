import { ROOM_TYPES } from "@/data/intake-options";
import type { Room } from "@/lib/types";
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
      { id: uid(), typeKey, label: defaultLabel(typeKey, prev), surfaces: ["muren"], photos: [] },
    ]);
  };
  const removeRoom = (id: string) => setRooms((prev) => prev.filter((r) => r.id !== id));
  const patchRoom = (id: string, patch: Partial<Room>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  const countFor = (typeKey: string) => rooms.filter((r) => r.typeKey === typeKey).length;

  const showPriority = rooms.length >= 3;
  const priorityCount = rooms.filter((r) => r.priority).length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        {ROOM_TYPES.map((t) => {
          const n = countFor(t.key);
          return (
            <button key={t.key} className="rd-row" onClick={() => addRoom(t.key)}>
              <span className="rd-row-label">{t.label}</span>
              <span
                className="rd-ring"
                aria-hidden
                style={n > 0 ? { borderColor: "var(--rd-pink)", background: "var(--rd-pink)" } : undefined}
              >
                {n > 0 ? n : "+"}
              </span>
            </button>
          );
        })}
      </div>

      {/* 30-minuten-verwachtingsmanagement: bij meer dan 2 ruimtes */}
      {rooms.length >= 3 && (
        <div className="rd-card-white" style={{ background: "var(--rd-lime)" }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>
            Even opletten
          </div>
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Je hebt <strong>{rooms.length} ruimtes</strong> gekozen. In 30 minuten behandelen we er
            meestal 1 à 2 echt goed. Vink hieronder je <strong>belangrijkste ruimtes</strong> aan
            (max 2), dan richten we het gesprek daarop.
          </p>
          <p style={{ margin: "10px 0 0", fontSize: 14, lineHeight: 1.45 }}>
            Wil je alles in één keer aanpakken? Dan past een{" "}
            <strong>uitgebreid kleuradvies</strong> beter.
          </p>
          <a
            href="https://roll.nl/kleuradvies"
            target="_blank"
            rel="noreferrer"
            className="rd-btn rd-btn-outline"
            style={{ marginTop: 12, textDecoration: "none" }}
          >
            Bekijk uitgebreid kleuradvies
          </a>
        </div>
      )}

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
              {showPriority && (
                <button
                  className={`rd-plan-chip${room.priority ? " is-on" : ""}`}
                  onClick={() => patchRoom(room.id, { priority: !room.priority })}
                  aria-pressed={!!room.priority}
                  disabled={!room.priority && priorityCount >= 2}
                  style={{
                    marginTop: 12,
                    ...(!room.priority && priorityCount >= 2 ? { opacity: 0.4, cursor: "not-allowed" } : {}),
                  }}
                >
                  {room.priority ? "★ Voorrang" : "☆ Voorrang geven"}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
