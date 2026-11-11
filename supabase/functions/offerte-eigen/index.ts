// Offertes voor eigen klanten van een styliste: zonder Roll-adviesgesprek, boeking of intake.
// De styliste kiest per offerte de verdeling tussen haar commissie en de korting voor de klant. Regels:
// - de klant krijgt nooit meer dan 10% korting; welke verdelingen mogen staat in stylist_offer_settings;
// - had de klant kort geleden een Roll-adviesgesprek, dan is het een Roll-klant: 10% commissie en geen
//   extra korting (alleen de samplekorting van de winkel). Korting kan dan alleen via een aanvraag bij Roll;
// - de korting geldt alleen op verf en andere kortingscodes werken er niet naast (coupon in de offerte-tool).
// De offerte zelf leeft in de offerte-tool op roll.nl; tabel stylist_offers is het overzicht en de bron voor
// de commissie. Alle schrijfacties lopen via deze function (service role), lezen gaat via RLS.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { klaviyoTrack } from "../_shared/klaviyo.ts";
import { normalizeOffer, ROLL_WHATSAPP, type Offer } from "../_shared/voorstel.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API = Deno.env.get("OFFERTE_API_URL") || "https://roll.nl/wp-json/roll-advies/v1/offerte";
const KEY = Deno.env.get("OFFERTE_API_KEY") ?? "";
const WINDOW_DAYS = Number(Deno.env.get("COMMISSION_WINDOW_DAYS") ?? "60");
const ROLL_KLANT_COMMISSIE = 10;
const MAX_KORTING = 10;
const STANDAARD: [number, number][] = [[10, 10], [15, 5], [20, 0]];

const api = (pad: string, init: RequestInit = {}) =>
  fetch(`${API}${pad}`, { ...init, headers: { "content-type": "application/json", "X-Roll-Advies-Key": KEY, ...(init.headers ?? {}) }, signal: AbortSignal.timeout(20_000) });
const eur = (v: number | null | undefined) => (v == null ? null : new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v));
const KOLOMMEN = "id,stylist_id,customer_name,customer_email,customer_phone,offerte_id,nummer,versie,status,commissie_pct,korting_pct,roll_klant,korting_aanvraag,korting_reden,totaal,commissie_basis,klant_url,mand_url,sent_at,sent_via,ordered_at,woo_order_id,created_at,updated_at";

// De toegestane verdelingen [commissie, korting]; korting nooit boven MAX_KORTING.
async function verdelingen(admin: any): Promise<[number, number][]> {
  const { data } = await admin.from("stylist_offer_settings").select("verdelingen").eq("id", true).maybeSingle();
  const ruw = Array.isArray((data as any)?.verdelingen) ? (data as any).verdelingen : STANDAARD;
  const uit = (ruw as unknown[]).filter((p): p is [number, number] => Array.isArray(p) && p.length === 2 && Number.isFinite(Number(p[0])) && Number.isFinite(Number(p[1])))
    .map((p) => [Number(p[0]), Number(p[1])] as [number, number])
    .filter(([c, k]) => k >= 0 && k <= MAX_KORTING && [0, 5, 10].includes(k) && c >= 0 && c <= 20);
  return uit.length ? uit : STANDAARD;
}

// Roll-klant: een bevestigd Roll-adviesgesprek op dit e-mailadres binnen het commissievenster.
async function isRollKlant(admin: any, email: string): Promise<boolean> {
  const since = new Date(Date.now() - WINDOW_DAYS * 864e5).toISOString();
  const { data } = await admin.from("bookings").select("id").ilike("customer_email", email).eq("status", "confirmed").gte("start_at", since).limit(1);
  return ((data as unknown[]) ?? []).length > 0;
}

