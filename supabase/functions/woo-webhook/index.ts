// Ontvangt WooCommerce order-webhooks en werkt de boeking bij.
// Betaald (processing/completed/on-hold) -> confirmed. Geannuleerd/mislukt -> cancelled.
// Verifieert de handtekening met WOO_WEBHOOK_SECRET.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { confirmPaid, cancelBooking, createCreditFromOrder } from "../_shared/confirm.ts";

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
    // Ook een verlopen (cancelled) hold wordt hier veilig afgehandeld: slot nog vrij → bevestigen,
    // anders herplaatsen bij een andere styliste, anders paid_unplaced + alert.
    if (existing && existing.status !== "confirmed") {
      await confirmPaid(admin, existing.id as string);
    } else if (!existing && !bookingId) {
      // Directe aankoop (route 2): geen boeking bij deze order -> maak een advies-tegoed + plan-mail.
      await createCreditFromOrder(admin, order);
    }
  } else if (dead) {
    // Refund/annulering: ook een reeds BEVESTIGDE afspraak wordt nu geannuleerd (slot komt vrij).
    // cancelBooking informeert klant + team alleen als het een echte afspraak was.
    const col = bookingId ? "id" : "woo_order_id";
    const val = bookingId ?? String(order.id);
    const { data: existing } = await admin.from("bookings").select("id").eq(col, val).maybeSingle();
    if (existing) await cancelBooking(admin, existing.id as string, order.status);
  }

  return new Response("ok");
});
