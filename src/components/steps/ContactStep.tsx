import type { IntakeAdres } from "@/lib/types";

interface Props {
  contactName: string;
  contactEmail: string;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
  /** Alleen meegeven als het adres nog niet bekend is; dan tonen we de adresvelden. */
  adres?: IntakeAdres;
  onAdres?: (v: IntakeAdres) => void;
}

const LEEG: IntakeAdres = { straat: "", huisnummer: "", postcode: "", plaats: "" };

export function ContactStep({ contactName, contactEmail, onName, onEmail, adres, onAdres }: Props) {
  const a = adres ?? LEEG;
  const set = (k: keyof IntakeAdres, v: string) => onAdres?.({ ...a, [k]: v });
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
      {onAdres && (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div style={{ fontWeight: 700, fontSize: 16 }}>Waar woon je?</div>
            <div style={{ fontSize: 14, lineHeight: 1.35, opacity: 0.75, marginTop: 2 }}>
              Zo kan je kleuradviseur alvast zien wat voor huis en buurt het is. Gaat het om een nieuwe woning? Vul dan dat adres in.
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="rd-input" style={{ flex: 3, minWidth: 0 }} value={a.straat} onChange={(e) => set("straat", e.target.value)}
              placeholder="Straat" autoComplete="address-line1" aria-label="Straat" />
            <input className="rd-input" style={{ flex: 1, minWidth: 0 }} value={a.huisnummer} onChange={(e) => set("huisnummer", e.target.value)}
              placeholder="Nr." aria-label="Huisnummer" />
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <input className="rd-input" style={{ flex: 1, minWidth: 0 }} value={a.postcode} onChange={(e) => set("postcode", e.target.value.toUpperCase())}
              placeholder="Postcode" autoComplete="postal-code" aria-label="Postcode" />
            <input className="rd-input" style={{ flex: 2, minWidth: 0 }} value={a.plaats} onChange={(e) => set("plaats", e.target.value)}
              placeholder="Plaats" autoComplete="address-level2" aria-label="Plaats" />
          </div>
        </div>
      )}
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
