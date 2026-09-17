// Bevestigt een betaalde boeking via confirm_paid_booking en vuurt het event.
// Gedeeld door woo-webhook en de statuspoll, zodat beide paden identiek gedragen.
import { buildBookingContext, klaviyoTrack, appointmentProfileProps } from "./klaviyo.ts";
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
      );
    }
  } else if (r.outcome === "paid_unplaced" && !r.already) {
    await postAlertWebhook(
      "paid_unplaced",
      "Klant heeft betaald maar het moment is niet meer beschikbaar. Plaats de afspraak handmatig via Boekingen in het dashboard.",
      { booking_id: bookingId },
    );
  }
  return r;
}
