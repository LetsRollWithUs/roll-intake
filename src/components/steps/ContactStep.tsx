interface Props {
  contactName: string;
  contactEmail: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
}

export function ContactStep({ contactName, contactEmail, onName, onEmail }: Props) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
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
      <div className="rd-card-white" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
        <span className="rd-ring is-on" aria-hidden style={{ width: 22, height: 22, fontSize: 12 }}>
          ✓
        </span>
        <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>
          We bewaren je intake zodat je later verder kunt waar je gebleven was. Je krijgt geen spam.
        </span>
      </div>
    </div>
  );
}
