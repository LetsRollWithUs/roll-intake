import { ImageGrid } from "@/components/ImageGrid";
import type { UploadedImage } from "@/lib/types";

interface Props {
  pinterestUrl: string;
  otherInspirationUrl: string;
  inspirationImages: UploadedImage[];
  inspirationNote: string;
  hasOtherChanges?: boolean;
  otherChangesNote: string;
  onPinterest: (v: string) => void;
  onOther: (v: string) => void;
  onImages: (v: UploadedImage[]) => void;
  onNote: (v: string) => void;
  onHasOtherChanges: (v: boolean) => void;
  onOtherChangesNote: (v: string) => void;
}

export function isUrlish(v: string): boolean {
  const t = v.trim();
  if (!t) return true; // leeg mag
  return /^(https?:\/\/)?[a-z0-9-]+(\.[a-z0-9-]+)+([/?#].*)?$/i.test(t);
}

export function InspiratieStep({
  pinterestUrl,
  otherInspirationUrl,
  inspirationImages,
  inspirationNote,
  hasOtherChanges,
  otherChangesNote,
  onPinterest,
  onOther,
  onImages,
  onNote,
  onHasOtherChanges,
  onOtherChangesNote,
}: Props) {
  const badPin = !isUrlish(pinterestUrl);
  const badOther = !isUrlish(otherInspirationUrl);

  const linkStyle = (bad: boolean) =>
    bad ? { borderColor: "var(--rd-pink-dark)" } : undefined;

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
          style={linkStyle(badPin)}
        />
        {badPin && (
          <p className="rd-sub" style={{ marginTop: 6, color: "var(--rd-pink-dark)", opacity: 1 }}>
            Dit lijkt geen geldige link. Laat leeg of plak een volledige URL.
          </p>
        )}
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
          style={linkStyle(badOther)}
        />
        {badOther && (
          <p className="rd-sub" style={{ marginTop: 6, color: "var(--rd-pink-dark)", opacity: 1 }}>
            Dit lijkt geen geldige link. Laat leeg of plak een volledige URL.
          </p>
        )}
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

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Verandert er nog iets aan de vloer, meubels of gordijnen?
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <button
            className={`rd-plan-chip${hasOtherChanges === true ? " is-on" : ""}`}
            onClick={() => onHasOtherChanges(true)}
            aria-pressed={hasOtherChanges === true}
          >
            Ja
          </button>
          <button
            className={`rd-plan-chip${hasOtherChanges === false ? " is-on" : ""}`}
            onClick={() => onHasOtherChanges(false)}
            aria-pressed={hasOtherChanges === false}
          >
            Nee, blijft zoals op de foto's
          </button>
        </div>
        {hasOtherChanges === true && (
          <textarea
            className="rd-input"
            value={otherChangesNote}
            onChange={(e) => onOtherChangesNote(e.target.value)}
            placeholder="Wat verandert er? Bijv. nieuwe eiken vloer, ander bankstel."
            style={{ height: 72, paddingTop: 10, marginTop: 10, resize: "none", lineHeight: 1.4 }}
          />
        )}
      </div>
    </div>
  );
}
