// Bevestigt een betaalde boeking via confirm_paid_booking en vuurt het event.
// Gedeeld door woo-webhook en de statuspoll, zodat beide paden identiek gedragen.
import { buildBookingContext, klaviyoTrack, appointmentProfileProps, notifyStylist, INTAKE_BASE } from "./klaviyo.ts";
import { postAlertWebhook } from "./alerts.ts";

// Online kleuradvies + het cadeauproduct. Uitbreidbaar via secret ADVICE_PRODUCT_IDS="14753,<gift-id>".
const ADVICE_PRODUCT_IDS: number[] = (Deno.env.get("ADVICE_PRODUCT_IDS") ?? "14753")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
// Cadeauproduct(en): tegoed + code, maar GEEN digitale plan-mail (Roll stuurt een fysieke kaart met de code).
const GIFT_PRODUCT_IDS: number[] = (Deno.env.get("GIFT_PRODUCT_IDS") ?? "")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));

// Thuisadvies: variatie van het kleuradviesproduct (THUIS_VARIATION_ID) of een eigen product (THUIS_PRODUCT_ID).
const THUIS_PRODUCT_ID = Number(Deno.env.get("THUIS_PRODUCT_ID") ?? 0);
const THUIS_VARIATION_ID = Number(Deno.env.get("THUIS_VARIATION_ID") ?? 0);
export function isThuisLine(li: any): boolean {
  if (THUIS_VARIATION_ID) return Number(li.variation_id) === THUIS_VARIATION_ID;
  return !!THUIS_PRODUCT_ID && Number(li.product_id) === THUIS_PRODUCT_ID;
}

// Thuisaanvraag binnen (betaald): bevestiging van de aanvraag (C06, variant thuis) + melding voor beheer.
export async function notifyThuisAanvraag(admin: any, bookingId: string) {
  const ctx = await buildBookingContext(admin, bookingId);
  if (ctx) {
    const p = ctx.properties;
    await klaviyoTrack("Advies flow", ctx.profile, {
      stap: "plan_je_afspraak", vorm: "thuis", thuis_aanvraag: true, booking_id: bookingId,
      intake_url: p.intake_url, intake_ingevuld: p.intake_ingevuld, adres_regel: p.adres_regel,
      voorkeuren: p.voorkeuren, whatsapp: "085 369 62 44", service_label: "Kleuradvies thuis",
    }, { intake_url: p.intake_url }, `${bookingId}:thuis_aanvraag`, admin);
  }
  await admin.from("system_alerts").insert({
    kind: "thuis_aanvraag",
    message: "Nieuwe aanvraag voor thuisadvies (betaald). Neem contact op en leg het moment vast in de klantkaart.",
    payload: { booking_id: bookingId },
  });
  await postAlertWebhook("thuis_aanvraag", "Nieuwe aanvraag voor thuisadvies (betaald).", { booking_id: bookingId });
}

// Thuisadvies direct op roll.nl gekocht (zonder boekingstool): maak de aanvraag aan met het factuuradres.
// Voorkeursmomenten vraagt de styliste dan telefonisch. Idempotent op woo_order_id.
export async function createThuisFromOrder(admin: any, order: any): Promise<boolean> {
  if (!(order.line_items ?? []).some(isThuisLine)) return false;
  const wooId = String(order.id);
  const { data: existing } = await admin.from("bookings").select("id").eq("woo_order_id", wooId).maybeSingle();
  if (existing) return true;
  const { data: svc } = await admin.from("services").select("id").eq("key", "thuis").maybeSingle();
  const bl = order.shipping?.address_1 ? order.shipping : (order.billing ?? {});
  const billing = order.billing ?? {};
  const now = new Date().toISOString();
  const { data: ins } = await admin.from("bookings").insert({
    service_id: svc?.id ?? null, status: "requested", format: "thuis", start_at: now, end_at: now,
    customer_name: [billing.first_name, billing.last_name].filter(Boolean).join(" ").trim() || null,
    customer_email: (billing.email ?? "").toLowerCase() || null, customer_phone: billing.phone || null,
    address: { straat: [bl.address_1, bl.address_2].filter(Boolean).join(" "), huisnummer: "", postcode: bl.postcode ?? "", plaats: bl.city ?? "", country: bl.country === "BE" ? "BE" : "NL" },
    woo_order_id: wooId, kanban_stage: "ingepland",
  }).select("id").single();
  if (ins?.id) await notifyThuisAanvraag(admin, ins.id);
  return true;
}

