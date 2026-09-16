import { PLANNING, SURFACES } from "@/data/intake-options";
import type { IntakeState, PlanningKey } from "@/lib/types";

type EditTarget = "rooms" | "surfaces" | "photos" | "beelden" | "gevoel" | "kleuren" | "inspiratie" | "vraag";

interface Props {
  state: IntakeState;
  onPlanning: (v: PlanningKey) => void;
  onName: (v: string) => void;
  onEmail: (v: string) => void;
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
        <div style={{ fontSize: 14, marginTop: 3 }}>{value}</div>
      </div>
      <button className="rd-textlink" onClick={onEdit} style={{ minHeight: 28, flex: "none" }}>
        Wijzig
      </button>
    </div>
  );
}

export function PlanningStep({ state, onPlanning, onName, onEmail, onEdit }: Props) {
  const photoCount = state.rooms.reduce((n, r) => n + r.photos.length, 0);
  const roomsTxt = state.rooms.map((r) => r.label).join(", ") || "Nog geen";
  const surfacesTxt =
    [...new Set(state.rooms.flatMap((r) => r.surfaces))].length > 0
      ? surfaceLabels([...new Set(state.rooms.flatMap((r) => r.surfaces))])
      : "Nog geen";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {/* Planning */}
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

      {/* Contact */}
      <div>
        <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 8 }}>
          Nog even je gegevens
        </div>
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 10 }}>
          Zo koppelen we je intake aan je kleuradvies.
        </p>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input
            className="rd-input"
            value={state.contactName}
            onChange={(e) => onName(e.target.value)}
            placeholder="Naam"
            autoComplete="name"
            aria-label="Naam"
          />
          <input
            className="rd-input"
            type="email"
            value={state.contactEmail}
            onChange={(e) => onEmail(e.target.value)}
            placeholder="E-mail"
            autoComplete="email"
            aria-label="E-mail"
          />
        </div>
      </div>

      {/* Compacte controle */}
      <div className="rd-card-white">
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>
          Je intake in het kort
        </div>
        <Row label="Ruimtes" value={roomsTxt} onEdit={() => onEdit("rooms")} />
        <Row label="Te schilderen" value={surfacesTxt} onEdit={() => onEdit("surfaces")} />
        <Row
          label="Foto's"
          value={photoCount > 0 ? `${photoCount} toegevoegd` : "Nog geen"}
          onEdit={() => onEdit("photos")}
        />
        <Row
          label="Sfeer"
          value={`${state.inspirationLikes.length} beeld(en)${
            state.moods.length ? " · " + state.moods.join(", ") : ""
          }${state.boldness ? " · durf " + state.boldness + "/5" : ""}`}
          onEdit={() => onEdit("gevoel")}
        />
        <Row
          label="Kleuren & samples"
          value={`${state.colors.length} Roll-kleur(en) · ${state.samples.length} sample(s)`}
          onEdit={() => onEdit("kleuren")}
        />
        <Row
          label="Jouw vraag"
          value={state.mainQuestion ? state.mainQuestion.slice(0, 60) + (state.mainQuestion.length > 60 ? "..." : "") : "Nog niet ingevuld"}
          onEdit={() => onEdit("vraag")}
        />
      </div>
    </div>
  );
}
