// Jouw schilderplan: de chat in de Projecthulp (fase 1, verborgen achter ?chat=1 op roll.nl/kleurplan).
//
// Volgorde per beurt (zoals in het plan): bericht -> voorstel van het model (werk_bij) -> controle en
// vastleggen in een nieuwe projectversie (projectmodel v2) -> berekening door de rekenkern op roll.nl -> pas dan
// schrijft het model zijn antwoord (tool antwoord). Getallen, producten en prijzen toont de browser uit de berekening.
//
// POST { sessie, aanvraagId, bericht? , tik? }  -> { antwoord, project, status, pakket, mens, versie }
//   met stroom: true -> text/event-stream: "tekst" (stukjes antwoord), "opnieuw" (tekst vervalt), "klaar" (zelfde JSON)
// POST { sessie, aanvraagId, formulier: { soort, ruimte?, waarden } } -> zelfde als een beurt; meestal zonder model
// POST { sessie, overdracht: 'whatsapp'|'mail' } -> { code, tekst }
// GET  ?sessie=...                              -> de laatste stand (terugkomen)
// GET  ?sessie=...&kort=1                       -> { bestaat, ruimtes } (voor de mail op roll.nl)
// GET  ?deel=<code>                             -> alleen-lezen: plan en pakket, zonder gesprek
// POST { sessie, bewaard: { email? } }          -> plan is bewaard (mail of gekopieerde link)
// POST { sessie, deel: true }                   -> { code } voor de deellink
// POST { sessie: <nieuw>, kopie: <deelcode> }   -> een eigen kopie van een gedeeld plan
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { RUIMTE_NAMEN, VLOER, isLak, nieuwProject, naarRekenkern, projectStatus, telt, toepassen, w } from "../_shared/projectmodel/index.js";
import PRODUCTINFO from "../_shared/projectmodel/productinfo.json" with { type: "json" };
import PACKS from "../_shared/projectmodel/packs.json" with { type: "json" };
import VOORWAARDEN from "../_shared/projectmodel/voorwaarden.json" with { type: "json" };

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const j = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const MODEL = Deno.env.get("PROJECTHULP_MODEL") ?? "claude-sonnet-5-5";
const ROLL = "https://roll.nl";
const ENGINE = `${SB_URL}/functions/v1/advies-engine`;
const MAX_BERICHTEN = 40;
const MAX_TEKENS = 1000;
const MAX_STAPPEN = 6;
// Alleen voor het vergelijken van modellen in de testset; geen geheim, wel lastig te raden. Haal weg na de keuze.
const TEST_TOKEN = "vergelijk-7d3f9a";

const db = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
const claude = new Anthropic({ apiKey: Deno.env.get("ANTHROPIC_API_KEY") ?? "" });

/* ---------- kleurdata van roll.nl (een uur in het geheugen) ---------- */

type Kleur = { n: string; h: string; d?: string; i?: string; u?: string; c?: string[] };
let INDEX: { c: Kleur[]; f: { s: string; n: string }[] } | null = null;
let INDEX_OP = 0;
async function index() {
  if (!INDEX || Date.now() - INDEX_OP > 3600_000) {
    INDEX = await (await fetch(`${ROLL}/wp-json/roll/v1/search-index`)).json();
    INDEX_OP = Date.now();
  }
  return INDEX!;
}
const lichtheid = (hex: string) => {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex || "");
  return m ? (0.299 * parseInt(m[1], 16) + 0.587 * parseInt(m[2], 16) + 0.114 * parseInt(m[3], 16)) / 255 : 0.5;
};
const kaart = (k: Kleur) => ({ naam: k.n, omschrijving: k.d ?? "", hex: k.h, afb: k.i ?? "", url: k.u ?? "" });

/* ---------- tools ---------- */

const TOOLS: any[] = [
  {
    name: "werk_bij",
    description: "Leg alles vast wat de klant zegt, als korte regels (zie OPDRACHTEN in de instructies). De server controleert en legt vast; je krijgt de nieuwe stand terug als er iets niet lukte.",
    input_schema: { type: "object", properties: { regels: { type: "array", items: { type: "string" } } }, required: ["regels"] },
  },
  {
    name: "zoek_kleur",
    description: "Zet een kleurnaam, RAL-code of kleur van een ander merk om naar een Roll-kleur. Altijd gebruiken voor je een genoemde kleur vastlegt.",
    input_schema: { type: "object", properties: { zoekterm: { type: "string" } }, required: ["zoekterm"] },
  },
  {
    name: "stel_kleuren_voor",
    description: "Drie of vier passende Roll-kleuren bij een kleurrichting. Toon ze daarna als kaarten via antwoord.kaarten.",
    input_schema: {
      type: "object",
      properties: {
        familie: { type: "string", description: "wit, beige, greige, bruin, roze, blauw, blauwgroen, groen, paars, oranje, rood, geel, grijs, zwart" },
        lichtheid: { type: "string", enum: ["licht", "midden", "donker", "maakt niet uit"] },
      },
      required: ["familie"],
    },
  },
  {
    name: "kleurhulp",
    description: "De korte kleurhulp (zelfde vragen als de kleurenscan). Zonder antwoorden: de vragen met hun keuzes. Met antwoorden: drie kleuren met waarom en het passende sample pack.",
    input_schema: {
      type: "object",
      properties: { ruimte: { type: "string" }, antwoorden: { type: "object", description: "Vraag-ID naar gekozen waarde(n)." } },
      required: ["ruimte"],
    },
  },
  {
    name: "productinfo",
    description: "Gecontroleerde productinformatie (droogtijd, voorbereiding, geschiktheid, lagen). Antwoord alleen hieruit.",
    input_schema: { type: "object", properties: { onderwerp: { type: "string", enum: ["muurverf", "voorstrijk", "renovlies", "primer", "lak"] } }, required: ["onderwerp"] },
  },
  {
    name: "voorwaarden",
    description: "Retour en verzending. Noem nooit voorwaarden die hier niet staan.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "antwoord",
    description: "Je antwoord aan de klant. Sluit elke beurt hiermee af.",
    // De tekst gaat woord voor woord naar de klant; daarom niet wachten tot de hele invoer klaar is.
    eager_input_streaming: true,
    input_schema: {
      type: "object",
      properties: {
        tekst: { type: "string", description: "Kort, je-vorm, hooguit drie zinnen voor de vraag. Geen liters of bedragen." },
        vraag: { type: "string", enum: ["ondergrond", "plafond", "spullen", "maat", "kleurroute", "geen-idee", "wanneer", "volgorde", "onderdelen", "lak", "eigen", "geen"], description: "Soort vraag; de server zet de passende chips of het formulier erbij (maat, ondergrond, onderdelen, lak). Bij eigen: geef chips mee." },
        chips: { type: "array", items: { type: "string" } },
        kaarten: { type: "array", items: { type: "string" }, description: "Namen van Roll-kleuren om als kaart te tonen." },
        voor: { type: "string", description: "Voor welk onderdeel de kaarten zijn, als pad: woonkamer.muren of slaapkamer2.plafond." },
        aannames: { type: "array", items: { type: "string" }, description: "Aannames die je in de tekst noemt, als pad: woonkamer.hoogte of woonkamer.muren.afwerking." },
        actie: { type: "string", enum: ["geen", "samples", "bestellen", "bewaren", "stappen", "overdracht", "kleuradvies"] },
      },
      required: ["tekst", "vraag"],
    },
  },
];

