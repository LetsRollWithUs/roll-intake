import { useEffect, useState } from "react";
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

  if (list.length === 0) return <span style={{ opacity: 0.5, fontSize: 13 }}>Geen foto's</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((p, i) => {
        const src = signed[photoPath(p)!];
        const box = { width: size, height: size, borderRadius: 10, display: "block" as const };
        if (!src) return <div key={i} style={{ ...box, background: "var(--rd-grey-light)" }} aria-label="Foto laden" />;
        return (
          <a key={i} href={src} target="_blank" rel="noreferrer" title="Open op ware grootte">
            <img src={src} alt="" style={{ ...box, objectFit: "cover" }} />
          </a>
        );
      })}
    </div>
  );
}
