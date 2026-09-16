import { ImageGrid } from "@/components/ImageGrid";
import type { UploadedImage } from "@/lib/types";

interface Props {
  pinterestUrl: string;
  otherInspirationUrl: string;
  inspirationImages: UploadedImage[];
  inspirationNote: string;
  onPinterest: (v: string) => void;
  onOther: (v: string) => void;
  onImages: (v: UploadedImage[]) => void;
  onNote: (v: string) => void;
}

export function InspiratieStep({
  pinterestUrl,
  otherInspirationUrl,
  inspirationImages,
  inspirationNote,
  onPinterest,
  onOther,
  onImages,
  onNote,
}: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Heb je beelden verzameld die laten zien waar je naartoe wilt? Deel ze hier. Alles is welkom,
        ook een half idee.
      </p>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Pinterest-board
        </div>
        <input
          className="rd-input"
          value={pinterestUrl}
          onChange={(e) => onPinterest(e.target.value)}
          placeholder="https://pinterest.com/..."
          inputMode="url"
          aria-label="Pinterest-link"
        />
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Andere link
        </div>
        <input
          className="rd-input"
          value={otherInspirationUrl}
          onChange={(e) => onOther(e.target.value)}
          placeholder="https://..."
          inputMode="url"
          aria-label="Andere link"
        />
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Inspiratiebeelden uploaden (max. 5)
        </div>
        <ImageGrid images={inspirationImages} onChange={onImages} max={5} />
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Wat spreekt je hierin vooral aan? (optioneel)
        </div>
        <textarea
          className="rd-input"
          value={inspirationNote}
          onChange={(e) => onNote(e.target.value)}
          placeholder="Bijvoorbeeld de warme kleuren, donkere kozijnen of juist de rustige uitstraling."
          style={{ height: 96, paddingTop: 12, resize: "none", lineHeight: 1.4 }}
        />
      </div>
    </div>
  );
}
