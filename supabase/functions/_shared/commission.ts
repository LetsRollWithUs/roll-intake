// Verfcommissie voor stylisten. Eén regel per betaalde verforder in de tabel `commissions`.
// Drie toeschrijvingsroutes: 'offerte' (bestelling via een offerte die de styliste voor een eigen klant
// maakte; de order draagt het offerte-id en de afgesproken verdeling), 'code' (persoonlijke kortingscode
// van de styliste op de order) en 'advies' (klant had binnen het venster een Roll-adviesgesprek bij die
// styliste). Een offerte gaat voor (meest expliciet), daarna advies, daarna code; wijzen ze naar
// verschillende stylisten, dan markeren we voor controle.

import { notifyStylist, fmtDag, datumNL } from "./klaviyo.ts";

const RATE = Number(Deno.env.get("COMMISSION_RATE") ?? "0.10");
const WINDOW_DAYS = Number(Deno.env.get("COMMISSION_WINDOW_DAYS") ?? "60");
const ADVICE_IDS: number[] = [
  ...(Deno.env.get("ADVICE_PRODUCT_IDS") ?? "14753").split(",").map((s) => Number(s.trim())),
  Number(Deno.env.get("ONLINE_PRODUCT_ID") ?? 0), Number(Deno.env.get("THUIS_PRODUCT_ID") ?? 0),
].filter((n) => Number.isFinite(n) && n > 0);
const GIFT_IDS: number[] = (Deno.env.get("GIFT_PRODUCT_IDS") ?? "")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));

const isSampleSku = (sku: string) => /^SMP[-_]/i.test(sku || "");

// Commissiebasis na klantkortingen, excl. btw: som van line_items.total (Woo levert die excl. btw
// en na coupon-korting) voor regels die geen advies, cadeau of sample zijn. Besluit: tools die in
// de verfbestelling zitten tellen WEL mee; alleen samples en advies worden uitgesloten. Verzending
// staat niet in line_items en valt dus vanzelf buiten de basis.
export function verfBaseExcl(order: any): number {
  let sum = 0;
  for (const li of order.line_items ?? []) {
    const pid = Number(li.product_id);
    if (ADVICE_IDS.includes(pid) || GIFT_IDS.includes(pid)) continue;
    if (isSampleSku(li.sku)) continue;
    sum += Number(li.total ?? 0);
  }
  return sum;
}

