import { useRef, useState } from "react";
import { supabase, INTAKE_PHOTOS_BUCKET } from "@/lib/supabase";
import { compressImage } from "@/lib/imageCompress";
import type { DbPhoto, DbRoom, IntakeRow } from "./types";

const uid = () => Math.random().toString(36).slice(2, 9);

// Achteraf foto's toevoegen aan een ruimte (bijv. per mail nagestuurd door de klant).
// Vervangt meteen de meldingen van foto's die bij het insturen niet doorkwamen.
export function AddPhotos({ intake, room, onDone }: { intake: IntakeRow; room: DbRoom; onDone: (next: IntakeRow) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const pick = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setBusy(true);
    setMsg(null);
    const added: DbPhoto[] = [];
    let failed = 0;
    for (const f of Array.from(files)) {
      const file = await compressImage(f);
      const id = uid();
      const path = `${intake.id}/rooms/${room.id}/${id}.jpg`;
      const { error } = await supabase.storage.from(INTAKE_PHOTOS_BUCKET).upload(path, file, { contentType: file.type, upsert: false });
      if (error) failed++;
      else added.push({ id, name: f.name, url: null, path });
    }
    if (added.length > 0) {
      const withPhotos = (r: DbRoom): DbRoom =>
        r.id !== room.id ? r : { ...r, photos: [...(r.photos ?? []).filter((p) => p?.path || p?.url), ...added] };
      const rooms = (intake.rooms ?? []).map(withPhotos);
      const payload = intake.payload && Array.isArray((intake.payload as { rooms?: unknown }).rooms)
        ? { ...intake.payload, rooms: ((intake.payload as { rooms: DbRoom[] }).rooms).map(withPhotos) }
        : intake.payload;
      const { error } = await supabase.from("intake").update({ rooms, payload }).eq("id", intake.id);
      if (error) { setBusy(false); setMsg("Foto's staan klaar, maar opslaan in het dossier lukte niet. Probeer het opnieuw."); return; }
      onDone({ ...intake, rooms, payload });
    }
    setBusy(false);
    if (input.current) input.current.value = "";
    setMsg(failed > 0 ? `${failed} foto('s) uploaden lukte niet. Probeer het opnieuw.` : `${added.length === 1 ? "Foto" : `${added.length} foto's`} toegevoegd.`);
  };

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8, flexWrap: "wrap" }}>
      <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => pick(e.target.files)} />
      <button className="rd-textlink" onClick={() => input.current?.click()} disabled={busy}>
        {busy ? "Uploaden..." : "+ Foto's toevoegen"}
      </button>
      {msg && <span style={{ fontSize: 13, fontWeight: 600, color: "var(--rd-aubergine)" }}>{msg}</span>}
    </div>
  );
}
