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
}

export interface AdviceRow {
  room: string;
  color: string;
  product: string;
  liters: string;
  m2?: string;
}
