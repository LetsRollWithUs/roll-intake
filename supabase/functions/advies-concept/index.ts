// Conceptvoorbereiding op basis van de intake (werkplek fase 5). Alleen adviseurs.
// Levert een CONCEPT: samenvatting van de hulpvraag, ontbrekende informatie + vragen voor het
// gesprek, 2-3 kleurrichtingen uitsluitend uit de Roll-collectie, en aandachtspunten voor samples.
// Nooit definitief advies en nooit een klantmail: de styliste neemt over, past aan of verwerpt.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { ROLL_COLORS, ROLL_PACKS } from "../_shared/roll-collection.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-5";

const SYSTEM = `Je bent de voorbereidingsassistent van Roll, een Nederlands verfmerk. Je helpt een kleuradviseur (styliste) een online kleuradvies van 30 minuten voor te bereiden op basis van de intake die de klant invulde.

Regels:
- Gebruik UITSLUITEND kleuren uit de meegeleverde Roll-collectie. Verwijs altijd met het exacte "id" en de "name". Verzin geen kleuren.
- Dit is een CONCEPT ter ondersteuning, geen definitief advies. Wees concreet maar bescheiden: benoem waarop een suggestie is gebaseerd en wat nog ontbreekt.
- Lichtinval, gebruiksmoment, vloer/meubels, gewenste sfeer en wat de klant al testte wegen mee. Ontbreekt informatie die het advies echt beïnvloedt (foto's, lichtinval, vloer/meubels, planning), zeg dat expliciet en formuleer een gerichte vraag voor het gesprek.
- Schrijf in het Nederlands, kort en praktisch, in de toon van een collega. Geen verkooppraat, geen streepjes als opsomming in lopende tekst.
- Antwoord ALLEEN met geldige JSON volgens dit schema, zonder toelichting eromheen:
{
  "samenvatting": "2-3 zinnen: wat wil de klant, wat is de kern van de vraag",
  "ontbreekt": ["korte punten van ontbrekende informatie"],
  "vragen": ["gerichte vragen om in het gesprek te stellen"],
  "richtingen": [
    { "titel": "korte naam van de richting", "kleuren": [{ "id": "roll-kleur-id", "naam": "Kleurnaam", "toepassing": "bijv. alle muren / accentwand / plafond" }], "waarom": "1-3 zinnen waarom dit past", "gebaseerd_op": "welke intake-gegevens dit onderbouwen" }
  ],
  "samples_aandacht": ["waar de klant op moet letten bij het beoordelen van samples"]
}
Geef 2 of 3 richtingen, elk met 1 tot 3 kleuren.`;