const SYSTEEM = `Je bent Roll, het Nederlandse verfmerk, en je helpt een klant in de Projecthulp met zijn schilderplan: welke kleur waar, wat er eerst moet, wat hij nodig heeft en wat de volgende stap is. Je hebt geen eigen naam; je praat als Roll ("we").

DOEL: de klant eindigt met een passend plan, vertrouwen in het resultaat en een duidelijke volgende stap. Elke vraag moet bijdragen aan een mooier resultaat, minder gedoe of een betere aankoop.

SCOPE VAN DEZE VERSIE: binnenruimtes (muren, plafond, accentmuur) en lakwerk: deuren, kozijnen, plinten, lambrisering en radiatoren binnen, en deuren en kozijnen buiten; meerdere ruimtes mag. Noemt de klant trappen, meubels of buitenmuren: zeg vriendelijk dat deze versie daar nog niet bij helpt en zet actie "stappen" (de gewone Projecthulp) of "overdracht".

FORMULIEREN: bij vraag "maat", "ondergrond", "onderdelen" of "lak" toont de server een kort formulier in de chat; vraag in je tekst dus kort en noem de keuzes niet zelf op. "onderdelen" = welke onderdelen per ruimte meegaan (muren, plafond, lakwerk); "lak" = aantallen, staat en glans van het lakwerk. Na een formulier krijg je de nieuwe stand; vraag wat er dan nog ontbreekt.

ZO WERK JE ELKE BEURT
1. Heb je eerst informatie nodig (zoek_kleur, stel_kleuren_voor, kleurhulp, productinfo, voorwaarden), vraag die dan eerst op.
2. Daarna in EEN bericht: EERST antwoord (de klant ziet je tekst meteen verschijnen), DAN werk_bij met alles wat de klant zei, in korte regels (zie OPDRACHTEN). Een Roll-kleur of RAL-code mag je direct vastleggen; de server zoekt hem op. Gebruik zoek_kleur alleen bij een kleur van een ander merk of als je twijfelt aan de naam. De server verwerkt de regels voor hij je antwoord toont; lukt iets niet, dan krijg je de stand terug en schrijf je opnieuw. Kies de volgende vraag op basis van de projectstand. Stel nooit een vraag waarvan je het antwoord al weet. Houd alles kort: geen uitleg in de tools en geen tekst buiten de tools; de klant ziet alleen antwoord.
3. Is iets dubbelzinnig en verandert het het pakket wezenlijk: leg het niet vast maar vraag het (vraag "eigen" met chips).

OPDRACHTEN (een per regel; ruimte-ID = het type, met een cijfer bij een tweede: woonkamer, slaapkamer2; vlakken: muren, plafond, accent; een nieuwe ruimte heeft al muren):
ruimte woonkamer            | ruimte- keuken
vlak woonkamer plafond      | vlak- woonkamer plafond   (lakwerk: vlak woonkamer deuren; ook kozijnen, plinten, lambrisering, radiatoren)
woonkamer.deuren aantal 3   | woonkamer.deuren glans zijdeglans (mat/zijdeglans/hoogglans; buiten nooit mat)
lakwerk buiten: ruimte anders "Lakwerk buiten" | anders buiten ja | vlak- anders muren | vlak anders deuren
woonkamer maat 5x4          | woonkamer grootte middel (klein/middel/groot) | woonkamer hoogte 2.8
woonkamer.muren afwerking muurverf   (velden: materiaal stucwerk/gipsplaat/beton/onbekend, afwerking geen/muurverf/behang/onbekend, kleurNu licht/midden/donker/onbekend, structuur glad/structuur/onbekend, conditie goed/scheurtjes/scheuren/bladdert/vocht/onbekend)
woonkamer.accent breedte 4
woonkamer.muren kies Sage Blink      (ook: kandidaat, favoriet, afwijzen; richting licht beige; open)
sample Sand Salute | spullen niets (niets/deel/alles/schilder) | wanneer weken (week/weken/later/onbekend) | volgorde samples-eerst (of verf-erbij) | doel rustiger slapen | ongedaan
Zet " ?" achter een regel die je afleidt maar die de klant niet zei: dat wordt een zichtbare aanname.

VOLGORDE NAAR DE KLANT: begint de klant over kleur of twijfel, help dan eerst met kleur; begint hij met een klus, vraag dan het ontbrekende: onderdelen (plafond mee?), maat, de muren nu, kleur. Een vraag mag dingen bundelen die bij elkaar horen.

DE MUREN NU: vraag "ondergrond" (de server zet de chips erbij). Gaat het plafond mee, vraag ze samen ("Hoe zien je muren en plafond er nu uit?") en leg een antwoord voor beide vast tenzij de klant ze apart noemt.
- "Geschilderd, wit of heel licht, glad" = afwerking muurverf, kleurNu licht, structuur glad, conditie goed.
- "Geschilderd, met duidelijk kleur" = afwerking muurverf, kleurNu donker (structuur glad ? en conditie goed ? als aanname).
- "Kaal stucwerk of gipsplaat" = afwerking geen. "Behang" = afwerking behang; behang gaat er altijd af; vraag daarna of er scheuren onder zitten.
- "Structuur of scheuren": vraag welke van de twee (vraag eigen).
- "Weet ik niet" = afwerking onbekend; zeg "we rekenen voorlopig met twee lagen" en zet het pad in aannames.
- Vocht, schimmel, afbladderende muurverf of beton: zeg dat dit een beoordeling vraagt en zet actie "overdracht".

DUBBELZINNIG, ALTIJD KORT BEVESTIGEN: "plafond wit laten" (niet schilderen of opnieuw wit?), "nieuwbouw" (kaal of al geschilderd?), "alles wit" (welke onderdelen, welk wit?), "20 vierkante meter" (vloer of muren?).

MAAT: lengte x breedte van de vloer is genoeg; anders vraag "maat". Chip "Ongeveer ... (klein)" = ruimte grootte klein, "(gemiddeld)" = grootte middel, "(groot)" = grootte groot. Noem de hoogte als aanname: "We rekenen met muren van 2,60 m; klopt dat niet, zeg het gerust" en zet ruimte.hoogte in aannames.

KLEUR (per vlak):
- JE GEEFT ZELF GEEN KLEURADVIES. Zeg nooit dat een kleur mooi is, goed past, rustig maakt of een goede keuze is, en kies geen kleur voor de klant. Onderbouwd advies komt uit de kleurhulp (dezelfde vragen als de kleurenscan) of van een stylist (online kleuradvies). Jij helpt met een richting, samples, en de weg naar die hulp.
- Roll-kleur of RAL duidelijk gekozen: "<ruimte>.muren kies <naam>". Bevestig neutraal met naam en tint ("Sage Blink, licht grijsgroen, staat erin voor de muren").
- Kleur van een ander merk (alleen dan zeg je "Je bedoelt ..."): zoek_kleur geeft het merk terug. Bevestig het merk een keer zakelijk ("Je bedoelt [merk] [kleur]. Die mengen we voor je, bij ons heet hij ...") en leg de Roll-naam vast die zoek_kleur gaf. Noem nooit uit jezelf een ander merk.
- Geen treffer: zeg dat eerlijk en toon Roll-kleuren uit dezelfde kleurfamilie als kaarten; de klant kiest zelf, het liefst na een sample. Noem ze niet "passend" of "dichtbij".
- Kaarten horen altijd bij een onderdeel: zet antwoord.voor op het pad (woonkamer.muren, hal.plinten). De klant kan op de kaart nog een ander open onderdeel kiezen.
- Richting: "<ruimte>.muren richting <omschrijving>", dan stel_kleuren_voor en toon de kleuren als kaarten, neutraal ("Dit zijn onze lichte beiges"). Raad aan ze eerst als sample te bekijken, en bied de kleurhulp of een stylist aan als de klant hulp wil.
- Twijfel tussen kleuren: kandidaat, nooit kies.
- Geen idee: vraag "geen-idee" (Help me kiezen, Laat een stylist meekijken met actie "kleuradvies", Later kiezen). Kleurhulp: vraag de vragen een voor een (vraag "eigen", met de keuzes als chips); vul in wat je al weet; daarna kleurhulp met antwoorden en toon de drie kleuren als kaarten.
- Een sample is een advies, nooit een voorwaarde. Accentmuur alleen als de klant een muur noemt of twijfelt of een kleur niet te veel wordt.
- Wanneer de klant wil beginnen (vraag "wanneer") alleen als het past, bij twijfel over kleur.

LAKWERK: vraag welke onderdelen meegaan (vraag "onderdelen") en daarna aantallen, staat en glans (vraag "lak"). De kleur van lakwerk kiest de klant zelf: wit, zelfde als de muren, een bijpassende wittint of een andere kleur; nooit automatisch wit. "Wit zoals nu" = kies Blank Page. Houtrot, eerder gelakte muren of vermoeden van loodhoudende verf: actie "overdracht".

PLAFOND: vraag een keer "Gaat het plafond ook mee?" (vraag "plafond"). "Ja, wit" = vlak <ruimte> plafond en <ruimte>.plafond kies Blank Page. "Ja, in de muurkleur" = dezelfde kleur als de muren.

SPULLEN: "Heb je al rollers en kwasten?" (vraag "spullen"): "Nog niets, zet alles klaar" = spullen niets, "Ik heb al spullen" = spullen alles, "Er komt een schilder" = spullen schilder.

TOON: warm, kort, deskundig zonder vakjargon, je-vorm. Hooguit drie zinnen voor de vraag. Positief, geen druk, geen nepdeadlines. Geen emoji, geen gedachtestreepjes.

NOOIT: een HEX-code of mengcode noemen; zelf liters, aantallen blikken of bedragen noemen (die staan in de pakketkaart); dekking beloven ("een laag is genoeg", "dekt altijd"): zeg "we rekenen met een laag" of "met twee lagen"; retour noemen als geruststelling (op kleur gemengde verf kan niet retour); voorwaarden of productinformatie noemen die niet uit productinfo of voorwaarden komt; renovlies of verf over behang adviseren.

UITKOMST ALS ER NOG KLEUREN OPEN ZIJN: verf voor een onderdeel zonder gekozen kleur verkopen we niet; de pakketkaart toont dan alleen samples. Zijn er nog kleuren open en is minstens een onderdeel al klaar (staat [klaar] in de stand) en is volgorde nog ?: vraag "volgorde" ("Wil je eerst de samples bekijken, of zetten we de verf voor de kleuren die al vaststaan alvast klaar?"). "Eerst de samples" = volgorde samples-eerst; "Zet de verf ... alvast klaar" = volgorde verf-erbij. Is nog geen onderdeel klaar, vraag het dan niet: help met kleur (samples, kleurhulp, stylist). Zeg nooit dat de verf al klaarstaat als volgorde samples-eerst is.

VOLGENDE STAP (antwoord.actie): "samples" als er samples klaarstaan en de kleur nog open is; "bestellen" als onderdelen klaar zijn; "bewaren" bij later verder; "geen" als je nog een vraag stelt.`;

/* ---------- uitvoering van de tools ---------- */

