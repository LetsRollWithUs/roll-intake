import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { SURFACES, DAYLIGHT, DAYLIGHT_DIRS, USAGE_TIMES, PLANNING } from "@/data/intake-options";
import { INSPIRATIONS } from "@/data/inspiration";
import { STATUSES, type AdvisorStatus } from "./status";
import { StatusPill, formatDate } from "./ui";
import type { IntakeRow, DbPhoto } from "./types";

function lbl(list: { key: string; label: string }[], key?: string | null): string {
  if (!key) return "";
  return list.find((x) => x.key === key)?.label ?? key;
}
function surfaceLabels(keys?: string[]): string {
  return (keys ?? []).map((k) => lbl(SURFACES, k)).join(", ");
}

function Photos({ photos }: { photos?: (DbPhoto | null)[] }) {
  const list = (photos ?? []).filter((p): p is DbPhoto => !!p && !!p.url);
  if (list.length === 0) return <span style={{ opacity: 0.5, fontSize: 13 }}>Geen foto's</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((p, i) => (
        <a key={i} href={p.url!} target="_blank" rel="noreferrer">
          <img
            src={p.url!}
            alt=""
            style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10, display: "block" }}
          />
        </a>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rd-card-white" style={{ marginTop: 12 }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

export function IntakeDetail() {
  const { id } = useParams();
  const [row, setRow] = useState<IntakeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [status, setStatus] = useState<AdvisorStatus>("nieuw");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("intake").select("*").eq("id", id).maybeSingle();
      if (!data) setNotFound(true);
      else {
        const r = data as IntakeRow;
        setRow(r);
        setStatus((r.advisor_status as AdvisorStatus) ?? "nieuw");
        setNotes(r.advisor_notes ?? "");
        setReason(r.advisor_rejected_reason ?? "");
      }
      setLoading(false);
    })();
  }, [id]);

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await supabase
      .from("intake")
      .update({
        advisor_status: status,
        advisor_notes: notes || null,
        advisor_rejected_reason: status === "afgewezen" ? reason || null : null,
        advisor_updated_at: new Date().toISOString(),
      })
      .eq("id", id);
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (notFound || !row)
    return (
      <div>
        <Link to="/beheer" className="rd-textlink">
          ← Terug
        </Link>
        <p className="rd-sub">Intake niet gevonden.</p>
      </div>
    );

  const p = row.payload ?? {};
  const likeThumbs = (row.inspiration_likes ?? [])
    .map((idk) => INSPIRATIONS.find((x) => x.id === idk))
    .filter(Boolean) as { src: string; label: string }[];

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
        <div>
          <h1 className="rd-h2" style={{ marginBottom: 2 }}>
            {row.contact_name || "Naamloos"}
          </h1>
          <a href={`mailto:${row.contact_email}`} style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>
            {row.contact_email}
          </a>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            Binnengekomen {formatDate(row.created_at)}
            {row.status === "concept" && " · concept (niet afgerond)"}
          </div>
        </div>
        <StatusPill status={row.advisor_status} />
      </div>

      {/* Workflow */}
      <div className="rd-card-white" style={{ marginTop: 16, background: "var(--rd-grey-light)" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
          Workflow
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              className={`rd-plan-chip${status === s.key ? " is-on" : ""}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {status === "afgewezen" && (
          <div style={{ marginTop: 12 }}>
            <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
              Reden van afwijzing
            </div>
            <textarea
              className="rd-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Waarom haakte de klant af? Bijv. budget, timing, koos ander merk."
              style={{ height: 72, paddingTop: 10, resize: "none", lineHeight: 1.4 }}
            />
          </div>
        )}

        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Advies / notities
          </div>
          <textarea
            className="rd-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jouw kleuradvies, voorstellen en interne notities."
            style={{ height: 140, paddingTop: 12, resize: "vertical", lineHeight: 1.45 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="rd-btn rd-btn-primary"
            onClick={save}
            disabled={saving}
            style={{ width: "auto", padding: "0 24px", ...(saving ? { opacity: 0.5 } : {}) }}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
          <a
            className="rd-btn rd-btn-outline"
            href="https://roll.nl/offerte"
            target="_blank"
            rel="noreferrer"
            style={{ width: "auto", padding: "0 22px", textDecoration: "none" }}
          >
            Offerte maken ↗
          </a>
          {saved && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>Opgeslagen ✓</span>}
          {row.advisor_updated_at && !saved && (
            <span style={{ fontSize: 12, opacity: 0.55 }}>Laatst bijgewerkt {formatDate(row.advisor_updated_at)}</span>
          )}
        </div>
        <p className="rd-sub" style={{ marginTop: 8 }}>
          Opent de prijsopgave op roll.nl in een nieuw tabblad (log daar in). De kleuren en ruimtes
          van deze intake staan hieronder ter referentie.
        </p>
      </div>

      {/* Vraag */}
      <Section title="Jouw vraag">
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {row.main_question || <span style={{ opacity: 0.5 }}>Niet ingevuld</span>}
        </p>
        {(p.questionScope as string) && (
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.7 }}>
            Voor: {p.questionScope === "een" ? "één ruimte" : "meerdere ruimtes"}
          </p>
        )}
        {(row.help_needs?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {row.help_needs!.map((h) => (
              <span key={h} className="rd-chip">
                {h}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Ruimtes */}
      <Section title={`Ruimtes (${row.rooms?.length ?? 0})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(row.rooms ?? []).map((r) => (
            <div key={r.id}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {r.label} {r.priority && <span title="Voorrang">★</span>}
              </div>
              <div style={{ fontSize: 13, opacity: 0.75, margin: "2px 0 8px" }}>
                {surfaceLabels(r.surfaces)}
                {r.daylight && ` · ${lbl(DAYLIGHT, r.daylight)}`}
                {r.daylightDir && ` · licht uit ${lbl(DAYLIGHT_DIRS, r.daylightDir)}`}
                {r.usage && ` · ${lbl(USAGE_TIMES, r.usage)}`}
              </div>
              <Photos photos={r.photos} />
            </div>
          ))}
        </div>
      </Section>

      {/* Sfeer */}
      <Section title="Sfeer">
        {likeThumbs.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {likeThumbs.map((t, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <img src={t.src} alt={t.label} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} />
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{t.label}</div>
              </div>
            ))}
          </div>
        ) : (
          p.noSfeerImage === true && <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.6 }}>Geen sfeerbeeld gekozen</p>
        )}
        <div style={{ fontSize: 14 }}>
          {(row.moods?.length ?? 0) > 0 && <div>Gevoel: {row.moods!.join(", ")}</div>}
          {row.boldness ? <div>Uitgesprokenheid: {row.boldness}/5</div> : null}
          {p.sfeerSameAll === false && (
            <div style={{ marginTop: 4 }}>
              Sfeer verschilt per ruimte{p.sfeerExceptionNote ? `: ${p.sfeerExceptionNote}` : ""}
            </div>
          )}
        </div>
      </Section>

      {/* Kleuren & samples */}
      <Section title="Kleuren & samples">
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          Al thuis: {row.has_samples ?? "onbekend"}
        </div>
        {(row.colors?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 6 }}>
              Overweegt (Roll)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {row.colors!.map((c, i) => (
                <span key={i} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {(row.samples?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {row.samples!.map((s) => (
              <div key={s.id} style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  {[s.brand, s.name].filter(Boolean).join(" · ")}{" "}
                  {s.verdict && <span style={{ fontWeight: 600, opacity: 0.6 }}>({s.verdict})</span>}
                </div>
                {s.note && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{s.note}</div>}
                {s.photo?.url && (
                  <div style={{ marginTop: 6 }}>
                    <Photos photos={[s.photo]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Inspiratie */}
      <Section title="Inspiratie">
        <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {row.pinterest_url && (
            <a href={row.pinterest_url} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>
              Pinterest-board
            </a>
          )}
          {row.other_inspiration_url && (
            <a href={row.other_inspiration_url} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>
              Andere link
            </a>
          )}
          {row.inspiration_note && <div style={{ opacity: 0.85 }}>{row.inspiration_note}</div>}
          {p.hasOtherChanges === true && (
            <div style={{ opacity: 0.85 }}>
              Verandert nog aan vloer/meubels/gordijnen{p.otherChangesNote ? `: ${p.otherChangesNote}` : ""}
            </div>
          )}
        </div>
        {(row.inspiration_images?.length ?? 0) > 0 && (
          <div style={{ marginTop: 10 }}>
            <Photos photos={row.inspiration_images ?? undefined} />
          </div>
        )}
      </Section>

      {/* Planning */}
      <Section title="Planning">
        <div style={{ fontSize: 14 }}>
          Wil schilderen: {lbl(PLANNING, row.planning) || "onbekend"}
          {row.complexity_level && ` · inschatting: ${row.complexity_level}`}
        </div>
      </Section>
    </div>
  );
}
