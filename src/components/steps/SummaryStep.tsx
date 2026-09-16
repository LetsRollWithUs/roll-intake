import { SURFACES } from "@/data/intake-options";
import { assessComplexity } from "@/lib/complexity";
import type { IntakeState } from "@/lib/types";

interface Props {
  state: IntakeState;
  onEdit: (screen: "rooms" | "photos" | "sfeer" | "colors" | "vraag") => void;
}

function surfaceLabels(keys: string[]): string {
  return keys
    .map((k) => SURFACES.find((s) => s.key === k)?.label ?? k)
    .join(", ");
}

function Block({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rd-card-white">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div className="rd-kicker" style={{ opacity: 0.55 }}>
          {title}
        </div>
        <button className="rd-textlink" onClick={onEdit} style={{ minHeight: 28 }}>
          Wijzig
        </button>
      </div>
      <div style={{ marginTop: 8 }}>{children}</div>
    </div>
  );
}

export function SummaryStep({ state, onEdit }: Props) {
  const cx = assessComplexity(state);
  const photoCount = state.rooms.reduce((n, r) => n + r.photos.length, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <Block title="Ruimtes" onEdit={() => onEdit("rooms")}>
        {state.rooms.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.6 }}>Nog geen ruimtes.</p>
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {state.rooms.map((r) => (
              <li key={r.id} style={{ fontSize: 14 }}>
                <span style={{ fontWeight: 700 }}>{r.label}</span>
                {r.surfaces.length > 0 && (
                  <span style={{ opacity: 0.65 }}> · {surfaceLabels(r.surfaces)}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Block>

      <Block title="Foto's & licht" onEdit={() => onEdit("photos")}>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
          {photoCount > 0 ? `${photoCount} foto('s) toegevoegd` : "Nog geen foto's"}
        </p>
      </Block>

      <Block title="Sfeer" onEdit={() => onEdit("sfeer")}>
        <p style={{ margin: 0, fontSize: 14, opacity: 0.75 }}>
          {state.inspirationLikes.length} beeld(en) gekozen
          {state.moods.length > 0 && ` · ${state.moods.join(", ")}`}
          {state.boldness ? ` · durf ${state.boldness}/5` : ""}
        </p>
      </Block>

      <Block title="Kleuren" onEdit={() => onEdit("colors")}>
        {state.colors.length === 0 ? (
          <p style={{ margin: 0, opacity: 0.6, fontSize: 14 }}>Nog geen kleuren gekozen.</p>
        ) : (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {state.colors.map((c) => (
              <span
                key={c.id}
                className="rd-chip"
                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
              >
                <span
                  aria-hidden
                  style={{ width: 12, height: 12, borderRadius: 99, background: c.hex }}
                />
                {c.name}
              </span>
            ))}
          </div>
        )}
      </Block>

      <Block title="Jouw vraag" onEdit={() => onEdit("vraag")}>
        <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>
          {state.mainQuestion || <span style={{ opacity: 0.6 }}>Nog niets ingevuld.</span>}
        </p>
        {(state.contactName || state.contactEmail) && (
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.65 }}>
            {[state.contactName, state.contactEmail].filter(Boolean).join(" · ")}
          </p>
        )}
      </Block>

      {/* Advies over het passende pakket, positief gebracht */}
      <div
        className="rd-card-white"
        style={{ background: "var(--rd-lime)", border: "1px solid rgba(47,33,65,.08)" }}
      >
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>
          Ons voorstel
        </div>
        {cx.level === "compact" ? (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Jouw vraag past mooi binnen het <strong>compacte kleuradvies</strong>. De styliste gaat
            hiermee aan de slag en stuurt je een persoonlijk voorstel.
          </p>
        ) : (
          <p style={{ margin: 0, fontSize: 14, lineHeight: 1.45 }}>
            Je hebt een rijke vraag ({cx.reasons.join(", ")}). De styliste kan je daarom naast het
            compacte advies ook het <strong>Totaal Kleuradvies</strong> voorstellen, zodat alles in
            één keer op elkaar klopt. Je bepaalt zelf wat je kiest.
          </p>
        )}
      </div>
    </div>
  );
}
