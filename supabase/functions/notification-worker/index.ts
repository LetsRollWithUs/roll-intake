// Verstuurt Klaviyo-events uit de outbox die (nog) niet gelukt zijn, met backoff.
// Elke minuut via pg_cron (header x-cron-secret). Na MAX_ATTEMPTS: alert + laten staan.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendToKlaviyo } from "../_shared/klaviyo.ts";
import { postAlertWebhook } from "../_shared/alerts.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CRON_SECRET") ?? Deno.env.get("CALENDAR_CRON_SECRET") ?? "";

const BACKOFF_MIN = [2, 5, 15, 30, 60]; // wachttijd na poging 1, 2, 3, 4, 5+
const MAX_ATTEMPTS = 6; // ~2 uur aan pogingen in totaal
const BATCH = 50;

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const nowIso = new Date().toISOString();

  const { data: rows, error } = await admin
    .from("notification_outbox")
    .select("*")
    .is("sent_at", null)
    .lte("next_attempt_at", nowIso)
    .lt("attempts", MAX_ATTEMPTS)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return j({ error: error.message }, 500);

  let sent = 0, retry = 0, dead = 0;
  for (const r of (rows ?? []) as any[]) {
    const res = await sendToKlaviyo(r.metric, r.profile, r.properties ?? {}, r.profile_props ?? {}, r.unique_id ?? undefined);
    const attempts = (r.attempts ?? 0) + 1;
    if (res.ok) {
      await admin.from("notification_outbox").update({ sent_at: new Date().toISOString(), attempts, last_error: null }).eq("id", r.id);
      sent++;
      continue;
    }
    const patch: Record<string, unknown> = { attempts, last_error: `${res.status} ${res.detail ?? ""}`.trim().slice(0, 500) };
    if (attempts >= MAX_ATTEMPTS) {
      dead++;
      if (!r.alerted_at) {
        const email = (r.profile ?? {}).email ?? null;
        await admin.from("system_alerts").insert({
          kind: "notification_failed",
          message: `Klaviyo-event "${r.metric}" kon na ${attempts} pogingen niet verstuurd worden. Klant heeft deze mail niet ontvangen.`,
          payload: { outbox_id: r.id, metric: r.metric, email, last_error: patch.last_error },
        });
        await postAlertWebhook("notification_failed", `Klaviyo-event "${r.metric}" definitief mislukt voor ${email ?? "onbekend"}.`, { outbox_id: r.id, last_error: patch.last_error });
        patch.alerted_at = new Date().toISOString();
      }
    } else {
      retry++;
      const wait = BACKOFF_MIN[Math.min(attempts - 1, BACKOFF_MIN.length - 1)];
      patch.next_attempt_at = new Date(Date.now() + wait * 60000).toISOString();
    }
    await admin.from("notification_outbox").update(patch).eq("id", r.id);
  }
  return j({ ok: true, processed: (rows ?? []).length, sent, retry, dead });
});