async function zoekKleur(term: string) {
  const t = term.trim();
  const ix = await index();
  const exact = ix.c.find((k) => k.n.toLowerCase() === t.toLowerCase());
  if (exact) return { type: "roll", naam: exact.n, omschrijving: exact.d ?? "" };
  const ral = /^ral\s*[-.]?\s*(\d{4})$/i.exec(t);
  const zoek = ral ? `RAL ${ral[1]}` : t;
  const km = async (q: string) => { const r = await (await fetch(`${ROLL}/wp-json/ark-kleurmatch/v1/colors?search=${encodeURIComponent(q)}&per_page=5`)).json().catch(() => []); return Array.isArray(r) ? r : []; };
  let lijst = await km(zoek);
  // "Nigiri van LAB" vindt niets, "nigiri" wel: probeer de losse woorden en houd treffers die bij de rest passen.
  if (!lijst.length && !ral) {
    const woorden = t.toLowerCase().split(/[^a-z0-9]+/).filter((x) => x.length > 3 && !["kleur", "verf", "van", "voor", "zoals"].includes(x));
    for (const wd of woorden) {
      const r = await km(wd);
      const rest = woorden.filter((x) => x !== wd);
      const passend = r.filter((x: any) => !rest.length || rest.some((x2) => `${x.brand} ${x.line} ${x.name}`.toLowerCase().includes(x2)));
      if (passend.length || r.length === 1) { lijst = passend.length ? passend : r; break; }
    }
  }
  lijst = lijst.slice(0, 3);
  if (ral) {
    const r = lijst.find((x: any) => "RAL" === String(x.brand).toUpperCase());
    if (r) return { type: "ral", naam: `RAL ${ral[1]}`, km: { id: r.id, rollNaam: r.rollName, rollCode: r.rollCode, hex: r.hex, ral: true, naam: `RAL ${ral[1]}` } };
  }
  const merk = lijst.filter((x: any) => "RAL" !== String(x.brand).toUpperCase());
  if (merk.length) {
    return {
      // Een kleurmatch-treffer mengt Roll exact na.
      treffers: merk.map((r: any) => ({ type: "merk-exact", naam: `${r.rollName}${r.rollCode ? " - " + r.rollCode : ""}`, merk: r.brand, merkKleur: r.name, km: { id: r.id, rollNaam: r.rollName, rollCode: r.rollCode, hex: r.hex, ral: false } })),
      let_op: "Bevestig het merk een keer, daarna alleen de Roll-naam.",
    };
  }
  const deel = ix.c.filter((k) => k.n.toLowerCase().includes(t.toLowerCase())).slice(0, 4);
  if (deel.length) return { mogelijk: deel.map((k) => ({ type: "roll", naam: k.n, omschrijving: k.d ?? "" })) };
  return { type: "geen", tip: "Geen match. Stel met stel_kleuren_voor een passende Roll-kleur voor; die is benaderd en de klant kiest hem zelf." };
}

async function stelVoor(familie: string, lh = "maakt niet uit") {
  const ix = await index();
  const f = familie.toLowerCase();
  const slug = ix.f.find((x) => x.s === f || x.n.toLowerCase() === f)?.s ?? f;
  // Kleuren die ook bij wit horen (zoals een warm wit in beige) alleen als iemand wit zoekt.
  let lijst = ix.c.filter((k) => (k.c ?? []).includes(slug) && ("wit" === slug || !(k.c ?? []).includes("wit")));
  const band = (k: Kleur) => { const l = lichtheid(k.h); return l >= 0.75 ? "licht" : l >= 0.45 ? "midden" : "donker"; };
  if (lh !== "maakt niet uit") {
    const gefilterd = lijst.filter((k) => band(k) === lh);
    if (gefilterd.length >= 2) lijst = gefilterd;
  }
  lijst = lijst.sort((a, b) => lichtheid(b.h) - lichtheid(a.h)).slice(0, 4);
  return { kleuren: lijst.map((k) => ({ type: "roll", naam: k.n, omschrijving: k.d ?? "" })) };
}

async function kleurhulp(project: any, ruimteId: string, antwoorden?: Record<string, unknown>) {
  if (!antwoorden || !Object.keys(antwoorden).length) {
    const v = await (await fetch(ENGINE)).json();
    return { vragen: (v.vragen ?? []).map((q: any) => ({ id: q.id, vraag: q.vraag ?? q.titel, meerdere: !!(q.meerdere || q.multi), keuzes: (q.opties ?? []).map((o: any) => ({ waarde: o.waarde, label: o.label })) })) };
  }
  const r = project.ruimtes.find((x: any) => x.id === ruimteId);
  const ruimte: Record<string, unknown> = { type: r?.type ?? "woonkamer" };
  const l = w(r?.maat?.lengte), b = w(r?.maat?.breedte);
  if (l && b) ruimte.vloer_m2 = Math.round(l * b * 10) / 10; else ruimte.grootte = w(r?.maat?.grootte, "middel");
  const { families, ...rest } = antwoorden as any;
  const res = await (await fetch(ENGINE, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ versie: 1, bron: "projecthulp-chat", sessie: "ph_" + project.id, ruimte, antwoorden: rest, families: families ?? [], log: true }) })).json();
  const kleuren = (res.kleuren ?? []).slice(0, 3).map((c: any) => ({ type: "roll", naam: c.naam, label: c.label ?? "", waarom: (c.waarom ?? []).slice(0, 2) }));
  const namen = new Set(kleuren.map((k: any) => k.naam));
  // Een pack alleen als het de aanbevolen kleuren echt bevat.
  const pack = PACKS.packs.map((p: any) => ({ p, n: p.kleuren.filter((k: string) => namen.has(k)).length })).sort((a: any, b: any) => b.n - a.n)[0];
  return { kleuren, pack: pack && pack.n >= 2 ? { naam: pack.p.naam, productId: pack.p.productId, kleuren: pack.p.kleuren } : null };
}

function productinfo(onderwerp: string) {
  if ("muurverf" === onderwerp) return PRODUCTINFO.verftypes.find((v: any) => /muur/i.test(v.naam));
  if ("lak" === onderwerp) return PRODUCTINFO.verftypes.filter((v: any) => /lak/i.test(v.naam));
  return PRODUCTINFO.producten.find((p: any) => p.soort === onderwerp) ?? { fout: "Geen informatie; verwijs naar de klantenservice." };
}

async function bereken(plan: any) {
  const body = new URLSearchParams({ action: "roll_vc_kleurplan", wat: "bereken", plan: JSON.stringify(plan) });
  const res = await fetch(`${ROLL}/wp-admin/admin-ajax.php`, { method: "POST", body });
  const jj = await res.json();
  if (!jj?.success) throw new Error("rekenkern");
  return jj.data;
}

/** Kleuren in een voorstel opzoeken: Roll-naam (ook zonder hoofdletters), of RAL via de kleurmatch. */
async function kleurenOpzoeken(wijzigingen: any[], gevonden: Map<string, any>) {
  const ix = await index();
  for (const wz of wijzigingen) {
    const k = wz?.kleur;
    if (!k || !k.naam || (k.km && k.km.id)) continue;
    // Wat zoek_kleur deze beurt vond (een merkkleur met de gegevens uit de kleurmatch).
    const eerder = gevonden.get(String(k.naam).toLowerCase()) ?? gevonden.get(String(k.merkKleur ?? "").toLowerCase());
    if (eerder) { wz.kleur = eerder; continue; }
    const roll = ix.c.find((c) => c.n.toLowerCase() === String(k.naam).trim().toLowerCase());
    if (roll) { wz.kleur = { type: "roll", naam: roll.n }; continue; }
    if (/^ral\s*[-.]?\s*\d{4}$/i.test(String(k.naam).trim())) {
      const r: any = await zoekKleur(String(k.naam));
      if ("ral" === r.type) wz.kleur = r;
    }
  }
  return wijzigingen;
}

/** Wat het model van het project te zien krijgt: korte tekst, met herkomst. */
function stand(p: any) {
  const g = (x: any) => (!x || null == x.waarde ? "?" : `${x.waarde}${"gezegd" === x.bron || x.geaccepteerd ? "" : "*"}`);
  const st = projectStatus(p);
  const regels: string[] = [];
  for (const r of p.ruimtes) {
    const l = w(r.maat.lengte), b = w(r.maat.breedte);
    regels.push(`${r.id} (${r.naam}${r.buiten ? ", buiten" : ""}): maat ${l && b ? `${g(r.maat.lengte)}x${g(r.maat.breedte)}` : `grootte ${g(r.maat.grootte)}`}, hoogte ${g(r.hoogte)}`);
    for (const v of r.vlakken) {
      const o = Object.entries(v.ondergrond).filter(([, x]) => x).map(([k, x]) => `${k}=${g(x)}`).join(" ");
      const k = v.kleur;
      const kl = "gekozen" === k.status ? `kleur ${w(k.gekozen)?.naam}` : [k.richting ? `richting ${k.richting}` : "", k.kandidaten.length ? `kandidaten ${k.kandidaten.map((x: any) => x.naam).join("/")}` : "", k.favorieten.length ? `favorieten ${k.favorieten.map((x: any) => x.naam).join("/")}` : "", k.afgewezen.length ? `afgewezen ${k.afgewezen.map((x: any) => x.naam).join("/")}` : ""].filter(Boolean).join(", ") || "kleur open";
      const s2 = st.onderdelen.find((x: any) => x.ruimte === r.id && x.vlak === v.id);
      const mist = s2 ? [...s2.ontbreekt, ...s2.controleren].join(",") : "";
      const lakInfo = isLak(v.soort) ? `; aantal ${g(v.aantal)}; glans ${g(v.glans)}` : "";
      regels.push(`  ${r.id}.${v.id}: ${kl}; ${o || "ondergrond ?"}${v.breedte ? `; breedte ${g(v.breedte)}` : ""}${lakInfo} [${s2?.status}${mist ? ": " + mist : ""}]`);
    }
  }
  regels.push(`spullen ${g(p.spullen)}; wanneer ${g(p.wanneer)}; volgorde ${g(p.volgorde)}; samples ${(p.samples ?? []).map((x: any) => x.naam).join(", ") || "geen"}${p.doel ? `; doel ${w(p.doel)}` : ""}`);
  return `(* = aanname, nog niet bevestigd; ? = onbekend)\n${regels.join("\n")}`;
}

const VELD_ONDERGROND = ["materiaal", "afwerking", "kleurNu", "structuur", "conditie"];
const KLEUR_WAT = ["kies", "kandidaat", "favoriet", "afwijzen", "richting", "open"];

