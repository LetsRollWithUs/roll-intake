import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/lib/supabase";
import type { DbPhoto } from "./types";

const PHOTO_BUCKET = "intake-photos";

// Opslagpad van een foto: nieuwe rijen hebben `path`, oude rijen een publieke URL waar we het pad uit halen.
export function photoPath(p: DbPhoto): string | null {
  if (p.path) return p.path;
  if (!p.url) return null;
  const m = p.url.match(/\/object\/(?:public|sign)\/intake-photos\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Foto's staan in een privé bucket; adviseurs krijgen kortlevende signed URLs (1 uur).
export function Photos({ photos, size = 84 }: { photos?: (DbPhoto | null)[]; size?: number }) {
  const list = (photos ?? []).filter((p): p is DbPhoto => !!p && !!photoPath(p));
  const key = list.map((p) => photoPath(p)).join("|");
  const [signed, setSigned] = useState<Record<string, string>>({});
  const [openAt, setOpenAt] = useState<number | null>(null);

  useEffect(() => {
    const paths = list.map((p) => photoPath(p)).filter((x): x is string => !!x);
    if (paths.length === 0) return;
    let stale = false;
    supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (stale || !data) return;
      const map: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      setSigned(map);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // Gekozen maar niet ontvangen (upload mislukt, bijv. te groot bestand).
  const missing = (photos ?? []).filter((p): p is DbPhoto => !!p && !photoPath(p) && !!p.name).length;
  const missingNote = missing > 0 && (
    <div style={{ flexBasis: "100%", fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>
      {missing === 1 ? "1 foto is niet goed doorgekomen." : `${missing} foto's zijn niet goed doorgekomen.`} Vraag de klant die even te mailen.
    </div>
  );
  if (list.length === 0) return missingNote || <span style={{ opacity: 0.5, fontSize: 13 }}>Geen foto's</span>;
  const srcs = list.map((p) => signed[photoPath(p)!]).filter(Boolean) as string[];
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((p, i) => {
        const src = signed[photoPath(p)!];
        const box = { width: size, height: size, borderRadius: 10, display: "block" as const };
        if (!src) return <div key={i} style={{ ...box, background: "var(--rd-grey-light)" }} aria-label="Foto laden" />;
        return (
          <button key={i} type="button" onClick={() => setOpenAt(srcs.indexOf(src))} title="Groot bekijken" aria-label={`Foto ${i + 1} groot bekijken`}
            style={{ padding: 0, border: 0, background: "none", cursor: "zoom-in", borderRadius: 10 }}>
            <img src={src} alt="" style={{ ...box, objectFit: "cover" }} />
          </button>
        );
      })}
      {missingNote}
      {openAt !== null && srcs.length > 0 && <Lightbox srcs={srcs} start={openAt} onClose={() => setOpenAt(null)} />}
    </div>
  );
}

// Foto groot bekijken, met vorige en volgende (ook met de pijltjestoetsen) en Esc om te sluiten.
function Lightbox({ srcs, start, onClose }: { srcs: string[]; start: number; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, start));
  const n = srcs.length;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const k = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight") setI((x) => (x + 1) % n);
      if (e.key === "ArrowLeft") setI((x) => (x - 1 + n) % n);
    };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [n, onClose]);
  const btn: React.CSSProperties = { background: "rgba(255,255,255,.14)", color: "#fff", border: 0, borderRadius: 99, width: 48, height: 48, fontSize: 22, cursor: "pointer", flex: "none" };
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="Foto" onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 95, background: "rgba(20,14,28,.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14, width: "100%", justifyContent: "center", minHeight: 0, flex: 1 }} onClick={(e) => e.stopPropagation()}>
        {n > 1 && <button type="button" style={btn} onClick={() => setI((x) => (x - 1 + n) % n)} aria-label="Vorige foto">‹</button>}
        <img src={srcs[i]} alt={`Foto ${i + 1} van ${n}`} style={{ maxWidth: "min(1200px, calc(100vw - 150px))", maxHeight: "calc(100vh - 110px)", objectFit: "contain", borderRadius: 12 }} />
        {n > 1 && <button type="button" style={btn} onClick={() => setI((x) => (x + 1) % n)} aria-label="Volgende foto">›</button>}
      </div>
      <div style={{ display: "flex", gap: 16, alignItems: "center", color: "#fff", fontSize: 14 }} onClick={(e) => e.stopPropagation()}>
        <span>{i + 1} van {n}</span>
        <a href={srcs[i]} target="_blank" rel="noreferrer" style={{ color: "#fff" }}>Openen in nieuw tabblad</a>
        <button type="button" onClick={onClose} style={{ ...btn, width: "auto", height: 40, padding: "0 18px", fontSize: 14, fontWeight: 700 }}>Sluiten</button>
      </div>
    </div>,
    document.body,
  );
}
