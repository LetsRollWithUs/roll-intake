import { useState } from "react";

// Wachtwoordveld met een oogje om te zien wat je typt.
const Eye = ({ open }: { open: boolean }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    {!open && <path d="M3 3l18 18" />}
  </svg>
);

export function PasswordInput({ value, onChange, placeholder = "Wachtwoord", autoComplete = "current-password", required, minLength, autoFocus }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoComplete?: string;
  required?: boolean;
  minLength?: number;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: "relative" }}>
      <input
        className="rd-input"
        type={show ? "text" : "password"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        required={required}
        minLength={minLength}
        autoFocus={autoFocus}
        style={{ paddingRight: 48, width: "100%" }}
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        aria-label={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
        title={show ? "Wachtwoord verbergen" : "Wachtwoord tonen"}
        style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", background: "none", border: 0, padding: 8, cursor: "pointer", color: "var(--rd-aubergine)", opacity: 0.6, display: "flex" }}
      >
        <Eye open={show} />
      </button>
    </div>
  );
}
