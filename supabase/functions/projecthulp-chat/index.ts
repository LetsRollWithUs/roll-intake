// Jouw schilderplan: de chat in de Projecthulp (fase 1, verborgen achter ?chat=1 op roll.nl/kleurplan).
//
// Volgorde per beurt (zoals in het plan): bericht -> voorstel van het model (werk_project_bij) -> controle en
// vastleggen in een nieuwe projectversie (projectmodel v2) -> berekening door de rekenkern op roll.nl -> pas dan
// schrijft het model zijn antwoord (tool antwoord). Getallen, producten en prijzen toont de browser uit de berekening.
//
// POST { sessie, aanvraagId, bericht? , tik? }  -> { antwoord, project, status, pakket, mens, versie }
// POST { sessie, overdracht: 'whatsapp'|'mail' } -> { code, tekst }
// GET  ?sessie=...                              -> de laatste stand (terugkomen)
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { nieuwProject, naarRekenkern, projectStatus, toepassen, w } from "../_shared/projectmodel/index.js";
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

const TOOLS: Anthropic.Tool[] = [
  {
    name: "werk_project_bij",
    description: "Leg alles vast wat de klant in zijn bericht zegt, in een aanroep met een lijst wijzigingen. De server controleert, legt vast en rekent; je krijgt de nieuwe projectstand, open vragen en de status per onderdeel terug.",
    input_schema: {
      type: "object",
      properties: {
        wijzigingen: {
          type: "array",
          items: {
            type: "object",
            properties: {
              actie: { type: "string", enum: ["ruimte-erbij", "ruimte-weg", "vlak-erbij", "vlak-weg", "zet", "kleur", "sample", "ongedaan"] },
              ruimte: { type: "string", description: "Vaste ruimte-ID: het type, met een cijfer bij een tweede (woonkamer, slaapkamer2)." },
              vlak: { type: "string", description: "Vaste vlak-ID: muren, plafond, accent." },
              type: { type: "string", description: "Ruimtetype bij ruimte-erbij." },
              naam: { type: "string" },
              soort: { type: "string", description: "Soort bij vlak-erbij: plafond of accent." },
              veld: { type: "string", description: "Bij zet: maat.lengte, maat.breedte, maat.grootte, hoogte, extra, ondergrond.materiaal, ondergrond.afwerking, ondergrond.kleurNu, ondergrond.structuur, ondergrond.conditie, breedte, hoogte, doel, spullen, wanneer." },
              waarde: { description: "De waarde (getal, tekst of ja/nee)." },
              zekerheid: { type: "string", enum: ["zeker", "waarschijnlijk", "onduidelijk"] },
              wat: { type: "string", enum: ["kies", "kandidaat", "favoriet", "afwijzen", "open", "richting", "erbij", "weg"] },
              richting: { type: "string" },
              kleur: { type: "object", description: "Een kleur zoals zoek_kleur of stel_kleuren_voor die teruggaf." },
              vraag: { type: "string", description: "Bij onduidelijk: de vraag die je de klant stelt." },
            },
            required: ["actie"],
          },
        },
      },
      required: ["wijzigingen"],
    },
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
    input_schema: {
      type: "object",
      properties: {
        tekst: { type: "string", description: "Kort, je-vorm, hooguit drie zinnen voor de vraag. Geen getallen voor liters of bedragen." },
        chips: { type: "array", items: { type: "string" }, description: "Tikbare antwoorden op je vraag, inclusief Weet ik niet waar dat kan." },
        kaarten: { type: "array", items: { type: "string" }, description: "Namen van Roll-kleuren om als kaart te tonen." },
        aannames_getoond: {
          type: "array",
          items: { type: "object", properties: { ruimte: { type: "string" }, vlak: { type: "string" }, veld: { type: "string" } }, required: ["veld"] },
          description: "Aannames die je in deze tekst zichtbaar noemt (bijv. hoogte 2,60 m). Gaat de klant daarna verder, dan gelden ze als geaccepteerd.",
        },
        actie: { type: "string", enum: ["geen", "samples", "bestellen", "bewaren", "stappen", "overdracht", "kleuradvies"] },
      },
      required: ["tekst", "chips", "kaarten", "actie"],
    },
  },
];

