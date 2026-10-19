// Kleurplan bewaren vanaf advies.roll.nl (pad "meerdere ruimtes"). Openbaar (browser), daarom:
// - alleen vanaf advies.roll.nl (CORS), invoer streng gecontroleerd
// - limiet per e-mailadres (3 per dag) en per IP (10 per uur), zodat niemand anderen kan bestoken met mails
// - er wordt GEEN account aangemaakt: de klant krijgt een link (Klaviyo-event "Kleurplan Bewaard"); pas na een klik
//   maakt roll.nl het account en project aan (plugin roll-mijn-huis, actie plan_claim in mijn-huis).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { klaviyoTrack } from "../_shared/klaviyo.ts";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SHOP = (Deno.env.get("WOO_URL") ?? "https://roll.nl").replace(/\/$/, "");
const ORIGINS = [/^https:\/\/advies\.roll\.nl$/, /^http:\/\/localhost(:\d+)?$/];

const SOORTEN = new Set(["woonkamer", "slaapkamer", "keuken", "eetkamer", "hal", "badkamer", "kinderkamer", "werkkamer", "wc", "anders"]);

function cors(origin: string | null) {
  const ok = origin && ORIGINS.some((r) => r.test(origin));
  return {
    "Access-Control-Allow-Origin": ok ? origin! : "https://advies.roll.nl",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

async function sha256(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const h = cors(origin);
  const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...h, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: h });
  if (req.method !== "POST") return j({ error: "method" }, 405);
  if (!origin || !ORIGINS.some((r) => r.test(origin))) return j({ error: "herkomst" }, 403);

  let body: any = {};
  try { body = await req.json(); } catch { return j({ error: "body" }, 400); }

  const email = String(body.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 200) return j({ error: "Vul een geldig e-mailadres in." }, 400);
  const voornaam = String(body.voornaam ?? "").trim().replace(/[<>"]/g, "").slice(0, 60) || null;
  const postcode = String(body.postcode ?? "").trim().toUpperCase().replace(/[^0-9A-Z ]/g, "").slice(0, 8) || null;
  const ruimtes = (Array.isArray(body.ruimtes) ? body.ruimtes : []).slice(0, 15).map((r: any) => ({
    soort: SOORTEN.has(r?.soort) ? r.soort : "anders",
    naam: String(r?.naam ?? "").trim().replace(/[<>"]/g, "").slice(0, 60) || null,
    nu: !!r?.nu,
  }));
  if (!ruimtes.length) return j({ error: "Kies minstens één ruimte." }, 400);

  const sb = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
  const ipHash = ip ? (await sha256("kleurplan|" + ip)).slice(0, 32) : null;

  const dag = new Date(Date.now() - 864e5).toISOString();
  const uur = new Date(Date.now() - 36e5).toISOString();
  const [{ count: perMail }, { count: perIp }] = await Promise.all([
    sb.from("mh_kleurplannen").select("id", { count: "exact", head: true }).ilike("email", email.replace(/[\\%_]/g, "\\$&")).gte("created_at", dag),
    ipHash ? sb.from("mh_kleurplannen").select("id", { count: "exact", head: true }).eq("ip_hash", ipHash).gte("created_at", uur)
      : Promise.resolve({ count: 0 } as any),
  ]);
  if ((perMail ?? 0) >= 3 || (perIp ?? 0) >= 10) {
    return j({ error: "We hebben je net al een mail gestuurd. Kijk ook even in je spam." }, 429);
  }

  const token = crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
  const { data: plan, error } = await sb.from("mh_kleurplannen")
    .insert({ email, voornaam, postcode, ruimtes, token_hash: await sha256(token), ip_hash: ipHash })
    .select("id").single();
  if (error || !plan) return j({ error: "Bewaren lukte niet. Probeer het nog een keer." }, 500);

  const link = `${SHOP}/my-account/?roll_mh_plan=${plan.id}.${token}`;
  const namen = ruimtes.map((r: any) => r.naam || r.soort);
  await klaviyoTrack(
    "Kleurplan Bewaard",
    { email, ...(voornaam ? { first_name: voornaam } : {}) },
    { activatie_url: link, ruimtes: namen, aantal_ruimtes: ruimtes.length, nu: ruimtes.filter((r: any) => r.nu).map((r: any) => r.naam || r.soort) },
    {},
    `kleurplan-${plan.id}`,
    sb,
  );

  return j({ ok: true, id: plan.id });
});
