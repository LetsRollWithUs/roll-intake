import { useMemo, useState } from "react";

export interface Slot {
  start_at: string;
  free: number;
}

// Design-tokens (handoff v1)
export const AUB = "#2F2141";
export const AUB_DIM = "#B9B2C0";
export const GREEN = "#5A8C4F";
export const GREEN_BG = "rgba(90,140,79,.14)";
export const PINK = "#B24A78";
export const CREME = "#FBF7EE";

export const TZ = "Europe/Amsterdam";
export const dateKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
export const dayFull = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
export const timeLabel = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
export const hourOf = (iso: string) =>
  Number(new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", hour12: false }).format(new Date(iso)));

export const isoDate = (d: Date) => d.toISOString().slice(0, 10);
const pad = (n: number) => String(n).padStart(2, "0");
const cellKey = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
export const MONTHS = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

export function Calendar({
  availDays, todayKey, maxKey, value, onSelect,
}: {
  availDays: Set<string>; todayKey: string; maxKey: string; value: string; onSelect: (k: string) => void;
}) {
  const startY = Number(todayKey.slice(0, 4));
  const startM = Number(todayKey.slice(5, 7)) - 1;
  const [cur, setCur] = useState({ y: startY, m: startM });
  const maxY = Number(maxKey.slice(0, 4));
  const maxM = Number(maxKey.slice(5, 7)) - 1;
  const canPrev = cur.y > startY || (cur.y === startY && cur.m > startM);
  const canNext = cur.y < maxY || (cur.y === maxY && cur.m < maxM);
  const shift = (d: number) => {
    const nm = cur.m + d;
    setCur({ y: cur.y + Math.floor(nm / 12), m: ((nm % 12) + 12) % 12 });
  };
  const first = new Date(cur.y, cur.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(cur.y, cur.m + 1, 0).getDate();
  const cells: (number | null)[] = [...Array(offset).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const nav = (dir: number, ok: boolean) => (
    <button onClick={() => ok && shift(dir)} disabled={!ok} aria-label={dir < 0 ? "Vorige maand" : "Volgende maand"}
      style={{ width: 32, height: 32, borderRadius: 99, border: "1px solid rgba(47,33,65,.12)", background: "#fff", cursor: ok ? "pointer" : "default", opacity: ok ? 1 : 0.35, color: AUB, fontSize: 16 }}>
      {dir < 0 ? "‹" : "›"}
    </button>
  );
  return (
    <div style={{ background: "#fff", borderRadius: 18, padding: "16px 16px 18px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        {nav(-1, canPrev)}
        <span style={{ fontWeight: 800, fontSize: 15 }}>{MONTHS[cur.m]} {cur.y}</span>
        {nav(1, canNext)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, textAlign: "center", fontWeight: 600, fontSize: 10, color: "rgba(47,33,65,.4)", marginBottom: 6 }}>
        {["M", "D", "W", "D", "V", "Z", "Z"].map((d, i) => <span key={i}>{d}</span>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const key = cellKey(cur.y, cur.m, d);
          const enabled = availDays.has(key) && key >= todayKey && key <= maxKey;
          const selected = key === value;
          return (
            <button key={i} onClick={() => enabled && onSelect(key)} disabled={!enabled}
              aria-label={`${d} ${MONTHS[cur.m]}${enabled ? ", beschikbaar" : ", niet beschikbaar"}`}
              style={{
                aspectRatio: "1 / 1", border: 0, borderRadius: 99, fontSize: 13, position: "relative",
                fontWeight: enabled ? 700 : 400, cursor: enabled ? "pointer" : "default",
                background: selected ? AUB : enabled ? GREEN_BG : "transparent",
                color: selected ? "#fff" : enabled ? AUB : "rgba(47,33,65,.3)",
              }}>
              {d}
              {enabled && !selected && (
                <span style={{ position: "absolute", bottom: 5, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: 99, background: GREEN }} />
              )}
            </button>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 16, marginTop: 14, fontWeight: 500, fontSize: 11, color: "rgba(47,33,65,.55)" }}>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN }} />beschikbaar</span>
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: AUB }} />gekozen</span>
      </div>
    </div>
  );
}

// Tijden van de gekozen dag, gegroepeerd per dagdeel
export function TimePicker({
  slots, day, value, onSelect,
}: {
  slots: Slot[]; day: string; value: string; onSelect: (iso: string) => void;
}) {
  const dayParts = useMemo(() => {
    const list = slots.filter((s) => dateKey(s.start_at) === day);
    const groups: { label: string; slots: Slot[] }[] = [
      { label: "Ochtend", slots: [] },
      { label: "Middag", slots: [] },
      { label: "Avond", slots: [] },
    ];
    for (const s of list) {
      const h = hourOf(s.start_at);
      groups[h < 12 ? 0 : h < 17 ? 1 : 2].slots.push(s);
    }
    return groups.filter((g) => g.slots.length > 0);
  }, [slots, day]);

  const first = slots.find((s) => dateKey(s.start_at) === day);
  if (!day || !first) return null;

  return (
    <div style={{ marginTop: 20 }}>
      <div style={{ fontWeight: 600, fontSize: 11, letterSpacing: ".12em", textTransform: "uppercase", color: "rgba(47,33,65,.5)", marginBottom: 10 }}>
        Tijd · {dayFull(first.start_at)}
      </div>
      {dayParts.map((p) => (
        <div key={p.label} style={{ marginBottom: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 12, color: "rgba(47,33,65,.6)", marginBottom: 6 }}>{p.label}</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 6 }}>
            {p.slots.map((s) => {
              const on = value === s.start_at;
              return (
                <button key={s.start_at} onClick={() => onSelect(s.start_at)}
                  style={{
                    padding: "11px 0", borderRadius: 12, minHeight: 44, cursor: "pointer",
                    border: `1.5px solid ${on ? AUB : "rgba(47,33,65,.15)"}`,
                    background: on ? AUB : "#fff", color: on ? "#fff" : AUB, font: "600 13px Figtree",
                  }}>
                  {timeLabel(s.start_at)}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
