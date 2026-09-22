import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { formatDate } from "./ui";
import type { AdviceConcept, IntakeRow } from "./types";

// Conceptvoorbereiding (fase 5): ondersteuning op basis van de intake, uitsluitend met kleuren uit de
// Roll-collectie. De styliste neemt over, past aan of verwerpt; het wordt nooit vanzelf advies of klantmail.
const hexOf = new Map(rollColors.map((c) => [c.id, c.hex]));

interface Props {
  intake: IntakeRow;
  onConcept: (concept: AdviceConcept, at: string) => void;
  onAdopt: (concept: AdviceConcept) => void;
}

export function ConceptPanel({ intake, onConcept, onAdopt }: Props) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const concept = intake.advice_concept;

  const generate = async (force: boolean) => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("advies-concept", { body: { intake_id: intake.id, force } });
    setBusy(false);
    const d = data as { ok?: boolean; concept?: AdviceConcept; at?: string; error?: string } | null;
    if (error || !d?.ok || !d.concept) { setErr(d?.error || "Concept maken lukte niet. Probeer het opnieuw."); return; }
    onConcept(d.concept, d.at ?? new Date().toISOString());
  };

  const List = ({ items }: { items: string[] }) => items.length === 0 ? <span style={{ opacity: 0.5 }}>geen</span> : (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
  );

  return (
    <div style={{ marginTop: 14, border: "1.5px dashed var(--rd-lavender-mid, #BBB1CB)", borderRadius: 14, padding: "12px 14px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <div>
          <div className="rd-kicker rd-kicker-pink">Conceptvoorbereiding</div>
          <div style={{ fontSize: 12.5, opacity: 0.7 }}>Concept op basis van de intake, alleen Roll-kleuren. Jij beoordeelt; niets gaat vanzelf naar de klant.</div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {concept && intake.advice_concept_at && <span style={{ fontSize: 12, opacity: 0.6 }}>{formatDate(intake.advice_concept_at)}</span>}
          <button className={`rd-plan-chip${!concept ? " is-on" : ""}`} onClick={() => generate(!!concept)} disabled={busy}>
            {busy ? "Bezig..." : concept ? "Opnieuw maken" : "Concept maken"}
          </button>
        </div>
      </div>
      {err && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, margin: "10px 0 0" }}>{err}</p>}

      {concept && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 12, fontSize: 14 }}>
          <div><strong>Samenvatting.</strong> {concept.samenvatting}</div>
          <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", color: "var(--rd-pink-dark)", marginBottom: 4 }}>Ontbreekt</div>
              <List items={concept.ontbreekt} />
            </div>
            <div>
              <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 4 }}>Vragen voor het gesprek</div>
              <List items={concept.vragen} />
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>Kleurrichtingen</div>
            <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))" }}>
              {concept.richtingen.map((r, i) => (
                <div key={i} className="rd-card-white" style={{ padding: 12, border: "1px solid var(--rd-line)" }}>
                  <div style={{ fontWeight: 800, marginBottom: 6 }}>{r.titel}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {r.kleuren.map((k) => (
                      <div key={k.id} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
                        <span style={{ width: 18, height: 18, borderRadius: 6, background: hexOf.get(k.id) ?? "#ccc", border: "1px solid rgba(0,0,0,.12)", flex: "none" }} />
                        <strong>{k.naam}</strong><span style={{ opacity: 0.7 }}>{k.toepassing}</span>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 13, marginTop: 8 }}>{r.waarom}</div>
                  {r.gebaseerd_op && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Gebaseerd op: {r.gebaseerd_op}</div>}
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 4 }}>Let op bij samples</div>
            <List items={concept.samples_aandacht} />
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button className="rd-btn rd-btn-outline" onClick={() => onAdopt(concept)} style={{ width: "auto", padding: "0 18px" }}>Overnemen in advies</button>
            <span style={{ fontSize: 12.5, opacity: 0.65 }}>Zet de kleurrichtingen als voorstel in "Gesprek &amp; advies"; daar pas je alles aan.</span>
          </div>
        </div>
      )}
    </div>
  );
}
