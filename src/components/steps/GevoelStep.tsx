import { MOODS } from "@/data/intake-options";

interface Props {
  moods: string[];
  boldness?: number;
  multiRoom: boolean;
  sfeerSameAll?: boolean;
  sfeerExceptionNote: string;
  onMoods: (v: string[]) => void;
  onBoldness: (v: number) => void;
  onSameAll: (v: boolean) => void;
  onException: (v: string) => void;
}

const MAX = 3;

export function GevoelStep({
  moods,
  boldness,
  multiRoom,
  sfeerSameAll,
  sfeerExceptionNote,
  onMoods,
  onBoldness,
  onSameAll,
  onException,
}: Props) {
  const toggle = (m: string) => {
    if (moods.includes(m)) onMoods(moods.filter((x) => x !== m));
    else if (moods.length < MAX) onMoods([...moods, m]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Kies maximaal 3 omschrijvingen ({moods.length}/{MAX})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {MOODS.map((m) => {
            const on = moods.includes(m);
            const dim = !on && moods.length >= MAX;
            return (
              <button
                key={m}
                className={`rd-plan-chip${on ? " is-on" : ""}`}
                onClick={() => toggle(m)}
                aria-pressed={on}
                style={dim ? { opacity: 0.45 } : undefined}
              >
                {m}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Hoe uitgesproken mogen we adviseren? (optioneel)
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              className={`rd-seg${boldness === n ? " is-on" : ""}`}
              onClick={() => onBoldness(boldness === n ? 0 : n)}
            >
              {n}
            </button>
          ))}
        </div>
        <p className="rd-sub" style={{ marginTop: 8 }}>
          1 = rustig en ingetogen, 5 = verras me maar
        </p>
      </div>

      {multiRoom && (
        <div>
          <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
            Geldt deze sfeer voor alle ruimtes?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`rd-plan-chip${sfeerSameAll === true ? " is-on" : ""}`}
              onClick={() => onSameAll(true)}
              aria-pressed={sfeerSameAll === true}
            >
              Ja, voor allemaal
            </button>
            <button
              className={`rd-plan-chip${sfeerSameAll === false ? " is-on" : ""}`}
              onClick={() => onSameAll(false)}
              aria-pressed={sfeerSameAll === false}
            >
              Nee, verschilt per ruimte
            </button>
          </div>
          {sfeerSameAll === false && (
            <textarea
              className="rd-input"
              value={sfeerExceptionNote}
              onChange={(e) => onException(e.target.value)}
              placeholder="Kort: welke ruimte wijkt af en hoe? (optioneel)"
              style={{ height: 72, paddingTop: 10, marginTop: 10, resize: "none", lineHeight: 1.4 }}
            />
          )}
        </div>
      )}
    </div>
  );
}
