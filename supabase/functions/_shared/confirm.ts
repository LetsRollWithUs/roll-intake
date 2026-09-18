// Bevestigt een betaalde boeking via confirm_paid_booking en vuurt het event.
// Gedeeld door woo-webhook en de statuspoll, zodat beide paden identiek gedragen.
import { buildBookingContext, klaviyoTrack, appointmentProfileProps, notifyStylist } from "./klaviyo.ts";
import { postAlertWebhook } from "./alerts.ts";

export interface ConfirmResult {
  outcome: "confirmed" | "reassigned" | "already_confirmed" | "paid_unplaced" | "not_found" | "error";
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
        "Afspraak bevestigd",
        ctx.profile,
        ctx.properties,
        appointmentProfileProps(ctx, { includeIntakeStatus: true }),
        `${bookingId}:confirmed:${stamp}`,
        admin,
      );
    }
    await notifyStylist(admin, bookingId, "nieuwe_boeking");
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

  const wasReal = prev === "confirmed" || prev === "paid_unplaced";
  if (wasReal) {
    const ctx = await buildBookingContext(admin, bookingId);
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
