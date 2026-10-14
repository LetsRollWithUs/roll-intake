import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

// Documenten bij de samenwerkingsafspraken (bijv. de getekende PDF). Privé bucket stylist-docs,
// map per medewerker. Downloaden via een tijdelijke link.
const BUCKET = "stylist-docs";

export function AfsprakenDocs({ stylistId }: { stylistId: string }) {
  const [files, setFiles] = useState<{ name: string; created_at: string | null; size: number | null }[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = async () => {
    const { data } = await supabase.storage.from(BUCKET).list(stylistId, { limit: 50, sortBy: { column: "created_at", order: "desc" } });
    setFiles(((data ?? []) as any[]).filter((f) => f.id).map((f) => ({ name: f.name, created_at: f.created_at ?? null, size: f.metadata?.size ?? null })));
  };
  useEffect(() => { if (stylistId) load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [stylistId]);

  const upload = async (list: FileList | null) => {
    const f = list?.[0];
    if (!f) return;
    if (f.size > 20 * 1024 * 1024) { setErr("Dit bestand is groter dan 20 MB."); return; }
    setBusy(true); setErr(null);
    const safe = f.name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "-").slice(-80) || "document.pdf";
    const stamp = new Date().toISOString().slice(0, 10);
    const { error } = await supabase.storage.from(BUCKET).upload(`${stylistId}/${stamp}-${safe}`, f, { contentType: f.type || "application/pdf", upsert: false });
    setBusy(false);
    if (input.current) input.current.value = "";
    if (error) { setErr(error.message.includes("exists") ? "Er staat al een bestand met deze naam van vandaag." : "Uploaden lukte niet. Probeer het opnieuw."); return; }
    load();
  };
  const open = async (name: string) => {
    const { data } = await supabase.storage.from(BUCKET).createSignedUrl(`${stylistId}/${name}`, 300);
    if (data?.signedUrl) window.open(data.signedUrl, "_blank", "noopener");
  };
  const remove = async (name: string) => {
    if (!window.confirm(`${name} verwijderen?`)) return;
    await supabase.storage.from(BUCKET).remove([`${stylistId}/${name}`]);
    load();
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6 }}>Documenten</span>
      {files.length === 0 && <span style={{ fontSize: 13, opacity: 0.6 }}>Nog geen document. Upload bijvoorbeeld de getekende samenwerkingsafspraken.</span>}
      {files.map((f) => (
        <div key={f.name} style={{ display: "flex", gap: 10, alignItems: "center", fontSize: 14, flexWrap: "wrap" }}>
          <button className="rd-textlink" onClick={() => open(f.name)}>{f.name}</button>
          <span style={{ fontSize: 12, opacity: 0.6 }}>{f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ""}</span>
          <button className="rd-textlink" onClick={() => remove(f.name)} style={{ fontSize: 12, color: "var(--rd-pink-dark)" }}>Verwijderen</button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <input ref={input} type="file" accept=".pdf,.doc,.docx,image/*" hidden onChange={(e) => upload(e.target.files)} />
        <button className="rd-btn rd-btn-outline" onClick={() => input.current?.click()} disabled={busy} style={{ width: "auto", padding: "0 14px", minHeight: 38 }}>{busy ? "Uploaden..." : "+ Document uploaden"}</button>
        {err && <span style={{ fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>{err}</span>}
      </div>
    </div>
  );
}