const SYSTEEM = `Je bent Roll, het Nederlandse verfmerk, en je helpt een klant in de Projecthulp met zijn schilderplan: welke kleur waar, wat er eerst moet, wat hij nodig heeft en wat de volgende stap is. Je hebt geen eigen naam; je praat als Roll ("we").

DOEL: de klant eindigt met een passend plan, vertrouwen in het resultaat en een duidelijke volgende stap. Elke vraag moet bijdragen aan een mooier resultaat, minder gedoe of een betere aankoop.

SCOPE VAN DEZE VERSIE: een binnenruimte, muren en eventueel plafond (en een accentmuur). Noemt de klant lakwerk (deuren, kozijnen), meer ruimtes, buitenwerk, trappen of meubels: zeg vriendelijk dat deze versie daar nog niet bij helpt en zet actie "stappen" (de gewone Projecthulp) of "overdracht".

ZO WERK JE ELKE BEURT
1. Noemt de klant een kleur: eerst zoek_kleur.
2. Leg alles wat de klant zegt vast met EEN aanroep van werk_project_bij (alle wijzigingen tegelijk). Ruimte-ID = het type (woonkamer, slaapkamer). Vlak-ID's: muren, plafond, accent. Een nieuwe ruimte krijgt automatisch het vlak muren.
3. Zekerheid: "zeker" als de klant het duidelijk zegt; "waarschijnlijk" als je het afleidt (dat wordt een zichtbare aanname); "onduidelijk" met een vraag als het dubbelzinnig is en het pakket wezenlijk verandert.
4. Sluit ALTIJD af met de tool antwoord. Kies de volgende vraag op basis van wat de server teruggeeft (open vragen, status per onderdeel). Stel nooit een vraag waarvan je het antwoord al weet.

VOLGORDE NAAR DE KLANT: begint de klant over kleur of twijfel, help dan eerst met kleur; begint hij met een klus, vraag dan het ontbrekende: onderdelen (plafond mee?), maat, de muren nu, kleur. Een vraag mag dingen bundelen die bij elkaar horen.

DE MUREN NU: vraag het met deze chips: "Geschilderd, licht, glad", "Geschilderd, donker", "Kaal stucwerk of gipsplaat", "Behang", "Structuur of scheuren", "Weet ik niet". "Geschilderd, licht, glad" = afwerking muurverf, kleurNu licht, structuur glad, conditie goed (allemaal zeker). Kaal = afwerking geen (vraag eventueel stucwerk of gipsplaat). Behang gaat er altijd af; vraag daarna of er scheuren onder zitten. Weet ik niet = afwerking onbekend; zeg dan "we rekenen voorlopig met twee lagen" en noem dat in aannames_getoond. Vocht, schimmel, afbladderende muurverf of beton: zeg dat dit een beoordeling vraagt en zet actie "overdracht".

DUBBELZINNIG, ALTIJD KORT BEVESTIGEN: "plafond wit laten" (niet schilderen of opnieuw wit?), "nieuwbouw" (kaal of al geschilderd?), "alles wit" (welke onderdelen, welk wit?), "20 vierkante meter" (vloer of muren?).

MAAT: lengte x breedte van de vloer is genoeg. Weet de klant het niet: chips Klein, Gemiddeld, Groot. Noem de hoogte als aanname: "We rekenen met muren van 2,60 m; klopt dat niet, zeg het gerust" en zet hem in aannames_getoond.

KLEUR (per vlak):
- Roll-kleur of RAL genoemd en duidelijk gekozen: kleur actie wat "kies", zekerheid zeker. Bevestig kort met naam en tint.
- Kleur van een ander merk: zoek_kleur geeft het merk terug. Bevestig het merk een keer zakelijk ("Je bedoelt [merk] [kleur]. Die mengen we voor je, bij ons heet hij ...") en gebruik daarna alleen de Roll-naam. Noem nooit uit jezelf een ander merk.
- Geen treffer: zeg dat eerlijk en stel een passende Roll-kleur voor als kaart; de klant kiest die zelf.
- Richting (familie of sfeer): kleur actie wat "richting", dan stel_kleuren_voor en toon de kleuren als kaarten. Op een kaart kan de klant een favoriet maken, een sample proberen of de kleur kiezen.
- Twijfel tussen kleuren: wat "kandidaat", nooit "kies".
- Geen idee: bied aan: Help me kiezen (kleurhulp), Laat een stylist meekijken (actie "kleuradvies"), Later kiezen. Kleurhulp: vraag de vragen een voor een met hun keuzes als chips; vul in wat je al weet; daarna kleurhulp met antwoorden en toon de drie kleuren als kaarten.
- Een sample is een advies, nooit een voorwaarde. Accentmuur alleen voorstellen als de klant een muur noemt of twijfelt of een kleur niet te veel wordt.
- Wanneer de klant wil beginnen vraag je alleen als het past (bij twijfel over kleur). Wie schildert vraag je bij de spullen.

PLAFOND: vraag een keer "Gaat het plafond ook mee?" met chips Nee, Ja wit, Ja in de muurkleur, Weet ik nog niet. Ja wit = vlak-erbij plafond en kleur Blank Page.

SPULLEN: "Heb je al rollers en kwasten?" chips: "Nog niets, zet alles klaar" (spullen niets), "Ik heb al spullen" (alles), "Er komt een schilder" (schilder).

TOON: warm, kort, deskundig zonder vakjargon, je-vorm. Hooguit drie zinnen voor de vraag. Positief, geen druk, geen nepdeadlines. Geen emoji, geen gedachtestreepjes.

NOOIT: een HEX-code of mengcode noemen; zelf liters, aantallen blikken of bedragen noemen (die staan in de pakketkaart); dekking beloven ("een laag is genoeg", "dekt altijd"): zeg "we rekenen met een laag" of "met twee lagen"; retour noemen als geruststelling (op kleur gemengde verf kan niet retour); voorwaarden of productinformatie noemen die niet uit productinfo of voorwaarden komt; renovlies of verf over behang adviseren.

VOLGENDE STAP (antwoord.actie): "samples" als er samples klaarstaan en de kleur nog open is; "bestellen" als onderdelen klaar zijn; "bewaren" bij later verder; "geen" als je nog een vraag stelt.`;

