import { PLANNING, SURFACES } from "@/data/intake-options";
import type { IntakeState, PlanningKey } from "@/lib/types";

type EditTarget =
  | "contact"
  | "rooms"
  | "surfaces"
  | "photos"
  | "beelden"
  | "gevoel"
  | "kleuren"
  | "inspiratie"
  | "vraag";

interface Props {
  state: IntakeState;
  onPlanning: (v: PlanningKey) => void;
  onEdit: (t: EditTarget) => void;
}

function surfaceLabels(keys: string[]): string {
  return keys.map((k) => SURFACES.find((s) => s.key === k)?.label ?? k).join(", ");
}

function Row({ label, value, onEdit }: { label: string; value: string; onEdit: () => void }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "10px 0",
        borderBottom: "1px solid var(--rd-line)",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div className="rd-kicker" style={{ opacity: 0.5 }}>
          {label}
        </div>
        <div style={{ fontSize: 14, marginTop: 3, whiteSpace: "pre-wrap" }}>{value}</div>
      </div>
      <button className="rd-textlink" onClick={onEdit} style={{ minHeight: 28, flex: "none" }}>
        Wijzig
      </button>
    </div>
  );
}

export function PlanningStep({ state, onPlanning, onEdit }: Props) {
  const photoCount = state.rooms.reduce((n, r) => n + r.photos.length, 0);
  const roomsTxt =
    state.rooms
      .map((r) => (r.priority ? `${r.label} ★` : r.label))
      .join(", ") || "Nog geen";
  const allSurfaces = [...new Set(state.rooms.flatMap((r) => r.surfaces))];
  const surfacesTxt = allSurfaces.length > 0 ? surfaceLabels(allSurfaces) : "Nog geen";

  const sfeerTxt = [
    state.noSfeerImage ? "Geen beeld gekozen" : `${state.inspirationLikes.length} beeld(en)`,
    state.moods.length ? state.moods.join(", ") : null,
    state.boldness ? `durf ${state.boldness}/5` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const colorNames = state.colors.map((c) => c.name).join(", ");
  const kleurenTxt =
    [
      colorNames ? `Roll: ${colorNames}` : null,
      state.samples.length ? `${state.samples.length} sample(s)` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Geen";

  const inspTxt =
    [
      state.pinterestUrl ? "Pinterest" : null,
      state.otherInspirationUrl ? "link" : null,
      state.inspirationImages.length ? `${state.inspirationImages.length} beeld(en)` : null,
      state.inspirationNote ? "notitie" : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Geen";

  const contactTxt = [state.contactName, state.contactEmail].filter(Boolean).join(" · ") || "—";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 10 }}>
          Wanneer wil je gaan schilderen?
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {PLANNING.map((p) => (
            <button
              key={p.key}
              className={`rd-plan-chip${state.planning === p.key ? " is-on" : ""}`}
              onClick={() => onPlanning(p.key)}
              aria-pressed={state.planning === p.key}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rd-card-white">
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>
          Je intake in het kort
        </div>
        <Row label="Contact" value={contactTxt} onEdit={() => onEdit("contact")} />
        <Row label="Ruimtes" value={roomsTxt} onEdit={() => onEdit("rooms")} />
        <Row label="Te schilderen" value={surfacesTxt} onEdit={() => onEdit("surfaces")} />
        <Row
          label="Foto's"
          value={photoCount > 0 ? `${photoCount} toegevoegd` : "Nog geen"}
          onEdit={() => onEdit("photos")}
        />
        <Row label="Sfeer" value={sfeerTxt || "Nog geen"} onEdit={() => onEdit("gevoel")} />
        <Row label="Kleuren & samples" value={kleurenTxt} onEdit={() => onEdit("kleuren")} />
        <Row label="Inspiratie" value={inspTxt} onEdit={() => onEdit("inspiratie")} />
        <Row
          label="Jouw vraag"
          value={
            (state.mainQuestion || "Nog niet ingevuld") +
            (state.questionScope
              ? `\n(${state.questionScope === "een" ? "één ruimte" : "meerdere ruimtes"})`
              : "")
          }
          onEdit={() => onEdit("vraag")}
        />
      </div>
    </div>
  );
}
