// Partners voor het beheer in het dashboard (roll.nl/dashboard/partners). Alleen voor beheerders.
//
// De afspraken en de cijfers van makelaars, creators en merken komen van roll.nl (plugin Roll Partners), waar ze ook
// voor het partnerdashboard worden berekend. Wij voegen er de soort en de mensen uit onze eigen tabellen aan toe.
// Stylistes staan in onze eigen database; die leest het dashboard zelf.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

// Zelfde site en sleutel als de offertekoppeling (X-Roll-Advies-Key).
const WP = new URL(Deno.env.get("OFFERTE_API_URL") || "https://roll.nl/wp-json/roll-advies/v1/offerte").origin;
const KEY = Deno.env.get("OFFERTE_API_KEY") ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST." }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const caller = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: isAdm } = await caller.rpc("is_admin");
    if (true !== isAdm) return json({ error: "Alleen beheerders zien de partners." }, 403);
    if (!KEY) return json({ error: "De koppeling met roll.nl staat niet aan." }, 503);

    let body: any = {};
    try { body = await req.json(); } catch { /* leeg */ }
    const slug = String(body?.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    if (!["lijst", "detail"].includes(body?.action) || ("detail" === body.action && !slug)) return json({ error: "Onbekende actie." }, 400);

    const r = await fetch(`${WP}/wp-json/roll-partners/v1/partners${"detail" === body.action ? `?slug=${slug}` : ""}`, {
      headers: { "X-Roll-Advies-Key": KEY }, signal: AbortSignal.timeout(25000),
    });
    const uit = await r.json().catch(() => null);
    if (!r.ok || !uit) return json({ error: 404 === r.status ? "Die partner bestaat niet." : "De cijfers van roll.nl ophalen lukte niet." }, 404 === r.status ? 404 : 502);

    // Onze eigen gegevens erbij: de soort (ook merk of schilder) en wie er via het dashboard bij mag.
    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    const { data: eigen } = await admin.from("partners").select("id, slug, soort, actief, partner_members(email, naam)");
    const per = new Map((eigen ?? []).map((p: any) => [p.slug, p]));
    const verrijk = (p: any) => {
      const e: any = per.get(p.slug);
      return { ...p, id: e?.id ?? null, soort: e?.soort ?? p.type ?? "overig", actief: e ? !!e.actief : true, leden: e?.partner_members ?? [] };
    };
    if ("detail" === body.action) return json({ partner: verrijk(uit.partner) });
    return json({ partners: (uit.partners ?? []).map(verrijk) });
  } catch (e) {
    console.error("partners-beheer:", (e as Error).message);
    return json({ error: "Er ging iets mis bij het ophalen van de partners." }, 500);
  }
});
