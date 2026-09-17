import { supabase, INTAKE_PHOTOS_BUCKET } from "./supabase";
import { assessComplexity } from "./complexity";
import { getIntakeId } from "./store";
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
 * Slaat een concept-lead op zodra we naam + e-mail hebben, zodat een klant die
 * afhaakt toch bewaard is. Eerst insert; bestaat de rij al, dan update.
 * (Geen upsert: INSERT ON CONFLICT botst met de RLS-policies.)
 */
export async function saveConceptLead(state: IntakeState): Promise<void> {
  const id = getIntakeId();
  if (!state.contactEmail.trim()) return;
  const fields = {
    contact_name: state.contactName || null,
    contact_email: state.contactEmail || null,
  };
  const { error } = await supabase.from("intake").insert({ id, status: "concept", ...fields });
  // 23505 = concept bestaat al; naam/e-mail worden bij verzenden alsnog overschreven.
  if (error && error.code !== "23505") throw new Error(error.message);
}

/**
 * Verstuurt de volledige intake: uploadt alle foto's en werkt de concept-rij bij
 * naar status 'verzonden'. Valt terug op insert als er nog geen rij is.
 */
export async function submitIntake(
  state: IntakeState,
  opts?: { bookingId?: string | null; mode?: string | null },
): Promise<{ id: string }> {
  const intakeId = getIntakeId();

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
        roomId: s.roomId ?? null,
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
    booking_id: opts?.bookingId ?? null,
    mode: opts?.mode ?? null,
    complexity_level: cx.level,
    complexity_score: cx.score,
    payload: {
      rooms,
      samples,
      colors: state.colors,
      inspirationImages,
      noSfeerImage: state.noSfeerImage ?? false,
      sfeerSameAll: state.sfeerSameAll ?? null,
      sfeerExceptionNote: state.sfeerExceptionNote || null,
      hasOtherChanges: state.hasOtherChanges ?? null,
      otherChangesNote: state.otherChangesNote || null,
      questionScope: state.questionScope ?? null,
    },
  };

  // Afronden via SECURITY DEFINER-RPC: werkt de concept-rij bij naar 'verzonden'
  // (of insert als die er niet is). Anon mag de tabel zelf niet lezen/wijzigen.
  const { error } = await supabase.rpc("submit_intake", { p_id: intakeId, p_row: row });
  if (error) throw new Error(error.message);

  return { id: intakeId };
}
