import { statusDef } from "./status";

export function StatusPill({ status }: { status: string }) {
  const s = statusDef(status);
  return (
    <span
      style={{
        display: "inline-block",
        background: s.bg,
        color: s.ink,
        fontWeight: 700,
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 99,
        whiteSpace: "nowrap",
      }}
    >
      {s.label}
    </span>
  );
}

export function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}
