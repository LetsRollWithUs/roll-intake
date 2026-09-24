import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { photoPath } from "./Photos";
import { buildAdvicePrompt, type PromptPhotos } from "./advicePrompt";
import type { IntakeRow } from "./types";

// Adviesprompt: alle intake-input, foto-links en de Roll-collectie in één prompt voor Claude of ChatGPT.
// Een hulpmiddel voor de eerste gedachtegang; het echte advies maakt de styliste zelf.
export function ConceptPanel({ intake }: { intake: IntakeRow }) {
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

  return (
    <div style={{ marginTop: 14, border: "1.5px dashed var(--rd-lavender-mid, #BBB1CB)", borderRadius: 14, padding: "12px 14px" }}>
      <div className="rd-kicker rd-kicker-pink">Eerste gedachtegang met AI</div>
      <div style={{ fontSize: 12.5, opacity: 0.75, marginTop: 2, lineHeight: 1.5 }}>
        Kopieer de prompt en plak hem in Claude of ChatGPT. Daarin staan de intake, de foto's en de hele Roll-collectie met technische kenmerken.
      </div>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button className="rd-btn rd-btn-primary" onClick={copyPrompt} style={{ width: "auto", padding: "0 20px" }}>Kopieer adviesprompt</button>
        <button className="rd-textlink" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Verberg prompt" : "Bekijk prompt"}</button>
        {copied && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rd-aubergine)" }}>{copied}</span>}
      </div>
      <div style={{ fontSize: 12.5, opacity: 0.7, marginTop: 6 }}>
        {photoCount > 0 ? `Er staan ${photoCount} foto-links in (7 dagen geldig). Sleep de foto's voor het beste resultaat ook in de chat.` : "Er zijn geen foto's bij deze intake."}
      </div>
      {showPrompt && <textarea className="rd-input" readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 8, height: 220, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.45, paddingTop: 10 }} />}

      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--rd-grey-light)", fontSize: 12.5, lineHeight: 1.5 }}>
        <strong>Let op:</strong> de waarde zit in jouw persoonlijke advies, waarin je zelf kijkt naar de ruimte, het licht en de wensen van de klant. Gebruik de uitkomst als eerste gedachtegang, niet als advies.
      </div>
    </div>
  );
}