/** De korte opdrachtregels van het model naar wijzigingen voor het projectmodel. */
function parseRegels(regels: string[]) {
  const uit: any[] = [];
  for (const ruw of regels) {
    let r = String(ruw).trim();
    if (!r) continue;
    let zekerheid = "zeker";
    if (/\s\?$/.test(r)) { zekerheid = "waarschijnlijk"; r = r.replace(/\s\?$/, "").trim(); }
    const [a, b, ...rest] = r.split(/\s+/);
    const tekst = rest.join(" ");
    const al = a.toLowerCase();
    if ("ongedaan" === al) { uit.push({ actie: "ongedaan" }); continue; }
    if ("ruimte" === al) { uit.push({ actie: "ruimte-erbij", type: String(b).replace(/\d+$/, ""), ruimte: b, naam: tekst.replace(/^"|"$/g, "") || undefined, zekerheid }); continue; }
    if ("ruimte-" === al) { uit.push({ actie: "ruimte-weg", ruimte: b }); continue; }
    if ("vlak" === al) { uit.push({ actie: "vlak-erbij", ruimte: b, vlak: rest[0], soort: rest[0] }); continue; }
    if ("vlak-" === al) { uit.push({ actie: "vlak-weg", ruimte: b, vlak: rest[0] }); continue; }
    if ("sample" === al) { uit.push({ actie: "sample", wat: "erbij", kleur: { naam: [b, ...rest].join(" ") }, zekerheid }); continue; }
    if ("volgorde" === al) { uit.push({ actie: "zet", veld: al, waarde: /verf/i.test(b) ? "verf-erbij" : "samples-eerst", zekerheid }); continue; }
    if (["spullen", "wanneer", "doel"].includes(al)) { uit.push({ actie: "zet", veld: al, waarde: [b, ...rest].join(" "), zekerheid }); continue; }
    // ruimte[.vlak] veld waarde
    const [ruimte, vlak] = a.split(".");
    const veld = String(b ?? "");
    if (!vlak) {
      if ("maat" === veld) {
        const m = /^(\d+(?:[.,]\d+)?)\s*x\s*(\d+(?:[.,]\d+)?)$/i.exec(tekst.replace(/\s+/g, ""));
        if (m) { uit.push({ actie: "zet", ruimte, veld: "maat.lengte", waarde: m[1], zekerheid }, { actie: "zet", ruimte, veld: "maat.breedte", waarde: m[2], zekerheid }); continue; }
      }
      if ("grootte" === veld) { uit.push({ actie: "zet", ruimte, veld: "maat.grootte", waarde: tekst, zekerheid }); continue; }
      if ("buiten" === veld) { uit.push({ actie: "zet", ruimte, veld: "buiten", waarde: !/^(nee|uit|false)$/i.test(tekst), zekerheid }); continue; }
      uit.push({ actie: "zet", ruimte, veld, waarde: tekst, zekerheid });
      continue;
    }
    if (KLEUR_WAT.includes(veld)) {
      uit.push({ actie: "kleur", ruimte, vlak, wat: veld, ...("richting" === veld ? { richting: tekst } : "open" === veld ? {} : { kleur: { naam: tekst } }), zekerheid });
      continue;
    }
    uit.push({ actie: "zet", ruimte, vlak, veld: VELD_ONDERGROND.includes(veld) ? `ondergrond.${veld}` : veld, waarde: tekst, zekerheid });
  }
  return uit;
}

/** Concrete maat-chips per ruimtetype (zelfde tabel als de rekenkern), want "klein" betekent voor iedereen iets anders. */
const nl = (x: number) => String(x).replace(".", ",");
function maatSchatting(type: string) {
  const t = (VLOER as any)[type] ?? (VLOER as any).standaard;
  const half = (x: number) => Math.round(x * 2) / 2;
  return [["klein", "klein"], ["middel", "gemiddeld"], ["groot", "groot"]].map(([k, n]) => {
    const a = half(Math.sqrt(t[k])), b = half(t[k] / a);
    return { grootte: k, label: `Ongeveer ${nl(a)} × ${nl(b)} m (${n})` };
  });
}
const maatChips = (type: string) => maatSchatting(type).map((x) => x.label);
function chipsVoor(vraag: string, project: any, eigen: string[] = []) {
  switch (vraag) {
    case "ondergrond": return ["Geschilderd, wit of heel licht, glad", "Geschilderd, met duidelijk kleur (zoals groen, grijs of donker)", "Kaal stucwerk of gipsplaat", "Behang", "Structuur of scheuren", "Weet ik niet"];
    case "plafond": return ["Nee", "Ja, wit", "Ja, in de muurkleur", "Weet ik nog niet"];
    case "spullen": return ["Nog niets, zet alles klaar", "Ik heb al spullen", "Er komt een schilder"];
    case "maat": {
      const r = project.ruimtes.find((x: any) => !(telt(x.maat.lengte) && telt(x.maat.breedte)) && !telt(x.maat.grootte)) ?? project.ruimtes[0];
      return r ? [...maatChips(r.type), "Weet ik niet"] : [];
    }
    case "kleurroute": return ["Ik weet mijn kleur", "Ik heb een richting", "Help me kiezen", "Laat een stylist meekijken", "Later kiezen"];
    case "geen-idee": return ["Help me kiezen", "Laat een stylist meekijken", "Later kiezen"];
    case "wanneer": return ["Binnen een week", "Over een paar weken", "Weet ik nog niet"];
    case "volgorde": return ["Eerst de samples", "Zet de verf voor de gekozen kleuren alvast klaar"];
    default: return eigen.slice(0, 12);
  }
}
/* ---------- formulierkaarten ---------- */

const TELBAAR = ["deuren", "kozijnen", "radiatoren", "kasten"];
const LAK_BINNEN = ["deuren", "kozijnen", "plinten", "lambrisering", "radiatoren"];
const LAK_BUITEN = ["deuren", "kozijnen"];
const VOLGT_UIT_MAAT = ["plinten", "lambrisering"];
const FORM_VRAGEN: Record<string, string> = { maat: "maat", ondergrond: "muren", onderdelen: "onderdelen", lak: "lak" };
const START_TYPES = ["woonkamer", "slaapkamer", "keuken", "eetkamer", "badkamer", "toilet", "hal", "werkkamer", "kinderkamer", "anders"];

const maatNodig = (r: any) => r.vlakken.some((v: any) => !isLak(v.soort) || VOLGT_UIT_MAAT.includes(v.soort)) && !(telt(r.maat.lengte) && telt(r.maat.breedte)) && !telt(r.maat.grootte);
const murenNodig = (r: any) => r.vlakken.some((v: any) => !isLak(v.soort) && (null == w(v.ondergrond.afwerking) || null == w(v.ondergrond.conditie)));
const lakNodig = (r: any) => r.vlakken.some((v: any) => isLak(v.soort) && (null == w(v.ondergrond.afwerking) || !telt(v.glans) || (TELBAAR.includes(v.soort) && null == w(v.aantal))));
/** Een ruimte die alleen lakwerk heeft (de tegel "Alleen deuren, kozijnen of plinten"). */
const alleenLak = (r: any) => /^lakwerk/.test(r.id);
const keuzesVan = (r: any) => (r.buiten ? LAK_BUITEN : alleenLak(r) ? LAK_BINNEN : ["muren", "plafond", ...LAK_BINNEN]);

/**
 * Het formulier dat de browser als kaart in de chat toont. Bij meer ruimtes één formulier voor alle ruimtes die
 * het nog nodig hebben, zodat de klant niet ruimte voor ruimte dezelfde vraag krijgt.
 */
function maakFormulier(soort: string, project: any): any {
  if ("onderdelen" === soort) {
    if (!project.ruimtes.length) return null;
    return { soort, ruimtes: project.ruimtes.map((r: any) => ({ id: r.id, naam: r.naam, vlakken: r.vlakken.map((v: any) => v.soort), keuzes: keuzesVan(r) })) };
  }
  if ("maat" === soort) {
    const rr = project.ruimtes.filter(maatNodig);
    if (!rr.length) return null;
    return {
      soort,
      ruimtes: rr.map((r: any) => ({ id: r.id, naam: alleenLak(r) ? "De ruimte met de plinten" : r.naam, lengte: w(r.maat.lengte), breedte: w(r.maat.breedte), schattingen: maatSchatting(alleenLak(r) ? "standaard" : r.type) })),
      hoogte: w(rr[0].hoogte) ?? 2.6,
      muren: rr.some((r: any) => r.vlakken.some((v: any) => "muren" === v.soort || "accent" === v.soort)),
    };
  }
  if ("muren" === soort) {
    const rr = project.ruimtes.filter(murenNodig);
    if (!rr.length) return null;
    return { soort, ruimtes: rr.map((r: any) => ({ id: r.id, naam: r.naam, plafond: r.vlakken.some((v: any) => "plafond" === v.soort), alleenPlafond: !r.vlakken.some((v: any) => "muren" === v.soort) })) };
  }
  if ("lak" === soort) {
    const rr = project.ruimtes.filter(lakNodig);
    if (!rr.length) return null;
    return {
      soort,
      ruimtes: rr.map((r: any) => ({ id: r.id, naam: r.naam, buiten: !!r.buiten, vlakken: r.vlakken.filter((v: any) => isLak(v.soort)).map((v: any) => ({ id: v.id, soort: v.soort, telbaar: TELBAAR.includes(v.soort), aantal: w(v.aantal) })) })),
      glansOpties: rr.every((r: any) => r.buiten) ? ["zijdeglans", "hoogglans"] : ["mat", "zijdeglans", "hoogglans"],
      buiten: rr.some((r: any) => r.buiten),
    };
  }
  return null;
}

/** Na een formulier: het volgende dat nog nodig is, eerst de maten, dan de muren, dan het lakwerk. */
const volgendeFormulier = (project: any) => maakFormulier("maat", project) ?? maakFormulier("muren", project) ?? maakFormulier("lak", project);
const klein = (n: string) => n.charAt(0).toLowerCase() + n.slice(1);
function formVraag(f: any) {
  const een = 1 === f.ruimtes?.length ? f.ruimtes[0].naam : "";
  if ("maat" === f.soort) return een ? `Hoe groot is de ${klein(een)}?` : "Hoe groot zijn de ruimtes?";
  if ("muren" === f.soort) return een ? `Hoe zien de muren van de ${klein(een)} er nu uit?` : "Hoe zien de muren er nu uit?";
  if ("lak" === f.soort) return "En het lakwerk?";
  return "Tik aan wat er mee gaat.";
}
const LAK_NAAM: Record<string, string> = { deuren: "deuren", kozijnen: "kozijnen", plinten: "plinten", lambrisering: "lambrisering", radiatoren: "radiatoren", kasten: "kasten" };
const getal = (x: unknown) => { const n = parseFloat(String(x ?? "").replace(",", ".")); return Number.isFinite(n) && n > 0 ? n : null; };

