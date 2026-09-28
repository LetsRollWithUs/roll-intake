// Nazorg bestelvoorstel: 10 dagen na het versturen nog geen bestelling? Dan een Roll-taak "nazorg",
// zodat Maurice of Ingmar de klant een appje stuurt, mailt of belt (de taak-trigger stuurt het seintje).
// Dagelijks via pg_cron. Eenmalig per voorstel (offer_nazorg_at). Besteld = status 'besteld'.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { orderedSince } from "../_shared/voorstel.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";
const WOO_URL = (Deno.env.get("WOO_URL") ?? "https://roll.nl").replace(/\/$/, "");
const wooAuth = "Basic " + btoa(`${Deno.env.get("WOO_KEY")}:${Deno.env.get("WOO_SECRET")}`);
const NAZORG_DAGEN = 10;

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

Deno.serve(async (req) => {
  if (!SECRET || req.headers.get("x-cron-secret") !== SECRET) return j({ error: "Geen toegang" }, 403);
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const cutoff = new Date(Date.now() - NAZORG_DAGEN * 864e5).toISOString();
  const { data: due, error } = await admin.from("intake")
    .select("id,booking_id,contact_name,contact_email,offer_sent_at,offer_total,offer_meta")
    .eq("offer_status", "verstuurd").is("offer_nazorg_at", null).lt("offer_sent_at", cutoff).limit(100);
  if (error) return j({ error: error.message }, 500);

  let taken = 0, besteld = 0;
  for (const it of (due ?? []) as any[]) {
    const now = new Date().toISOString();
    if (it.contact_email && await orderedSince(it.contact_email, it.offer_sent_at, WOO_URL, wooAuth)) {
      await admin.from("intake").update({ offer_status: "besteld", offer_nazorg_at: now }).eq("id", it.id);
      besteld++;
      continue;
    }
    const { data: bk } = it.booking_id ? await admin.from("bookings").select("stylist_id").eq("id", it.booking_id).maybeSingle() : { data: null };
    const due10 = new Date().toISOString().slice(0, 10);
    const { error: e2 } = await admin.from("roll_tasks").insert({
      type: "nazorg", booking_id: it.booking_id, intake_id: it.id, stylist_id: (bk as any)?.stylist_id ?? null,
      requested_by: "systeem", due_date: due10,
      payload: { rooms: [], planning: "", notes: `Bestelvoorstel ${it.offer_meta?.nummer ?? ""} (totaal ${it.offer_total ?? "onbekend"}) is ${NAZORG_DAGEN} dagen geleden verstuurd en nog niet besteld. Stuur een appje, mail of bel even.` },
    });
    if (!e2) { await admin.from("intake").update({ offer_nazorg_at: now }).eq("id", it.id); taken++; }
  }
  return j({ ok: true, checked: (due ?? []).length, taken, besteld });
});
