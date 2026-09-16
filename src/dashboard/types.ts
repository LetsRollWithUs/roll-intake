// Vorm van een intake-rij zoals die uit Supabase komt (snake_case + jsonb).

export interface DbPhoto {
  id?: string;
  name?: string;
  url?: string | null;
}
export interface DbRoom {
  id: string;
  label: string;
  typeKey?: string;
  surfaces?: string[];
  daylight?: string | null;
  daylightDir?: string | null;
  usage?: string | null;
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
}
