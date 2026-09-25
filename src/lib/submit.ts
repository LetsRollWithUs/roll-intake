import { supabase, INTAKE_PHOTOS_BUCKET } from "./supabase";
import { assessComplexity } from "./complexity";
import { getIntakeId } from "./store";
import type { IntakeState, UploadedImage } from "./types";
import { getTurnstileToken } from "./turnstile";
import { FunctionsHttpError } from "@supabase/supabase-js";

/**
 * Roept intake-submit aan (server met Turnstile-controle). Geeft null terug als de functie
 * niet bereikbaar is; dan valt de intake terug op de oude directe route, zodat klanten
 * altijd kunnen versturen. Een bewuste weigering (403) gooit wel een fout.
 */
async function callIntakeFn<T>(body: Record<string, unknown>): Promise<T | null> {
  const { data, error } = await supabase.functions.invoke("intake-submit", { body });
  if (!error) return data as T;
  if (error instanceof FunctionsHttpError && error.context?.status === 403) throw new Error("turnstile");
  return null;
}

function extFromName(name: string): string {
  const m = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "jpg";
}

// Slaat het opslagpad op (geen publieke URL): de bucket is privé, het dashboard
// maakt er een signed URL van. Bij een mislukte upload blijft path leeg.
// Met upload-links van de server (signed) als die er zijn, anders de oude directe upload.
async function uploadImage(
  img: UploadedImage,
  path: string,
  signed: Record<string, string> | null,
): Promise<{ id: string; name: string; url: string | null; path: string | null }> {
  if (!img.file) return { id: img.id, name: img.name, url: null, path: null };
  const bucket = supabase.storage.from(INTAKE_PHOTOS_BUCKET);
  const token = signed?.[path];
  const { error } = token
    ? await bucket.uploadToSignedUrl(path, token, img.file, { contentType: img.file.type })
    : await bucket.upload(path, img.file, { upsert: false, contentType: img.file.type });
  if (error) return { id: img.id, name: img.name, url: null, path: null };
  return { id: img.id, name: img.name, url: null, path };
}

const roomPhotoPath = (intakeId: string, roomId: string, p: UploadedImage) => `${intakeId}/rooms/${roomId}/${p.id}.${extFromName(p.name)}`;
const samplePhotoPath = (intakeId: string, sampleId: string, p: UploadedImage) => `${intakeId}/samples/${sampleId}.${extFromName(p.name)}`;
const inspirationPath = (intakeId: string, p: UploadedImage) => `${intakeId}/inspiration/${p.id}.${extFromName(p.name)}`;

/**
 * Slaat een concept-lead op zodra we naam + e-mail hebben, zodat een klant die
 * afhaakt toch bewaard is. Eerst insert; bestaat de rij al, dan update.
 * (Geen upsert: INSERT ON CONFLICT botst met de RLS-policies.)
 */
export async function saveConceptLead(state: IntakeState): Promise<void> {
  const id = getIntakeId();
  if (!state.contactEmail.trim()) return;
  const token = await getTurnstileToken("intake_concept");
  const viaServer = await callIntakeFn({ action: "concept", id, name: state.contactName, email: state.contactEmail, turnstile_token: token });
  if (viaServer) return;
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

  // Eerst Turnstile + upload-links ophalen voor alle foto's in één keer.
  const paths = [
    ...state.rooms.flatMap((r) => r.photos.filter((p) => p.file).map((p) => roomPhotoPath(intakeId, r.id, p))),
    ...state.samples.filter((s) => s.photo?.file).map((s) => samplePhotoPath(intakeId, s.id, s.photo!)),
    ...state.inspirationImages.filter((i) => i.file).map((i) => inspirationPath(intakeId, i)),
  ];
  const token = await getTurnstileToken("intake_submit");
  const prep = await callIntakeFn<{ uploads: Record<string, string>; ticket: string }>({ action: "prepare", id: intakeId, paths, turnstile_token: token });
  const signed = prep?.uploads ?? null;

  const rooms = await Promise.all(
    state.rooms.map(async (room) => {
      const photos = await Promise.all(
        room.photos.map((p) =>
          uploadImage(p, roomPhotoPath(intakeId, room.id, p), signed),
        ),
      );
      return {
        id: room.id,
        typeKey: room.typeKey,
        label: room.label,
        surfaces: room.surfaces,
        sun: room.sun ?? [],
        skylight: !!room.skylight,
        noWindows: !!room.noWindows,
        usage: room.usage ?? null,
        otherChanges: room.otherChanges ?? null,
        otherChangesNote: room.otherChangesNote ?? null,
        daylight: room.daylight ?? null,
        daylightDir: room.daylightDir ?? null,
        priority: !!room.priority,
        photos,
      };
    }),
  );

  const samples = await Promise.all(
    state.samples.map(async (s) => {
      const photo = s.photo
        ? await uploadImage(s.photo, samplePhotoPath(intakeId, s.id, s.photo), signed)
        : null;
      return {
        id: s.id,
        brand: s.brand,
        roomId: s.roomId ?? null,
        name: s.name,
        verdict: s.verdict,
        note: s.note ?? null,
        photo,
        rollId: s.rollId ?? null,
        hex: s.hex ?? null,
        packId: s.packId ?? null,
      };
    }),
  );

  // has_samples afleiden uit de echte samples (het topniveau is alleen een ja/nee-poort).
  const brandsLc = state.samples.map((s) => (s.brand || "").trim().toLowerCase());
  const anyRoll = state.samples.some((s) => !!s.rollId) || brandsLc.includes("roll");
  const anyOther = state.samples.some((s) => !s.rollId && (s.brand || "").trim() !== "" && (s.brand || "").trim().toLowerCase() !== "roll");
  const hasSamplesResolved =
    state.hasSamples === "nee" || state.hasSamples == null
      ? state.hasSamples ?? null
      : state.samples.length === 0
      ? "ja"
      : anyRoll && anyOther
      ? "allebei"
      : anyRoll
      ? "roll"
      : "andere";

  const inspirationImages = await Promise.all(
    state.inspirationImages.map((img) =>
      uploadImage(img, inspirationPath(intakeId, img), signed),
    ),
  );

  const cx = assessComplexity(state);

  // Meetgegevens per ruimte (key = room id) voor de reken-engine in het dashboard.
  const roomMeasures: Record<string, unknown> = {};
  for (const room of state.rooms) if (room.measure) roomMeasures[room.id] = room.measure;

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
    has_samples: hasSamplesResolved,
    samples,
    pinterest_url: state.pinterestUrl || null,
    other_inspiration_url: state.otherInspirationUrl || null,
    inspiration_images: inspirationImages,
    planning: state.planning ?? null,
    painter: state.painter ?? null,
    room_measures: roomMeasures,
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
  // Afronden via de server met het ticket uit prepare; zonder server de oude route.
  const done = prep ? await callIntakeFn<{ ok: boolean }>({ action: "submit", id: intakeId, row, ticket: prep.ticket }) : null;
  if (!done) {
    const { error } = await supabase.rpc("submit_intake", { p_id: intakeId, p_row: row });
    if (error) throw new Error(error.message);
  }

  // Koppelt de intake aan de boeking in Klaviyo (zet intake_ingevuld=true → reminderflow stopt).
  // Best-effort: een mislukte melding mag het afronden niet blokkeren.
  if (opts?.bookingId) {
    try {
      await supabase.functions.invoke("booking", {
        body: { action: "intake_done", booking_id: opts.bookingId },
      });
    } catch {
      /* stil: melding is niet kritiek voor de klant */
    }
  }

  return { id: intakeId };
}
