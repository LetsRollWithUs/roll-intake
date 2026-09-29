import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { photoPath } from "./Photos";
import { buildAdvicePrompt, listPhotos, type PromptPhotos } from "./advicePrompt";
import type { IntakeRow } from "./types";

// Adviesprompt voor een intern beslisblad: de styliste kopieert de prompt en plakt hem in haar eigen
// Claude of ChatGPT, en sleept de foto's (zip met genummerde bestanden) erbij als bijlage.
// Een hulpmiddel voor de voorbereiding; het echte advies maakt de styliste zelf.
export function ConceptPanel({ intake }: { intake: IntakeRow }) {
  const base = useMemo(() => listPhotos(intake, (p) => photoPath(p as never)), [intake]);
  const [photos, setPhotos] = useState<PromptPhotos>(base);
  const [copied, setCopied] = useState<string | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);
  const [zipState, setZipState] = useState<"idle" | "busy" | "fout">("idle");

  // Reserve-links (7 dagen geldig) ophalen, zodat kopiëren direct op de klik kan.
  useEffect(() => {
    setPhotos(base);
    if (!base.length) return;
    let stale = false;
    supabase.storage.from("intake-photos").createSignedUrls(base.map((x) => x.path), 60 * 60 * 24 * 7).then(({ data }) => {
      if (stale || !data) return;
      const url = new Map(data.filter((d) => d.path && d.signedUrl).map((d) => [d.path as string, d.signedUrl]));
      setPhotos(base.map((x) => ({ ...x, url: url.get(x.path) ?? undefined })));
    });
    return () => { stale = true; };
  }, [base]);

  const prompt = useMemo(() => buildAdvicePrompt(intake, photos), [intake, photos]);

  const copyPrompt = async () => {
    try { await navigator.clipboard.writeText(prompt); setCopied("Prompt gekopieerd"); }
    catch { setShowPrompt(true); setCopied("Kopiëren lukte niet automatisch; selecteer de tekst hieronder."); }
    setTimeout(() => setCopied(null), 4000);
  };

  // Alle foto's in één zip, met dezelfde namen als in de prompt (F1-woonkamer.jpg, ...).
  const downloadZip = async () => {
    setZipState("busy");
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      for (const x of photos) {
        const { data } = await supabase.storage.from("intake-photos").download(x.path);
        if (data) zip.file(x.file, data);
      }
      const blob = await zip.generateAsync({ type: "blob" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `fotos-${(intake.contact_name ?? "klant").trim().split(/\s+/)[0].toLowerCase()}.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 5000);
      setZipState("idle");
    } catch { setZipState("fout"); }
  };

  return (
    <div style={{ marginTop: 14, border: "1.5px dashed var(--rd-lavender-mid, #BBB1CB)", borderRadius: 14, padding: "12px 14px" }}>
      <div className="rd-kicker rd-kicker-pink">Beslisblad met AI</div>
      <ol style={{ fontSize: 13, lineHeight: 1.55, margin: "6px 0 0", paddingLeft: 18 }}>
        <li>Kopieer de prompt en plak hem in je eigen Claude of ChatGPT.</li>
        {photos.length > 0 && <li>Download de foto's en sleep ze erbij als bijlage. De bestandsnamen (F1, F2, ...) staan ook in de prompt.</li>}
        <li>Je krijgt een intern beslisblad: één voorlopig plan, één alternatief, de vraag die beslist en een gesprekskaart.</li>
      </ol>

      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 12 }}>
        <button className="rd-btn rd-btn-primary" onClick={copyPrompt} style={{ width: "auto", padding: "0 20px" }}>Kopieer prompt</button>
        {photos.length > 0 && <button className="rd-btn rd-btn-outline" onClick={downloadZip} disabled={zipState === "busy"} style={{ width: "auto", padding: "0 18px" }}>{zipState === "busy" ? "Foto's inpakken..." : `Download foto's (${photos.length})`}</button>}
        <button className="rd-textlink" onClick={() => setShowPrompt((v) => !v)}>{showPrompt ? "Verberg prompt" : "Bekijk prompt"}</button>
        {copied && <span role="status" style={{ fontSize: 13, fontWeight: 600 }}>{copied}</span>}
        {zipState === "fout" && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: "var(--rd-pink-dark)" }}>Downloaden lukte niet. Probeer het opnieuw.</span>}
      </div>
      {showPrompt && <textarea className="rd-input" readOnly value={prompt} onFocus={(e) => e.currentTarget.select()} style={{ marginTop: 8, height: 220, fontFamily: "ui-monospace, Menlo, monospace", fontSize: 12, lineHeight: 1.45, paddingTop: 10 }} />}

      <div style={{ marginTop: 12, padding: "10px 12px", borderRadius: 10, background: "var(--rd-grey-light)", fontSize: 12.5, lineHeight: 1.5 }}>
        <strong>Let op:</strong> het beslisblad is een voorbereiding. Jij kijkt in het gesprek naar de ruimte, het licht en de wensen van de klant, en maakt het advies.
      </div>
    </div>
  );
}
