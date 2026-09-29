// Booking-brug tussen de boekflow en WooCommerce.
// - checkout (anon): reserveert een slot (hold_slot) en maakt een €30 Woo-order,
//   geeft de betaal-URL terug.
// - status (anon): controleert de order en bevestigt de boeking als betaald.
// - setup_webhook / delete_order (alleen @roll.nl-admin): beheer/opruimen.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { buildBookingContext, klaviyoTrack, appointmentProfileProps, notifyStylist } from "../_shared/klaviyo.ts";
import { confirmPaid, createCreditFromOrder } from "../_shared/confirm.ts";
import { SAMPLE_STICKER_IDS, SAMPLE_POUCH_IDS, PACK_PRODUCT_IDS, PRICE, colorNameToId, multiAddUrl, sampleImage, SHOP_BASE } from "../_shared/roll-products.ts";
import { ROLL_COLORS } from "../_shared/roll-collection.ts";
import { buildOfferPayload } from "../_shared/offerte.ts";
import { turnstileGate, TURNSTILE_BLOCKED_MSG } from "../_shared/turnstile.ts";
import { normalizeOffer, sampleDiscount, MAATWERK_GRENS, PILOT_AANTAL, ROLL_WHATSAPP, type Offer } from "../_shared/voorstel.ts";
const HEX_BY_ID = new Map(ROLL_COLORS.map((c: any) => [c.id, c.hex]));

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
// Offerte-tool (WP-plugin) endpoint dat een offerte-record maakt uit de ruimtedata.
const OFFERTE_API_URL = Deno.env.get("OFFERTE_API_URL") || "https://roll.nl/wp-json/roll-advies/v1/offerte";
const OFFERTE_API_KEY = Deno.env.get("OFFERTE_API_KEY") ?? "";
// Bestelvoorstellen (concept/ophalen/verstuurd) pas aan zodra de offerte-tool v2 live is (secret OFFERTE_V2=1).
// Tot dan gaat een voorstel als Roll-taak, zodat de oude versie geen losse offertes aanmaakt.
const OFFERTE_V2 = Deno.env.get("OFFERTE_V2") === "1";
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
      if (!(await turnstileGate(admin, req, body.turnstile_token, "booking_checkout"))) return j({ error: TURNSTILE_BLOCKED_MSG }, 403);
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
        .select("contact_email,contact_name,advisor_outcome,advisor_advice,advisor_offer_url,advisor_summary,advice_products,advice_sample,advice_verf,booking_id,offer_meta")
        .eq("id", body.intake_id)
        .maybeSingle();
      if (!it || !(it as any).contact_email) return j({ ok: false, skipped: "geen intake/e-mail" });
      const row = it as any;
      // Fase (sample|verf): lees de kleuren en producten uit de bijbehorende bundel.
      // Terugval op de oude, gespiegelde velden voor rijen van vóór de splitsing.
      const phase = body.phase === "sample" || body.phase === "verf" ? body.phase : null;
      const bundle = phase === "sample" ? row.advice_sample : phase === "verf" ? row.advice_verf : null;
      // Verfadvies met een offerte in de editor: de kleuren komen uit de actuele offerte (enige bron), met HEX.
      let offerRows: any[] | null = null;
      if (phase === "verf" && row.offer_meta?.id && OFFERTE_API_KEY && OFFERTE_V2) {
        try {
          const rr = await fetch(`${OFFERTE_API_URL}/${row.offer_meta.id}`, { headers: { "X-Roll-Advies-Key": OFFERTE_API_KEY } });
          if (rr.ok) {
            const o = normalizeOffer(await rr.json());
            const seen = new Set<string>();
            offerRows = o.regels.filter((l) => l.kleurNaam && ["verf", undefined, null].includes(l.soort as any))
              .filter((l) => { const k = `${l.ruimte}|${l.oppervlak}|${l.kleurNaam}`; if (seen.has(k)) return false; seen.add(k); return true; })
              .map((l) => ({ room: [l.ruimte, l.oppervlak].filter(Boolean).join(" · "), color: l.kleurNaam ?? "", hex: l.kleurHex ?? null, url: l.url ?? null, product: l.product ?? "", liters: "", m2: "" }));
          }
        } catch { /* terugval op het vastgelegde advies */ }
      }
      const advice = offerRows?.length ? offerRows : bundle && Array.isArray(bundle.rooms)
        ? bundle.rooms.map((r: any) => ({ room: [r.room, r.surface].filter((x: string) => (x ?? "").trim()).join(" · "), color: r.color ?? "", product: r.product ?? "", liters: r.liters ?? "", m2: r.m2 ?? "" }))
        : (Array.isArray(row.advisor_advice) ? row.advisor_advice : []);
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
        return { room: a.room ?? "", color: a.color ?? "", color_id: colorId, hex: a.hex ?? null, url: a.url ?? null, product: a.product ?? "", liters: a.liters ?? "", m2: a.m2 ?? "" };
      });
      const outcome = row.advisor_outcome ?? null;
      // Vervolgrichting: uit de fase-bundel, anders expliciet meegegeven, anders afgeleid.
      const given = String(bundle?.route ?? body.route ?? "");
      const route = given === "samples" || given === "zelf" || given === "roll"
        ? given
        : phase === "sample" ? "samples"
        : outcome === "samples_needed" ? "samples" : outcome === "color_chosen" ? "zelf" : "roll";
      const stap = route === "samples" ? "advies_samples" : route === "zelf" ? "advies_verf" : "advies_followup";
      const subject = typeof body.subject === "string" && body.subject.trim() ? body.subject.trim() : null;
      const klantTekst = typeof body.body === "string" && body.body.trim() ? body.body.trim() : null;

      // Door de styliste geselecteerde producten -> kaartjes voor de mail (afbeelding, prijs, bestellink).
      const selection = bundle && Array.isArray(bundle.products) ? bundle.products
        : Array.isArray(row.advice_products) ? row.advice_products : [];
      const producten = selection.map((p: any) => {
        const kind = p.kind as string; const ref = String(p.ref ?? "");
        if (kind === "pack") {
          const pid = PACK_PRODUCT_IDS[ref];
          return { kind, id: ref, name: p.name ?? ref, price: PRICE.pack, image_url: sampleImage("pack", ref), url: pid ? multiAddUrl([[pid, 1]], "cart") : `${SHOP_BASE}/?s=${encodeURIComponent(p.name ?? ref)}` };
        }
        if (kind === "sticker") {
          const pid = SAMPLE_STICKER_IDS[ref];
          return { kind, id: ref, name: p.name ?? ref, price: PRICE.sticker, image_url: sampleImage("sticker", ref), url: pid ? multiAddUrl([[pid, 1]], "cart") : null };
        }
        if (kind === "tester") {
          const pid = SAMPLE_POUCH_IDS[ref];
          return { kind, id: ref, name: p.name ?? ref, price: PRICE.tester, image_url: sampleImage("tester", ref), url: pid ? multiAddUrl([[pid, 1]], "cart") : null };
        }
        return null;
      }).filter(Boolean);
      // Alles-in-mandje link voor de geselecteerde stickers + testers samen.
      const selPairs: [number, number][] = [];
      for (const p of selection as any[]) {
        const map = p.kind === "sticker" ? SAMPLE_STICKER_IDS : p.kind === "tester" ? SAMPLE_POUCH_IDS : p.kind === "pack" ? PACK_PRODUCT_IDS : null;
        if (map && map[String(p.ref)]) selPairs.push([map[String(p.ref)], 1]);
      }
      const producten_cart_url = multiAddUrl(selPairs, "cart");

      // Verf-route: per geadviseerde kleur een prijsopgave-link met de kleur voorgevuld.
      // De styliste kiest alleen de kleuren; liters/varianten/tools doet Roll of de klant via /prijsopgave.
      const seenColor = new Set<string>();
      // Roll-kleuren linken naar hun kleurpagina; nagemengde kleuren (Roll-naam uit de editor) naar de offerte of prijsopgave.
      const verf_colors = (enriched as any[]).filter((a) => { const k = a.color_id || a.color; if (!k || seenColor.has(k)) return false; seenColor.add(k); return !!(a.color_id || a.hex); }).map((a) => ({
        name: a.color, id: a.color_id ?? null, hex: a.color_id ? HEX_BY_ID.get(a.color_id) ?? a.hex ?? null : a.hex,
        pdp_url: a.color_id ? `${SHOP_BASE}/product/${encodeURIComponent(a.color_id)}/` : (a.url || row.advisor_offer_url || `${SHOP_BASE}/prijsopgave/`),
        quote_url: a.color_id ? `${SHOP_BASE}/prijsopgave/?kleur=${encodeURIComponent(a.color_id)}` : (row.advisor_offer_url || `${SHOP_BASE}/prijsopgave/`),
      }));
      const quote_url = `${SHOP_BASE}/prijsopgave/${verf_colors[0]?.id ? `?kleur=${encodeURIComponent(verf_colors[0].id)}` : ""}`;
      const props = {
        stap,
        phase,
        intake_id: body.intake_id,
        booking_id: row.booking_id ?? body.booking_id ?? null,
        outcome,
        route,
        gesprekssamenvatting: (bundle?.answer ?? row.advisor_summary) ?? null,
        onderwerp: subject,
        klant_tekst: klantTekst,
        advice: enriched,
        producten,
        producten_cart_url,
        verf_colors,
        quote_url,
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

    // Offerte genereren: ruimtedata -> offerte-tool (roll-advies/v1/offerte). De tool maakt het
    // offerte-record met live WooCommerce-prijzen en geeft nummer + editor-URL terug.
    if (action === "offerte_create") {
      if (!body.intake_id) return j({ ok: false, skipped: "geen intake_id" });
      const caller = createClient(SB_URL, SB_ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const { data: isAdv } = await caller.rpc("is_advisor");
      if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
      const { data: it } = await admin
        .from("intake")
        .select("id,booking_id,contact_name,contact_email,rooms,room_measures,advice_verf")
        .eq("id", body.intake_id)
        .maybeSingle();
      if (!it) return j({ ok: false, skipped: "geen intake" });
      const bid = (it as any).booking_id ?? body.booking_id ?? null;
      const { data: bk } = bid ? await admin.from("bookings").select("customer_name,customer_phone").eq("id", bid).maybeSingle() : { data: null };
      const toolsInCart = body.tools_in_cart !== false;
      const payload = buildOfferPayload(it as any, { phone: (bk as any)?.customer_phone ?? "", name: (bk as any)?.customer_name ?? "", toolsInCart, notes: typeof body.notes === "string" ? body.notes : "" });
      if (payload.project.surfaces.length === 0) return j({ ok: false, skipped: "geen ruimtes met maten" });
      // Zonder sleutel staat de koppeling uit (het endpoint geeft dan 503).
      if (!OFFERTE_API_KEY || !OFFERTE_V2) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld", payload });

      let data: any = {};
      try {
        const resp = await fetch(OFFERTE_API_URL, {
          method: "POST",
          headers: { "content-type": "application/json", "X-Roll-Advies-Key": OFFERTE_API_KEY },
          body: JSON.stringify(payload),
        });
        data = await resp.json().catch(() => ({}));
        if (resp.status === 503) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld" });
        if (!resp.ok || !data?.ok) return j({ ok: false, error: `offerte-tool gaf ${resp.status}`, detail: data });
      } catch (e) {
        return j({ ok: false, error: "offerte-tool niet bereikbaar", detail: String(e) });
      }
      // editUrl = de editor (voor Roll). De klant krijgt klantUrl zodra de offerte-tool die meestuurt;
      // tot dan blijft advisor_offer_url (de link in de opvolgmail) ongemoeid.
      const editUrl: string | null = data.editUrl ?? null;
      const klantUrl: string | null = data.klantUrl ?? null;
      const onbekend: string[] = Array.isArray(data.kleurenOnbekend) ? data.kleurenOnbekend.map(String).slice(0, 20) : [];
      const meta = { tools_in_cart: toolsInCart, id: data.id ?? null, nummer: data.nummer ?? null, edit_url: editUrl, klant_url: klantUrl, mand_url: data.mandUrl ?? null, kleuren_onbekend: onbekend, at: new Date().toISOString() };
      const { data: u } = await caller.auth.getUser();
      await admin.from("intake").update(klantUrl ? { advisor_offer_url: klantUrl, offer_meta: meta } : { offer_meta: meta }).eq("id", body.intake_id);
      await admin.from("advice_sends").insert({
        intake_id: body.intake_id, booking_id: bid, route: "offerte",
        subject: `Offerte ${data.nummer ?? ""} aangemaakt`.trim(), body: `${editUrl ?? ""}\nRuimtes: ${data.ruimtes ?? payload.project.surfaces.length} · tools ${toolsInCart ? "in het mandje" : "los in de mail"}${onbekend.length ? `\nKleuren niet herkend: ${onbekend.join(", ")}` : ""}`,
        sent_to: (it as any).contact_email, sent_by: u?.user?.email ?? null, sent_at: meta.at,
      });
      return j({ ok: true, offer_url: klantUrl, edit_url: editUrl, nummer: data.nummer ?? null, id: data.id ?? null, kleuren_onbekend: onbekend });
    }

    // Gratis afspraak of uitnodiging (plan_moment / invite_customer): dezelfde bevestigingsmail (C01)
    // met moment, videolink, intakelink en verzetlink, plus een melding aan de styliste.
    if (action === "uitnodiging_verstuur") {
      const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: seen } = await caller.from("bookings").select("id,status").eq("id", body.booking_id ?? "").maybeSingle();
      if (!seen) return j({ error: "Geen toegang" }, 403);
      if ((seen as any).status !== "confirmed") return j({ ok: false, error: "nog geen moment gepland" });
      const ctx = await buildBookingContext(admin, body.booking_id);
      if (!ctx) return j({ ok: false, error: "afspraak niet gevonden" });
      const r = await klaviyoTrack("Advies flow", ctx.profile, { ...ctx.properties, stap: "bevestigd", gratis: true },
        appointmentProfileProps(ctx, { includeIntakeStatus: true }), `${body.booking_id}:uitnodiging:${Date.now()}`, admin);
      await notifyStylist(admin, body.booking_id, "nieuwe_boeking");
      return j({ ok: r.ok });
    }

    // Dossier definitief verwijderen (alleen beheerders): afspraak, intake, taken, verzendlog en foto's.
    // Offertes in roll.nl/offerte en bestellingen in WooCommerce blijven bestaan.
    if (action === "dossier_delete") {
      const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: isAdm } = await caller.rpc("is_admin");
      if (isAdm !== true) return j({ error: "Geen toegang" }, 403);
      const bid: string | null = body.booking_id ?? null;
      let iid: string | null = body.intake_id ?? null;
      if (bid) {
        const { data: b } = await admin.from("bookings").select("id,intake_id").eq("id", bid).maybeSingle();
        if (!b) return j({ error: "afspraak niet gevonden" }, 404);
        iid = iid ?? (b as any).intake_id ?? null;
      }
      if (!bid && !iid) return j({ error: "niets om te verwijderen" }, 400);
      // Foto's: alles onder de map van de intake (rooms/<id>/, samples/, inspiration/).
      let removed = 0;
      if (iid) {
        const bucket = admin.storage.from("intake-photos");
        const walk = async (prefix: string): Promise<string[]> => {
          const { data } = await bucket.list(prefix, { limit: 1000 });
          const out: string[] = [];
          for (const f of data ?? []) {
            const path = `${prefix}/${f.name}`;
            if (f.id) out.push(path); else out.push(...(await walk(path)));
          }
          return out;
        };
        const files = await walk(iid);
        if (files.length) { const { data: del } = await bucket.remove(files); removed = del?.length ?? 0; }
      }
      if (bid) {
        await admin.from("bookings").update({ intake_id: null }).eq("id", bid);
        await admin.from("advice_credits").update({ booking_id: null }).eq("booking_id", bid);
      }
      if (iid) {
        await admin.from("intake").update({ booking_id: null }).eq("id", iid);
        await admin.from("bookings").update({ intake_id: null }).eq("intake_id", iid);
        await admin.from("roll_tasks").delete().eq("intake_id", iid);
      }
      if (bid) { const { error } = await admin.from("bookings").delete().eq("id", bid); if (error) return j({ error: error.message }, 500); }
      if (iid) { const { error } = await admin.from("intake").delete().eq("id", iid); if (error) return j({ error: error.message }, 500); }
      return j({ ok: true, photos_removed: removed });
    }

    // Editor van roll.nl/offerte in de klantkaart: ondertekende bewerklink (styliste of Roll).
    if (action === "offerte_editlink" || action === "offerte_koppel" || action === "offerte_get" || action === "offerte_bevestig") {
      const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: seen } = await caller.from("intake").select("id").eq("id", body.intake_id ?? "").maybeSingle();
      if (!seen) return j({ error: "Geen toegang" }, 403);
      if (!OFFERTE_API_KEY || !OFFERTE_V2) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld" });
      const { data: it } = await admin.from("intake").select("id,offer_meta,offer_status").eq("id", body.intake_id).maybeSingle();
      const meta = (it as any)?.offer_meta ?? {};
      if (action === "offerte_koppel") {
        // "Nieuwe versie maken" in de editor: het nieuwe offerte-id aan deze intake koppelen.
        const nid = Number(body.offer_id);
        if (!nid) return j({ error: "geen offerte" }, 400);
        const rr = await fetch(`${OFFERTE_API_URL}/${nid}`, { headers: { "X-Roll-Advies-Key": OFFERTE_API_KEY } });
        const d = rr.ok ? await rr.json().catch(() => null) : null;
        const own = d?.intake_id ?? d?.kenmerk?.intake_id ?? null;
        if (!d || (own && own !== body.intake_id)) return j({ error: "offerte hoort niet bij deze intake" }, 400);
        const o = normalizeOffer(d);
        await admin.from("intake").update({ offer_meta: { ...meta, id: o.id, nummer: o.nummer, edit_url: o.editUrl, klant_url: o.klantUrl, mand_url: o.mandUrl, offer: o, at: new Date().toISOString() }, offer_status: "concept", offer_total: o.totaal }).eq("id", body.intake_id);
        return j({ ok: true, offer: o });
      }
      if (!meta.id) return j({ ok: false, skipped: "nog geen offerte" });
      if (action === "offerte_bevestig") {
        // Winnaar na de check-in: testvlak wordt Bevestigd met die kleur.
        const rr = await fetch(`${OFFERTE_API_URL}/${meta.id}/vlak/${encodeURIComponent(String(body.vid ?? ""))}/bevestig`, { method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": OFFERTE_API_KEY }, body: JSON.stringify({ kleurId: Number(body.kleurId) }) });
        const d = await rr.json().catch(() => null);
        if (!rr.ok || !d) return j({ ok: false, error: rr.status === 409 ? "De offerte is al verstuurd; maak eerst een nieuwe versie." : `offerte-tool gaf ${rr.status}` });
        const o = normalizeOffer(d);
        await admin.from("intake").update({ offer_meta: { ...meta, offer: o }, offer_total: o.totaal }).eq("id", body.intake_id);
        return j({ ok: true, offer: o });
      }
      if (action === "offerte_get") {
        const rr = await fetch(`${OFFERTE_API_URL}/${meta.id}`, { headers: { "X-Roll-Advies-Key": OFFERTE_API_KEY } });
        if (!rr.ok) return j({ ok: false, error: `offerte-tool gaf ${rr.status}` });
        const o = normalizeOffer(await rr.json());
        await admin.from("intake").update({ offer_meta: { ...meta, offer: o, klant_url: o.klantUrl ?? meta.klant_url, mand_url: o.mandUrl ?? meta.mand_url }, offer_total: o.totaal }).eq("id", body.intake_id);
        return j({ ok: true, offer: o, status: (it as any)?.offer_status ?? null });
      }
      const { data: isAdm } = await caller.rpc("is_admin");
      const rol = isAdm === true ? "roll" : "styliste";
      const rr = await fetch(`${OFFERTE_API_URL}/${meta.id}/editlink`, { method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": OFFERTE_API_KEY }, body: JSON.stringify({ rol, uren: 8, modus: body.modus === "advies" ? "advies" : "offerte" }) });
      const d = await rr.json().catch(() => ({}));
      if (!rr.ok || !d?.url) return j({ ok: false, error: `offerte-tool gaf ${rr.status}` });
      return j({ ok: true, url: d.url, rol: d.rol ?? rol, verloopt: d.verloopt ?? null, offer_id: meta.id });
    }

    // Bestelvoorstel, stap 1: concept in de offerte-tool aanmaken of bijwerken, met Sample korting
    // en kenmerk (styliste/intake). Geeft de offerte terug voor het controlescherm.
    if (action === "voorstel_concept") {
      const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: seen } = await caller.from("intake").select("id").eq("id", body.intake_id ?? "").maybeSingle();
      if (!seen) return j({ error: "Geen toegang" }, 403);
      const { data: it } = await admin.from("intake")
        .select("id,booking_id,contact_name,contact_email,rooms,room_measures,advice_verf,offer_meta,offer_status")
        .eq("id", body.intake_id).maybeSingle();
      if (!it) return j({ ok: false, skipped: "geen intake" });
      const row = it as any;
      // Advies in de editor: alle ruimtes uit de intake, ook zonder kleur of maten. Welke vlakken in de
      // offerte komen, bepaalt de status per vlak in de editor (alleen bevestigde vlakken tellen mee).
      const bid = row.booking_id ?? body.booking_id ?? null;
      const { data: bk } = bid ? await admin.from("bookings").select("customer_name,customer_phone,stylist_id, stylists(name)").eq("id", bid).maybeSingle() : { data: null };
      const toolsInCart = body.tools_in_cart !== false;
      const payload: any = buildOfferPayload(row, { phone: (bk as any)?.customer_phone ?? "", name: (bk as any)?.customer_name ?? "", toolsInCart, notes: typeof body.notes === "string" ? body.notes : "", alleRuimtes: true });
      if (payload.project.surfaces.length === 0) return j({ ok: false, skipped: "geen ruimtes met maten" });
      const korting = await sampleDiscount(row.contact_email ?? "", WOO_URL, wooAuth);
      payload.status = "concept";
      payload.korting = korting;
      payload.kenmerk = { intake_id: row.id, booking_id: bid, styliste_id: (bk as any)?.stylist_id ?? null, styliste_naam: (bk as any)?.stylists?.name ?? null };
      if (!OFFERTE_API_KEY || !OFFERTE_V2) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld", korting });
      let data: any = {};
      try {
        const resp = await fetch(OFFERTE_API_URL, { method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": OFFERTE_API_KEY }, body: JSON.stringify(payload) });
        data = await resp.json().catch(() => ({}));
        if (resp.status === 503) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld", korting });
        if (!resp.ok || !data?.ok) return j({ ok: false, error: `offerte-tool gaf ${resp.status}`, detail: data, korting });
      } catch (e) {
        return j({ ok: false, error: "offerte-tool niet bereikbaar", detail: String(e), korting });
      }
      const offer = normalizeOffer(data);
      const meta = { ...(row.offer_meta ?? {}), tools_in_cart: toolsInCart, id: offer.id, nummer: offer.nummer, edit_url: offer.editUrl, klant_url: offer.klantUrl, mand_url: offer.mandUrl, kleuren_onbekend: offer.kleurenOnbekend, korting, offer, at: new Date().toISOString() };
      await admin.from("intake").update({ offer_meta: meta, offer_status: "concept", offer_total: offer.totaal }).eq("id", row.id);
      return j({ ok: true, offer, korting, grens: MAATWERK_GRENS });
    }

    // Bestelvoorstel, stap 2: offerte vers ophalen, markeren als verstuurd en de klantmail (Klaviyo) starten.
    // Door de styliste (eigen klant) of door Roll vanuit een taak.
    if (action === "voorstel_versturen") {
      const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
      const { data: seen } = await caller.from("intake").select("id").eq("id", body.intake_id ?? "").maybeSingle();
      if (!seen) return j({ error: "Geen toegang" }, 403);
      const { data: u } = await caller.auth.getUser();
      const { data: it } = await admin.from("intake").select("id,booking_id,contact_name,contact_email,offer_meta,offer_status").eq("id", body.intake_id).maybeSingle();
      const row = it as any;
      const offerId = row?.offer_meta?.id;
      if (!row?.contact_email || !offerId) return j({ ok: false, skipped: "nog geen voorstel" });
      if (!OFFERTE_API_KEY || !OFFERTE_V2) return j({ ok: false, skipped: "offerte-tool endpoint niet gekoppeld" });
      // Vers ophalen, zodat aanpassingen van Roll in de editor meegaan. Oudere offerte-tool zonder GET: laatste concept.
      let offer: Offer = normalizeOffer(row.offer_meta?.offer ?? row.offer_meta);
      try {
        const r = await fetch(`${OFFERTE_API_URL}/${offerId}`, { headers: { "X-Roll-Advies-Key": OFFERTE_API_KEY } });
        if (r.ok) { const d = await r.json().catch(() => null); if (d?.ok !== false && d) offer = normalizeOffer(d); }
      } catch { /* terugval op concept */ }
      if (offer.kleurenOnbekend.length) return j({ ok: false, skipped: "kleuren onbekend", kleuren_onbekend: offer.kleurenOnbekend });
      try {
        await fetch(`${OFFERTE_API_URL}/${offerId}/verstuurd`, { method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": OFFERTE_API_KEY }, body: JSON.stringify({ verstuurd_door: u?.user?.email ?? null }) });
      } catch { /* status in de offerte-tool is niet kritiek voor de mail */ }
      const bid = row.booking_id ?? body.booking_id ?? null;
      const { data: bk } = bid ? await admin.from("bookings").select("customer_name,stylist_id, stylists(name,email)").eq("id", bid).maybeSingle() : { data: null };
      const stylistName = (bk as any)?.stylists?.name ?? null;
      const klantUrl = offer.klantUrl ?? row.offer_meta?.klant_url ?? null;
      // Bedragen als Nederlandse tekst voor de mail (Klaviyo kent geen komma-notatie).
      const fmt = (v: number | null | undefined) => (v == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));
      const withFmt = <T extends { totaal?: number }>(xs: T[]) => xs.map((x) => ({ ...x, totaal_fmt: fmt(x.totaal ?? null) }));
      const props = {
        stap: "offerte_verstuurd",
        intake_id: row.id, booking_id: bid, stylist_name: stylistName,
        afzender: stylistName ? `${stylistName} van Roll` : "Roll",
        offerte_nummer: offer.nummer, klant_url: klantUrl, mand_url: offer.mandUrl ?? row.offer_meta?.mand_url ?? null,
        regels: withFmt(offer.regels), tools: withFmt(offer.tools.filter((t) => t.inMandje !== false)), tools_los: withFmt(offer.tools.filter((t) => t.inMandje === false)),
        subtotaal: offer.subtotaal, subtotaal_fmt: fmt(offer.subtotaal),
        korting: offer.korting ? { ...offer.korting, bedrag_fmt: fmt(offer.korting.bedrag) } : null,
        extra: offer.extra.map((e) => ({ ...e, bedrag_fmt: e.bedrag ? fmt(e.bedrag) : null })),
        verzending: offer.verzending, verzending_fmt: offer.verzending ? fmt(offer.verzending) : "gratis",
        totaal: offer.totaal, totaal_fmt: fmt(offer.totaal),
        kleuren: [...new Map(offer.regels.filter((l) => l.kleurNaam).map((l) => [l.kleurNaam, { naam: l.kleurNaam, hex: l.kleurHex ?? null }])).values()],
        whatsapp: ROLL_WHATSAPP,
      };
      const r = await klaviyoTrack("Advies flow", { email: row.contact_email, first_name: row.contact_name ?? undefined }, props, {}, `${row.id}:offerte:${offerId}:${Date.now()}`, admin);
      if (!r.ok) return j({ ok: false, error: "mail niet gestart", detail: r.detail });
      const now = new Date().toISOString();
      await admin.from("intake").update({
        offer_status: "verstuurd", offer_sent_at: now, offer_total: offer.totaal, offer_nazorg_at: null,
        advisor_offer_url: klantUrl ?? undefined, offer_meta: { ...(row.offer_meta ?? {}), offer, sent_at: now, sent_by: u?.user?.email ?? null },
      }).eq("id", row.id);
      await admin.from("advice_sends").insert({
        intake_id: row.id, booking_id: bid, route: "offerte", subject: `Bestelvoorstel ${offer.nummer ?? ""}`.trim(),
        body: `${klantUrl ?? ""}\nTotaal: ${offer.totaal ?? "onbekend"}`, sent_to: row.contact_email, sent_by: u?.user?.email ?? null, sent_at: now,
      });
      if (body.task_id) await admin.from("roll_tasks").update({ status: "verstuurd", updated_at: now, result: { offer_url: klantUrl ?? undefined } }).eq("id", body.task_id);
      const klant = (bk as any)?.customer_name ?? row.contact_name ?? "klant";
      const dash = bid ? `https://intake.roll.nl/beheer/gesprek/${bid}` : "https://intake.roll.nl/beheer";
      if ((offer.totaal ?? 0) > MAATWERK_GRENS) {
        await admin.rpc("roll_melding", { p_soort: "groot_voorstel", p_props: { klant_naam: klant, styliste: stylistName, totaal: offer.totaal, dashboard_url: dash }, p_key: `groot:${row.id}:${offerId}` });
      }
      // Pilot: de eerste voorstellen per styliste krijgt Roll ter controle.
      if ((bk as any)?.stylist_id) {
        const { data: sb } = await admin.from("bookings").select("id").eq("stylist_id", (bk as any).stylist_id);
        const ids = ((sb as any[]) ?? []).map((b) => b.id);
        const { count } = ids.length ? await admin.from("intake").select("id", { count: "exact", head: true }).in("booking_id", ids).not("offer_sent_at", "is", null) : { count: 0 };
        if ((count ?? 0) <= PILOT_AANTAL && u?.user?.email?.toLowerCase() === String((bk as any)?.stylists?.email ?? "").toLowerCase()) {
          await admin.rpc("roll_melding", { p_soort: "pilot_controle", p_props: { klant_naam: klant, styliste: stylistName, totaal: offer.totaal, nummer_voorstel: count, dashboard_url: dash }, p_key: `pilot:${row.id}:${offerId}` });
        }
      }
      return j({ ok: true, offer, klant_url: klantUrl });
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
