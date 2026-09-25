// Vorm van een intake-rij zoals die uit Supabase komt (snake_case + jsonb).

export interface DbPhoto {
  id?: string;
  name?: string;
  url?: string | null; // oude rijen: publieke URL (bucket is nu privé; dashboard leidt hier het pad uit af)
  path?: string | null; // nieuwe rijen: opslagpad in de bucket, weergave via signed URL
}
export interface DbRoom {
  id: string;
  label: string;
  typeKey?: string;
  surfaces?: string[];
  sun?: string[] | null;
  skylight?: boolean | null;
  noWindows?: boolean | null;
  usage?: string | null;
  otherChanges?: boolean | null;
  otherChangesNote?: string | null;
  daylight?: string | null;
  daylightDir?: string | null;
  priority?: boolean;
  photos?: DbPhoto[];
}
export interface DbSample {
  id: string;
  brand?: string;
  name?: string;
  verdict?: string;
  note?: string | null;
  roomId?: string | null;
  photo?: DbPhoto | null;
  rollId?: string | null;
  hex?: string | null;
  packId?: string | null;
}
export interface DbColor {
  id?: string;
  name: string;
  hex?: string;
  rollId?: string;
}

export interface IntakeRow {
  id: string;
  created_at: string;
  status: string; // concept | verzonden
  contact_name: string | null;
  contact_email: string | null;
  main_question: string | null;
  help_needs: string[] | null;
  moods: string[] | null;
  inspiration_likes: string[] | null;
  inspiration_note: string | null;
  boldness: number | null;
  rooms: DbRoom[] | null;
  colors: DbColor[] | null;
  has_samples: string | null;
  samples: DbSample[] | null;
  pinterest_url: string | null;
  other_inspiration_url: string | null;
  inspiration_images: DbPhoto[] | null;
  planning: string | null;
  painter: string | null;
  complexity_level: string | null;
  complexity_score: number | null;
  payload: Record<string, unknown> | null;
  advisor_status: string;
  advisor_notes: string | null;
  advisor_rejected_reason: string | null;
  advisor_updated_at: string | null;
  advisor_outcome: string | null;
  advisor_advice: AdviceRow[] | null;
  advisor_buy_moment: string | null;
  advisor_next_action: string | null;
  advisor_offer_url: string | null;
  advisor_followup_sent_at: string | null;
  advisor_summary: string | null;
  advisor_offer_notes: string | null;
  // Werkplek fase 2: gestructureerd advies
  advice_client: AdviceClient | null;
  advice_internal: string | null;
  followup_plan: FollowupPlan | null;
  followup_route: "samples" | "zelf" | "roll" | null;
  // Werkplek fase 5: conceptvoorbereiding (AI-concept, door de styliste goed te keuren)
  advice_concept: AdviceConcept | null;
  advice_concept_at: string | null;
  advice_products: AdviceProduct[] | null;
  advice_sample: AdvicePhase | null;
  advice_verf: AdvicePhase | null;
  // Meetgegevens per ruimte (key = room id) voor de reken-engine; zie src/lib/verfcalc.ts.
  room_measures: Record<string, import("@/lib/verfcalc").RoomMeasure> | null;
  // Uitkomst van de sample-check-in (stap 4).
  sample_checkin: SampleCheckin | null;
  // Offerte uit de offerte-tool + keuze of de aanbevolen tools in het mandje gaan.
  offer_meta: OfferMeta | null;
}

export interface OfferMeta { tools_in_cart: boolean; id?: number | null; nummer?: string | null; edit_url?: string | null; klant_url?: string | null; mand_url?: string | null; kleuren_onbekend?: string[]; at?: string }

export type CheckinOutcome = "keuze_gemaakt" | "meer_samples" | "nog_twijfel" | "later_schilderen" | "geen_reactie";
export interface SampleCheckin {
  at: string;
  by: string | null;
  outcome: CheckinOutcome;
  winners: { room_id?: string; room: string; surface: string; color: string }[];
  note: string;
}

export interface AdviceProduct { kind: "pack" | "sticker" | "tester"; ref: string; name: string }

// Eén advies-fase (sample of verf): eigen tekst, kleuren, route en (sample) producten.
export interface AdvicePhase {
  answer: string;
  rooms: AdviceRoom[];
  sample_instruction: string;
  next_step: string;
  internal: string;
  plan: FollowupPlan;
  route: "samples" | "zelf" | "roll";
  products: AdviceProduct[];
}

export interface AdviceConcept {
  samenvatting: string;
  ontbreekt: string[];
  vragen: string[];
  richtingen: { titel: string; kleuren: { id: string; naam: string; toepassing: string }[]; waarom: string; gebaseerd_op: string }[];
  samples_aandacht: string[];
  model?: string;
}

export interface AdviceRoom {
  room_id?: string; // koppeling met de ruimte uit de intake (bij voorkeur boven de naam)
  room: string;
  surface: string;
  color: string;
  status: "voorgesteld" | "definitief";
  product: string;
  m2: string;
  liters: string;
  motivation: string;
}
export interface AdviceClient {
  answer: string;
  rooms: AdviceRoom[];
  sample_instruction: string;
  next_step: string;
}
export interface FollowupPlan { what: string; who: "styliste" | "roll" | "klant" | ""; when: string }

export interface AdviceRow {
  room: string;
  color: string;
  product: string;
  liters: string;
  m2?: string;
}
