import { supabase, INTAKE_PHOTOS_BUCKET } from "./supabase";
import { assessComplexity } from "./complexity";
import type { IntakeState } from "./types";

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "jpg";
}

/**
 * Verstuurt de intake: uploadt de foto's naar de bucket en schrijft één rij in
 * de intake-tabel. De anon-key mag alleen insturen, niet teruglezen, dus we
 * genereren het id zelf en gebruiken geen returning-select.
 */
export async function submitIntake(state: IntakeState): Promise<{ id: string }> {
  const intakeId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  // Foto's uploaden en de rooms verrijken met publieke URL's.
  const rooms = await Promise.all(
    state.rooms.map(async (room) => {
      const photos = await Promise.all(
        room.photos.map(async (p) => {
          if (!p.file) return { id: p.id, name: p.name, url: p.url };
          const path = `${intakeId}/${room.id}/${p.id}.${extFromName(p.name)}`;
          const { error } = await supabase.storage
            .from(INTAKE_PHOTOS_BUCKET)
            .upload(path, p.file, { upsert: false, contentType: p.file.type });
          if (error) {
            return { id: p.id, name: p.name, url: null, error: error.message };
          }
          const { data } = supabase.storage.from(INTAKE_PHOTOS_BUCKET).getPublicUrl(path);
          return { id: p.id, name: p.name, url: data.publicUrl };
        }),
      );
      return {
        id: room.id,
        typeKey: room.typeKey,
        label: room.label,
        surfaces: room.surfaces,
        daylight: room.daylight ?? null,
        daylightDir: room.daylightDir ?? null,
        photos,
      };
    }),
  );

  const cx = assessComplexity(state);

  const row = {
    id: intakeId,
    contact_name: state.contactName || null,
    contact_email: state.contactEmail || null,
    main_question: state.mainQuestion || null,
    help_needs: state.helpNeeds,
    moods: state.moods,
    inspiration_likes: state.inspirationLikes,
    inspiration_note: state.inspirationNote || null,
    boldness: state.boldness ?? null,
    rooms,
    colors: state.colors,
    complexity_level: cx.level,
    complexity_score: cx.score,
    payload: { rooms, colors: state.colors, moods: state.moods },
  };

  const { error } = await supabase.from("intake").insert(row);
  if (error) throw new Error(error.message);

  return { id: intakeId };
}
