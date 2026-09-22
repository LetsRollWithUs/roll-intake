// Booking-brug tussen de boekflow en WooCommerce.
// - checkout (anon): reserveert een slot (hold_slot) en maakt een €30 Woo-order,
//   geeft de betaal-URL terug.
// - status (anon): controleert de order en bevestigt de boeking als betaald.
// - setup_webhook / delete_order (alleen @roll.nl-admin): beheer/opruimen.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack, appointmentProfileProps, notifyStylist } from "../_shared/klaviyo.ts";
import { confirmPaid, createCreditFromOrder } from "../_shared/confirm.ts";
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
        .select("id,status,woo_order_id,start_at,customer_email, services(key)")
        .eq("id", body.booking_id)
        .maybeSingle();
      if (!b) return j({ error: "Niet gevonden" }, 404);
      const mode = (b as any).services?.key ?? null;
      const email = (b as any).customer_email ?? null;
      if (b.status === "confirmed") return j({ status: "confirmed", start_at: b.start_at, mode, customer_email: email });
      if (b.status === "paid_unplaced") return j({ status: "paid_unplaced", start_at: b.start_at, mode, customer_email: email });
      if (b.woo_order_id) {
        const r = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${b.woo_order_id}`, {
          headers: { Authorization: wooAuth },
        });
        const o = await r.json();
        if (r.ok && ["processing", "completed", "on-hold"].includes(o.status)) {
          await confirmPaid(admin, b.id as string);
          const { data: after } = await admin.from("bookings").select("status,start_at").eq("id", b.id).maybeSingle();
          return j({ status: (after as any)?.status ?? b.status, start_at: (after as any)?.start_at ?? b.start_at, mode });
        }
      }
      return j({ status: b.status, start_at: b.start_at, mode });
    }

    // E-mailcheck (anon): heeft dit adres al een afspraak of een gekocht advies-tegoed?
    // Geeft alleen wat de intake nodig heeft om te koppelen of zacht door te verwijzen;
    // geen namen, telefoon of geheime tokens (voorkomt enumeratie/hijack).
    if (action === "email_status") {
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/.+@.+\..+/.test(email)) return j({ has_booking: false, has_credit: false });
      const nowIso = new Date().toISOString();

      const { data: bk } = await admin
        .from("bookings")
        .select("id,start_at,status")
        .ilike("customer_email", email)
        .in("status", ["confirmed", "paid_unplaced"])
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true })
        .limit(1);
      const booking = (bk ?? [])[0] as { id: string; start_at: string; status: string } | undefined;

      const { data: cr } = await admin
        .from("advice_credits")
        .select("status,scheduled_at")
        .ilike("buyer_email", email)
        .in("status", ["paid", "scheduled"])
        .order("created_at", { ascending: false })
        .limit(1);
      const credit = (cr ?? [])[0] as { status: string; scheduled_at: string | null } | undefined;

      return j({
        has_booking: !!booking,
        booking_id: booking?.id ?? null,
        next_start_at: booking?.start_at ?? null,
        has_credit: !!credit,
        credit_scheduled: credit?.status === "scheduled" || !!credit?.scheduled_at,
      });
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
        admin,
      );
      await notifyStylist(admin, body.booking_id, "intake_binnen");
      return j({ ok: r.ok });
    }

    // Afspraak gewijzigd (verzet of overgedragen): nieuwe tijd/videolink mailen.
    if (action === "booking_changed") {
      if (!body.booking_id) return j({ ok: false, skipped: "geen booking_id" });
      const ctx = await buildBookingContext(admin, body.booking_id);
      if (!ctx) return j({ ok: false, skipped: "boeking niet gevonden" });
      const r = await klaviyoTrack(
        "Advies flow",
        ctx.profile,
        { ...ctx.properties, stap: "gewijzigd" },
        appointmentProfileProps(ctx),
        `${body.booking_id}:gewijzigd:${Date.now()}`,
        admin,
      );
      await notifyStylist(admin, body.booking_id, "gewijzigd");
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
        .select("contact_email,contact_name,advisor_outcome,advisor_advice,advisor_offer_url,advisor_summary,booking_id")
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
        return { room: a.room ?? "", color: a.color ?? "", color_id: colorId, product: a.product ?? "", liters: a.liters ?? "", m2: a.m2 ?? "" };
      });
      const outcome = row.advisor_outcome ?? null;
      // Vervolgrichting: expliciet meegegeven (werkplek fase 2) of afgeleid van de uitkomst.
      const given = String(body.route ?? "");
      const route = given === "samples" || given === "zelf" || given === "roll"
        ? given
        : outcome === "samples_needed" ? "samples" : outcome === "color_chosen" ? "zelf" : "roll";
      const stap = route === "samples" ? "advies_samples" : route === "zelf" ? "advies_verf" : "advies_followup";
      const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : null;
      const klantTekst = typeof body.body === "string" && body.body.trim() ? body.body.trim() : null;
      const props = {
        stap,
        intake_id: body.intake_id,
        booking_id: row.booking_id ?? body.booking_id ?? null,
        outcome,
        route,
        gesprekssamenvatting: row.advisor_summary ?? null,
        onderwerp: subject,
        klant_tekst: klantTekst,
        advice: enriched,
        samples_stickers_url: multiAddUrl(stickerPairs, "cart"),
        samples_testers_url: multiAddUrl(pouchPairs, "cart"),
        offer_url: row.advisor_offer_url || `${SHOP_BASE}/prijsopgave`,
        has_offer: !!row.advisor_offer_url,
      };
      const r = await klaviyoTrack(
        "Advies flow",
        { email: row.contact_email, first_name: row.contact_name ?? undefined },
        props,
        {},
        `${body.intake_id}:${stap}:${Date.now()}`,
        admin,
      );
      if (r.ok) {
        const now = new Date().toISOString();
        await admin.from("intake").update({ advisor_followup_sent_at: now }).eq("id", body.intake_id);
        // Verzendlog: exact wat er naar de klant ging (of de gegenereerde standaardtekst).
        const { data: u } = await caller.auth.getUser();
        await admin.from("advice_sends").insert({
          intake_id: body.intake_id, booking_id: row.booking_id ?? body.booking_id ?? null, route,
          subject: subject ?? `Jouw kleuradvies van Roll (${stap})`, body: klantTekst ?? (row.advisor_summary ?? ""),
          sent_to: row.contact_email, sent_by: u?.user?.email ?? null, sent_at: now,
        });
      }
      return j({ ok: r.ok, detail: r.detail });
    }

    // Aankopen van een klant ophalen uit WooCommerce (op e-mail). Alleen adviseurs.
    // Geeft een samenvatting: totaal besteed, aantal samples/producten en de orders.
    if (action === "customer_orders") {
      const caller = createClient(SB_URL, SB_ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const { data: isAdv } = await caller.rpc("is_advisor");
      if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
      const email = String(body.email ?? "").trim().toLowerCase();
      if (!/.+@.+\..+/.test(email)) return j({ ok: true, orders: [], total_spent: 0, order_count: 0, sample_items: 0, product_items: 0 });

      const res = await fetch(
        `${WOO_URL}/wp-json/wc/v3/orders?search=${encodeURIComponent(email)}&per_page=25&orderby=date&order=desc`,
        { headers: { Authorization: wooAuth } },
      );
      if (!res.ok) return j({ error: "Kon aankopen niet ophalen" }, 502);
      const raw = await res.json();
      const paidStatuses = ["processing", "completed", "on-hold"];
      const isSample = (sku: string) => /^SMP[-_]/i.test(sku || "");

      let totalSpent = 0, sampleItems = 0, productItems = 0;
      const orders = (Array.isArray(raw) ? raw : [])
        .filter((o: any) => String(o.billing?.email ?? "").toLowerCase() === email)
        .filter((o: any) => paidStatuses.includes(o.status))
        .map((o: any) => {
          const items = (o.line_items ?? []).map((li: any) => {
            const qty = Number(li.quantity ?? 0);
            const kind = isSample(li.sku) ? "sample" : "product";
            if (kind === "sample") sampleItems += qty; else productItems += qty;
            return { name: li.name ?? "", sku: li.sku ?? "", qty, total: Number(li.total ?? 0), kind };
          });
          totalSpent += Number(o.total ?? 0);
          return {
            id: o.id, number: o.number ?? String(o.id), date: o.date_created ?? null,
            status: o.status, total: Number(o.total ?? 0), currency: o.currency ?? "EUR", items,
          };
        });

      return j({ ok: true, orders, order_count: orders.length, total_spent: totalSpent, sample_items: sampleItems, product_items: productItems });
    }

    // Route 2: tegoed inwisselen voor een afspraak + bevestiging vuren (zoals de webhook bij route 1).
    if (action === "book_credit") {
      const { token, service_key, start, name, email, phone } = body;
      const { data, error } = await admin.rpc("book_with_credit", {
        p_token: token, p_service_key: service_key, p_start: start, p_name: name, p_email: email, p_phone: phone,
      });
      if (error) return j({ error: error.message }, 409);
      const bookingId = (data as any)?.booking_id as string | undefined;
      const already = (data as any)?.already === true;
      if (bookingId && !already) {
        const ctx = await buildBookingContext(admin, bookingId);
        if (ctx) {
          await klaviyoTrack(
            "Advies flow",
            ctx.profile,
            { ...ctx.properties, stap: "bevestigd" },
            appointmentProfileProps(ctx, { includeIntakeStatus: true }),
            `${bookingId}:bevestigd:${Date.now()}`,
            admin,
          );
        }
        await notifyStylist(admin, bookingId, "nieuwe_boeking");
      }
      return j({ booking_id: bookingId, already });
    }

    // Route 2: planpagina bereikt via de Woo-retour (/plan?order=&key=). Verifieer de order bij Woo,
    // maak zo nodig het tegoed aan, en geef het token terug zodat de planpagina verder kan.
    if (action === "plan_resolve") {
      const { order_id, order_key } = body;
      if (!order_id || !order_key) return j({ error: "order_id en order_key vereist" }, 400);
      const r = await fetch(`${WOO_URL}/wp-json/wc/v3/orders/${order_id}`, { headers: { Authorization: wooAuth } });
      const o = await r.json();
      if (!r.ok) return j({ error: "Order niet gevonden" }, 404);
      if (o.order_key !== order_key) return j({ error: "Ongeldige sleutel" }, 403);
      if (!["processing", "completed", "on-hold"].includes(o.status)) return j({ error: "Order nog niet betaald" }, 409);
      if ((o.meta_data ?? []).some((m: any) => m.key === "_booking_id")) {
        return j({ error: "Deze order heeft al een boeking" }, 409);
      }
      const credit = await createCreditFromOrder(admin, o);
      if (!credit) return j({ error: "Geen advies-product in deze order" }, 422);
      return j({ token: credit.manage_token });
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
