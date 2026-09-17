// Booking-brug tussen de boekflow en WooCommerce.
// - checkout (anon): reserveert een slot (hold_slot) en maakt een €30 Woo-order,
//   geeft de betaal-URL terug.
// - status (anon): controleert de order en bevestigt de boeking als betaald.
// - setup_webhook / delete_order (alleen @roll.nl-admin): beheer/opruimen.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack, appointmentProfileProps } from "../_shared/klaviyo.ts";
import { SAMPLE_STICKER_IDS, SAMPLE_POUCH_IDS, colorNameToId, multiAddUrl, SHOP_BASE } from "../_shared/roll-products.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const WOO_URL = (Deno.env.get("WOO_URL") ?? "https://roll.nl").replace(/\/$/, "");
const WOO_KEY = Deno.env.get("WOO_KEY")!;
const WOO_SECRET = Deno.env.get("WOO_SECRET")!;
const WEBHOOK_SECRET = Deno.env.get("WOO_WEBHOOK_SECRET")!;
const PRODUCT_ID = 14753; // online kleuradvies
const wooAuth = "Basic " + btoa(`${WOO_KEY}:${WOO_SECRET}`);

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const action = body.action as string;
    const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

    if (action === "checkout") {
      const { service_key, start, name, email, phone, coupon } = body;
      const { data: hold, error } = await admin.rpc("hold_slot", {
        p_service_key: service_key,
        p_start: start,
        p_name: name,
        p_email: email,
        p_phone: phone ?? null,
      });
      if (error) return j({ error: error.message }, 409);
      const bookingId = hold.booking_id as string;

      const orderRes = await fetch(`${WOO_URL}/wp-json/wc/v3/orders`, {
        method: "POST",
        headers: { Authorization: wooAuth, "content-type": "application/json" },
        body: JSON.stringify({
          status: "pending",
          billing: { first_name: name, email, phone: phone || undefined },
          line_items: [{ product_id: PRODUCT_ID, quantity: 1 }],
          coupon_lines: coupon ? [{ code: String(coupon) }] : undefined,
          meta_data: [
            { key: "_booking_id", value: bookingId },
            { key: "_booking_source", value: "intake" },
          ],
        }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) {
        await admin.from("bookings").update({ status: "cancelled" }).eq("id", bookingId);
        return j({ error: "Kon de order niet aanmaken.", detail: order }, 502);
      }
      await admin.from("bookings").update({ woo_order_id: String(order.id) }).eq("id", bookingId);
      const payUrl = `${WOO_URL}/checkout/order-pay/${order.id}/?pay_for_order=true&key=${order.order_key}`;
      return j({ booking_id: bookingId, order_id: order.id, pay_url: payUrl });
    }

    if (action === "status") {
      const { data: b } = await admin
        .from("bookings")
        .select("id,status,woo_order_id,start_at, services(key)")
        .eq("id", body.booking_id)
        .maybeSingle();
      if (!b) return j({ error: "Niet gevonden" }, 404);
      const mode = (b as any).services?.key ?? null;
      if (b.status === "confirmed") return j({ status: "confirmed", start_at: b.start_at, mode });
      if (b.woo_order_id) {
        const r = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${b.woo_order_id}`, {
          headers: { Authorization: wooAuth },
        });
        const o = await r.json();
        if (r.ok && ["processing", "completed", "on-hold"].includes(o.status)) {
          await admin.from("bookings").update({ status: "confirmed", hold_expires_at: null }).eq("id", b.id);
          const ctx = await buildBookingContext(admin, b.id as string);
          if (ctx) {
            await klaviyoTrack(
              "Afspraak bevestigd",
              ctx.profile,
              ctx.properties,
              appointmentProfileProps(ctx, { includeIntakeStatus: true }),
              `${b.id}:confirmed`,
            );
          }
          return j({ status: "confirmed", start_at: b.start_at, mode });
        }
      }
      return j({ status: b.status, start_at: b.start_at, mode });
    }

    // Intake ingevuld: profielprop zetten zodat de reminderflow stopt + event voor opvolging.
    if (action === "intake_done") {
      if (!body.booking_id) return j({ ok: false, skipped: "geen booking_id" });
      const ctx = await buildBookingContext(admin, body.booking_id);
      if (!ctx) return j({ ok: false, skipped: "boeking niet gevonden" });
      const r = await klaviyoTrack(
        "Intake ingevuld",
        ctx.profile,
        ctx.properties,
        { intake_ingevuld: true, intake_ingevuld_at: new Date().toISOString() },
        `${ctx.bookingId}:intake_done`,
      );
      return j({ ok: r.ok });
    }

    // Afspraak gewijzigd (verzet of overgedragen): nieuwe tijd/videolink mailen.
    if (action === "booking_changed") {
      if (!body.booking_id) return j({ ok: false, skipped: "geen booking_id" });
      const ctx = await buildBookingContext(admin, body.booking_id);
      if (!ctx) return j({ ok: false, skipped: "boeking niet gevonden" });
      const r = await klaviyoTrack(
        "Afspraak gewijzigd",
        ctx.profile,
        ctx.properties,
        appointmentProfileProps(ctx),
      );
      return j({ ok: r.ok });
    }

    // Advies afgerond: opvolgmail met de juiste route (samples of verf). Alleen adviseurs.
    if (action === "advies_done") {
      if (!body.intake_id) return j({ ok: false, skipped: "geen intake_id" });
      const caller = createClient(SB_URL, SB_ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const { data: isAdv } = await caller.rpc("is_advisor");
      if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
      const { data: it } = await admin
        .from("intake")
        .select("contact_email,contact_name,advisor_outcome,advisor_advice,advisor_offer_url,booking_id")
        .eq("id", body.intake_id)
        .maybeSingle();
      if (!it || !(it as any).contact_email) return j({ ok: false, skipped: "geen intake/e-mail" });
      const row = it as any;
      const advice = Array.isArray(row.advisor_advice) ? row.advisor_advice : [];
      const stickerPairs: [number, number][] = [];
      const pouchPairs: [number, number][] = [];
      const seenSt = new Set<number>();
      const seenPo = new Set<number>();
      const enriched = advice.map((a: any) => {
        const colorId = colorNameToId(a.color ?? "");
        if (colorId) {
          const st = SAMPLE_STICKER_IDS[colorId];
          if (st && !seenSt.has(st)) { seenSt.add(st); stickerPairs.push([st, 1]); }
          const po = SAMPLE_POUCH_IDS[colorId];
          if (po && !seenPo.has(po)) { seenPo.add(po); pouchPairs.push([po, 1]); }
        }
        return { room: a.room ?? "", color: a.color ?? "", color_id: colorId, product: a.product ?? "", liters: a.liters ?? "" };
      });
      const outcome = row.advisor_outcome ?? null;
      const route = outcome === "samples_needed" ? "samples" : outcome === "color_chosen" ? "verf" : "followup";
      const props = {
        intake_id: body.intake_id,
        booking_id: row.booking_id ?? null,
        outcome,
        route,
        advice: enriched,
        samples_stickers_url: multiAddUrl(stickerPairs, "cart"),
        samples_testers_url: multiAddUrl(pouchPairs, "cart"),
        offer_url: row.advisor_offer_url || `${SHOP_BASE}/prijsopgave`,
        has_offer: !!row.advisor_offer_url,
      };
      const r = await klaviyoTrack(
        "Advies afgerond",
        { email: row.contact_email, first_name: row.contact_name ?? undefined },
        props,
        {},
        `${body.intake_id}:advies:${Date.now()}`,
      );
      if (r.ok) {
        await admin.from("intake").update({ advisor_followup_sent_at: new Date().toISOString() }).eq("id", body.intake_id);
      }
      return j({ ok: r.ok, detail: r.detail });
    }

    // Admin-acties (@roll.nl)
    if (action === "setup_webhook" || action === "delete_order") {
      const caller = createClient(SB_URL, SB_ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const { data: u } = await caller.auth.getUser();
      const { data: isAdv } = await caller.rpc("is_advisor");
      const email = (u?.user?.email ?? "").toLowerCase();
      if (isAdv !== true || !email.endsWith("@roll.nl")) return j({ error: "Geen toegang" }, 403);

      if (action === "setup_webhook") {
        const res = await fetch(`${WOO_URL}/wp-json/wc/v3/webhooks`, {
          method: "POST",
          headers: { Authorization: wooAuth, "content-type": "application/json" },
          body: JSON.stringify({
            name: "Intake booking",
            topic: "order.updated",
            delivery_url: `${SB_URL}/functions/v1/woo-webhook`,
            secret: WEBHOOK_SECRET,
            status: "active",
          }),
        });
        const w = await res.json();
        return j({ ok: res.ok, webhook: w }, res.ok ? 200 : 502);
      }
      if (action === "delete_order") {
        const res = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${body.order_id}?force=true`, {
          method: "DELETE",
          headers: { Authorization: wooAuth },
        });
        return j({ ok: res.ok }, res.ok ? 200 : 502);
      }
    }

    return j({ error: "Onbekende actie" }, 400);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
