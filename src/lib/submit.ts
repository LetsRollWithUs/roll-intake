import { supabase, INTAKE_PHOTOS_BUCKET } from "./supabase";
import { assessComplexity } from "./complexity";
import type { IntakeState, UploadedImage } from "./types";

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "jpg";
}

async function uploadImage(
  img: UploadedImage,
  path: string,
): Promise<{ id: string; name: string; url: string | null }> {
  if (!img.file) return { id: img.id, name: img.name, url: img.url };
  const { error } = await supabase.storage
    .from(INTAKE_PHOTOS_BUCKET)
    .upload(path, img.file, { upsert: false, contentType: img.file.type });
  if (error) return { id: img.id, name: img.name, url: null };
  const { data } = supabase.storage.from(INTAKE_PHOTOS_BUCKET).getPublicUrl(path);
  return { id: img.id, name: img.name, url: data.publicUrl };
}

/**
 * Verstuurt de intake: uploadt alle foto's (ruimtes, samples, inspiratie) en
 * schrijft één rij. De anon-key mag alleen insturen, niet teruglezen, dus we
 * genereren het id zelf en gebruiken geen returning-select.
 */
export async function submitIntake(state: IntakeState): Promise<{ id: string }> {
  const intakeId =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const rooms = await Promise.all(
    state.rooms.map(async (room) => {
      const photos = await Promise.all(
        room.photos.map((p) =>
          uploadImage(p, `${intakeId}/rooms/${room.id}/${p.id}.${extFromName(p.name)}`),
        ),
      );
      return {
        id: room.id,
        typeKey: room.typeKey,
        label: room.label,
        surfaces: room.surfaces,
        daylight: room.daylight ?? null,
        daylightDir: room.daylightDir ?? null,
        usage: room.usage ?? null,
        priority: !!room.priority,
        photos,
      };
    }),
  );

  const samples = await Promise.all(
    state.samples.map(async (s) => {
      const photo = s.photo
        ? await uploadImage(s.photo, `${intakeId}/samples/${s.id}.${extFromName(s.photo.name)}`)
        : null;
      return {
        id: s.id,
        brand: s.brand,
        name: s.name,
        verdict: s.verdict,
        note: s.note ?? null,
        photo,
      };
    }),
  );

  const inspirationImages = await Promise.all(
    state.inspirationImages.map((img) =>
      uploadImage(img, `${intakeId}/inspiration/${img.id}.${extFromName(img.name)}`),
    ),
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
    has_samples: state.hasSamples ?? null,
    samples,
    pinterest_url: state.pinterestUrl || null,
    other_inspiration_url: state.otherInspirationUrl || null,
    inspiration_images: inspirationImages,
    planning: state.planning ?? null,
    complexity_level: cx.level,
    complexity_score: cx.score,
    payload: { rooms, samples, colors: state.colors, inspirationImages },
  };

  const { error } = await supabase.from("intake").insert(row);
  if (error) throw new Error(error.message);

  return { id: intakeId };
}
