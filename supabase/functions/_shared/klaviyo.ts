// Gedeelde Klaviyo-helper voor de booking-edge-functions.
// Wij vuren events + zetten profieleigenschappen; de mails/flows leven in Klaviyo.
import { createClient } from "jsr:@supabase/supabase-js@2";

const KLAVIYO_KEY = Deno.env.get("KLAVIYO_PRIVATE_KEY") ?? "";
const INTAKE_BASE = (Deno.env.get("INTAKE_BASE_URL") ?? "https://intake.roll.nl").replace(/\/$/, "");
const KLAVIYO_REVISION = "2024-10-15";
const TZ = "Europe/Amsterdam";

export const serviceMode = (key?: string | null) =>
  key === "post_sample" ? "post" : "pre";
export const serviceLabel = (key?: string | null) =>
  key === "post_sample" ? "Al samples getest" : "Nog geen samples getest";

const fmtLocal = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", {
    timeZone: TZ, weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit",
  }).format(new Date(iso));

export interface BookingContext {
  bookingId: string;
  profile: { email: string; first_name?: string; phone_number?: string };
  properties: Record<string, unknown>;
}

// Laadt alles wat de mails nodig hebben voor een boeking.
export async function buildBookingContext(
  admin: ReturnType<typeof createClient>,
  bookingId: string,
): Promise<BookingContext | null> {
  const { data: b } = await admin
    .from("bookings")
    .select(
      "id,start_at,customer_name,customer_email,customer_phone,manage_token,intake_id, services(key), stylists(name,meet_url)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || !(b as any).customer_email) return null;
  const row = b as any;
  const key = row.services?.key as string | undefined;
  const mode = serviceMode(key);
  const properties: Record<string, unknown> = {
    booking_id: row.id,
    service: key,
    service_label: serviceLabel(key),
    start_at: row.start_at,
    start_at_local: fmtLocal(row.start_at),
    stylist_name: row.stylists?.name ?? null,
    meet_url: row.stylists?.meet_url ?? null,
    intake_url: `${INTAKE_BASE}/?booking=${row.id}&mode=${mode}`,
    manage_url: `${INTAKE_BASE}/boek/beheer?token=${row.manage_token}`,
    intake_ingevuld: !!row.intake_id,
  };
  return {
    bookingId: row.id,
    profile: {
      email: row.customer_email,
      first_name: row.customer_name ?? undefined,
      phone_number: row.customer_phone ?? undefined,
    },
    properties,
  };
}

// Vuurt een Klaviyo-event. profileProps worden als custom profieleigenschappen meegeschreven
// (o.a. next_appointment_at + intake_ingevuld voor de date-triggered reminderflow).
export async function klaviyoTrack(
  metricName: string,
  profile: { email: string; first_name?: string; phone_number?: string },
  properties: Record<string, unknown>,
  profileProps: Record<string, unknown> = {},
  uniqueId?: string,
): Promise<{ ok: boolean; status: number; detail?: string }> {
  if (!KLAVIYO_KEY) return { ok: false, status: 0, detail: "KLAVIYO_PRIVATE_KEY ontbreekt" };
  if (!profile.email) return { ok: false, status: 0, detail: "geen e-mailadres" };

  const profileAttrs: Record<string, unknown> = { email: profile.email };
  if (profile.first_name) profileAttrs.first_name = profile.first_name;
  if (profile.phone_number) profileAttrs.phone_number = profile.phone_number;
  if (Object.keys(profileProps).length) profileAttrs.properties = profileProps;

  const body = {
    data: {
      type: "event",
      attributes: {
        properties,
        time: new Date().toISOString(),
        ...(uniqueId ? { unique_id: uniqueId } : {}),
        metric: { data: { type: "metric", attributes: { name: metricName } } },
        profile: { data: { type: "profile", attributes: profileAttrs } },
      },
    },
  };

  try {
    const res = await fetch("https://a.klaviyo.com/api/events/", {
      method: "POST",
      headers: {
        Authorization: `Klaviyo-API-Key ${KLAVIYO_KEY}`,
        revision: KLAVIYO_REVISION,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify(body),
    });
    if (res.ok) return { ok: true, status: res.status };
    const detail = await res.text();
    return { ok: false, status: res.status, detail };
  } catch (e) {
    return { ok: false, status: 0, detail: String(e) };
  }
}