export async function attributeCommission(admin: any, order: any): Promise<{ ok?: boolean; skipped?: string; stylist?: string; route?: string; amount?: number; conflict?: boolean }> {
  const verf = verfBaseExcl(order);
  if (verf <= 0) return { skipped: "geen verf op de order" };
  const wooId = String(order.id);
  const email = String(order.billing?.email ?? "").trim().toLowerCase();

  // Route 'code': een kortingscode van een styliste op de order. Eerst de codes met een eigen verdeling
  // (stylist_codes: de code bepaalt het commissiepercentage), dan de oude losse code op de styliste.
  let codeStylist: string | null = null;
  let codeRij: { commissie_pct: number; korting_pct: number } | null = null;
  const codes = (order.coupon_lines ?? []).map((c: any) => String(c.code ?? "").trim().toLowerCase()).filter(Boolean);
  if (codes.length) {
    const { data: sc } = await admin.from("stylist_codes").select("stylist_id,code,commissie_pct,korting_pct").eq("actief", true);
    for (const c of (sc ?? []) as any[]) {
      if (codes.includes(String(c.code).trim().toLowerCase())) {
        codeStylist = c.stylist_id;
        codeRij = { commissie_pct: Number(c.commissie_pct), korting_pct: Number(c.korting_pct) };
        break;
      }
    }
    if (!codeStylist) {
      const { data } = await admin.from("stylists").select("id,discount_code").not("discount_code", "is", null);
      for (const s of (data ?? []) as any[]) {
        if (codes.includes(String(s.discount_code).trim().toLowerCase())) { codeStylist = s.id; break; }
      }
    }
  }

  // Route 'advies': recente bevestigde afspraak, of een handmatig in de flow gezette klant ('manual',
  // gerekend vanaf het moment van in de flow zetten), op hetzelfde e-mailadres binnen het venster.
  let adviesStylist: string | null = null;
  let adviesBookingId: string | null = null;
  if (email) {
    const orderMs = new Date(order.date_created ?? order.date_created_gmt ?? Date.now()).getTime();
    const since = new Date(orderMs - WINDOW_DAYS * 864e5).toISOString();
    const { data: bk } = await admin
      .from("bookings")
      .select("id,stylist_id,start_at")
      .ilike("customer_email", email)
      .in("status", ["confirmed", "manual"])
      .gte("start_at", since)
      .lte("start_at", new Date(orderMs).toISOString())
      .order("start_at", { ascending: false })
      .limit(1);
    const b = (bk ?? [])[0] as any;
    adviesStylist = b?.stylist_id ?? null;
    adviesBookingId = b?.id ?? null;
  }

  // Route 'offerte': de winkelmandlink van een offerte voor een eigen klant zet de offerte, de styliste en
  // de verdeling op de order (offerte-tool >= 1.86.0). Het percentage komt uit onze eigen offerte-rij,
  // niet uit de order, zodat het niet te beinvloeden is.
  const meta = (k: string) => (order.meta_data ?? []).find((m: any) => m.key === k)?.value;
  let offerte: { id: string; stylist_id: string; commissie_pct: number; korting_pct: number } | null = null;
  if (String(meta("_roll_offerte_herkomst") ?? "") === "styliste") {
    const oid = Number(meta("_roll_offerte_id"));
    if (oid) {
      const { data: of } = await admin.from("stylist_offers").select("id,stylist_id,commissie_pct,korting_pct").eq("offerte_id", oid).maybeSingle();
      if (of?.stylist_id) offerte = { id: of.id, stylist_id: of.stylist_id, commissie_pct: Number(of.commissie_pct), korting_pct: Number(of.korting_pct) };
    }
  }

  // E-mail (advies) is primair en het meest betrouwbaar; de persoonlijke code is de fallback
  // voor eigen klanten zonder adviesgesprek. Wijzen ze naar verschillende stylisten, dan markeren
  // we voor controle. De gedeelde samplekorting-code matcht nooit een styliste en wordt genegeerd.
  let stylist: string | null = null, route: string | null = null, conflict = false;
  if (offerte) {
    stylist = offerte.stylist_id; route = "offerte";
    conflict = (!!adviesStylist && adviesStylist !== stylist) || (!!codeStylist && codeStylist !== stylist);
  } else if (adviesStylist && codeStylist) {
    stylist = adviesStylist; route = "advies"; conflict = adviesStylist !== codeStylist;
  } else if (adviesStylist) { stylist = adviesStylist; route = "advies"; }
  else if (codeStylist) { stylist = codeStylist; route = "code"; }
  else return { skipped: "geen toeschrijving" };

  // Percentage uit de samenwerkingsafspraken van de styliste (ingesteld door beheer), anders de standaard.
  const { data: sr } = await admin.from("stylist_agreements").select("commission_rate").eq("stylist_id", stylist).maybeSingle();
  // Bij een offerte voor een eigen klant geldt de verdeling van die offerte.
  // Bij een code met een eigen verdeling geldt die verdeling (alleen als de bestelling via die code loopt).
  const metCode = route === "code" && codeRij && Number.isFinite(codeRij.commissie_pct);
  const rate = offerte && Number.isFinite(offerte.commissie_pct) ? offerte.commissie_pct / 100
    : metCode ? codeRij!.commissie_pct / 100
    : sr?.commission_rate != null ? Number(sr.commission_rate) : RATE;
  const amount = Math.round(verf * rate * 100) / 100;

  // Bestaat er al een regel voor deze order? Niet overschrijven zodra 'ie verder is dan te_controleren.
  const { data: existing } = await admin.from("commissions").select("id,status").eq("woo_order_id", wooId).maybeSingle();
  const row = {
    woo_order_id: wooId, stylist_id: stylist, route, customer_email: email || null,
    verf_excl: Math.round(verf * 100) / 100, rate, amount,
    order_total: Number(order.total ?? 0), currency: order.currency ?? "EUR",
    conflict, updated_at: new Date().toISOString(),
    offer_id: offerte?.id ?? null, klant_korting_pct: offerte ? offerte.korting_pct : metCode ? codeRij!.korting_pct : null,
  };
  if (!existing) {
    await admin.from("commissions").insert({ ...row, status: "te_controleren" });
  } else if (existing.status === "te_controleren") {
    await admin.from("commissions").update(row).eq("id", existing.id);
  }

  // De offerte staat nu op besteld, met de order erbij.
  if (offerte) {
    await admin.from("stylist_offers").update({ status: "besteld", ordered_at: new Date().toISOString(), woo_order_id: wooId, updated_at: new Date().toISOString() }).eq("id", offerte.id);
  }

  // Kanban automatisch naar 'verf gekocht' voor de advies-boeking (tenzij afgehaakt), en
  // open verkoopherinneringen sluiten: de aankoop is gedaan.
  if (route === "advies" && adviesBookingId) {
    await admin.from("bookings").update({ kanban_stage: "verf" })
      .eq("id", adviesBookingId).neq("kanban_stage", "afgehaakt");
    await admin.from("followup_tasks")
      .update({ done_at: new Date().toISOString(), outcome: "verf_gekocht", note: `Automatisch gesloten: verf gekocht (order ${wooId}).` })
      .eq("booking_id", adviesBookingId).is("done_at", null);
  }
  return { ok: true, stylist, route, amount, conflict };
}

