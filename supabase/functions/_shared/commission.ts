// Verfcommissie voor stylisten. Eén regel per betaalde verforder in de tabel `commissions`.
// Twee toeschrijvingsroutes: 'code' (persoonlijke kortingscode van de styliste op de order)
// en 'advies' (klant had binnen het venster een Roll-adviesgesprek bij die styliste).
// Bij conflict: code wint (expliciete klantactie), maar we markeren voor controle.

const RATE = Number(Deno.env.get("COMMISSION_RATE") ?? "0.10");
const WINDOW_DAYS = Number(Deno.env.get("COMMISSION_WINDOW_DAYS") ?? "60");
const ADVICE_IDS: number[] = (Deno.env.get("ADVICE_PRODUCT_IDS") ?? "14753")
  .split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
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

  // Route 'code': persoonlijke kortingscode van een styliste op de order.
  let codeStylist: string | null = null;
  const codes = (order.coupon_lines ?? []).map((c: any) => String(c.code ?? "").trim().toLowerCase()).filter(Boolean);
  if (codes.length) {
    const { data } = await admin.from("stylists").select("id,discount_code").not("discount_code", "is", null);
    for (const s of (data ?? []) as any[]) {
      if (codes.includes(String(s.discount_code).trim().toLowerCase())) { codeStylist = s.id; break; }
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

  // E-mail (advies) is primair en het meest betrouwbaar; de persoonlijke code is de fallback
  // voor eigen klanten zonder adviesgesprek. Wijzen ze naar verschillende stylisten, dan markeren
  // we voor controle. De gedeelde samplekorting-code matcht nooit een styliste en wordt genegeerd.
  let stylist: string | null = null, route: string | null = null, conflict = false;
  if (adviesStylist && codeStylist) {
    stylist = adviesStylist; route = "advies"; conflict = adviesStylist !== codeStylist;
  } else if (adviesStylist) { stylist = adviesStylist; route = "advies"; }
  else if (codeStylist) { stylist = codeStylist; route = "code"; }
  else return { skipped: "geen toeschrijving" };

  const amount = Math.round(verf * RATE * 100) / 100;

  // Bestaat er al een regel voor deze order? Niet overschrijven zodra 'ie verder is dan te_controleren.
  const { data: existing } = await admin.from("commissions").select("id,status").eq("woo_order_id", wooId).maybeSingle();
  const row = {
    woo_order_id: wooId, stylist_id: stylist, route, customer_email: email || null,
    verf_excl: Math.round(verf * 100) / 100, rate: RATE, amount,
    order_total: Number(order.total ?? 0), currency: order.currency ?? "EUR",
    conflict, updated_at: new Date().toISOString(),
  };
  if (!existing) {
    await admin.from("commissions").insert({ ...row, status: "te_controleren" });
  } else if (existing.status === "te_controleren") {
    await admin.from("commissions").update(row).eq("id", existing.id);
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

// Zet de sample-badge op de bijbehorende boeking wanneer een klant samples bestelt.
export async function flagSamplesOrdered(admin: any, order: any) {
  const hasSample = (order.line_items ?? []).some((li: any) => /^SMP[-_]/i.test(li.sku || ""));
  if (!hasSample) return;
  const email = String(order.billing?.email ?? "").trim().toLowerCase();
  if (!email) return;
  const orderMs = new Date(order.date_created ?? order.date_created_gmt ?? Date.now()).getTime();
  const since = new Date(orderMs - WINDOW_DAYS * 864e5).toISOString();
  const { data: bk } = await admin
    .from("bookings")
    .select("id")
    .ilike("customer_email", email)
    .in("status", ["confirmed", "manual"])
    .gte("start_at", since)
    .lte("start_at", new Date(orderMs).toISOString())
    .order("start_at", { ascending: false })
    .limit(1);
  const id = ((bk ?? [])[0] as any)?.id;
  if (id) await admin.from("bookings").update({ samples_besteld: true }).eq("id", id);
}

// Bij refund/annulering: commissie laten vervallen, tenzij al uitbetaald (dan handmatig terugvorderen).
export async function voidCommission(admin: any, orderId: string | number) {
  await admin.from("commissions")
    .update({ status: "vervallen", updated_at: new Date().toISOString() })
    .eq("woo_order_id", String(orderId))
    .neq("status", "uitbetaald");
}