const MUUR_NU: Record<string, [Record<string, string>, string]> = {
  licht: [{ afwerking: "muurverf", kleurNu: "licht" }, "geschilderd, wit of heel licht"],
  donker: [{ afwerking: "muurverf", kleurNu: "donker" }, "geschilderd, met duidelijk kleur"],
  kaal: [{ afwerking: "geen", materiaal: "stucwerk" }, "kaal stucwerk of gipsplaat"],
  behang: [{ afwerking: "behang" }, "behang"],
  onbekend: [{ afwerking: "onbekend" }, "weet ik niet"],
};
const MUUR_STAAT: Record<string, [Record<string, string>, string]> = {
  glad: [{ structuur: "glad", conditie: "goed" }, "glad"],
  structuur: [{ structuur: "structuur", conditie: "goed" }, "met structuur"],
  scheurtjes: [{ structuur: "glad", conditie: "scheurtjes" }, "kleine scheurtjes"],
  scheuren: [{ structuur: "glad", conditie: "scheuren" }, "scheuren"],
  vocht: [{ conditie: "vocht" }, "vocht of schimmel"],
  onbekend: [{ structuur: "onbekend", conditie: "onbekend" }, "weet ik niet"],
};
const LAK_STAAT: Record<string, [Record<string, string>, string]> = {
  gelakt: [{ materiaal: "hout", afwerking: "lak", conditie: "goed" }, "gelakt"],
  bladdert: [{ materiaal: "hout", afwerking: "lak", conditie: "bladdert" }, "bladdert"],
  kaal: [{ materiaal: "hout", afwerking: "geen", conditie: "goed" }, "kaal hout"],
  metaal: [{ materiaal: "metaal", afwerking: "geen", conditie: "goed" }, "metaal"],
  onbekend: [{ afwerking: "onbekend", conditie: "onbekend" }, "weet ik niet"],
};

/** Een ingevuld formulier naar wijzigingen voor het projectmodel, plus een korte tekst voor het gesprek. */
function formulierWijzigingen(f: any, project: any): { wijzigingen: any[]; tekst: string } {
  const wz: any[] = [];
  const z = { zekerheid: "zeker" };
  let v = f?.waarden ?? {};
  // Formulieren van voor de bundeling hadden één ruimte.
  if (f?.ruimte && !v.ruimtes && ["maat", "muren", "lak"].includes(f.soort)) v = { ...v, ruimtes: { [f.ruimte]: v } };
  const zet = (r: any, vl: any, veld: string, waarde: unknown) => {
    wz.push({ actie: "zet", ruimte: r.id, ...(vl ? { vlak: vl.id } : {}), veld, waarde, ...z });
    // "Weet ik niet" in het formulier: de klant zag erbij dat we voorzichtig rekenen.
    if ("onbekend" === waarde) wz.push({ actie: "accepteer", ruimte: r.id, ...(vl ? { vlak: vl.id } : {}), veld });
  };

  if ("start" === f?.soort) {
    if ("binnen" === v.lak || "buiten" === v.lak) {
      const id = "buiten" === v.lak ? "lakwerkbuiten" : "lakwerk";
      wz.push({ actie: "ruimte-erbij", ruimte: id, type: "anders", naam: "buiten" === v.lak ? "Lakwerk buiten" : "Lakwerk binnen", ...z }, { actie: "vlak-weg", ruimte: id, vlak: "muren" });
      if ("buiten" === v.lak) wz.push({ actie: "zet", ruimte: id, veld: "buiten", waarde: true, ...z });
      return { wijzigingen: wz, tekst: `Alleen lakwerk, ${v.lak}` };
    }
    const delen: string[] = [];
    for (const type of START_TYPES) {
      const n = Math.min(4, Math.max(0, parseInt(String(v.ruimtes?.[type] ?? 0), 10) || 0));
      const basis = (RUIMTE_NAMEN as any)[type] ?? type;
      for (let i = 1; i <= n; i++) {
        let id = 1 === i ? type : `${type}${i}`;
        for (let j = i + 1; project.ruimtes.some((x: any) => x.id === id); j++) id = `${type}${j}`;
        wz.push({ actie: "ruimte-erbij", ruimte: id, type, naam: n > 1 ? `${basis} ${i}` : basis, ...z });
      }
      if (n) delen.push(n > 1 ? `${n} × ${klein(basis)}` : basis);
    }
    return { wijzigingen: wz, tekst: delen.join(", ") };
  }

  if ("onderdelen" === f?.soort) {
    const delen: string[] = [];
    for (const rr of project.ruimtes) {
      const wil: string[] = Array.isArray(v.ruimtes?.[rr.id]) ? v.ruimtes[rr.id] : null;
      if (!wil) continue;
      const keuzes = keuzesVan(rr);
      for (const soort of keuzes) {
        const heeft = rr.vlakken.some((x: any) => x.soort === soort);
        if (wil.includes(soort) && !heeft) wz.push({ actie: "vlak-erbij", ruimte: rr.id, vlak: soort, soort, ...z });
        if (!wil.includes(soort) && heeft) wz.push({ actie: "vlak-weg", ruimte: rr.id, vlak: soort });
      }
      delen.push(`${rr.naam}: ${wil.filter((x) => keuzes.includes(x)).join(", ") || "niets"}`);
    }
    return { wijzigingen: wz, tekst: delen.join("; ") };
  }

  const ruimtes = project.ruimtes.filter((r: any) => v.ruimtes && v.ruimtes[r.id]);
  if ("maat" === f?.soort) {
    const hg = getal(v.hoogte ?? Object.values(v.ruimtes ?? {}).map((x: any) => x?.hoogte).find(Boolean));
    const delen: string[] = [];
    for (const r of ruimtes) {
      const m = v.ruimtes[r.id];
      const l = getal(m.lengte), b = getal(m.breedte);
      if (l && b) { zet(r, null, "maat.lengte", l); zet(r, null, "maat.breedte", b); delen.push(`${r.naam}: ${nl(l)} × ${nl(b)} m`); }
      else if (["klein", "middel", "groot"].includes(m.grootte)) { zet(r, null, "maat.grootte", m.grootte); delen.push(`${r.naam}: ${maatSchatting(alleenLak(r) ? "standaard" : r.type).find((x) => x.grootte === m.grootte)?.label.toLowerCase()}`); }
      if (hg && r.vlakken.some((x: any) => !isLak(x.soort))) zet(r, null, "hoogte", hg);
    }
    return { wijzigingen: wz, tekst: delen.join("; ") + (hg ? `, muren ${hg.toFixed(2).replace(".", ",")} m hoog` : "") };
  }
  if ("muren" === f?.soort) {
    const delen: string[] = [];
    for (const r of ruimtes) {
      const nu = MUUR_NU[v.ruimtes[r.id].nu], st = MUUR_STAAT[v.ruimtes[r.id].staat] ?? MUUR_STAAT.glad;
      if (!nu) continue;
      for (const vl of r.vlakken.filter((x: any) => !isLak(x.soort))) {
        for (const [veld, waarde] of Object.entries({ ...nu[0], ...st[0] })) zet(r, vl, `ondergrond.${veld}`, waarde);
      }
      delen.push(`${ruimtes.length > 1 ? r.naam + ": " : ""}${nu[1]}, ${st[1]}`);
    }
    return { wijzigingen: wz, tekst: `Muren nu: ${delen.join("; ")}` };
  }
  if ("lak" === f?.soort) {
    const st = LAK_STAAT[v.staat];
    const delen: string[] = [];
    for (const r of ruimtes) {
      // Buiten bestaat geen matte lak: dan wordt het zijdeglans.
      const glans = ["mat", "zijdeglans", "hoogglans"].includes(v.glans) ? (r.buiten && "mat" === v.glans ? "zijdeglans" : v.glans) : null;
      const stuk: string[] = [];
      for (const vl of r.vlakken.filter((x: any) => isLak(x.soort))) {
        if (st) for (const [veld, waarde] of Object.entries(st[0])) zet(r, vl, `ondergrond.${veld}`, waarde);
        if (glans) zet(r, vl, "glans", glans);
        const n = parseInt(String(v.ruimtes[r.id]?.aantallen?.[vl.id] ?? ""), 10);
        if (TELBAAR.includes(vl.soort) && Number.isInteger(n)) { zet(r, vl, "aantal", n); stuk.push(`${n} ${1 === n ? ({ deuren: "deur", kozijnen: "kozijn", radiatoren: "radiator", kasten: "kast" } as Record<string, string>)[vl.soort] : LAK_NAAM[vl.soort]}`); }
        else if (!TELBAAR.includes(vl.soort)) stuk.push(LAK_NAAM[vl.soort] ?? vl.soort);
      }
      delen.push(`${ruimtes.length > 1 ? r.naam + ": " : ""}${stuk.join(", ")}`);
    }
    return { wijzigingen: wz, tekst: `Lakwerk: ${delen.join("; ")}${st ? "; " + st[1] : ""}${v.glans ? "; " + v.glans : ""}` };
  }
  return { wijzigingen: [], tekst: "" };
}

