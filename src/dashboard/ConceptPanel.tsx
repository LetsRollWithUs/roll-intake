import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { rollColors } from "@/data/roll-colors";
import { formatDate } from "./ui";
import { photoPath } from "./Photos";
import { buildAdvicePrompt, type PromptPhotos } from "./advicePrompt";
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
  const [photos, setPhotos] = useState<PromptPhotos>({ rooms: {}, samples: {}, inspiration: [] });
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  // Foto-links vooraf ophalen (7 dagen geldig), zodat kopiëren direct op de klik kan.
  useEffect(() => {
    const want: { kind: "room" | "sample" | "insp"; key: string; path: string }[] = [];
    for (const r of intake.rooms ?? []) for (const ph of r.photos ?? []) { const pa = photoPath(ph); if (pa) want.push({ kind: "room", key: r.id, path: pa }); }
    for (const s of intake.samples ?? []) { const pa = s.photo ? photoPath(s.photo) : null; if (pa) want.push({ kind: "sample", key: s.id, path: pa }); }
    for (const ph of intake.inspiration_images ?? []) { const pa = photoPath(ph); if (pa) want.push({ kind: "insp", key: "", path: pa }); }
    if (!want.length) return;
    let stale = false;
    supabase.storage.from("intake-photos").createSignedUrls(want.map((w) => w.path), 60 * 60 * 24 * 7).then(({ data }) => {
      if (stale || !data) return;
      const url = new Map(data.filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
      const next: PromptPhotos = { rooms: {}, samples: {}, inspiration: [] };
      for (const w of want) {
        const u = url.get(w.path); if (!u) continue;
        if (w.kind === "room") (next.rooms[w.key] ??= []).push(u);
        else if (w.kind === "sample") next.samples[w.key] = u;
        else next.inspiration.push(u);
      }
      setPhotos(next);
    });
    return () => { stale = true; };
  }, [intake.id]);

  const prompt = useMemo(() => buildAdvicePrompt(intake, photos), [intake, photos]);
  const photoCount = Object.values(photos.rooms).reduce((n, a) => n + a.length, 0) + Object.keys(photos.samples).length + photos.inspiration.length;

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied("Prompt gekopieerd ✓"); }
    catch { setShowPrompt(true); setCopied("Kopiëren lukte niet automatisch; selecteer de tekst hieronder."); }
    setTimeout(() => setCopied(null), 4000);
  };

  const generate = async (force: boolean) => {
    setBusy(true); setErr(null);
    const { data, error } = await supabase.functions.invoke("advies-concept", { body: { intake_id: intake.id, force } });
    setBusy(false);
    let d = data as { ok?: boolean; concept?: AdviceConcept; at?: string; error?: string } | null;
    // Bij een foutstatus zit de reden in de response-body (error.context).
    if (error && !d) { try { d = await (error as { context?: Response }).context?.json(); } catch { /* geen body */ } }
    if (error || !d?.ok || !d.concept) { setErr(d?.error || "Concept maken lukte niet. Probeer het opnieuw."); return; }
    onConcept(d.concept, d.at ?? new Date().toISOString());
  };

  const List = ({ items }: { items: string[] }) => items.length === 0 ? <span style={{ opacity: 0.5 }}>geen</span> : (
    <ul style={{ margin: 0, paddingLeft: 18, display: "flex", flexDirection: "column", gap: 3 }}>{items.map((s, i) => <li key={i}>{s}</li>)}</ul>
  );

  return (
    <div style={{ marginTop: 14, border: "1.5px dashed var(--rd-lavender-mid, #BBB1CB)", borderRadius: 14, padding: "12px 14px" }}>
      <div className="rd-kicker rd-kicker-pink">Advies voorbereiden met AI</div>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 2 }}>Alle intake-input, de foto's en de volledige Roll-collectie met technische kenmerken in één prompt. Jij beoordeelt; niets gaat vanzelf naar de klant.</div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button className="rd-btn rd-btn-primary" onClick={copyPrompt} style={{ width: "auto", padding: "0 20px" }}>Kopieer adviesprompt</button>
        <button className="rd-textlink" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Verberg prompt" : "Bekijk prompt"}</button>
        {copied && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rd-aubergine)" }}>{copied}</span>}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 6 }}>
        Plak de prompt in Claude of ChatGPT. {photoCount > 0 ? `Er staan ${photoCount} foto-links in (7 dagen geldig); sleep de foto's voor het beste resultaat ook in de chat.` : "Er zijn geen foto's bij deze intake."}
      </div>
      {showPrompt && <textarea className="rd-input" readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 8, height: 220, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.45, paddingTop: 10 }} />}

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid var(--rd-line)", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, opacity: 0.7 }}>Of laat het dashboard zelf een concept maken:</span>
        {concept && intake.advice_concept_at && <span style={{ fontSize: 12, opacity: 0.6 }}>{formatDate(intake.advice_concept_at)}</span>}
        <button className="rd-plan-chip" onClick={() => generate(!!concept)} disabled={busy}>
          {busy ? "Bezig..." : concept ? "Opnieuw maken" : "Concept maken"}
        </button>
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
            <span style={{ fontSize: 12.5, opacity: 0.65 }}>Zet de kleurrichtingen als voorstel in het sample-advies; daar pas je alles aan.</span>
          </div>
        </div>
      )}
    </div>
  );
}