// Leest de gelegenheid + een persoonlijk bericht uit de order (cadeauproduct).
function readGift(order: any): { occasion: string | null; message: string | null } {
  let occasion: string | null = null;
  let message: string | null = null;
  const om = order.meta_data ?? [];
  occasion = om.find((m: any) => m.key === "_gift_occasion")?.value ?? null;
  message = om.find((m: any) => m.key === "_gift_message")?.value ?? null;
  for (const li of order.line_items ?? []) {
    for (const m of li.meta_data ?? []) {
      const k = String(m.display_key ?? m.key ?? "").toLowerCase();
      const v = m.display_value ?? m.value ?? null;
      if (!occasion && (k.includes("gelegenheid") || k.includes("occasion"))) occasion = v;
      if (!message && (k.includes("bericht") || k.includes("boodschap") || k.includes("message"))) message = v;
    }
  }
  return { occasion: occasion || null, message: message || null };
}

// Korte, leesbare cadeaucode (geen verwarrende tekens): ROLL-XXXX-XXXX.
const CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
function genRedeemCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  return `ROLL-${pick(4)}-${pick(4)}`;
}

// Route 2: bij een directe aankoop (order met het advies-product, zonder _booking_id) maken we
// een advies-tegoed en sturen we de klant de "plan je afspraak"-link. Idempotent op woo_order_id.
export async function createCreditFromOrder(admin: any, order: any): Promise<{ manage_token: string } | null> {
  const hasAdvice = (order.line_items ?? []).some((li: any) => ADVICE_PRODUCT_IDS.includes(Number(li.product_id)) && !isThuisLine(li));
  if (!hasAdvice) return null;
  const wooId = String(order.id);
  const billing = order.billing ?? {};
  const name = [billing.first_name, billing.last_name].filter(Boolean).join(" ").trim() || null;
  const gift = readGift(order);
  const isGift = (order.line_items ?? []).some((li: any) => GIFT_PRODUCT_IDS.includes(Number(li.product_id)));

  // Upsert: bestaat het tegoed al, dan niets overschrijven. Nieuwe krijgen een cadeaucode.
  await admin.from("advice_credits").upsert(
    {
      woo_order_id: wooId, buyer_name: name, buyer_email: billing.email ?? null, buyer_phone: billing.phone ?? null,
      redeem_code: genRedeemCode(), occasion: gift.occasion, gift_message: gift.message, is_gift: isGift,
    },
    { onConflict: "woo_order_id", ignoreDuplicates: true },
  );
  let { data: credit } = await admin
    .from("advice_credits").select("*").eq("woo_order_id", wooId).maybeSingle();
  if (!credit) return null;
  // Ontbreekt de code nog (oud tegoed)? Alsnog toekennen, met retry bij een botsing.
  if (!credit.redeem_code) {
    for (let i = 0; i < 5 && !credit.redeem_code; i++) {
      const { data: upd } = await admin.from("advice_credits")
        .update({ redeem_code: genRedeemCode() }).eq("id", credit.id).is("redeem_code", null).select("*").maybeSingle();
      if (upd?.redeem_code) credit = upd;
    }
  }

  // Plan-mail één keer sturen (zolang nog niet ingepland). Bij een cadeau NIET: Roll stuurt de fysieke kaart.
  if (!credit.plan_mailed_at && credit.status === "paid" && credit.buyer_email && !credit.is_gift) {
    const planUrl = `${INTAKE_BASE}/plan?token=${credit.manage_token}`;
    await klaviyoTrack(
      "Advies flow",
      { email: credit.buyer_email, first_name: credit.buyer_name ?? undefined },
      { stap: "plan_je_afspraak", plan_url: planUrl, redeem_code: credit.redeem_code ?? null, service_label: "Online kleuradvies" },
      {},
      `${wooId}:plan_je_afspraak`,
      admin,
    );
    await admin.from("advice_credits").update({ plan_mailed_at: new Date().toISOString() }).eq("id", credit.id);
  }
  return { manage_token: credit.manage_token };
}

