// Mijn huis (roll.nl, WooCommerce Mijn account): gegevens van één klant voor de plugin roll-mijn-huis.
// Alleen server-naar-server: de plugin stuurt de geheime sleutel (secret MIJNHUIS_KEY) en het e-mailadres
// dat de klant in zijn account heeft bevestigd. Geen CORS, geen browsertoegang.
// - kleuren: de 81 Roll-kleuren en de samplepakketten (openbaar, voor kleurvlakken en herkenning in orders)
// - klant:   kleurentests (quiz), adviesafspraken en intake bij dit e-mailadres
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ROLL_COLORS, ROLL_PACKS } from "../_shared/roll-collection.ts";
import { projectAction, exact } from "./projecten.ts";
import { serviceMode } from "../_shared/klaviyo.ts";

const KEY = Deno.env.get("MIJNHUIS_KEY") ?? "";
const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const INTAKE_BASE = (Deno.env.get("INTAKE_BASE") ?? "https://intake.roll.nl").replace(/\/$/, "");

const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { "content-type": "application/json" } });

// Vergelijking in constante tijd, zodat de sleutel niet via responstijd te raden is.
function sameKey(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const HEX = new Map(ROLL_COLORS.map((c: any) => [c.id, c.hex]));
const NAME = new Map(ROLL_COLORS.map((c: any) => [c.id, c.name]));
const kleur = (id: string | null | undefined, naam?: string | null) =>
  id ? { id, naam: naam || NAME.get(id) || id, hex: HEX.get(id) ?? null } : null;

const RUIMTE: Record<string, string> = {
  woonkamer: "Woonkamer", slaapkamer: "Slaapkamer", keuken: "Keuken", badkamer: "Badkamer", hal: "Gang en hal",
  gang: "Gang en hal", kinderkamer: "Kinderkamer", werkkamer: "Werkkamer", babykamer: "Babykamer", eetkamer: "Eetkamer", toilet: "Toilet", wc: "Toilet", anders: "Andere ruimte",
};
const ruimteNaam = (r: string | null) => (r ? RUIMTE[r] ?? r.charAt(0).toUpperCase() + r.slice(1).replace(/_/g, " ") : "Ruimte");

Deno.serve(async (req) => {
  if (req.method !== "POST") return j({ error: "method" }, 405);
  if (!KEY) return j({ error: "niet ingesteld" }, 503);
  if (!sameKey(req.headers.get("x-roll-mijnhuis-key") ?? "", KEY)) return j({ error: "geen toegang" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch { return j({ error: "body" }, 400); }

  if (body.action === "kleuren") {
    return j({
      kleuren: ROLL_COLORS.map((c: any) => ({ id: c.id, naam: c.name, sub: c.sub, hex: c.hex })),
      pakketten: ROLL_PACKS.map((p: any) => ({ id: p.id, naam: p.name, kleuren: p.colorIds })),
    });
  }

  if (["projecten", "project_opslaan", "project_weg", "ruimte_opslaan", "ruimte_weg", "plan_claim", "plan_opnieuw", "onderdeel_opslaan", "onderdeel_weg", "scan_toewijzen"].includes(body.action)) {
    const sbp = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
    const r = await projectAction(sbp, body);
    return j(r.data, r.status);
  }

  if (body.action !== "klant") return j({ error: "onbekende actie" }, 400);
  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return j({ error: "email" }, 400);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const sinds = new Date(Date.now() - 400 * 864e5).toISOString();

  const [{ data: qs }, { data: bs }, { data: ins }] = await Promise.all([
    sb.from("quiz_results")
      .select("id,created_at,first_name,room_type,daylight,paint_scope,paint_timeline,primary_color,primary_color_id,secondary_colors,recommended_pack_name,user_answers")
      .ilike("email", exact(email)).gte("created_at", sinds).not("primary_color_id", "is", null)
      .order("created_at", { ascending: false }).limit(20),
    sb.from("bookings")
      .select("id,status,format,start_at,manage_token,created_at,gesprek_gevoerd_at,intake_id,stylist_id, stylists(name,photo_path), services(key,name,duration_min)")
      .ilike("customer_email", exact(email)).is("archived_at", null).in("status", ["confirmed", "requested", "manual"])
      .order("created_at", { ascending: false }).limit(5),
    sb.from("intake").select("id,created_at,status,booking_id").ilike("contact_email", exact(email)).is("archived_at", null)
      .order("created_at", { ascending: false }).limit(3),
  ]);

  // Per ruimte alleen de laatste kleurentest: dat is wat de klant nu het meest herkent.
  const gezien = new Set<string>();
  const ruimtes = [];
  for (const q of (qs as any[]) ?? []) {
    const r = q.room_type ?? q.user_answers?.room ?? "ruimte";
    if (gezien.has(r)) continue;
    gezien.add(r);
    const extra = Array.isArray(q.secondary_colors) ? q.secondary_colors.slice(0, 4).map((c: any) => kleur(c?.id, c?.name)).filter(Boolean) : [];
    ruimtes.push({
      id: q.id, datum: q.created_at, ruimte: r, ruimte_naam: ruimteNaam(r),
      hoofdkleur: kleur(q.primary_color_id, q.primary_color), kleuren: extra,
      daglicht: q.daylight ?? null, vloer: q.user_answers?.floorTone ?? null,
      bereik: q.paint_scope ?? null, planning: q.paint_timeline ?? null, pakket: q.recommended_pack_name ?? null,
    });
  }

  const SB_PUBLIC = `${SB_URL}/storage/v1/object/public/stylist-photos/`;
  const afspraken = ((bs as any[]) ?? []).map((b) => ({
    id: b.id,
    status: b.status, // confirmed = gepland, requested = thuisadvies betaald en nog in te plannen, manual = klant kiest zelf een moment
    vorm: b.format === "thuis" ? "thuis" : "online",
    start: b.status === "confirmed" ? b.start_at : null,
    gevoerd: !!b.gesprek_gevoerd_at,
    dienst: b.services?.name ?? null,
    minuten: b.services?.duration_min ?? null,
    styliste: b.stylists ? { naam: b.stylists.name, foto: b.stylists.photo_path ? SB_PUBLIC + b.stylists.photo_path : null } : null,
    beheer_url: b.manage_token ? `${INTAKE_BASE}/boek/beheer?token=${b.manage_token}` : null,
    intake: !!b.intake_id,
    intake_url: b.intake_id ? null : `${INTAKE_BASE}/?booking=${b.id}&mode=${serviceMode(b.services?.key)}`,
  }));

  const intakes = ((ins as any[]) ?? []).map((i) => ({ id: i.id, datum: i.created_at, status: i.status, booking_id: i.booking_id }));
  const voornaam = ((qs as any[]) ?? []).find((q) => q.first_name)?.first_name ?? null;

  // Alle kleurentests (max. 20), voor het overzicht van je kleuradvies en om ze aan een ruimte te koppelen.
  const scans = ((qs as any[]) ?? []).map((q) => ({
    id: q.id, datum: q.created_at, ruimte: q.room_type ?? "anders", ruimte_naam: ruimteNaam(q.room_type ?? null),
    hoofdkleur: kleur(q.primary_color_id, q.primary_color),
    kleuren: Array.isArray(q.secondary_colors) ? q.secondary_colors.slice(0, 4).map((c: any) => kleur(c?.id, c?.name)).filter(Boolean) : [],
  }));

  return j({ voornaam, ruimtes, scans, afspraken, intakes });
});