/* ---------- uitvoering van de tools ---------- */

async function zoekKleur(term: string) {
  const t = term.trim();
  const ix = await index();
  const exact = ix.c.find((k) => k.n.toLowerCase() === t.toLowerCase());
  if (exact) return { type: "roll", naam: exact.n, omschrijving: exact.d ?? "" };
  const ral = /^ral\s*[-.]?\s*(\d{4})$/i.exec(t);
  const zoek = ral ? `RAL ${ral[1]}` : t;
  const res = await (await fetch(`${ROLL}/wp-json/ark-kleurmatch/v1/colors?search=${encodeURIComponent(zoek)}&per_page=3`)).json().catch(() => []);
  const lijst = Array.isArray(res) ? res : [];
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
  let lijst = ix.c.filter((k) => (k.c ?? []).includes(slug));
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

/** Wat het model van het project te zien krijgt: compact, met herkomst. */
function samenvatting(p: any, status: any) {
  const g = (x: any) => (x ? `${x.waarde}${"gezegd" === x.bron ? "" : x.geaccepteerd ? " (aanname, geaccepteerd)" : " (aanname)"}` : null);
  return {
    versie: p.versie,
    doel: w(p.doel),
    spullen: w(p.spullen),
    wanneer: w(p.wanneer),
    samples: (p.samples ?? []).map((s: any) => s.naam),
    ruimtes: p.ruimtes.map((r: any) => ({
      id: r.id, type: r.type, naam: r.naam,
      maat: { lengte: g(r.maat.lengte), breedte: g(r.maat.breedte), grootte: g(r.maat.grootte) },
      hoogte: g(r.hoogte),
      vlakken: r.vlakken.map((v: any) => ({
        id: v.id, soort: v.soort,
        ondergrond: Object.fromEntries(Object.entries(v.ondergrond).map(([k, x]) => [k, g(x)])),
        breedte: g(v.breedte),
        kleur: { status: v.kleur.status, gekozen: w(v.kleur.gekozen)?.naam ?? null, richting: v.kleur.richting ?? null, kandidaten: v.kleur.kandidaten.map((k: any) => k.naam), favorieten: v.kleur.favorieten.map((k: any) => k.naam), afgewezen: v.kleur.afgewezen.map((k: any) => k.naam) },
      })),
    })),
    status: status.onderdelen.map((o: any) => ({ onderdeel: `${o.ruimte}.${o.vlak}`, status: o.status, ontbreekt: o.ontbreekt, controleren: o.controleren })),
    openVragen: (p.openVragen ?? []).slice(-3).map((q: any) => q.vraag),
  };
}

/** Alleen onderdelen die klaar zijn gaan mee naar het mandje; samples altijd. */
function mandPlan(plan: any, status: any) {
  const klaar = new Set(status.onderdelen.filter((o: any) => "klaar" === o.status).map((o: any) => `${o.ruimte}.${o.vlak}`));
  const ruimtes = plan.ruimtes.map((r: any) => ({ ...r, vlakken: r.vlakken.filter((v: any) => klaar.has(`${r.id}.${v.id}`)) })).filter((r: any) => r.vlakken.length);
  return { ...plan, ruimtes };
}

/* ---------- de beurt ---------- */

async function laad(sessie: string) {
  const { data } = await db.from("projecthulp_chat").select("*").eq("sessie", sessie).maybeSingle();
  return data;
}

async function beurt(sessie: string, aanvraagId: string, bericht: string, tik: any) {
  const start = Date.now();
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
  const ix = await index();
  const kleurIndex = new Set(ix.c.map((k) => k.n));
  const opties = { kleurIndex };
  const toolLog: any[] = [];
  let laatsteWijzigingen: any[] = [];

  // Aannames die de bot vorige beurt noemde: de klant ging verder, dus geaccepteerd.
  const vorige = [...(rij.gesprek as any[])].reverse().find((b) => "roll" === b.rol);
  const getoond = vorige?.uit?.antwoord?.aannames_getoond ?? [];
  if (getoond.length) {
    project = toepassen(project, { aanvraagId: aanvraagId + "#a", versie: project.versie, door: "klant-chat", wijzigingen: getoond.map((a: any) => ({ actie: "accepteer", ...a })) }, opties).project;
  }
  // Een tik op een kaart of chip: direct vastleggen als bewuste keuze van de klant.
  let tikTekst = "";
  if (tik && "object" === typeof tik) {
    const u = toepassen(project, { aanvraagId: aanvraagId + "#t", versie: project.versie, door: "klant-kaart", wijzigingen: [{ zekerheid: "zeker", ...tik }] }, opties);
    project = u.project;
    tikTekst = `De klant tikte: ${tik.wat ?? tik.actie} ${tik.kleur?.naam ?? ""} ${tik.vlak ? "voor " + tik.vlak : ""}`.trim();
  }

  let pakket: any = null;
  let mens: any[] = [];
  const herbereken = async () => {
    const { plan, mens: m } = naarRekenkern(project);
    mens = m;
    try { pakket = await bereken(plan); } catch { pakket = { fout: "Pakket kon niet worden berekend." }; }
  };
  await herbereken();

  const geschiedenis: Anthropic.MessageParam[] = (rij.gesprek as any[]).slice(-10).map((b) => ({ role: "klant" === b.rol ? "user" : "assistant", content: b.tekst || "..." }) as Anthropic.MessageParam);
  // Een gesprek begint altijd met de klant.
  while (geschiedenis.length && "assistant" === geschiedenis[0].role) geschiedenis.shift();
  // Zelfde rol twee keer achter elkaar mag; de API voegt ze samen.
  const stand = () => JSON.stringify(samenvatting(project, projectStatus(project)));
  const messages: Anthropic.MessageParam[] = [...geschiedenis, { role: "user", content: `Projectstand nu: ${stand()}\n\n${tikTekst ? tikTekst + "\n" : ""}Klant: ${bericht || "(tikte op een kaart)"}` }];

  let antwoord: any = null;
  let tokens = { in: 0, uit: 0, cache: 0 };
  for (let stap = 0; stap < MAX_STAPPEN && !antwoord; stap++) {
    const res = await claude.beta.messages.create({
      model: MODEL,
      max_tokens: 4000,
      system: [{ type: "text", text: SYSTEEM, cache_control: { type: "ephemeral", ttl: "1h" } }],
      tools: TOOLS,
      messages,
      output_config: { effort: "low" },
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    } as any);
    tokens.in += res.usage?.input_tokens ?? 0;
    tokens.uit += res.usage?.output_tokens ?? 0;
    tokens.cache += (res.usage as any)?.cache_read_input_tokens ?? 0;
    if ("refusal" === res.stop_reason) break;
    messages.push({ role: "assistant", content: res.content as any });
    const calls = res.content.filter((c: any) => "tool_use" === c.type) as Anthropic.ToolUseBlock[];
    if (!calls.length) {
      const tekst = res.content.filter((c: any) => "text" === c.type).map((c: any) => c.text).join("\n").trim();
      antwoord = { tekst: tekst || "Vertel gerust verder.", chips: [], kaarten: [], actie: "geen" };
      break;
    }
    const results: Anthropic.ToolResultBlockParam[] = [];
    // Eerst vastleggen en rekenen, dan pas antwoorden: een antwoord naast wijzigingen telt niet.
    const wijzigtOok = calls.some((c) => "werk_project_bij" === c.name);
    for (const c of calls) {
      if ("antwoord" === c.name && wijzigtOok) {
        results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify({ opnieuw: "De wijzigingen zijn net verwerkt. Schrijf je antwoord opnieuw op basis van de nieuwe stand." }) });
        continue;
      }
      const inp: any = c.input ?? {};
      let out: unknown;
      try {
        switch (c.name) {
          case "werk_project_bij": {
            const u = toepassen(project, { aanvraagId: `${aanvraagId}#${stap}`, versie: project.versie, door: "klant-chat", wijzigingen: Array.isArray(inp.wijzigingen) ? inp.wijzigingen : [] }, opties);
            project = u.project;
            laatsteWijzigingen = laatsteWijzigingen.concat(u.toegepast);
            await herbereken();
            out = { toegepast: u.toegepast.length, geweigerd: u.geweigerd.map((x: any) => x.reden), openVragen: u.openVragen.map((x: any) => x.vraag), naar_een_mens: mens, pakket_berekend: !!pakket && !pakket.fout, stand: JSON.parse(stand()) };
            break;
          }
          case "zoek_kleur": out = await zoekKleur(String(inp.zoekterm ?? "")); break;
          case "stel_kleuren_voor": out = await stelVoor(String(inp.familie ?? ""), inp.lichtheid); break;
          case "kleurhulp": out = await kleurhulp(project, String(inp.ruimte ?? ""), inp.antwoorden); break;
          case "productinfo": out = productinfo(String(inp.onderwerp ?? "")); break;
          case "voorwaarden": out = VOORWAARDEN; break;
          case "antwoord": antwoord = inp; out = { ok: true }; break;
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
  if (!antwoord) antwoord = { tekst: "Even geen antwoord. Probeer het nog een keer, of ga verder met de stappen.", chips: [], kaarten: [], actie: "stappen" };

  // Kaarten alleen van echte Roll-kleuren; de browser toont kleurvlak, naam en omschrijving.
  const kaarten = (antwoord.kaarten ?? []).map((n: string) => ix.c.find((k) => k.n === n)).filter(Boolean).slice(0, 4).map((k: any) => kaart(k));
  const status = projectStatus(project);
  const { plan } = naarRekenkern(project);
  const uit = {
    antwoord: { tekst: String(antwoord.tekst ?? ""), chips: (antwoord.chips ?? []).slice(0, 6), kaarten, actie: antwoord.actie ?? "geen", aannames_getoond: antwoord.aannames_getoond ?? [] },
    project, status, pakket, mens, versie: project.versie, mandPlan: mandPlan(plan, status),
  };
  const nu = new Date().toISOString();
  const gesprek = [...(rij.gesprek as any[]),
    { rol: "klant", tekst: bericht || tikTekst, aanvraagId, op: nu },
    { rol: "roll", tekst: uit.antwoord.tekst, aanvraagId, op: nu, uit: { antwoord: uit.antwoord } }];
  await db.from("projecthulp_chat").upsert({ sessie, project, gesprek, status: rij.status ?? "actief", updated_at: nu });
  await db.from("projecthulp_chat_log").insert({ sessie, aanvraag_id: aanvraagId, versie: project.versie, bericht: (bericht || tikTekst).replace(/\b\d{4}\s?[a-z]{2}\b|\b0\d{9}\b|\S+@\S+/gi, "[weg]"), wijzigingen: laatsteWijzigingen, tools: toolLog, model: MODEL, tokens, duur_ms: Date.now() - start });
  return uit;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    if (req.method === "GET") {
      const sessie = new URL(req.url).searchParams.get("sessie") ?? "";
      const rij = sessie.length >= 24 ? await laad(sessie) : null;
      if (!rij) return j({ leeg: true });
      const status = projectStatus(rij.project);
      const { plan } = naarRekenkern(rij.project);
      let pakket = null;
      try { pakket = await bereken(plan); } catch { pakket = { fout: "Pakket kon niet worden berekend." }; }
      return j({ project: rij.project, gesprek: rij.gesprek.map((b: any) => ({ rol: b.rol, tekst: b.tekst, antwoord: b.uit?.antwoord })), status, pakket, versie: rij.project.versie, mandPlan: mandPlan(plan, status), bijRoll: "bij-roll" === rij.status });
    }
    const body = await req.json();
    const sessie = String(body.sessie ?? "");
    if (!/^[a-z0-9]{24,64}$/i.test(sessie)) return j({ fout: "Ongeldige sessie." }, 400);
    if (body.overdracht) {
      const rij = await laad(sessie);
      if (!rij) return j({ fout: "Geen gesprek gevonden." }, 404);
      const code = rij.code ?? Array.from(crypto.getRandomValues(new Uint8Array(4))).map((x) => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[x % 32]).join("");
      await db.from("projecthulp_chat").update({ code, updated_at: new Date().toISOString() }).eq("sessie", sessie);
      return j({ code, tekst: `Hoi Roll, ik heb een vraag over mijn schilderplan (code ${code}).` });
    }
    const bericht = String(body.bericht ?? "").slice(0, MAX_TEKENS);
    if (!bericht.trim() && !body.tik) return j({ fout: "Leeg bericht." }, 400);
    const aanvraagId = String(body.aanvraagId ?? crypto.randomUUID()).slice(0, 64);
    return j(await beurt(sessie, aanvraagId, bericht, body.tik ?? null));
  } catch (e) {
    console.error(e);
    return j({ fout: "Er ging iets mis. Probeer het nog een keer, of ga verder met de stappen.", actie: "stappen" }, 500);
  }
});