/** Een aanname als pad ("woonkamer.hoogte", "woonkamer.muren.afwerking") naar een accepteer-wijziging. */
function aannameNaarWijziging(pad: string) {
  const d = String(pad).split(".");
  if (2 === d.length) return { actie: "accepteer", ruimte: d[0], veld: "maat" === d[1] ? "maat.lengte" : d[1] };
  if (3 === d.length) return { actie: "accepteer", ruimte: d[0], vlak: d[1], veld: VELD_ONDERGROND.includes(d[2]) ? `ondergrond.${d[2]}` : d[2] };
  return null;
}

/**
 * Wat we verkopen zolang er kleuren open zijn. Zonder gekozen kleur geen verf; de klant kiest of de verf voor de
 * kleuren die al vaststaan alvast mee gaat (verf-erbij) of dat eerst de samples komen (samples-eerst, ook de standaard).
 */
function route(project: any) {
  const open: { ruimte: string; vlak: string }[] = [];
  for (const r of project.ruimtes) for (const v of r.vlakken) if ("gekozen" !== v.kleur.status) open.push({ ruimte: r.naam, vlak: v.soort });
  const v = w(project.volgorde);
  return { route: !open.length ? "compleet" : "verf-erbij" === v ? "verf-erbij" : "samples-eerst" === v ? "samples-eerst" : "kiezen", open };
}
const zonderVerf = (plan: any, project: any) => (["kiezen", "samples-eerst"].includes(route(project).route) ? { ...plan, ruimtes: [] } : plan);

/** Een plan met alleen de onderdelen in de gegeven statussen; samples en packs gaan altijd mee. */
function planMet(plan: any, status: any, statussen: string[]) {
  const mee = new Set(status.onderdelen.filter((o: any) => statussen.includes(o.status)).map((o: any) => `${o.ruimte}.${o.vlak}`));
  const ruimtes = plan.ruimtes.map((r: any) => ({ ...r, vlakken: r.vlakken.filter((v: any) => mee.has(`${r.id}.${v.id}`)) })).filter((r: any) => r.vlakken.length);
  return { ...plan, ruimtes };
}
/** Naar het mandje: alleen wat klaar is om te bestellen. */
const mandPlan = (plan: any, status: any, project: any) => zonderVerf(planMet(plan, status, ["klaar"]), project);
/** In de pakketkaart: alleen onderdelen waarvan de klant de maat gaf (of een maat-chip koos) en de muren nu bekend zijn. */
function rekenPlan(plan: any, project: any) {
  const mee = new Set<string>();
  for (const r of project.ruimtes) {
    const maat = (telt(r.maat.lengte) && telt(r.maat.breedte)) || telt(r.maat.grootte);
    for (const v of r.vlakken) {
      const lak = isLak(v.soort);
      const maatOk = maat || (lak && !VOLGT_UIT_MAAT.includes(v.soort));
      const aantalOk = !TELBAAR.includes(v.soort) || null != w(v.aantal);
      if (maatOk && aantalOk && null != w(v.ondergrond.afwerking)) mee.add(`${r.id}.${v.id}`);
    }
  }
  const ruimtes = plan.ruimtes.map((r: any) => ({ ...r, vlakken: r.vlakken.filter((v: any) => mee.has(`${r.id}.${v.id}`)) })).filter((r: any) => r.vlakken.length);
  return zonderVerf({ ...plan, ruimtes }, project);
}

/* ---------- woord voor woord ---------- */

/** De tekst tot nu toe uit half binnengekomen JSON van de tool antwoord ({"tekst": "Hoi, ...). */
function tekstUit(json: string) {
  const m = /"tekst"\s*:\s*"/.exec(json);
  if (!m) return "";
  let i = m.index + m[0].length, uit = "";
  const ESC: Record<string, string> = { n: "\n", t: " ", r: "", b: "", f: "", '"': '"', "\\": "\\", "/": "/" };
  while (i < json.length) {
    const c = json[i];
    if ('"' === c) break;
    if ("\\" === c) {
      if (i + 1 >= json.length) break;
      const n = json[i + 1];
      if ("u" === n) { if (i + 6 > json.length) break; uit += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16)); i += 6; continue; }
      uit += ESC[n] ?? n; i += 2; continue;
    }
    uit += c; i++;
  }
  return uit;
}

const VRAGEN = ["ondergrond", "plafond", "spullen", "maat", "kleurroute", "geen-idee", "wanneer", "volgorde", "onderdelen", "lak", "eigen", "geen"];
const ACTIES = ["geen", "samples", "bestellen", "bewaren", "stappen", "overdracht", "kleuradvies"];
const tekstLijst = (x: unknown) => (Array.isArray(x) ? x.filter((y) => "string" === typeof y) : []);
/** De invoer van antwoord komt ongecontroleerd binnen (eager streaming): zelf nalopen. */
function geldigAntwoord(inp: any) {
  if (!inp || "string" !== typeof inp.tekst || !inp.tekst.trim()) return null;
  return {
    tekst: inp.tekst,
    vraag: VRAGEN.includes(inp.vraag) ? inp.vraag : "geen",
    chips: tekstLijst(inp.chips),
    kaarten: tekstLijst(inp.kaarten),
    voor: "string" === typeof inp.voor ? inp.voor.slice(0, 60) : "",
    aannames: tekstLijst(inp.aannames),
    actie: ACTIES.includes(inp.actie) ? inp.actie : "geen",
  };
}

/** Voor welk onderdeel kaarten zijn: wat het model noemde als dat bestaat, anders het eerste onderdeel zonder kleur. */
function kaartDoel(project: any, pad?: string) {
  const [ruimte, vlak] = String(pad ?? "").split(".");
  const r = project.ruimtes.find((x: any) => x.id === ruimte);
  if (r?.vlakken.some((v: any) => v.id === vlak)) return { ruimte, vlak };
  const alle = project.ruimtes.flatMap((x: any) => x.vlakken.map((v: any) => ({ ruimte: x.id, vlak: v.id, open: "gekozen" !== v.kleur.status, muur: "muren" === v.soort })));
  const doel = alle.find((x: any) => x.open && x.muur && (!r || x.ruimte === r.id)) ?? alle.find((x: any) => x.open) ?? alle[0];
  return doel ? { ruimte: doel.ruimte, vlak: doel.vlak } : null;
}

/** Of het plan bewaard is, met het e-mailadres half verborgen (voor de projectkaart). */
function bewaardInfo(rij: any) {
  if (!rij?.bewaard_op) return null;
  const e = String(rij.email ?? "");
  const [n, d] = e.split("@");
  return { op: rij.bewaard_op, email: d ? `${n.slice(0, 2)}***@${d}` : null };
}

/* ---------- de beurt ---------- */

async function laad(sessie: string) {
  const { data } = await db.from("projecthulp_chat").select("*").eq("sessie", sessie).maybeSingle();
  return data;
}

type Meld = (soort: "tekst" | "opnieuw", data?: unknown) => void;

