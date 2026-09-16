import { createClient } from "@supabase/supabase-js";

// De publishable key hoort thuis in de browserbundel; env heeft voorrang, met
// de publieke waarden als fallback zodat een build altijd werkt.
const url = import.meta.env.VITE_SUPABASE_URL ?? "https://lsboujprrvhntgbvlvyu.supabase.co";
const key =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
  "sb_publishable_r8uXvtFb4hYz2qexL6X60g_KRwuMnsG";

export const supabase = createClient(url, key, {
  auth: { persistSession: false },
});

export const INTAKE_PHOTOS_BUCKET = "intake-photos";
