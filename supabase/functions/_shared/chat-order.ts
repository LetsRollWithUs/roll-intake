// Jouw schilderplan: een order die uit een chatgesprek komt, koppelen aan dat gesprek.
// De plugin Roll Kleurplan zet het gesprek als order-meta _roll_chat_sessie; deze functie bewaart de stand per order.
// Een fout hier mag de rest van de webhook (boekingen, commissie) nooit raken.
export async function koppelChatOrder(admin: any, order: any) {
  try {
    const sessie = String((order.meta_data ?? []).find((m: any) => m.key === "_roll_chat_sessie")?.value ?? "");
    if (!/^[a-z0-9]{24,64}$/i.test(sessie) || !order.id) return;
    const regels: any[] = order.line_items ?? [];
    const isSample = (r: any) => String(r.sku ?? "").toUpperCase().startsWith("SMP-");
    const samples = regels.some(isSample);
    const overig = regels.some((r) => !isSample(r));
    const soort = samples && overig ? "beide" : samples ? "samples" : "verf";
    const { error } = await admin.from("projecthulp_chat_order").upsert({
      order_id: Number(order.id),
      sessie,
      status: String(order.status ?? ""),
      totaal: Number(order.total ?? 0),
      soort,
      besteld_op: order.date_paid_gmt ? `${order.date_paid_gmt}Z` : order.date_created_gmt ? `${order.date_created_gmt}Z` : null,
      updated_at: new Date().toISOString(),
    });
    if (error) console.error("koppelChatOrder", error.message);
  } catch (e) {
    console.error("koppelChatOrder", e);
  }
}
