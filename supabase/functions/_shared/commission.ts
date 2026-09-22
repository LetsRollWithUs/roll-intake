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

// Verfomzet na klantkortingen, excl. btw: som van line_items.total (Woo levert die excl. btw en
// na coupon-korting) voor regels die geen advies, cadeau of sample zijn. Tools/verzending vallen
// buiten line_items of moeten later via een SKU/categorie-regel worden uitgesloten.
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

  // Route 'advies': recente bevestigde afspraak op hetzelfde e-mailadres binnen het venster.
  let adviesStylist: string | null = null;
  if (email) {
    const orderMs = new Date(order.date_created ?? order.date_created_gmt ?? Date.now()).getTime();
    const since = new Date(orderMs - WINDOW_DAYS * 864e5).toISOString();
    const { data: bk } = await admin
      .from("bookings")
      .select("stylist_id,start_at")
      .ilike("customer_email", email)
      .eq("status", "confirmed")
      .gte("start_at", since)
      .lte("start_at", new Date(orderMs).toISOString())
      .order("start_at", { ascending: false })
      .limit(1);
    adviesStylist = ((bk ?? [])[0] as any)?.stylist_id ?? null;
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
  return { ok: true, stylist, route, amount, conflict };
}

// Bij refund/annulering: commissie laten vervallen, tenzij al uitbetaald (dan handmatig terugvorderen).
export async function voidCommission(admin: any, orderId: string | number) {
  await admin.from("commissions")
    .update({ status: "vervallen", updated_at: new Date().toISOString() })
    .eq("woo_order_id", String(orderId))
    .neq("status", "uitbetaald");
}
