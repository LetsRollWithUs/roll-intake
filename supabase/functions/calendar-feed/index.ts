// Persoonlijke abonneer-feed per styliste: al haar bevestigde Roll-afspraken als ICS.
// Zij abonneert zich hierop in Google/Outlook/Apple; de agenda ververst automatisch.
// Publiek benaderbaar via haar geheime feed_token.
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
  const { data: stylist } = await admin
    .from("stylists").select("id,name,meet_url").eq("feed_token", token).maybeSingle();
  if (!stylist) return new Response("niet gevonden", { status: 404 });

  const st = stylist as any;
  const sinceIso = new Date(Date.now() - 7 * 864e5).toISOString();
  const { data: bookings } = await admin
    .from("bookings")
    .select("id,start_at,end_at,status,customer_name,customer_phone,manage_token,intake_id, services(key)")
    .eq("stylist_id", st.id)
    .eq("status", "confirmed")
    .gte("start_at", sinceIso)
    .order("start_at", { ascending: true });

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Roll//Kleuradvies//NL",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc("Roll kleuradvies")}`,
    "X-WR-TIMEZONE:Europe/Amsterdam",
  ];

  for (const b of (bookings ?? []) as any[]) {
    const end = b.end_at ?? new Date(new Date(b.start_at).getTime() + 30 * 60000).toISOString();
    const naam = b.customer_name || "Klant";
    const intakeUrl = `${INTAKE_BASE}/?booking=${b.id}&mode=${mode(b.services?.key)}`;
    const desc = [
      `Kleuradvies met ${naam}.`,
      st.meet_url ? `Videogesprek: ${st.meet_url}` : "",
      b.customer_phone ? `Telefoon klant: ${b.customer_phone}` : "",
      `Intake: ${b.intake_id ? "ingevuld" : "nog niet ingevuld"}`,
      `Bekijk de intake: ${intakeUrl}`,
    ].filter(Boolean).join("\n");
    lines.push(
      "BEGIN:VEVENT",
      `UID:${b.id}@intake.roll.nl`,
      `DTSTAMP:${icsUtc(new Date().toISOString())}`,
      `DTSTART:${icsUtc(b.start_at)}`,
      `DTEND:${icsUtc(end)}`,
      `SUMMARY:${esc(`Kleuradvies: ${naam}`)}`,
      `DESCRIPTION:${esc(desc)}`,
      st.meet_url ? `LOCATION:${esc(st.meet_url)}` : "LOCATION:Online",
      "STATUS:CONFIRMED",
      "END:VEVENT",
    );
  }
  lines.push("END:VCALENDAR");

  return new Response(lines.join("\r\n"), {
    status: 200,
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": 'inline; filename="roll-kleuradvies.ics"',
      "cache-control": "max-age=300",
    },
  });
});
