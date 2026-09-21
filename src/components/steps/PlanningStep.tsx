import { useEffect, useMemo, useState } from "react";
import { PLANNING, SURFACES } from "@/data/intake-options";
import type { IntakeState, PlanningKey, UploadedImage } from "@/lib/types";

type EditTarget =
  | "contact" | "rooms" | "surfaces" | "photos" | "beelden" | "gevoel" | "kleuren" | "inspiratie" | "vraag";

interface Props {
  state: IntakeState;
  onPlanning: (v: PlanningKey) => void;
  onEdit: (t: EditTarget) => void;
}

function surfaceLabel(k: string): string {
  return SURFACES.find((s) => s.key === k)?.label ?? k;
}
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

// Kleine sectiekaart met titel, wijzig-knop en vrije inhoud.
function Card({ label, onEdit, children }: { label: string; onEdit: () => void; children: React.ReactNode }) {
  return (
    <div className="rd-card-white" style={{ padding: "14px 16px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div className="rd-kicker rd-kicker-pink">{label}</div>
        <button className="rd-textlink" onClick={onEdit} style={{ minHeight: 28, fontSize: 13 }}>
          Wijzig
        </button>
      </div>
      {children}
    </div>
  );
}

const Chip = ({ children }: { children: React.ReactNode }) => <span className="rd-chip">{children}</span>;
const empty = <span style={{ fontSize: 14, opacity: 0.5 }}>Nog niet ingevuld</span>;

// Foto-thumbnails uit bestand of eerder geüploade url.
function Thumbs({ photos }: { photos: UploadedImage[] }) {
  const [urls, setUrls] = useState<string[]>([]);
  useEffect(() => {
    const made: string[] = [];
    const list = photos.slice(0, 6).map((p) => {
      if (p.url) return p.url;
      if (p.file) {
        const u = URL.createObjectURL(p.file);
        made.push(u);
        return u;
      }
      return "";
    });
    setUrls(list);
    return () => made.forEach((u) => URL.revokeObjectURL(u));
  }, [photos]);
  if (!photos.length) return empty;
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {urls.map((u, i) =>
        u ? (
          <img key={i} src={u} alt="" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 8, display: "block" }} />
        ) : (
          <div key={i} style={{ width: 52, height: 52, borderRadius: 8, background: "var(--rd-grey-light)" }} />
        ),
      )}
    </div>
  );
}

export function PlanningStep({ state, onPlanning, onEdit }: Props) {
  const allSurfaces = useMemo(() => [...new Set(state.rooms.flatMap((r) => r.surfaces))], [state.rooms]);
  const allPhotos = useMemo(() => state.rooms.flatMap((r) => r.photos), [state.rooms]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
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

      <div>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
          Je intake in het kort
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {/* Contact */}
          <Card label="Contact" onEdit={() => onEdit("contact")}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 42, height: 42, borderRadius: 99, background: "var(--rd-lavender)", flex: "none",
                display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "var(--rd-aubergine)",
              }}>
                {initials(state.contactName)}
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>{state.contactName || "Naamloos"}</div>
                <div style={{ fontSize: 13, opacity: 0.65, overflow: "hidden", textOverflow: "ellipsis" }}>{state.contactEmail || "—"}</div>
              </div>
            </div>
          </Card>

          {/* Ruimtes */}
          <Card label="Ruimtes" onEdit={() => onEdit("rooms")}>
            {state.rooms.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {state.rooms.map((r) => (
                  <Chip key={r.id}>{r.label}{r.priority ? " ★" : ""}</Chip>
                ))}
              </div>
            ) : empty}
          </Card>

          {/* Te schilderen */}
          <Card label="Te schilderen" onEdit={() => onEdit("surfaces")}>
            {allSurfaces.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {allSurfaces.map((s) => <Chip key={s}>{surfaceLabel(s)}</Chip>)}
              </div>
            ) : empty}
          </Card>

          {/* Foto's */}
          <Card label="Foto's" onEdit={() => onEdit("photos")}>
            <Thumbs photos={allPhotos} />
          </Card>

          {/* Sfeer */}
          <Card label="Sfeer" onEdit={() => onEdit("gevoel")}>
            {state.moods.length || state.boldness || state.inspirationLikes.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                {state.moods.map((m) => <Chip key={m}>{m}</Chip>)}
                {state.boldness ? <Chip>durf {state.boldness}/5</Chip> : null}
              </div>
            ) : empty}
          </Card>

          {/* Kleuren & samples */}
          <Card label="Kleuren & samples" onEdit={() => onEdit("kleuren")}>
            {state.colors.length || state.samples.length ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {state.colors.map((c) => (
                  <span key={c.id} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ width: 14, height: 14, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.12)" }} />
                    {c.name}
                  </span>
                ))}
                {state.samples.length ? <Chip>{state.samples.length} sample(s) getest</Chip> : null}
              </div>
            ) : <span style={{ fontSize: 14, opacity: 0.5 }}>Nog geen</span>}
          </Card>

          {/* Inspiratie */}
          <Card label="Inspiratie" onEdit={() => onEdit("inspiratie")}>
            {state.pinterestUrl || state.otherInspirationUrl || state.inspirationImages.length || state.inspirationNote ? (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {state.pinterestUrl && <Chip>Pinterest</Chip>}
                {state.otherInspirationUrl && <Chip>Link</Chip>}
                {state.inspirationImages.length ? <Chip>{state.inspirationImages.length} beeld(en)</Chip> : null}
                {state.inspirationNote && <Chip>Notitie</Chip>}
              </div>
            ) : <span style={{ fontSize: 14, opacity: 0.5 }}>Geen</span>}
          </Card>

          {/* Vraag */}
          <Card label="Jouw vraag" onEdit={() => onEdit("vraag")}>
            <div style={{ fontSize: 14, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
              {state.mainQuestion || empty}
              {state.questionScope && (
                <span style={{ display: "block", fontSize: 12, opacity: 0.6, marginTop: 4 }}>
                  Voor {state.questionScope === "een" ? "één ruimte" : "meerdere ruimtes"}
                </span>
              )}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
