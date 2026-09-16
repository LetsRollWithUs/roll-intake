import { HELP_NEEDS } from "@/data/intake-options";

interface Props {
  helpNeeds: string[];
  mainQuestion: string;
  onHelpNeeds: (v: string[]) => void;
  onQuestion: (v: string) => void;
}

const MAX = 2;

export function VraagStep({ helpNeeds, mainQuestion, onHelpNeeds, onQuestion }: Props) {
  const toggle = (v: string) => {
    if (helpNeeds.includes(v)) onHelpNeeds(helpNeeds.filter((x) => x !== v));
    else if (helpNeeds.length < MAX) onHelpNeeds([...helpNeeds, v]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Waar wil je vooral hulp bij? (max. 2, {helpNeeds.length}/{MAX})
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {HELP_NEEDS.map((h) => {
            const on = helpNeeds.includes(h);
            const dim = !on && helpNeeds.length >= MAX;
            return (
              <button
                key={h}
                className={`rd-plan-chip${on ? " is-on" : ""}`}
                onClick={() => toggle(h)}
                aria-pressed={on}
                style={dim ? { opacity: 0.45 } : undefined}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Waar wil je na het gesprek duidelijkheid over hebben?
        </div>
        <textarea
          className="rd-input"
          value={mainQuestion}
          onChange={(e) => onQuestion(e.target.value)}
          placeholder="Dit is het belangrijkste. Vertel in je eigen woorden wat een geslaagd advies voor jou zou zijn."
          style={{ height: 130, paddingTop: 12, resize: "none", lineHeight: 1.4 }}
        />
      </div>
    </div>
  );
}
