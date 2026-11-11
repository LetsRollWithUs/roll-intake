// Check-in na de samples: op de dag dat de check-in gepland staat en nog open is, krijgt de styliste
// een kort seintje (Styliste melding, soort samples_checkin). Alleen voor klanten die de samples echt
// hebben besteld en nog geen verf kochten. Dagelijks via pg_cron. Eenmalig per taak en datum: schuift
// de check-in op (bijvoorbeeld bij "geen reactie"), dan volgt op de nieuwe dag weer een seintje.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { notifyStylist, datumNL } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";
// Een gemiste dag (storing) halen we in, een oude achterstand mailen we niet alsnog.
const INHAAL_DAGEN = 2;

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const vandaag = datumNL(new Date());
  const vanaf = datumNL(new Date(Date.now() - INHAAL_DAGEN * 864e5));

  const { data: taken, error } = await admin.from("followup_tasks")
    .select("id,booking_id,due_date, bookings!inner(samples_besteld,kanban_stage,status)")
    .eq("kind", "sample_checkin").eq("owner", "styliste").is("done_at", null)
    .gte("due_date", vanaf).lte("due_date", vandaag)
    .eq("bookings.samples_besteld", true)
    .limit(200);
  if (error) return j({ error: error.message }, 500);

  let verstuurd = 0;
  for (const t of (taken ?? []) as any[]) {
    if (["verf", "afgehaakt"].includes(t.bookings?.kanban_stage) || t.bookings?.status === "cancelled") continue;
    const key = `${t.id}:styliste:samples_checkin:${t.due_date}`;
    const { data: al } = await admin.from("notification_outbox").select("id").eq("unique_id", key).limit(1);
    if ((al ?? []).length) continue;
    await notifyStylist(admin, t.booking_id, "samples_checkin", {}, key);
    verstuurd++;
  }
  return j({ ok: true, gecontroleerd: (taken ?? []).length, verstuurd });
});
