import { HELP_NEEDS, PLANNING, PAINTERS } from "@/data/intake-options";
import type { PlanningKey, PainterKey } from "@/lib/types";

interface Props {
  helpNeeds: string[];
  mainQuestion: string;
  multiRoom: boolean;
  questionScope?: "een" | "meerdere";
  planning?: PlanningKey;
  painter?: PainterKey;
  onHelpNeeds: (v: string[]) => void;
  onQuestion: (v: string) => void;
  onScope: (v: "een" | "meerdere") => void;
  onPlanning: (v: PlanningKey) => void;
  onPainter: (v: PainterKey) => void;
}

const MAX = 2;

export function VraagStep({
  helpNeeds,
  mainQuestion,
  multiRoom,
  questionScope,
  planning,
  painter,
  onHelpNeeds,
  onQuestion,
  onScope,
  onPlanning,
  onPainter,
}: Props) {
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

      {multiRoom && (
        <div>
          <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
            Gaat je vraag over één ruimte of meerdere?
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className={`rd-plan-chip${questionScope === "een" ? " is-on" : ""}`}
              onClick={() => onScope("een")}
              aria-pressed={questionScope === "een"}
            >
              Eén ruimte
            </button>
            <button
              className={`rd-plan-chip${questionScope === "meerdere" ? " is-on" : ""}`}
              onClick={() => onScope("meerdere")}
              aria-pressed={questionScope === "meerdere"}
            >
              Meerdere ruimtes
            </button>
          </div>
        </div>
      )}

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Wanneer wil je gaan schilderen?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PLANNING.map((p) => (
            <button
              key={p.key}
              className={`rd-plan-chip${planning === p.key ? " is-on" : ""}`}
              onClick={() => onPlanning(p.key)}
              aria-pressed={planning === p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Wie gaat er schilderen?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PAINTERS.map((p) => (
            <button
              key={p.key}
              className={`rd-plan-chip${painter === p.key ? " is-on" : ""}`}
              onClick={() => onPainter(p.key)}
              aria-pressed={painter === p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
