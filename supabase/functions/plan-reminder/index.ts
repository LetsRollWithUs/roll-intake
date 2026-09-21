// Route 2 fase 2: herinnert kopers die hun advies-tegoed nog niet hebben ingepland.
// Dagelijks via pg_cron. Eenmalig per tegoed (plan_reminded_at), 3 dagen na de plan-mail.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { klaviyoTrack, INTAKE_BASE } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";

const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - 3 * 864e5).toISOString();

  const { data: due, error } = await admin
    .from("advice_credits")
    .select("id,manage_token,buyer_name,buyer_email")
    .eq("status", "paid")
    .is("plan_reminded_at", null)
    .not("buyer_email", "is", null)
    .lt("created_at", cutoff)
    .limit(200);
  if (error) return j({ error: error.message }, 500);

  let sent = 0;
  for (const c of (due ?? []) as any[]) {
    await klaviyoTrack(
      "Advies flow",
      { email: c.buyer_email, first_name: c.buyer_name ?? undefined },
      { stap: "plan_reminder", plan_url: `${INTAKE_BASE}/plan?token=${c.manage_token}`, service_label: "Online kleuradvies" },
      {},
      `${c.id}:plan_reminder`,
      admin,
    );
    await admin.from("advice_credits").update({ plan_reminded_at: new Date().toISOString() }).eq("id", c.id);
    sent++;
  }
  return j({ ok: true, sent });
});
