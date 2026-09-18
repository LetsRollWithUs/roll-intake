// Plant de 24u intake-reminder (Advies flow, stap=reminder). Draait elke 15 min via pg_cron.
// Vuurt voor bevestigde afspraken binnen 24u waarvan de intake nog niet ingevuld is en de
// reminder nog niet verstuurd. Idempotent via reminder_sent_at + unique_id.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  const { data: due, error } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .is("intake_id", null)
    .gt("start_at", new Date().toISOString())
    .lte("start_at", new Date(Date.now() + 24 * 3600 * 1000).toISOString())
    .limit(200);
  if (error) return j({ error: error.message }, 500);

  let sent = 0;
  for (const b of (due ?? []) as { id: string }[]) {
    const ctx = await buildBookingContext(admin, b.id);
    if (ctx) {
      await klaviyoTrack(
        "Advies flow",
        ctx.profile,
        { ...ctx.properties, stap: "reminder" },
        {},
        `${b.id}:reminder`,
        admin,
      );
    }
    await admin.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
    sent++;
  }
  return j({ ok: true, sent });
});
