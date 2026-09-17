// Serveert een .ics voor één afspraak (de "zet in agenda"-knop in de mail).
// Publiek benaderbaar via de geheime manage_token van de boeking.
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTAKE_BASE = (Deno.env.get("INTAKE_BASE_URL") ?? "https://intake.roll.nl").replace(/\/$/, "");

const icsUtc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const mode = (key?: string | null) => (key === "post_sample" ? "post" : "pre");

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return new Response("token ontbreekt", { status: 400 });

  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data: b } = await admin
    .from("bookings")
    .select("id,start_at,end_at,status,manage_token, services(key), stylists(name,meet_url)")
    .eq("manage_token", token)
    .maybeSingle();
  if (!b) return new Response("niet gevonden", { status: 404 });

  const row = b as any;
  const end = row.end_at ?? new Date(new Date(row.start_at).getTime() + 30 * 60000).toISOString();
  const stylist = row.stylists?.name as string | undefined;
  const meet = row.stylists?.meet_url as string | undefined;
  const intakeUrl = `${INTAKE_BASE}/?booking=${row.id}&mode=${mode(row.services?.key)}`;
  const manageUrl = `${INTAKE_BASE}/boek/beheer?token=${row.manage_token}`;
  const cancelled = row.status === "cancelled";

  const desc = [
    `Online kleuradvies${stylist ? ` met ${stylist}` : ""}.`,
    meet ? `Videogesprek: ${meet}` : "",
    `Vul je intake in: ${intakeUrl}`,
    `Afspraak verzetten: ${manageUrl}`,
  ].filter(Boolean).join("\n");

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roll//Kleuradvies//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${row.id}@intake.roll.nl`,
    `DTSTAMP:${icsUtc(new Date().toISOString())}`,
    `DTSTART:${icsUtc(row.start_at)}`,
    `DTEND:${icsUtc(end)}`,
    `SUMMARY:${esc("Kleuradvies met Roll")}`,
    `DESCRIPTION:${esc(desc)}`,
    meet ? `LOCATION:${esc(meet)}` : "LOCATION:Online",
    `STATUS:${cancelled ? "CANCELLED" : "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  const body = lines.join("\r\n");

  return new Response(body, {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'attachment; filename="kleuradvies-roll.ics"',
      "cache-control": "no-store",
    },
  });
});
