// Ontvangt WooCommerce order-webhooks en werkt de boeking bij.
// Betaald (processing/completed/on-hold) -> confirmed. Geannuleerd/mislukt -> cancelled.
// Verifieert de handtekening met WOO_WEBHOOK_SECRET.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SECRET = Deno.env.get("WOO_WEBHOOK_SECRET")!;

async function validSignature(raw: string, sig: string | null): Promise<boolean> {
  if (!sig) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(SECRET),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(raw));
  const b64 = btoa(String.fromCharCode(...new Uint8Array(mac)));
  return b64 === sig;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("ok");
  const raw = await req.text();
  // Woo stuurt een ping zonder body bij aanmaken; die accepteren we.
  if (!raw || raw === "{}") return new Response("ok");

  const sig = req.headers.get("x-wc-webhook-signature");
  if (!(await validSignature(raw, sig))) return new Response("invalid signature", { status: 401 });

  let order: any;
  try {
    order = JSON.parse(raw);
  } catch {
    return new Response("bad json", { status: 400 });
  }

  const bookingId = (order.meta_data ?? []).find((m: any) => m.key === "_booking_id")?.value;
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

  const paid = ["processing", "completed", "on-hold"].includes(order.status);
  const dead = ["cancelled", "failed", "refunded"].includes(order.status);

  if (paid) {
    const col = bookingId ? "id" : "woo_order_id";
    const val = bookingId ?? String(order.id);
    const { data: existing } = await admin.from("bookings").select("id,status").eq(col, val).maybeSingle();
    if (existing && existing.status !== "confirmed") {
      await admin.from("bookings").update({ status: "confirmed", hold_expires_at: null }).eq("id", existing.id);
      const ctx = await buildBookingContext(admin, existing.id as string);
      if (ctx) {
        await klaviyoTrack(
          "Afspraak bevestigd",
          ctx.profile,
          ctx.properties,
          { next_appointment_at: ctx.properties.start_at, intake_ingevuld: ctx.properties.intake_ingevuld },
          `${existing.id}:confirmed`,
        );
      }
    }
  } else if (dead) {
    await admin
      .from("bookings")
      .update({ status: "cancelled" })
      .eq(bookingId ? "id" : "woo_order_id", bookingId ?? String(order.id))
      .in("status", ["held", "pending_payment"]);
  }

  return new Response("ok");
});
