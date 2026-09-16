import { useRef } from "react";
import { DAYLIGHT, DAYLIGHT_DIRS } from "@/data/intake-options";
import type { Room, DaylightKey, DaylightDir } from "@/lib/types";
import { uid } from "@/lib/store";

interface Props {
  rooms: Room[];
  setRooms: (updater: (prev: Room[]) => Room[]) => void;
}

function RoomPhotos({
  room,
  patch,
}: {
  room: Room;
  patch: (id: string, p: Partial<Room>) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const onFiles = (files: FileList | null) => {
    if (!files) return;
    const added = Array.from(files).map((f) => ({
      id: uid(),
      url: URL.createObjectURL(f),
      name: f.name,
    }));
    patch(room.id, { photos: [...room.photos, ...added] });
  };

  const removePhoto = (pid: string) =>
    patch(room.id, { photos: room.photos.filter((p) => p.id !== pid) });

  return (
    <div className="rd-card-white">
      <div className="rd-row-label" style={{ marginBottom: 12 }}>
        {room.label}
      </div>

      {/* Foto's */}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {room.photos.map((p) => (
          <div
            key={p.id}
            style={{
              position: "relative",
              width: 76,
              height: 76,
              borderRadius: 12,
              overflow: "hidden",
              background: "var(--rd-grey-light)",
            }}
          >
            <img
              src={p.url}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
            <button
              onClick={() => removePhoto(p.id)}
              aria-label="Foto verwijderen"
              style={{
                position: "absolute",
                top: 3,
                right: 3,
                width: 22,
                height: 22,
                borderRadius: 99,
                border: 0,
                background: "rgba(47,33,65,.72)",
                color: "#fff",
                fontSize: 13,
                lineHeight: 1,
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        ))}
        <button
          onClick={() => fileRef.current?.click()}
          aria-label="Foto toevoegen"
          style={{
            width: 76,
            height: 76,
            borderRadius: 12,
            border: "1.5px dashed var(--rd-lavender-mid)",
            background: "var(--rd-offwhite)",
            color: "var(--rd-aubergine)",
            fontSize: 26,
            cursor: "pointer",
          }}
        >
          +
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            onFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {/* Lichtinval */}
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

      {/* Windrichting */}
      <div style={{ marginTop: 14 }}>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Op het zonnigst gericht op
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {DAYLIGHT_DIRS.map((d) => (
            <button
              key={d.key}
              className={`rd-plan-chip${room.daylightDir === d.key ? " is-on" : ""}`}
              onClick={() =>
                patch(room.id, {
                  daylightDir: room.daylightDir === d.key ? undefined : (d.key as DaylightDir),
                })
              }
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PhotosStep({ rooms, setRooms }: Props) {
  const patch = (id: string, p: Partial<Room>) =>
    setRooms((prev) => prev.map((r) => (r.id === id ? { ...r, ...p } : r)));

  if (rooms.length === 0) {
    return (
      <div className="rd-card-white" style={{ textAlign: "center", padding: "24px 18px" }}>
        <p style={{ margin: 0, fontWeight: 600 }}>
          Voeg eerst een ruimte toe bij stap 1.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {rooms.map((room) => (
        <RoomPhotos key={room.id} room={room} patch={patch} />
      ))}
    </div>
  );
}