export interface ConfirmResult {
  outcome: "confirmed" | "reassigned" | "already_confirmed" | "paid_unplaced" | "requested" | "not_found" | "error";
  booking_id?: string;
  stylist_id?: string;
  confirmed_at?: string | null;
  already?: boolean;
}

export async function confirmPaid(admin: any, bookingId: string): Promise<ConfirmResult> {
  const { data, error } = await admin.rpc("confirm_paid_booking", { p_booking_id: bookingId });
  if (error) {
    await postAlertWebhook("confirm_error", `confirm_paid_booking faalde: ${error.message}`, { booking_id: bookingId });
    return { outcome: "error", booking_id: bookingId };
  }
  const r = (data ?? {}) as ConfirmResult;

  if (r.outcome === "confirmed" || r.outcome === "reassigned") {
    const ctx = await buildBookingContext(admin, bookingId);
    if (ctx) {
      // unique_id met bevestigingsmoment: een herbevestiging na een verlopen hold krijgt zo wél een nieuwe mail.
      const stamp = r.confirmed_at ? new Date(r.confirmed_at).getTime() : Date.now();
      await klaviyoTrack(
        "Advies flow",
        ctx.profile,
        { ...ctx.properties, stap: "bevestigd" },
        appointmentProfileProps(ctx, { includeIntakeStatus: true }),
        `${bookingId}:bevestigd:${stamp}`,
        admin,
      );
    }
    await notifyStylist(admin, bookingId, "nieuwe_boeking");
  } else if ((r.outcome as string) === "requested" && !r.already) {
    await notifyThuisAanvraag(admin, bookingId);
  } else if (r.outcome === "paid_unplaced" && !r.already) {
    await postAlertWebhook(
      "paid_unplaced",
      "Klant heeft betaald maar het moment is niet meer beschikbaar. Plaats de afspraak handmatig via Boekingen in het dashboard.",
      { booking_id: bookingId },
    );
  }
  return r;
}

// Annuleert een boeking (bijv. na een refund/annulering in WooCommerce). Het slot komt vrij
// doordat 'cancelled' buiten de overlapbescherming valt. Alleen bij een eerder BEVESTIGDE
// afspraak informeren we de klant (event) en het team (melding); een niet-betaalde hold die
// sneuvelt is de normale gang van zaken en veroorzaakt geen ruis.
export async function cancelBooking(admin: any, bookingId: string, reason: string) {
  const { data: b } = await admin
    .from("bookings")
    .select("id,status,stylist_id,customer_email,customer_name,start_at,woo_order_id")
    .eq("id", bookingId)
    .maybeSingle();
  if (!b) return { outcome: "not_found" };
  if (b.status === "cancelled") return { outcome: "already_cancelled" };

  const prev = b.status as string;
  await admin.from("bookings").update({ status: "cancelled", hold_expires_at: null }).eq("id", bookingId);

  const wasReal = prev === "confirmed" || prev === "paid_unplaced" || prev === "requested";
  if (wasReal) {
    const ctx = prev === "requested" ? null : await buildBookingContext(admin, bookingId);
    if (ctx) {
      await klaviyoTrack("Afspraak geannuleerd", ctx.profile, ctx.properties, {}, `${bookingId}:cancelled:${Date.now()}`, admin);
    }
    await admin.from("system_alerts").insert({
      kind: "booking_cancelled",
      message: `Een bevestigde afspraak is geannuleerd of terugbetaald (${reason}). Het moment is weer vrij.`,
      payload: {
        booking_id: bookingId, customer_email: b.customer_email, customer_name: b.customer_name,
        start_at: b.start_at, stylist_id: b.stylist_id, reason,
      },
    });
    // Openstaande "betaald, niet geplaatst"-melding voor deze boeking sluiten: die is nu opgelost.
    await admin.from("system_alerts").update({ acknowledged_at: new Date().toISOString() })
      .eq("kind", "paid_unplaced").is("acknowledged_at", null).eq("payload->>booking_id", bookingId);
    await postAlertWebhook("booking_cancelled", `Bevestigde afspraak geannuleerd of terugbetaald (${reason}).`, { booking_id: bookingId });
    await notifyStylist(admin, bookingId, "geannuleerd");
  }
  return { outcome: "cancelled", previous: prev, wasReal };
}
