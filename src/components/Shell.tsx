import type { ReactNode } from "react";

interface ShellProps {
  /** 1-based huidige stap voor de voortgangsbalk; 0 verbergt de balk. */
  step: number;
  total: number;
  onBack?: () => void;
  kicker?: string;
  title: ReactNode;
  sub?: ReactNode;
  children: ReactNode;
  /** Vaste voet, meestal de primaire knop. */
  footer?: ReactNode;
}

export function Shell({ step, total, onBack, kicker, title, sub, children, footer }: ShellProps) {
  const pct = total > 0 ? Math.round((step / total) * 100) : 0;

  return (
    <div
      className="rd-root rd-lock"
      style={{ background: "var(--rd-offwhite)", color: "var(--rd-aubergine)" }}
    >
      <div className="rd-col">
        {/* Kop: terug + voortgang */}
        <div style={{ flex: "none", padding: "14px 24px 0" }}>
          <div style={{ display: "flex", alignItems: "center", minHeight: 32 }}>
            {onBack ? (
              <button
                onClick={onBack}
                aria-label="Terug"
                className="rd-textlink"
                style={{ minHeight: 32, opacity: 0.7, textDecoration: "none" }}
              >
                ← Terug
              </button>
            ) : (
              <span aria-hidden style={{ minHeight: 32 }} />
            )}
            <span style={{ flex: 1 }} />
            {step > 0 && (
              <span className="rd-kicker" style={{ opacity: 0.55 }}>
                Stap {step} van {total}
              </span>
            )}
          </div>
        </div>
        {step > 0 && (
          <div className="rd-track" style={{ background: "var(--rd-lavender)" }}>
            <div className="rd-track-fill" style={{ width: `${pct}%` }} />
          </div>
        )}

        {/* Body: scrolt binnen het frame */}
        <div
          key={step}
          className="rd-screen-in rd-hide-scroll"
          style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "22px 24px 8px" }}
        >
          {kicker && (
            <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
              {kicker}
            </div>
          )}
          <h1 className="rd-h2">{title}</h1>
          {sub && <p className="rd-sub">{sub}</p>}
          <div style={{ marginTop: 22 }}>{children}</div>
        </div>

        {/* Voet: vaste CTA */}
        {footer && (
          <div
            className="rd-cta"
            style={{ flex: "none", padding: "12px 24px calc(16px + env(safe-area-inset-bottom))" }}
          >
            <div className="rd-cta-inner" style={{ maxWidth: 440, margin: "0 auto" }}>
              {footer}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
