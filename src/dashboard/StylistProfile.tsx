import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";

// Profiel van een styliste: foto en korte introductie. Foto's staan in de openbare bucket stylist-photos.
// Via de client (die heeft een fallback-URL); VITE_SUPABASE_URL staat niet in elke build.
const photoUrl = (path: string | null) => (path ? supabase.storage.from("stylist-photos").getPublicUrl(path).data.publicUrl : null);

// `kicker` noemt van wie het profiel is (beheer bekijkt ook andere medewerkers); `plain` = zonder eigen kaart (binnen de Team-kaart).
export function StylistProfile({ stylistId, canEdit, onFlash, kicker = "Je profiel", plain = false }: { stylistId: string; canEdit: boolean; onFlash: (t: string) => void; kicker?: string; plain?: boolean }) {
  const [bio, setBio] = useState("");
  const [photo, setPhoto] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!stylistId) return;
    supabase.from("stylists").select("bio,photo_path").eq("id", stylistId).maybeSingle().then(({ data }) => {
      const d = data as { bio: string | null; photo_path: string | null } | null;
      setBio(d?.bio ?? ""); setPhoto(d?.photo_path ?? null);
    });
  }, [stylistId]);

  const save = async (nextPhoto = photo) => {
    setBusy(true); setErr(null);
    const { error } = await supabase.rpc("set_stylist_profile", { p_stylist_id: stylistId, p_bio: bio, p_photo_path: nextPhoto ?? "" });
    setBusy(false);
    if (error) { setErr(error.message); return false; }
    return true;
  };

  const upload = async (files: FileList | null) => {
    const f = files?.[0];
    if (!f) return;
    setBusy(true); setErr(null);
    const file = await compressImage(f);
    const path = `${stylistId}/${Date.now()}.jpg`;
    const { error } = await supabase.storage.from("stylist-photos").upload(path, file, { contentType: file.type, upsert: false });
    if (error) { setBusy(false); setErr("Uploaden lukte niet. Probeer een andere foto."); return; }
    setPhoto(path);
    if (await save(path)) onFlash("Foto opgeslagen.");
    if (input.current) input.current.value = "";
  };

  const url = photoUrl(photo);
  return (
    <div className={plain ? undefined : "rd-card-white"} style={plain ? { borderTop: "1px solid var(--rd-line)", paddingTop: 12 } : { marginTop: 12 }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>{kicker}</div>
      <div style={{ display: "flex", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <div style={{ width: 96, height: 96, borderRadius: 99, background: "var(--rd-grey-light)", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, opacity: url ? 1 : 0.6 }}>
            {url ? <img src={url} alt="Profielfoto" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : "Geen foto"}
          </div>
          {canEdit && (
            <>
              <input ref={input} type="file" accept="image/*" hidden onChange={(e) => upload(e.target.files)} />
              <button className="rd-textlink" onClick={() => input.current?.click()} disabled={busy}>{url ? "Andere foto" : "Foto toevoegen"}</button>
            </>
          )}
        </div>
        <div style={{ flex: "1 1 280px", display: "flex", flexDirection: "column", gap: 8 }}>
          <label className="kk-label" htmlFor={`bio-${stylistId}`} style={{ fontSize: 13, fontWeight: 700 }}>Introductie</label>
          <textarea id={`bio-${stylistId}`} className="rd-input" rows={4} maxLength={1200} value={bio} disabled={!canEdit} onChange={(e) => setBio(e.target.value)}
            placeholder="Vertel kort wie je bent, waar je ervaring ligt en waar je blij van wordt in een interieur."
            style={{ minHeight: 110, paddingTop: 10, lineHeight: 1.5 }} />
          {canEdit && (
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <button className="rd-btn rd-btn-primary" onClick={async () => { if (await save()) onFlash("Profiel opgeslagen."); }} disabled={busy} style={{ width: "auto", padding: "0 20px", minHeight: 44 }}>{busy ? "Opslaan..." : plain ? "Introductie opslaan" : "Opslaan"}</button>
              <span style={{ fontSize: 12, opacity: 0.6 }}>{bio.length}/1200</span>
            </div>
          )}
          {err && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, margin: 0 }}>{err}</p>}
        </div>
      </div>
    </div>
  );
}
