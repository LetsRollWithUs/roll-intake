import { HELP_NEEDS } from "@/data/intake-options";

interface Props {
  helpNeeds: string[];
  mainQuestion: string;
  contactName: string;
  contactEmail: string;
  onHelpNeeds: (v: string[]) => void;
  onQuestion: (v: string) => void;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
}

export function VraagStep({
  helpNeeds,
  mainQuestion,
  contactName,
  contactEmail,
  onHelpNeeds,
  onQuestion,
  onName,
  onEmail,
}: Props) {
  const toggle = (v: string) =>
    onHelpNeeds(helpNeeds.includes(v) ? helpNeeds.filter((x) => x !== v) : [...helpNeeds, v]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Waar mogen we vooral op letten? (meerdere mag)
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {HELP_NEEDS.map((h) => {
            const on = helpNeeds.includes(h);
            return (
              <button
                key={h}
                className={`rd-plan-chip${on ? " is-on" : ""}`}
                onClick={() => toggle(h)}
                aria-pressed={on}
              >
                {h}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Vertel het in je eigen woorden
        </div>
        <textarea
          className="rd-input"
          value={mainQuestion}
          onChange={(e) => onQuestion(e.target.value)}
          placeholder="Waar loop je tegenaan, en wat zou een geslaagd advies voor jou zijn?"
          style={{ height: 120, paddingTop: 12, paddingBottom: 12, resize: "none", lineHeight: 1.4 }}
        />
      </div>

      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Waar sturen we je advies naartoe?
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="rd-input"
            value={contactName}
            onChange={(e) => onName(e.target.value)}
            placeholder="Je naam"
            autoComplete="name"
            aria-label="Je naam"
          />
          <input
            className="rd-input"
            type="email"
            value={contactEmail}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="Je e-mailadres"
            autoComplete="email"
            aria-label="Je e-mailadres"
          />
        </div>
      </div>
    </div>
  );
}