// Wat we uit de offerte-tool overnemen op de overzichtsrij.
function uitOfferte(o: Offer) {
  return {
    nummer: o.nummer, versie: o.versie ?? 1, totaal: o.totaal, commissie_basis: o.commissieBasis,
    klant_url: o.klantUrl, mand_url: o.mandUrl, updated_at: new Date().toISOString(),
    ...(o.status === "besteld" ? { status: "besteld" } : {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return j({ error: "Alleen POST" }, 405);
  let body: any;
  try { body = await req.json(); } catch { return j({ error: "Ongeldige aanvraag" }, 400); }
  const action = String(body?.action ?? "");

  const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
  const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
  const { data: isAdv } = await caller.rpc("is_advisor");
  if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
  const { data: u } = await caller.auth.getUser();
  const wie = u?.user?.email ?? null;
  const { data: isAdm } = await caller.rpc("is_admin");
  const beheer = isAdm === true;
  if (!KEY) return j({ ok: false, error: "De offerte-tool is niet gekoppeld." });

  // Een bestaande offerte: lezen via RLS (eigen offertes, beheer alles), schrijven via de service role.
  const laad = async (id: unknown) => {
    const { data } = await caller.from("stylist_offers").select(KOLOMMEN).eq("id", String(id ?? "")).maybeSingle();
    return data as any | null;
  };
  const haal = async (offerteId: number): Promise<Offer | null> => {
    const r = await api(`/${offerteId}`);
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return d && d.ok !== false ? normalizeOffer(d) : null;
  };

  try {
    // Nieuwe offerte voor een eigen klant.
    if (action === "nieuw") {
      const naam = String(body.naam ?? "").trim().slice(0, 120);
      const email = String(body.email ?? "").trim().toLowerCase().slice(0, 160);
      const telefoon = String(body.telefoon ?? "").trim().slice(0, 40);
      if (naam.length < 2) return j({ ok: false, error: "Vul de naam van je klant in." });
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return j({ ok: false, error: "Vul een geldig e-mailadres in." });

      // Voor wie: de styliste zelf, of (beheer) een gekozen styliste.
      let stylist: { id: string; name: string } | null = null;
      if (beheer && body.stylist_id) {
        const { data } = await admin.from("stylists").select("id,name").eq("id", String(body.stylist_id)).maybeSingle();
        stylist = (data as any) ?? null;
      } else {
        const { data } = await caller.rpc("current_stylist");
        const s = Array.isArray(data) ? data[0] : data;
        stylist = s?.id ? { id: s.id, name: s.name } : null;
      }
      if (!stylist) return j({ ok: false, error: beheer ? "Kies voor welke styliste deze offerte is." : "Je account is nog niet gekoppeld aan een styliste." });

      const rollKlant = await isRollKlant(admin, email);
      const toegestaan = await verdelingen(admin);
      let commissie = ROLL_KLANT_COMMISSIE, korting = 0;
      if (!rollKlant) {
        const gevraagd = Number(body.korting_pct);
        const paar = toegestaan.find(([, k]) => k === gevraagd) ?? toegestaan[0];
        [commissie, korting] = paar;
      }

      const { data: rij, error } = await admin.from("stylist_offers").insert({
        stylist_id: stylist.id, customer_name: naam, customer_email: email, customer_phone: telefoon || null,
        commissie_pct: commissie, korting_pct: korting, roll_klant: rollKlant, created_by: wie,
      }).select(KOLOMMEN).single();
      if (error || !rij) return j({ ok: false, error: "Opslaan lukte niet." });

      const [voornaam, ...rest] = naam.split(/\s+/);
      const sleutel = `eigen-${(rij as any).id}`;
      const r = await api("", {
        method: "POST",
        body: JSON.stringify({
          status: "concept", titel: naam, bron: "styliste-eigen", intake_id: sleutel, project: { surfaces: [] },
          klant: { voornaam, achternaam: rest.join(" "), email, telefoon },
          kenmerk: { intake_id: sleutel, styliste_id: stylist.id, styliste_naam: stylist.name, eigen_klant: true, commissie_pct: commissie, roll_klant: rollKlant },
          ...(korting > 0 ? { korting: { type: "styliste", pct: korting } } : {}),
        }),
      });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d?.id) {
        await admin.from("stylist_offers").delete().eq("id", (rij as any).id);
        return j({ ok: false, error: `De offerte-tool gaf ${r.status}${d?.message ? `: ${d.message}` : ""}.` });
      }
      const o = normalizeOffer(d);
      // De offerte-tool kent de korting alleen als de bijbehorende coupon bestaat; anders eerlijk terugzetten.
      const echteKorting = o.kortingPct ?? 0;
      const { data: bij } = await admin.from("stylist_offers").update({ offerte_id: o.id, ...uitOfferte(o), korting_pct: echteKorting }).eq("id", (rij as any).id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij, roll_klant: rollKlant, korting_niet_beschikbaar: korting > 0 && echteKorting !== korting });
    }

    // Beheer: een aangevraagde korting toekennen (5 of 10) of afwijzen. De commissie blijft zoals hij was.
    // Werkt voor een offerte van een eigen klant (taak met offer_id) en voor een verfplan uit het
    // Roll-advies (taak met intake_id): daar komt de korting in de plaats van de samplekorting.
    if (action === "korting_besluit") {
      if (!beheer) return j({ error: "Alleen beheer" }, 403);
      const pct = Number(body.pct);
      if (![0, 5, 10].includes(pct)) return j({ ok: false, error: "Kies 5 of 10 procent, of wijs af." });
      const { data: taak } = await admin.from("roll_tasks").select("id,type,intake_id,offer_id").eq("id", String(body.task_id ?? "")).maybeSingle();
      const t = taak as any;
      if (!t || t.type !== "korting") return j({ error: "Taak niet gevonden" }, 404);
      const nu = new Date().toISOString();
      const eigen = t.offer_id ? ((await admin.from("stylist_offers").select(KOLOMMEN).eq("id", t.offer_id).maybeSingle()).data as any) : null;
      const intake = !eigen && t.intake_id ? ((await admin.from("intake").select("id,offer_meta").eq("id", t.intake_id).maybeSingle()).data as any) : null;
      const offerteId = Number(eigen?.offerte_id ?? intake?.offer_meta?.id ?? 0);
      if (pct > 0 && !offerteId) return j({ ok: false, error: "Er is nog geen offerte om de korting op te zetten. Laat de styliste eerst het verfplan maken." });
      let o: Offer | null = null;
      if (pct > 0) {
        const r = await api(`/${offerteId}/korting`, { method: "POST", body: JSON.stringify({ pct, label: "Jouw korting", ...(eigen ? { commissie_pct: eigen.commissie_pct } : {}) }) });
        const d = await r.json().catch(() => null);
        if (!r.ok || !d) return j({ ok: false, error: d?.message ?? `De offerte-tool gaf ${r.status}.` });
        o = normalizeOffer(d);
        if ((o.kortingPct ?? 0) !== pct) return j({ ok: false, error: "De korting kon niet op de offerte worden gezet." });
      }
      if (eigen) {
        await admin.from("stylist_offers").update({ ...(o ? { ...uitOfferte(o), korting_pct: o.kortingPct ?? 0 } : { updated_at: nu }), korting_aanvraag: pct > 0 ? "toegekend" : "afgewezen" }).eq("id", eigen.id);
      } else if (intake && o) {
        await admin.from("intake").update({ offer_meta: { ...(intake.offer_meta ?? {}), offer: o }, offer_total: o.totaal }).eq("id", intake.id);
      }
      await admin.from("roll_tasks").update({ status: "afgerond", owner: wie, updated_at: nu, result: { note: pct > 0 ? `${pct}% korting toegekend` : "Korting afgewezen" } }).eq("id", t.id);
      return j({ ok: true, pct });
    }

    const rij = await laad(body.id);
    if (!rij) return j({ error: "Offerte niet gevonden" }, 404);
    if (!rij.offerte_id) return j({ ok: false, error: "Deze offerte is niet goed aangemaakt. Maak een nieuwe." });

    // Bewerklink voor de editor in het dashboard.
    if (action === "editlink") {
      const r = await api(`/${rij.offerte_id}/editlink`, { method: "POST", body: JSON.stringify({ rol: beheer ? "roll" : "styliste", uren: 8, modus: "offerte" }) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d?.url) return j({ ok: false, error: `De offerte-tool gaf ${r.status}.` });
      return j({ ok: true, url: d.url, rol: d.rol ?? null, verloopt: d.verloopt ?? null });
    }

    // Stand ophalen uit de offerte-tool (totaal, status, links).
    if (action === "ververs") {
      const o = await haal(Number(rij.offerte_id));
      if (!o) return j({ ok: false, error: "De offerte kon niet worden opgehaald." });
      const { data: bij } = await admin.from("stylist_offers").update(uitOfferte(o)).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij, offer: o });
    }

    // "Nieuwe versie maken" in de editor: het nieuwe offerte-id aan deze rij koppelen.
    if (action === "koppel") {
      const nid = Number(body.offerte_id);
      if (!nid) return j({ ok: false, error: "Geen offerte opgegeven." });
      const o = await haal(nid);
      if (!o || o.intakeId !== `eigen-${rij.id}`) return j({ ok: false, error: "Die offerte hoort niet bij deze klant." });
      const { data: bij } = await admin.from("stylist_offers").update({ offerte_id: o.id, ...uitOfferte(o), status: o.status === "besteld" ? "besteld" : "concept", sent_at: null, sent_via: null }).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij, offer: o });
    }

    // Verdeling kiezen (commissie en korting voor de klant).
    if (action === "verdeling") {
      if (rij.status === "besteld") return j({ ok: false, error: "Deze offerte is al besteld." });
      if (rij.roll_klant) return j({ ok: false, error: "Dit is een Roll-klant: 10% commissie, geen extra korting. Vraag zo nodig korting aan bij Roll." });
      const toegestaan = await verdelingen(admin);
      const paar = toegestaan.find(([, k]) => k === Number(body.korting_pct));
      if (!paar) return j({ ok: false, error: "Deze verdeling kan niet." });
      const [commissie, korting] = paar;
      const r = await api(`/${rij.offerte_id}/korting`, { method: "POST", body: JSON.stringify({ pct: korting, commissie_pct: commissie }) });
      const d = await r.json().catch(() => null);
      if (!r.ok || !d) return j({ ok: false, error: d?.message ?? `De offerte-tool gaf ${r.status}.` });
      const o = normalizeOffer(d);
      const { data: bij } = await admin.from("stylist_offers").update({ ...uitOfferte(o), commissie_pct: commissie, korting_pct: o.kortingPct ?? 0 }).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij, offer: o });
    }

    // Versturen: per mail (verfplan-mail) of alleen de link, om zelf te delen.
    if (action === "versturen") {
      const via = body.via === "link" ? "link" : "mail";
      const o = await haal(Number(rij.offerte_id));
      if (!o) return j({ ok: false, error: "De offerte kon niet worden opgehaald." });
      if (!o.regels.length) return j({ ok: false, error: "Er staat nog niets in de offerte. Vul eerst de ruimtes en kleuren in." });
      if (o.kleurenOnbekend.length) return j({ ok: false, error: `Deze kleuren kennen we niet: ${o.kleurenOnbekend.join(", ")}.` });
      try { await api(`/${rij.offerte_id}/verstuurd`, { method: "POST", body: JSON.stringify({ verstuurd_door: wie }) }); } catch { /* status in de offerte-tool is niet kritiek */ }
      const { data: st } = await admin.from("stylists").select("name").eq("id", rij.stylist_id).maybeSingle();
      const stylistName = (st as any)?.name ?? null;
      if (via === "mail") {
        const metFmt = <T extends { totaal?: number }>(xs: T[]) => xs.map((x) => ({ ...x, totaal_fmt: eur(x.totaal ?? null) }));
        const props = {
          stap: "offerte_verstuurd", eigen_klant: true, intake_id: null, booking_id: null, stylist_name: stylistName,
          afzender: stylistName ?? "Roll",
          offerte_nummer: o.nummer, klant_url: o.klantUrl, mand_url: o.mandUrl,
          regels: metFmt(o.regels), tools: metFmt(o.tools.filter((t) => t.inMandje !== false)), tools_los: metFmt(o.tools.filter((t) => t.inMandje === false)),
          subtotaal: o.subtotaal, subtotaal_fmt: eur(o.subtotaal),
          korting: o.korting ? { ...o.korting, bedrag_fmt: eur(o.korting.bedrag) } : null,
          extra: o.extra.map((e) => ({ ...e, bedrag_fmt: e.bedrag ? eur(e.bedrag) : null })),
          verzending: o.verzending, verzending_fmt: o.verzending ? eur(o.verzending) : "gratis",
          totaal: o.totaal, totaal_fmt: eur(o.totaal),
          kleuren: [...new Map(o.regels.filter((l) => l.kleurNaam).map((l) => [l.kleurNaam, { naam: l.kleurNaam, hex: l.kleurHex ?? null }])).values()],
          whatsapp: ROLL_WHATSAPP,
        };
        const r = await klaviyoTrack("Advies flow", { email: rij.customer_email, first_name: rij.customer_name ?? undefined }, props, {}, `${rij.id}:offerte:${rij.offerte_id}:${Date.now()}`, admin);
        if (!r.ok) return j({ ok: false, error: "De mail kon niet worden gestart." });
      }
      const nu = new Date().toISOString();
      const { data: bij } = await admin.from("stylist_offers").update({ ...uitOfferte(o), status: o.status === "besteld" ? "besteld" : "verstuurd", sent_at: nu, sent_via: via }).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij, klant_url: o.klantUrl });
    }

    // Uitzondering: korting aanvragen bij Roll, met reden. Roll kent tot 10% toe.
    if (action === "korting_aanvragen") {
      const reden = String(body.reden ?? "").trim().slice(0, 600);
      if (reden.length < 10) return j({ ok: false, error: "Leg kort uit waarom deze klant korting nodig heeft." });
      if (rij.status === "besteld") return j({ ok: false, error: "Deze offerte is al besteld." });
      if (rij.korting_aanvraag === "aangevraagd") return j({ ok: false, error: "Je aanvraag loopt al." });
      const { error } = await admin.from("roll_tasks").insert({
        type: "korting", stylist_id: rij.stylist_id, offer_id: rij.id, requested_by: wie ?? "styliste", due_date: new Date().toISOString().slice(0, 10),
        payload: { rooms: [], planning: "", notes: `Korting gevraagd voor ${rij.customer_name} (offerte ${rij.nummer ?? ""}, totaal ${eur(rij.totaal) ?? "onbekend"}). Reden: ${reden}`, klant_naam: rij.customer_name },
      });
      if (error) return j({ ok: false, error: "De aanvraag kon niet worden opgeslagen." });
      const { data: bij } = await admin.from("stylist_offers").update({ korting_aanvraag: "aangevraagd", korting_reden: reden, updated_at: new Date().toISOString() }).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij });
    }

    // Concept laten vervallen (de offerte in de offerte-tool blijft bestaan als archief).
    if (action === "vervallen") {
      if (rij.status === "besteld") return j({ ok: false, error: "Een bestelde offerte kan niet vervallen." });
      const { data: bij } = await admin.from("stylist_offers").update({ status: "vervallen", updated_at: new Date().toISOString() }).eq("id", rij.id).select(KOLOMMEN).single();
      return j({ ok: true, offerte: bij });
    }

    return j({ error: "Onbekende actie" }, 400);
  } catch (e) {
    return j({ ok: false, error: "Er ging iets mis. Probeer het opnieuw.", detail: String((e as Error)?.message ?? e).slice(0, 200) });
  }
});