// Samples besteld door een klant met een adviesgesprek: badge op de boeking, de styliste krijgt een
// seintje ("goed nieuws, de samples zijn besteld") en haar check-in komt op besteldatum + CHECKIN_DAGEN
// te staan, zodat ze op het juiste moment vraagt hoe de kleuren bevallen en de keuze in het verfplan zet.
// Eenmalig per order: de webhook komt per statuswissel opnieuw binnen.
export const CHECKIN_ACTIE = "Check hoe de samples bevallen";
export const CHECKIN_DAGEN = Number(Deno.env.get("SAMPLE_CHECKIN_DAGEN") ?? "3");

export async function flagSamplesOrdered(admin: any, order: any) {
  const sampleRegels = (order.line_items ?? []).filter((li: any) => isSampleSku(li.sku));
  if (!sampleRegels.length) return;
  const email = String(order.billing?.email ?? "").trim().toLowerCase();
  if (!email) return;
  const orderMs = new Date(order.date_created ?? order.date_created_gmt ?? Date.now()).getTime();
  const since = new Date(orderMs - WINDOW_DAYS * 864e5).toISOString();
  const { data: bk } = await admin
    .from("bookings")
    .select("id,stylist_id,kanban_stage")
    .ilike("customer_email", email)
    .in("status", ["confirmed", "manual"])
    .gte("start_at", since)
    .lte("start_at", new Date(orderMs).toISOString())
    .order("start_at", { ascending: false })
    .limit(1);
  const b = (bk ?? [])[0] as any;
  if (!b?.id) return;
  await admin.from("bookings").update({ samples_besteld: true }).eq("id", b.id);

  // Verf al gekocht of klant afgehaakt: geen check-in meer nodig.
  if (["verf", "afgehaakt"].includes(b.kanban_stage)) return;
  const key = `${b.id}:styliste:samples_besteld:${order.id}`;
  const { data: al } = await admin.from("notification_outbox").select("id").eq("unique_id", key).limit(1);
  if ((al ?? []).length) return;

  const checkin = new Date(orderMs + CHECKIN_DAGEN * 864e5);
  const due = datumNL(checkin);
  const { data: open } = await admin.from("followup_tasks").select("id")
    .eq("booking_id", b.id).eq("kind", "sample_checkin").is("done_at", null).limit(1);
  const taakId = ((open ?? [])[0] as any)?.id;
  if (taakId) await admin.from("followup_tasks").update({ due_date: due }).eq("id", taakId);
  else await admin.from("followup_tasks").insert({
    booking_id: b.id, stylist_id: b.stylist_id ?? null, action: CHECKIN_ACTIE, owner: "styliste",
    due_date: due, kind: "sample_checkin", created_by: "systeem",
  });

  const samples = sampleRegels.map((li: any) => String(li.name ?? "").trim()).filter(Boolean).slice(0, 12);
  await notifyStylist(admin, b.id, "samples_besteld", {
    samples, order_nummer: String(order.number ?? order.id),
    checkin_datum_local: fmtDag(checkin.toISOString()),
  }, key);
}

// Bij refund/annulering: commissie laten vervallen, tenzij al uitbetaald (dan handmatig terugvorderen).
export async function voidCommission(admin: any, orderId: string | number) {
  await admin.from("commissions")
    .update({ status: "vervallen", updated_at: new Date().toISOString() })
    .eq("woo_order_id", String(orderId))
    .neq("status", "uitbetaald");
}