async function beurt(sessie: string, aanvraagId: string, bericht: string, tik: any, modelKeuze = MODEL, meld: Meld = () => {}, formulier: any = null) {
  const start = Date.now();
  // Alleen in de testset: "model:denken" om de denkstand te vergelijken (uit, tussen, adaptief).
  const [model, denkTest] = modelKeuze.split(":");
  const denken = denkTest ?? Deno.env.get("PROJECTHULP_DENKEN") ?? "tussen";
  // De kleurenlijst van roll.nl laden we terwijl de rest doorgaat; pas nodig bij een kleur.
  const ixP = index();
  let rij = await laad(sessie);
  if (!rij) {
    rij = { sessie, project: nieuwProject(sessie.slice(0, 12)), gesprek: [], status: "actief" };
  }
  // Opnieuw geprobeerd: hetzelfde antwoord, niets dubbel.
  const eerder = (rij.gesprek as any[]).find((b) => b.aanvraagId === aanvraagId && "roll" === b.rol);
  if (eerder) return { ...eerder.uit, herhaald: true };
  if ((rij.gesprek as any[]).filter((b) => "klant" === b.rol).length >= MAX_BERICHTEN) {
    return { fout: "Dit gesprek is lang geworden. Ga verder met de stappen of stuur ons een bericht.", actie: "stappen" };
  }
  let project = rij.project;
  const opties: any = {};
  const metKleuren = async () => { opties.kleurIndex ??= new Set((await ixP).c.map((k) => k.n)); };
  const toolLog: any[] = [];
  let laatsteWijzigingen: any[] = [];

  // Aannames die de bot vorige beurt noemde: de klant ging verder, dus geaccepteerd.
  const vorige = [...(rij.gesprek as any[])].reverse().find((b) => "roll" === b.rol);
  const getoond = (vorige?.uit?.antwoord?.aannames ?? []).map(aannameNaarWijziging).filter(Boolean);
  if (getoond.length) {
    project = toepassen(project, { aanvraagId: aanvraagId + "#a", versie: project.versie, door: "klant-chat", wijzigingen: getoond }, opties).project;
  }
  // Een tik op een kaart of chip: direct vastleggen als bewuste keuze van de klant.
  let tikTekst = "";
  if (tik && "object" === typeof tik) {
    if (tik.kleur) await metKleuren();
    const u = toepassen(project, { aanvraagId: aanvraagId + "#t", versie: project.versie, door: "klant-kaart", wijzigingen: [{ zekerheid: "zeker", ...tik }] }, opties);
    project = u.project;
    tikTekst = "zet" === tik.actie
      ? `De klant koos in de pakketkaart: ${tik.veld} ${tik.waarde}`
      : `De klant tikte: ${tik.wat ?? tik.actie} ${tik.kleur?.naam ?? ""} ${tik.vlak ? `voor ${tik.ruimte ? tik.ruimte + "." : ""}${tik.vlak}` : ""}`.trim();
  }

  let mens: any[] = [];

  // Een ingevuld formulier: direct vastleggen. Is er daarna nog een formulier nodig, dan komt dat meteen,
  // zonder model; anders gaat het model verder met de nieuwe stand.
  let formTekst = "";
  let antwoord: any = null;
  if (formulier && "object" === typeof formulier) {
    const fw = formulierWijzigingen(formulier, project);
    formTekst = fw.tekst || "Formulier ingevuld";
    const u = toepassen(project, { aanvraagId: aanvraagId + "#f", versie: project.versie, door: "klant-kaart", wijzigingen: fw.wijzigingen }, opties);
    project = u.project;
    laatsteWijzigingen = u.toegepast;
    tikTekst = `De klant vulde het formulier in: ${formTekst}`;
    const nuMens = naarRekenkern(project).mens;
    const terug = [...u.openVragen.map((x: any) => x.vraag), ...u.geweigerd.map((x: any) => x.reden)];
    if (nuMens.length) {
      antwoord = { tekst: "Vocht, schimmel of afbladderende verf wil je eerst goed laten bekijken. Stuur ons een bericht, dan kijken we graag met je mee.", vraag: "geen", actie: "overdracht" };
    } else if (terug.length) {
      antwoord = { tekst: terug[0], vraag: "geen", actie: "geen", formulier: maakFormulier("start" === formulier.soort ? "onderdelen" : formulier.soort, project) ?? volgendeFormulier(project) };
    } else if ("start" === formulier.soort) {
      // Na het startscherm: welke onderdelen er per ruimte mee gaan.
      const f = maakFormulier("onderdelen", project);
      if (f) antwoord = { tekst: `Fijn. ${formVraag(f)}`, vraag: "geen", actie: "geen", formulier: f };
    } else {
      const volgende = volgendeFormulier(project);
      if (volgende) antwoord = { tekst: `Genoteerd. ${formVraag(volgende)}`, vraag: "geen", actie: "geen", formulier: volgende };
    }
  }

  const geschiedenis: Anthropic.MessageParam[] = (rij.gesprek as any[]).slice(-10).map((b) => ({ role: "klant" === b.rol ? "user" : "assistant", content: b.tekst || "..." }) as Anthropic.MessageParam);
  // Een gesprek begint altijd met de klant.
  while (geschiedenis.length && "assistant" === geschiedenis[0].role) geschiedenis.shift();
  // Zelfde rol twee keer achter elkaar mag; de API voegt ze samen.
  const messages: Anthropic.MessageParam[] = [...geschiedenis, { role: "user", content: `Projectstand:\n${stand(project)}\n\n${tikTekst ? tikTekst + "\n" : ""}Klant: ${bericht || (formulier ? "(formulier ingevuld)" : "zet" === tik?.actie ? "(koos in de pakketkaart, staat al vast)" : "(tikte op een kaart)")}` }];

  const gevonden = new Map<string, any>();
  let tokens: any = { in: 0, uit: 0, cache: 0, t: { laden: Date.now() - start, model: 0, rekenen: 0, opslaan: 0 } };
  for (let stap = 0; stap < MAX_STAPPEN && !antwoord; stap++) {
    const haiku = model.includes("haiku");
    const t0 = Date.now();
    const stroom = claude.beta.messages.stream({
      model,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: "low" },
      // Zonder nadenken tussen de tools: een gesprek als dit heeft daar weinig aan en het scheelt seconden.
      // Met PROJECTHULP_DENKEN=adaptive gaat het nadenken weer aan.
      ...("adaptive" === denken ? {} : { thinking: { type: haiku || "uit" === denken ? "disabled" : "between_tools" } }),
      // Server-side fallback bij een weigering bestaat voor Sonnet 5.5, niet voor Haiku.
      ...(haiku ? {} : { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" }),
    } as any);
    // De tekst van antwoord gaat stukje voor stukje naar de browser.
    let antwoordBlok = -1, json = "", verstuurd = "";
    for await (const ev of stroom as any) {
      if (!tokens.t.eerste) tokens.t.eerste = Date.now() - start;
      if ("content_block_start" === ev.type && "tool_use" === ev.content_block?.type && "antwoord" === ev.content_block.name && antwoordBlok < 0) {
        antwoordBlok = ev.index;
        if (verstuurd) { meld("opnieuw"); verstuurd = ""; }
      } else if ("content_block_delta" === ev.type && ev.index === antwoordBlok && "input_json_delta" === ev.delta?.type) {
        json += ev.delta.partial_json;
        const t = tekstUit(json);
        if (t.length > verstuurd.length) { tokens.t.tekst ??= Date.now() - start; meld("tekst", t.slice(verstuurd.length)); verstuurd = t; }
      }
    }
    let res: any;
    try {
      res = await stroom.finalMessage();
    } catch (e) {
      // Kon de invoer niet gelezen worden, dan telt alleen wat er al stond.
      if (!(e instanceof SyntaxError) && !/json/i.test(String((e as Error).message))) throw e;
      const t = tekstUit(json);
      antwoord = t ? { tekst: t, vraag: "geen", actie: "geen", chips: [], kaarten: [], aannames: [] } : null;
      if (!antwoord && verstuurd) meld("opnieuw");
      break;
    }
    tokens.t.model += Date.now() - t0;
    (tokens.blokken ??= []).push(res.content.map((c: any) => `${c.type}${"thinking" === c.type ? ":" + String(c.thinking ?? "").length : "tool_use" === c.type ? ":" + c.name : "text" === c.type ? ":" + c.text.length : ""}`).join(" "));
    tokens.in += res.usage?.input_tokens ?? 0;
    tokens.uit += res.usage?.output_tokens ?? 0;
    tokens.cache += (res.usage as any)?.cache_read_input_tokens ?? 0;
    if ("refusal" === res.stop_reason || ("max_tokens" === res.stop_reason && res.content.some((c: any) => "tool_use" === c.type))) { if (verstuurd) meld("opnieuw"); break; }
    messages.push({ role: "assistant", content: res.content as any });
    const calls = res.content.filter((c: any) => "tool_use" === c.type) as Anthropic.ToolUseBlock[];
    if (!calls.length) {
      const tekst = res.content.filter((c: any) => "text" === c.type).map((c: any) => c.text).join("\n").trim();
      antwoord = { tekst: tekst || "Vertel gerust verder.", vraag: "geen", actie: "geen" };
      break;
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    // Eerst vastleggen en rekenen, dan pas antwoorden: een antwoord naast wijzigingen telt niet.
    const wijzigtOok = calls.some((c) => "werk_bij" === c.name);
    let schoon = true;
    // Eerst de wijzigingen, dan pas het antwoord bekijken.
    calls.sort((a, b) => Number("antwoord" === a.name) - Number("antwoord" === b.name));
    for (const c of calls) {
      if ("antwoord" === c.name && wijzigtOok && !schoon) {
        if (verstuurd) { meld("opnieuw"); verstuurd = ""; }
        results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify({ opnieuw: "De wijzigingen zijn net verwerkt. Schrijf je antwoord opnieuw op basis van de nieuwe stand." }) });
        continue;
      }
      const inp: any = c.input ?? {};
      let out: unknown;
      try {
        switch (c.name) {
          case "werk_bij": {
            const voorstel = await kleurenOpzoeken(parseRegels(Array.isArray(inp.regels) ? inp.regels : []), gevonden);
            await metKleuren();
            const u = toepassen(project, { aanvraagId: `${aanvraagId}#${stap}`, versie: project.versie, door: "klant-chat", wijzigingen: voorstel }, opties);
            project = u.project;
            laatsteWijzigingen = laatsteWijzigingen.concat(u.toegepast);
            mens = naarRekenkern(project).mens;
            schoon = schoon && !u.geweigerd.length && !u.openVragen.length;
            out = u.geweigerd.length || u.openVragen.length || mens.length
              ? { niet_gelukt: u.geweigerd.map((x: any) => x.reden), vragen: u.openVragen.map((x: any) => x.vraag), naar_een_mens: mens, stand: stand(project) }
              : { ok: u.toegepast.length };
            break;
          }
          case "zoek_kleur": {
            const z: any = await zoekKleur(String(inp.zoekterm ?? ""));
            for (const k of [z, ...(z.treffers ?? []), ...(z.mogelijk ?? [])]) {
              if (k?.naam && k.type && "geen" !== k.type) {
                gevonden.set(String(k.naam).toLowerCase(), k);
                if (k.merkKleur) { gevonden.set(String(k.merkKleur).toLowerCase(), k); gevonden.set(`${k.merk} ${k.merkKleur}`.toLowerCase(), k); }
                if (k.km?.rollNaam) gevonden.set(String(k.km.rollNaam).toLowerCase(), k);
              }
            }
            out = z;
            break;
          }
          case "stel_kleuren_voor": out = await stelVoor(String(inp.familie ?? ""), inp.lichtheid); break;
          case "kleurhulp": out = await kleurhulp(project, String(inp.ruimte ?? ""), inp.antwoorden); break;
          case "productinfo": out = productinfo(String(inp.onderwerp ?? "")); break;
          case "voorwaarden": out = VOORWAARDEN; break;
          case "antwoord": {
            antwoord = geldigAntwoord(inp);
            if (!antwoord && verstuurd) { meld("opnieuw"); verstuurd = ""; }
            out = antwoord ? { ok: true } : { fout: "Antwoord onvolledig: geef tekst en vraag." };
            break;
          }
          default: out = { fout: "onbekende tool" };
        }
      } catch (e) {
        out = { fout: String((e as Error).message || e) };
      }
      toolLog.push({ tool: c.name, input: c.name === "antwoord" ? undefined : inp });
      results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(out) });
    }
    if (!antwoord) messages.push({ role: "user", content: results });
  }
  if (!antwoord) antwoord = { tekst: "Even geen antwoord. Probeer het nog een keer, of ga verder met de stappen.", vraag: "geen", actie: "stappen" };
  // Rekenen gebeurt niet meer in de beurt: de browser haalt de pakketkaart direct daarna op (GET ...&pakket=1),
  // zodat het antwoord niet op de rekenkern hoeft te wachten.
  mens = naarRekenkern(project).mens;
  // Kaarten alleen van echte Roll-kleuren; de browser toont kleurvlak, naam en omschrijving. Zonder kaarten wachten
  // we niet op de kleurenlijst (een formulier is dan meteen klaar).
  ixP.catch(() => null);
  const ix = antwoord.kaarten?.length ? await ixP : null;
  const kaarten = (antwoord.kaarten ?? []).map((n: string) => ix?.c.find((k) => k.n === n)).filter(Boolean).slice(0, 4).map((k: any) => kaart(k));
  const status = projectStatus(project);
  const { plan } = naarRekenkern(project);
  // Een vaste vraag van het model (maat, muren, onderdelen, lakwerk) wordt een formulier, als er nog iets te vragen is.
  const formulierUit = antwoord.formulier ?? (FORM_VRAGEN[antwoord.vraag] ? maakFormulier(FORM_VRAGEN[antwoord.vraag], project) : null);
  const uit = {
    antwoord: { tekst: String(antwoord.tekst ?? ""), kaartenVoor: kaarten.length ? kaartDoel(project, antwoord.voor) : null, chips: formulierUit ? [] : chipsVoor(String(antwoord.vraag ?? "geen"), project, antwoord.chips ?? []), kaarten, actie: antwoord.actie ?? "geen", aannames: (antwoord.aannames ?? []).slice(0, 6), formulier: formulierUit },
    project, status, pakket: null, pakketVolgt: true, mens, versie: project.versie, mandPlan: mandPlan(plan, status, project), route: route(project),
  };
  const nu = new Date().toISOString();
  const gesprek = [...(rij.gesprek as any[]),
    { rol: "klant", tekst: bericht || formTekst || tikTekst, aanvraagId, op: nu },
    { rol: "roll", tekst: uit.antwoord.tekst, aanvraagId, op: nu, uit: { antwoord: uit.antwoord } }];
  const t2 = Date.now();
  await db.from("projecthulp_chat").upsert({ sessie, project, gesprek, status: rij.status ?? "actief", updated_at: nu });
  tokens.t.opslaan = Date.now() - t2;
  await db.from("projecthulp_chat_log").insert({ sessie, aanvraag_id: aanvraagId, versie: project.versie, bericht: (bericht || formTekst || tikTekst).replace(/\b\d{4}\s?[a-z]{2}\b|\b0\d{9}\b|\S+@\S+/gi, "[weg]"), wijzigingen: laatsteWijzigingen, tools: toolLog, model: modelKeuze, tokens, duur_ms: Date.now() - start });
  return uit;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const q = new URL(req.url).searchParams;
      const deel = q.get("deel") ?? "";
      if (deel) {
        // Een gedeeld plan: alleen kijken. Geen gesprek, geen e-mail, geen sessie.
        const { data: gd } = /^[A-Z0-9]{12}$/.test(deel) ? await db.from("projecthulp_chat").select("project").eq("deel_code", deel).maybeSingle() : { data: null };
        if (!gd) return j({ fout: "Dit gedeelde plan bestaat niet (meer)." }, 404);
        const st = projectStatus(gd.project);
        const { plan: pl } = naarRekenkern(gd.project);
        let pk = null;
        try { pk = await bereken(rekenPlan(pl, gd.project)); } catch { pk = { fout: "Pakket kon niet worden berekend." }; }
        return j({ project: gd.project, status: st, pakket: pk, versie: gd.project.versie, route: route(gd.project), gedeeld: true });
      }
      const sessie = q.get("sessie") ?? "";
      const rij = sessie.length >= 24 ? await laad(sessie) : null;
      if (q.get("kort")) return j(rij ? { bestaat: true, ruimtes: rij.project.ruimtes.map((r: any) => r.naam) } : { bestaat: false });
      if (!rij) return j({ leeg: true });
      const status = projectStatus(rij.project);
      if (new URL(req.url).searchParams.get("pakket")) {
        const { plan: pl } = naarRekenkern(rij.project);
        let pk = null;
        try { pk = await bereken(rekenPlan(pl, rij.project)); } catch { pk = { fout: "Pakket kon niet worden berekend." }; }
        return j({ pakket: pk, versie: rij.project.versie, route: route(rij.project) });
      }
      const { plan } = naarRekenkern(rij.project);
      let pakket = null;
      try { pakket = await bereken(rekenPlan(plan, rij.project)); } catch { pakket = { fout: "Pakket kon niet worden berekend." }; }
      return j({ project: rij.project, gesprek: rij.gesprek.map((b: any) => ({ rol: b.rol, tekst: b.tekst, antwoord: b.uit?.antwoord })), status, pakket, versie: rij.project.versie, mandPlan: mandPlan(plan, status, rij.project), route: route(rij.project), bijRoll: "bij-roll" === rij.status, bewaard: bewaardInfo(rij) });
    }
    const body = await req.json();
    const sessie = String(body.sessie ?? "");
    if (!/^[a-z0-9]{24,64}$/i.test(sessie)) return j({ fout: "Ongeldige sessie." }, 400);
    if (body.bewaard && "object" === typeof body.bewaard) {
      const rij = await laad(sessie);
      if (!rij) return j({ fout: "Geen plan gevonden." }, 404);
      const email = "string" === typeof body.bewaard.email && /^[^\s@]{1,64}@[^\s@]{1,190}\.[a-z]{2,}$/i.test(body.bewaard.email) ? body.bewaard.email.toLowerCase() : null;
      const nu = new Date().toISOString();
      await db.from("projecthulp_chat").update({ bewaard_op: nu, ...(email ? { email } : {}), updated_at: nu }).eq("sessie", sessie);
      return j({ bewaard: bewaardInfo({ ...rij, bewaard_op: nu, email: email ?? rij.email }) });
    }
    if (body.deel) {
      const rij = await laad(sessie);
      if (!rij) return j({ fout: "Geen plan gevonden." }, 404);
      let code = rij.deel_code;
      for (let i = 0; !code && i < 3; i++) {
        const c = Array.from(crypto.getRandomValues(new Uint8Array(12))).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
        const { error } = await db.from("projecthulp_chat").update({ deel_code: c }).eq("sessie", sessie);
        if (!error) code = c;
      }
      return code ? j({ code }) : j({ fout: "Delen lukte niet. Probeer het nog eens." }, 500);
    }
    if (body.kopie) {
      const code = String(body.kopie);
      const { data: gd } = /^[A-Z0-9]{12}$/.test(code) ? await db.from("projecthulp_chat").select("project").eq("deel_code", code).maybeSingle() : { data: null };
      if (!gd) return j({ fout: "Dit gedeelde plan bestaat niet (meer)." }, 404);
      if (await laad(sessie)) return j({ fout: "Deze sessie bestaat al." }, 409);
      const project = { ...gd.project, id: sessie.slice(0, 12), log: [] };
      const welkom = { tekst: "Je begint met een kopie van een gedeeld plan. Pas gerust aan wat bij jou anders is: vertel het hier of tik op de onderdelen.", chips: [], kaarten: [], actie: "geen", aannames: [] };
      const nu = new Date().toISOString();
      await db.from("projecthulp_chat").insert({ sessie, project, gesprek: [{ rol: "roll", tekst: welkom.tekst, aanvraagId: "kopie", op: nu, uit: { antwoord: welkom } }], status: "actief", bron: "kopie", updated_at: nu });
      return j({ ok: true });
    }
    if (body.overdracht) {
      const rij = await laad(sessie);
      if (!rij) return j({ fout: "Geen gesprek gevonden." }, 404);
      const code = rij.code ?? Array.from(crypto.getRandomValues(new Uint8Array(4))).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
      await db.from("projecthulp_chat").update({ code, updated_at: new Date().toISOString() }).eq("sessie", sessie);
      return j({ code, tekst: `Hoi Roll, ik heb een vraag over mijn schilderplan (code ${code}).` });
    }
    const bericht = String(body.bericht ?? "").slice(0, MAX_TEKENS);
    const formulier = body.formulier && "object" === typeof body.formulier && ["start", "onderdelen", "maat", "muren", "lak"].includes(body.formulier.soort) ? body.formulier : null;
    if (!bericht.trim() && !body.tik && !formulier) return j({ fout: "Leeg bericht." }, 400);
    const aanvraagId = String(body.aanvraagId ?? crypto.randomUUID()).slice(0, 64);
    const model = TEST_TOKEN === body.test && /^claude-(haiku|sonnet|opus)-[\d-]+(:(uit|tussen|adaptive))?$/.test(String(body.model ?? "")) ? String(body.model) : MODEL;
    if (!body.stroom) return j(await beurt(sessie, aanvraagId, bericht, body.tik ?? null, model, undefined, formulier));
    const enc = new TextEncoder();
    const sse = new ReadableStream({
      async start(ctrl) {
        const stuur = (soort: string, data: unknown) => { try { ctrl.enqueue(enc.encode(`event: ${soort}\ndata: ${JSON.stringify(data)}\n\n`)); } catch { /* browser weg */ } };
        try {
          stuur("klaar", await beurt(sessie, aanvraagId, bericht, body.tik ?? null, model, (soort, data) => stuur(soort, data ?? null), formulier));
        } catch (e) {
          console.error(e);
          stuur("klaar", { fout: "Er ging iets mis. Probeer het nog een keer, of ga verder met de stappen.", actie: "stappen", ...(TEST_TOKEN === body.test ? { detail: String((e as Error).message ?? e).slice(0, 400) } : {}) });
        }
        ctrl.close();
      },
    });
    return new Response(sse, { headers: { ...cors, "content-type": "text/event-stream", "cache-control": "no-cache" } });
  } catch (e) {
    console.error(e);
    return j({ fout: "Er ging iets mis. Probeer het nog een keer, of ga verder met de stappen.", actie: "stappen" }, 500);
  }
});
