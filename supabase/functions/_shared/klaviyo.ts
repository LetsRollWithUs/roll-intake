// Gedeelde Klaviyo-helper voor de booking-edge-functions.
// Wij vuren events + zetten profieleigenschappen; de mails/flows leven in Klaviyo.
import { createClient } from "jsr:@supabase/supabase-js@2";

const KLAVIYO_KEY = Deno.env.get("KLAVIYO_PRIVATE_KEY") ?? "";
const INTAKE_BASE = (Deno.env.get("INTAKE_BASE_URL") ?? "https://intake.roll.nl").replace(/\/$/, "");
const SB_URL = (Deno.env.get("SUPABASE_URL") ?? "").replace(/\/$/, "");
const KLAVIYO_REVISION = "2024-10-15";
const TZ = "Europe/Amsterdam";
const EVENT_TITLE = "Kleuradvies met Roll";

const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

// Bouwt "zet in agenda"-links (Google, Outlook, en een .ics voor Apple/overig).
function calendarLinks(opts: {
  bookingId: string; token: string; start: string; end: string;
  stylist?: string | null; meetUrl?: string | null; intakeUrl: string; manageUrl: string;
}) {
  const details = [
    `Online kleuradvies${opts.stylist ? ` met ${opts.stylist}` : ""}.`,
    opts.meetUrl ? `Videogesprek: ${opts.meetUrl}` : "",
    `Vul je intake in: ${opts.intakeUrl}`,
    `Afspraak verzetten: ${opts.manageUrl}`,
  ].filter(Boolean).join("\n");
  const loc = opts.meetUrl ?? "";
  const e = encodeURIComponent;
  const gcal =
    `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${e(EVENT_TITLE)}` +
    `&dates=${icsUtc(opts.start)}/${icsUtc(opts.end)}&details=${e(details)}&location=${e(loc)}`;
  const outlook =
    `https://outlook.office.com/calendar/0/deeplink/compose?path=/calendar/action/compose&rru=addevent` +
    `&subject=${e(EVENT_TITLE)}&startdt=${e(new Date(opts.start).toISOString())}` +
    `&enddt=${e(new Date(opts.end).toISOString())}&body=${e(details)}&location=${e(loc)}`;
  const ics = `${SB_URL}/functions/v1/calendar-event?token=${opts.token}`;
  return { gcal_url: gcal, outlook_url: outlook, ics_url: ics };
}

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
      "id,start_at,end_at,customer_name,customer_email,customer_phone,manage_token,intake_id, services(key), stylists(name,meet_url)",
    )
    .eq("id", bookingId)
    .maybeSingle();
  if (!b || !(b as any).customer_email) return null;
  const row = b as any;
  const key = row.services?.key as string | undefined;
  const mode = serviceMode(key);
  const intakeUrl = `${INTAKE_BASE}/?booking=${row.id}&mode=${mode}`;
  const manageUrl = `${INTAKE_BASE}/boek/beheer?token=${row.manage_token}`;
  const endAt = row.end_at ?? new Date(new Date(row.start_at).getTime() + 30 * 60000).toISOString();
  const cal = calendarLinks({
    bookingId: row.id, token: row.manage_token, start: row.start_at, end: endAt,
    stylist: row.stylists?.name, meetUrl: row.stylists?.meet_url, intakeUrl, manageUrl,
  });
  const properties: Record<string, unknown> = {
    booking_id: row.id,
    service: key,
    service_label: serviceLabel(key),
    start_at: row.start_at,
    start_at_local: fmtLocal(row.start_at),
    stylist_name: row.stylists?.name ?? null,
    meet_url: row.stylists?.meet_url ?? null,
    intake_url: intakeUrl,
    manage_url: manageUrl,
    intake_ingevuld: !!row.intake_id,
    ...cal,
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

// Profieleigenschappen voor de afspraak. De 24u-reminder is een date-flow zonder event,
// dus die kan alleen profielprops lezen: daarom schrijven we intake_url/manage_url/stylist_name
// e.d. ook naar het profiel (niet alleen als event-property).
export function appointmentProfileProps(
  ctx: BookingContext,
  opts?: { includeIntakeStatus?: boolean },
): Record<string, unknown> {
  const p = ctx.properties;
  const out: Record<string, unknown> = {
    next_appointment_at: p.start_at,
    next_appointment_local: p.start_at_local,
    stylist_name: p.stylist_name,
    meet_url: p.meet_url,
    intake_url: p.intake_url,
    manage_url: p.manage_url,
  };
  if (opts?.includeIntakeStatus) out.intake_ingevuld = p.intake_ingevuld;
  return out;
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
