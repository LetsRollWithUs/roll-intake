// Toegang tot het dashboard (roll.nl/dashboard): de eigen wachtwoordmail.
//
// "Wachtwoord vergeten" stuurt niet de standaardmail van het loginsysteem, maar een mail in Roll-stijl via roll.nl.
// De link bevat een eenmalige code (token_hash) en wijst altijd naar ons eigen dashboard; hij hangt dus niet af van
// de toegestane adressen in het loginsysteem. De code wordt pas verbruikt als iemand zijn nieuwe wachtwoord opslaat.
//
// Zonder login aan te roepen. Het antwoord is altijd hetzelfde, of het adres nu bekend is of niet.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

const DASHBOARD_BASE = (Deno.env.get("DASHBOARD_BASE_URL") ?? "https://roll.nl/dashboard").replace(/\/$/, "");
// Zelfde site en sleutel als de offertekoppeling (X-Roll-Advies-Key).
const WP = new URL(Deno.env.get("OFFERTE_API_URL") || "https://roll.nl/wp-json/roll-advies/v1/offerte").origin;
const KEY = Deno.env.get("OFFERTE_API_KEY") ?? "";
const PER_ADRES = 3, IN_TOTAAL = 120; // per uur

const voornaam = (naam: unknown) => String(naam ?? "").trim().split(/\s+/)[0] ?? "";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Alleen POST." }, 405);
  let body: any = {};
  try { body = await req.json(); } catch { /* leeg */ }
  if ("wachtwoord" !== body?.action) return json({ error: "Onbekende actie." }, 400);
  const mail = String(body?.email ?? "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail) || mail.length > 200) return json({ error: "Vul een geldig e-mailadres in." }, 400);

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const klaar = json({ ok: true });

  // Begrenzing: hooguit een paar mails per adres per uur, en een plafond voor alles samen.
  const sinds = new Date(Date.now() - 3600_000).toISOString();
  const [{ count: perAdres }, { count: totaal }] = await Promise.all([
    admin.from("dashboard_mail_log").select("id", { count: "exact", head: true }).eq("email", mail).gte("created_at", sinds),
    admin.from("dashboard_mail_log").select("id", { count: "exact", head: true }).gte("created_at", sinds),
  ]);
  if ((perAdres ?? 0) >= PER_ADRES || (totaal ?? 0) >= IN_TOTAAL) {
    console.warn("dashboard-toegang: begrensd", { perAdres, totaal });
    return klaar;
  }
  // Net al een mail gestuurd naar dit adres? Dan geen nieuwe: een nieuwe link maakt de vorige ongeldig, en wie twee
  // keer klikt opent dan vaak de eerste mail en ziet "link verlopen" (gezien op 12 nov 2026).
  const { count: net } = await admin.from("dashboard_mail_log").select("id", { count: "exact", head: true })
    .eq("email", mail).eq("verstuurd", true).gte("created_at", new Date(Date.now() - 120_000).toISOString());
  if ((net ?? 0) > 0) return klaar;
  // Het logboek is alleen voor de begrenzing: na een week gaan de regels weg.
  await admin.from("dashboard_mail_log").delete().lt("created_at", new Date(Date.now() - 7 * 86400_000).toISOString());
  const { data: log } = await admin.from("dashboard_mail_log").insert({ email: mail, soort: "wachtwoord" }).select("id").single();

  try {
    const { data: lijst } = await admin.rpc("dashboard_toegang_voor", { p_email: mail });
    const opLijst = !!(lijst?.team || lijst?.partner);
    const naam = voornaam(lijst?.team?.naam ?? lijst?.partner?.naam);

    // De eenmalige code. Bestaat het account nog niet en staat het adres op een lijst, dan maken we het eerst aan:
    // zo werkt "Wachtwoord vergeten" ook als eerste keer inloggen.
    let link = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
    if (link.error && opLijst) {
      const nieuw = await admin.auth.admin.createUser({ email: mail, email_confirm: true, password: crypto.randomUUID() + crypto.randomUUID() });
      if (!nieuw.error) link = await admin.auth.admin.generateLink({ type: "recovery", email: mail });
    }
    const code = link.data?.properties?.hashed_token;
    if (link.error || !code) return klaar; // onbekend adres: zelfde antwoord, geen mail

    if (!KEY) { console.error("dashboard-toegang: OFFERTE_API_KEY ontbreekt, mail niet verstuurd"); return klaar; }
    const r = await fetch(`${WP}/wp-json/roll-partners/v1/dashboard-mail`, {
      method: "POST",
      headers: { "content-type": "application/json", "X-Roll-Advies-Key": KEY },
      body: JSON.stringify({ soort: "wachtwoord", email: mail, voornaam: naam, link: `${DASHBOARD_BASE}/nieuw-wachtwoord?token_hash=${encodeURIComponent(code)}&type=recovery` }),
      signal: AbortSignal.timeout(15000),
    });
    const uit = await r.json().catch(() => null);
    const verstuurd = r.ok && true === uit?.ok;
    if (!verstuurd) console.error("dashboard-toegang: versturen mislukt", r.status, uit?.code ?? "");
    if (log?.id) await admin.from("dashboard_mail_log").update({ verstuurd }).eq("id", log.id);
  } catch (e) {
    console.error("dashboard-toegang:", (e as Error).message);
  }
  return klaar;
});
