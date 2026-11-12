// Het eigen dashboard van een partner (makelaar, creator, merk) op roll.nl/dashboard.
//
// De cijfers berekent roll.nl (plugin Roll Partners), dezelfde als altijd. Deze functie controleert eerst wie er
// vraagt: alleen mensen die bij de partner horen (partner_members) en beheerders krijgen de cijfers. Beheerders kijken
// mee; kiezen, een factuur melden of kaarten aanvragen kan alleen iemand van de partner zelf.
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
const ACTIES = ["cijfers", "keuze", "factuur", "kaarten"];

// Wat de partner zelf te zien krijgt: niet de accounts van anderen en niet de links voor het beheer.
function voorPartner(p: any, soort: string) {
  const { mensen: _m, links, ...rest } = p ?? {};
  return { ...rest, soort, links: { pagina: links?.pagina ?? "" } };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST." }, 405);
  try {
    const caller = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
      auth: { persistSession: false },
    });
    const [{ data: wie }, { data: toegang }] = await Promise.all([caller.auth.getUser(), caller.rpc("mijn_toegang")]);
    const email = wie?.user?.email ?? "";
    if (!email || !toegang) return json({ error: "Log eerst in." }, 401);

    let body: any = {};
    try { body = await req.json(); } catch { /* leeg */ }
    const actie = String(body?.action ?? "");
    const slug = String(body?.slug ?? "").toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 60);
    if (!ACTIES.includes(actie) || !slug) return json({ error: "Onbekende actie." }, 400);

    const eigen = ((toegang as any).partners ?? []).find((p: any) => p.slug === slug) ?? null;
    const beheerder = true === (toegang as any).beheerder;
    if (!eigen && !beheerder) return json({ error: "Dit dashboard hoort niet bij jouw account." }, 403);
    if ("cijfers" !== actie && !eigen) return json({ error: "Als beheerder kijk je mee. Dit kan alleen de partner zelf doen." }, 403);
    if (!KEY) return json({ error: "De koppeling met roll.nl staat niet aan." }, 503);

    let r: Response;
    if ("cijfers" === actie) {
      r = await fetch(`${WP}/wp-json/roll-partners/v1/partners?slug=${slug}`, { headers: { "X-Roll-Advies-Key": KEY }, signal: AbortSignal.timeout(25000) });
    } else {
      // De naam van wie het doet gaat mee, zodat Roll in de melding ziet wie het was.
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data: lid } = await admin.from("partner_members").select("naam").eq("partner_id", eigen.id).ilike("email", email.replace(/([%_\\])/g, "\\$1")).maybeSingle();
      const invoer: Record<string, unknown> = { slug, actie, naam: (lid as any)?.naam ?? "", email };
      if ("keuze" === actie) { invoer.kwartaal = String(body?.kwartaal ?? "").slice(0, 7); invoer.keuze = "verf" === body?.keuze ? "verf" : "geld"; }
      if ("factuur" === actie) { invoer.kwartaal = String(body?.kwartaal ?? "").slice(0, 7); invoer.factuurNr = String(body?.factuurNr ?? "").slice(0, 60); }
      if ("kaarten" === actie) invoer.aantal = Math.max(5, Math.min(200, Number(body?.aantal) || 25));
      r = await fetch(`${WP}/wp-json/roll-partners/v1/partner-actie`, {
        method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": KEY }, body: JSON.stringify(invoer), signal: AbortSignal.timeout(25000),
      });
    }
    const uit = await r.json().catch(() => null);
    if (!r.ok || !uit?.partner) {
      // Een nette melding van roll.nl (al gekozen, nog niet af te rekenen) geven we door; de rest vatten we samen.
      const bekend = [400, 409].includes(r.status) && typeof uit?.message === "string" ? uit.message : null;
      if (!bekend) console.error("partner-dashboard:", actie, r.status, uit?.code ?? "");
      return json({ error: bekend ?? (404 === r.status ? "Dit dashboard bestaat niet (meer)." : "De cijfers van roll.nl ophalen lukte niet. Probeer het over een minuut opnieuw.") }, bekend ? r.status : 404 === r.status ? 404 : 502);
    }
    return json({ partner: voorPartner(uit.partner, eigen?.soort ?? uit.partner.type ?? "overig"), meekijken: !eigen });
  } catch (e) {
    console.error("partner-dashboard:", (e as Error).message);
    return json({ error: "Er ging iets mis. Probeer het over een minuut opnieuw." }, 500);
  }
});
