// Offertes en prijsopgaven van roll.nl voor het overzicht van het beheer (roll.nl/dashboard/offertes).
//
// roll.nl (plugin roll-verfcalculator) geeft de lijst terug: alle offertes uit de offerte-tool en de prijsopgaven
// waar een e-mailadres bij hoort. Alleen beheerders. De offertes van stylistes en de gesprekken met Charlie staan in
// onze eigen database; die leest het dashboard zelf.
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
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const { data: isAdm } = await caller.rpc("is_admin");
    if (true !== isAdm) return json({ error: "Alleen beheerders zien alle offertes." }, 403);
    if (!KEY) return json({ error: "De koppeling met roll.nl staat niet aan." }, 503);

    const r = await fetch(`${WP}/wp-json/roll-advies/v1/overzicht?max=400`, { headers: { "X-Roll-Advies-Key": KEY }, signal: AbortSignal.timeout(25000) });
    const uit = await r.json().catch(() => null);
    if (!r.ok || !Array.isArray(uit?.offertes)) {
      console.error("offertes-overzicht:", r.status, uit?.code ?? "");
      return json({ error: "De offertes van roll.nl ophalen lukte niet." }, 502);
    }
    return json({ offertes: uit.offertes, prijsopgaven: Array.isArray(uit.prijsopgaven) ? uit.prijsopgaven : [] });
  } catch (e) {
    console.error("offertes-overzicht:", (e as Error).message);
    return json({ error: "Er ging iets mis bij het ophalen van de offertes." }, 500);
  }
});
