// Intake-herinneringen (Advies flow, stap=reminder). Draait elke 15 min via pg_cron.
// Twee momenten, alleen voor bevestigde afspraken waarvan de intake nog niet is ingevuld:
//  1. Vroeg: 48 uur na het boeken, als het gesprek dan nog minstens 6 dagen weg is
//     (anders volgt de late herinnering kort daarna en krijgt de klant twee mails vlak na elkaar).
//     Idempotent via de unique_id `${id}:reminder-vroeg` in notification_outbox (en bij Klaviyo).
//  2. Laat: 3 dagen (72 uur) voor het gesprek, zodat de styliste de intake op tijd kan lezen.
//     Idempotent via reminder_sent_at + unique_id `${id}:reminder`.
// Beide vuren stap=reminder met het veld `herinnering` ("vroeg" of "laat") voor de tekst in Klaviyo.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";

const UUR = 3600 * 1000;
const LAAT_VOORAF = 72 * UUR; // late herinnering: 3 dagen voor het gesprek
const VROEG_NA_BOEKEN = 48 * UUR; // vroege herinnering: 2 dagen na het boeken
const VROEG_MIN_VOORAF = 6 * 24 * UUR; // alleen als het gesprek nog minstens 6 dagen weg is

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const nu = Date.now();

  // 1. Vroege herinnering
  const { data: vroeg, error: e1 } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("intake_id", null)
    .is("reminder_sent_at", null)
    .lte("created_at", new Date(nu - VROEG_NA_BOEKEN).toISOString())
    .gt("start_at", new Date(nu + VROEG_MIN_VOORAF).toISOString())
    .limit(200);
  if (e1) return j({ error: e1.message }, 500);

  let vroegSent = 0;
  const vroegIds = ((vroeg ?? []) as { id: string }[]).map((b) => b.id);
  if (vroegIds.length) {
    const { data: al } = await admin
      .from("notification_outbox")
      .select("unique_id")
      .in("unique_id", vroegIds.map((id) => `${id}:reminder-vroeg`));
    const gehad = new Set(((al ?? []) as { unique_id: string }[]).map((r) => r.unique_id));
    for (const id of vroegIds) {
      if (gehad.has(`${id}:reminder-vroeg`)) continue;
      const ctx = await buildBookingContext(admin, id);
      if (!ctx) continue;
      await klaviyoTrack(
        "Advies flow",
        ctx.profile,
        { ...ctx.properties, stap: "reminder", herinnering: "vroeg" },
        {},
        `${id}:reminder-vroeg`,
        admin,
      );
      vroegSent++;
    }
  }

  // 2. Late herinnering, 3 dagen vooraf
  const { data: due, error } = await admin
    .from("bookings")
    .select("id")
    .eq("status", "confirmed")
    .is("reminder_sent_at", null)
    .is("intake_id", null)
    .gt("start_at", new Date(nu).toISOString())
    .lte("start_at", new Date(nu + LAAT_VOORAF).toISOString())
    .limit(200);
  if (error) return j({ error: error.message }, 500);

  let sent = 0;
  for (const b of (due ?? []) as { id: string }[]) {
    const ctx = await buildBookingContext(admin, b.id);
    if (ctx) {
      await klaviyoTrack(
        "Advies flow",
        ctx.profile,
        { ...ctx.properties, stap: "reminder", herinnering: "laat" },
        {},
        `${b.id}:reminder`,
        admin,
      );
    }
    await admin.from("bookings").update({ reminder_sent_at: new Date().toISOString() }).eq("id", b.id);
    sent++;
  }
  return j({ ok: true, vroeg: vroegSent, sent });
});
