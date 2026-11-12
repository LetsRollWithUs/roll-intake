// Partners voor het beheer in het dashboard (roll.nl/dashboard/partners). Alleen voor beheerders.
//
// De afspraken en de cijfers van makelaars, creators en merken komen van roll.nl (plugin Roll Partners), waar ze ook
// voor het partnerdashboard worden berekend. Wij voegen er de soort en de mensen uit onze eigen tabellen aan toe.
// Stylistes staan in onze eigen database; die leest het dashboard zelf.
//
// Ook hier: wie er bij een partner in mag (partner_members). Toegang geven stuurt een uitnodiging in Roll-stijl met
// een link om een wachtwoord te kiezen; intrekken haalt het adres van de lijst.
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
const DASHBOARD_BASE = (Deno.env.get("DASHBOARD_BASE_URL") ?? "https://roll.nl/dashboard").replace(/\/$/, "");
const LEES = ["lijst", "detail"];
const LEDEN = ["lid_toevoegen", "lid_uitnodigen", "lid_verwijderen"];

/**
 * Geeft de webshop de lijst van wie er bij een partner hoort. Die is daar nodig omdat bestellingen van de partner
 * zelf geen commissie opleveren.
 */
async function zetLedenDoor(admin: any, slug: string, partnerId: string): Promise<boolean> {
  const { data } = await admin.from("partner_members").select("email").eq("partner_id", partnerId);
  const emails = ((data as any[]) ?? []).map((m) => String(m.email).toLowerCase());
  try {
    const r = await fetch(`${WP}/wp-json/roll-partners/v1/partner-leden`, {
      method: "POST", headers: { "content-type": "application/json", "X-Roll-Advies-Key": KEY }, body: JSON.stringify({ slug, emails }), signal: AbortSignal.timeout(15000),
    });
    if (!r.ok) console.error("partners-beheer: leden doorzetten mislukt", slug, r.status);
    else console.log("partners-beheer: leden doorgezet", slug, emails.length);
    return r.ok;
  } catch (e) {
    console.error("partners-beheer: leden doorzetten", (e as Error).message);
    return false;
  }
}

/** Stuurt de uitnodiging: een eenmalige link om een wachtwoord te kiezen. Maakt het account aan als het er nog niet is. */
async function nodigUit(admin: any, mail: string, naam: string, partner: string): Promise<boolean> {
  let link = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
  if (link.error) {
    const nieuw = await admin.auth.admin.createUser({ email: mail, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
    if (!nieuw.error) link = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
  }
  const code = link.data?.properties?.hashed_token;
  if (link.error || !code) { console.error("partners-beheer: geen link voor de uitnodiging"); return false; }
  const { data: log } = await admin.from("dashboard_mail_log").insert({ email: mail, soort: "uitnodiging" }).select("id").single();
  const r = await fetch(`${WP}/wp-json/roll-partners/v1/dashboard-mail`, {
    method: "POST",
    headers: { "content-type": "application/json", "X-Roll-Advies-Key": KEY },
    body: JSON.stringify({ soort: "uitnodiging", email: mail, voornaam: naam.trim().split(/\s+/)[0] ?? "", partner, link: `${DASHBOARD_BASE}/nieuw-wachtwoord?token_hash=${encodeURIComponent(code)}&type=recovery` }),
    signal: AbortSignal.timeout(15000),
  });
  const uit = await r.json().catch(() => null);
  const verstuurd = r.ok && true === uit?.ok;
  if (!verstuurd) console.error("partners-beheer: uitnodiging versturen mislukt", r.status, uit?.code ?? "");
  if (log?.id) await admin.from("dashboard_mail_log").update({ verstuurd }).eq("id", log.id);
  return verstuurd;
}

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
    if (![...LEES, ...LEDEN].includes(body?.action) || ("lijst" !== body.action && !slug)) return json({ error: "Onbekende actie." }, 400);

    if (LEDEN.includes(body.action)) {
      const mail = String(body?.email ?? "").trim().toLowerCase();
      const naam = String(body?.naam ?? "").trim().slice(0, 80);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 200) return json({ error: "Vul een geldig e-mailadres in." }, 400);
      const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
      const { data: partner } = await admin.from("partners").select("id, naam, actief").eq("slug", slug).maybeSingle();
      if (!partner) return json({ error: "Deze partner staat nog niet in het dashboard." }, 404);
      const { data: alle } = await admin.from("partner_members").select("id, email, naam").eq("partner_id", (partner as any).id);
      const lid = ((alle as any[]) ?? []).find((m) => String(m.email).toLowerCase() === mail) ?? null;

      if ("lid_verwijderen" === body.action) {
        if (lid) await admin.from("partner_members").delete().eq("id", lid.id);
        await zetLedenDoor(admin, slug, (partner as any).id);
        return json({ ok: true });
      }
      if ("lid_toevoegen" === body.action) {
        if (lid) await admin.from("partner_members").update({ naam: naam || lid.naam }).eq("id", lid.id);
        else {
          const { error: fout } = await admin.from("partner_members").insert({ partner_id: (partner as any).id, email: mail, naam: naam || null });
          if (fout) { console.error("partners-beheer: lid toevoegen", fout.message); return json({ error: "Toegang geven lukte niet." }, 500); }
          await zetLedenDoor(admin, slug, (partner as any).id);
        }
      } else if (!lid) return json({ error: "Dit adres heeft nog geen toegang." }, 404);
      // Net al een mail naar dit adres? Een nieuwe link maakt de vorige ongeldig, dus dan sturen we er geen tweede achteraan.
      const { count: net } = await admin.from("dashboard_mail_log").select("id", { count: "exact", head: true })
        .eq("email", mail).eq("verstuurd", true).gte("created_at", new Date(Date.now() - 120_000).toISOString());
      if ((net ?? 0) > 0) return json({ ok: true, verstuurd: true, net: true });
      const verstuurd = await nodigUit(admin, mail, naam || lid?.naam || "", (partner as any).naam);
      return json({ ok: true, verstuurd });
    }

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
    if ("detail" === body.action) {
      const p = verrijk(uit.partner);
      // Loopt de lijst bij de webshop achter (bijvoorbeeld na een storing), dan zetten we hem hier alsnog door.
      if (p.id && Array.isArray(uit.partner.ledenMails)) {
        const hier = (p.leden as any[]).map((m) => String(m.email).toLowerCase()).sort().join(",");
        const daar = (uit.partner.ledenMails as string[]).map((m) => String(m).toLowerCase()).sort().join(",");
        if (hier !== daar) await zetLedenDoor(admin, slug, p.id);
      }
      return json({ partner: p });
    }
    return json({ partners: (uit.partners ?? []).map(verrijk) });
  } catch (e) {
    console.error("partners-beheer:", (e as Error).message);
    return json({ error: "Er ging iets mis bij het ophalen van de partners." }, 500);
  }
});