function intakeText(it: any): string {
  const rooms = (it.rooms ?? []).map((r: any) => {
    const bits = [
      r.label,
      (r.surfaces ?? []).length ? `oppervlakken: ${(r.surfaces ?? []).join(", ")}` : "oppervlakken onbekend",
      r.noWindows ? "geen ramen" : (r.sun ?? []).length ? `zon: ${(r.sun ?? []).join(", ")}` : "lichtinval onbekend",
      r.skylight ? "dakraam" : "",
      r.usage ? `gebruik: ${r.usage}` : "",
      r.otherChanges ? `verandert: ${r.otherChangesNote || "ja"}` : "",
      `${(r.photos ?? []).length} foto('s)`,
    ].filter(Boolean);
    return `- ${bits.join(" · ")}`;
  }).join("\n");
  const colors = (it.colors ?? []).map((c: any) => `${c.name} (${c.rollId ?? "?"})`).join(", ");
  const samples = (it.samples ?? []).map((s: any) => `${[s.brand, s.name].filter(Boolean).join(" ")}${s.verdict ? ` [${s.verdict}]` : ""}${s.note ? ` "${s.note}"` : ""}`).join("; ");
  return [
    `Hulpvraag: ${it.main_question || "(niet ingevuld)"}`,
    (it.help_needs ?? []).length ? `Hulp bij: ${(it.help_needs ?? []).join(", ")}` : "",
    `Ruimtes:\n${rooms || "- (geen)"}`,
    `Gewenst gevoel: ${(it.moods ?? []).join(", ") || "onbekend"}${it.boldness ? ` · durf ${it.boldness}/5` : ""}`,
    `Overwogen Roll-kleuren: ${colors || "geen"}`,
    `Samples: ${it.has_samples ?? "onbekend"}${samples ? ` · getest: ${samples}` : ""}`,
    it.inspiration_note ? `Inspiratie-notitie: ${it.inspiration_note}` : "",
    `Planning: ${it.planning ?? "onbekend"} · wie schildert: ${it.painter ?? "onbekend"}`,
  ].filter(Boolean).join("\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const intakeId = String(body.intake_id ?? "");
    if (!intakeId) return j({ error: "intake_id vereist" }, 400);
    const caller = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } }, auth: { persistSession: false } });
    const { data: isAdv } = await caller.rpc("is_advisor");
    if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
    if (!API_KEY || API_KEY.includes("...")) return j({ error: "ANTHROPIC_API_KEY ontbreekt of is een placeholder. Zet de echte key als Supabase-secret." }, 500);

    const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
    const { data: it } = await admin.from("intake")
      .select("id,main_question,help_needs,rooms,colors,samples,has_samples,moods,boldness,inspiration_note,planning,painter,advice_concept,advice_concept_at")
      .eq("id", intakeId).maybeSingle();
    if (!it) return j({ error: "Intake niet gevonden" }, 404);
    if (it.advice_concept && !body.force) return j({ ok: true, cached: true, concept: it.advice_concept, at: it.advice_concept_at });

    const collection = ROLL_COLORS.map((c) => ({ id: c.id, name: c.name, family: c.family, light: c.light, undertone: c.undertone, temp: c.temp, chroma: c.chroma, neutral: c.neutral, lrv: c.lrv }));
    const user = `INTAKE VAN DE KLANT\n${intakeText(it)}\n\nROLL-COLLECTIE (JSON)\n${JSON.stringify(collection)}\n\nBUNDELS (samplepacks)\n${JSON.stringify(ROLL_PACKS)}`;

    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: MODEL, max_tokens: 1800, temperature: 0.4, system: SYSTEM, messages: [{ role: "user", content: user }] }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 401) return j({ error: "API-key ongeldig (401). Zet de echte ANTHROPIC_API_KEY als Supabase-secret." }, 502);
      return j({ error: `Model-aanroep mislukte (${res.status})`, detail: t.slice(0, 300) }, 502);
    }
    const out = await res.json();
    const text: string = (out.content ?? []).map((c: any) => c.text ?? "").join("");
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
    let concept: any;
    try { concept = JSON.parse(cleaned); } catch { return j({ error: "Het model gaf geen geldige JSON terug.", detail: cleaned.slice(0, 300) }, 502); }

    // Alleen echte Roll-kleuren toestaan; onbekende id's vervallen.
    const valid = new Set(ROLL_COLORS.map((c) => c.id));
    const nameOf = new Map(ROLL_COLORS.map((c) => [c.id, c.name]));
    concept.richtingen = (Array.isArray(concept.richtingen) ? concept.richtingen : []).slice(0, 3).map((r: any) => ({
      titel: String(r.titel ?? ""), waarom: String(r.waarom ?? ""), gebaseerd_op: String(r.gebaseerd_op ?? ""),
      kleuren: (Array.isArray(r.kleuren) ? r.kleuren : []).filter((k: any) => valid.has(String(k.id))).slice(0, 3)
        .map((k: any) => ({ id: String(k.id), naam: nameOf.get(String(k.id)) ?? String(k.naam ?? ""), toepassing: String(k.toepassing ?? "") })),
    })).filter((r: any) => r.kleuren.length > 0);
    concept.samenvatting = String(concept.samenvatting ?? "");
    concept.ontbreekt = Array.isArray(concept.ontbreekt) ? concept.ontbreekt.map(String) : [];
    concept.vragen = Array.isArray(concept.vragen) ? concept.vragen.map(String) : [];
    concept.samples_aandacht = Array.isArray(concept.samples_aandacht) ? concept.samples_aandacht.map(String) : [];
    concept.model = MODEL;

    const at = new Date().toISOString();
    await admin.from("intake").update({ advice_concept: concept, advice_concept_at: at }).eq("id", intakeId);
    return j({ ok: true, cached: false, concept, at, usage: out.usage ?? null });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
