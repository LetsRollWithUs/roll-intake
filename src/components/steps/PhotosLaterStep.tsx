import { ImageGrid } from "@/components/ImageGrid";
import { SUN_MOMENTS } from "@/data/intake-options";
import type { Room, SunMoment, UploadedImage } from "@/lib/types";

interface Props {
  rooms: Room[];
  patch: (id: string, p: Partial<Room>) => void;
  /** Woont de klant er toch al? Terug naar foto's en licht per ruimte. */
  onTochAl: () => void;
}

// Foto's & licht voor wie er nog niet woont: één scherm, alles optioneel. Wel ruimte voor
// beelden van de makelaar of een plattegrond, want die helpen al bij het advies.
export function PhotosLaterStep({ rooms, patch, onTochAl }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rd-card-white">
        <p style={{ margin: 0, fontWeight: 600 }}>Geen foto's? Geen probleem.</p>
        <p className="rd-sub" style={{ margin: "6px 0 0" }}>
          Heb je al foto's van de makelaar of verkoper, of een plattegrond? Voeg ze gerust toe, dat helpt bij je advies.
          Weet je al aan welke kant de zon binnenvalt, bijvoorbeeld uit de woningbeschrijving? Kies het dan per ruimte.
        </p>
      </div>

      {rooms.map((room) => {
        const sun = room.sun ?? [];
        const toggleSun = (k: SunMoment) => {
          const next = sun.includes(k) ? sun.filter((x) => x !== k) : [...sun, k];
          patch(room.id, { sun: next, sunUnknown: next.length === 0, noWindows: false });
        };
        return (
          <div key={room.id} className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div className="rd-row-label">{room.label}</div>
            <ImageGrid
              images={room.photos}
              onChange={(next: UploadedImage[]) => patch(room.id, { photos: next, noPhotos: next.length === 0 })}
              max={6}
            />
            <div>
              <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>Wanneer valt de zon binnen?</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {SUN_MOMENTS.map((m) => (
                  <button key={m.key} className={`rd-plan-chip${sun.includes(m.key) ? " is-on" : ""}`}
                    onClick={() => toggleSun(m.key)} aria-pressed={sun.includes(m.key)}>
                    {m.label}
                  </button>
                ))}
                <button className={`rd-plan-chip${room.sunUnknown ? " is-on" : ""}`}
                  onClick={() => patch(room.id, { sunUnknown: true, sun: [], noWindows: false })} aria-pressed={!!room.sunUnknown}>
                  Weet ik nog niet
                </button>
              </div>
            </div>
          </div>
        );
      })}

      <button className="rd-textlink" onClick={onTochAl} style={{ alignSelf: "center", fontSize: 13, opacity: 0.75 }}>
        Woon je er toch al? Vul foto's en licht per ruimte in
      </button>
    </div>
  );
}
