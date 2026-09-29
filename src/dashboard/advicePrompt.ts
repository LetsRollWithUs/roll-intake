import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";
import { SURFACES, SUN_MOMENTS, USAGE_TIMES, PLANNING, PAINTERS } from "@/data/intake-options";
import { INSPIRATIONS } from "@/data/inspiration";
import { summarizeMeasure, calcRoom } from "@/lib/verfcalc";
import type { IntakeRow } from "./types";

// Eén grote prompt die de styliste in Claude of ChatGPT plakt: alle intake-input, de volledige
// Roll-collectie met technische kenmerken, en een werkwijze die licht en interieur meeweegt.

const lbl = (list: { key: string; label: string }[], k?: string | null) => list.find((x) => x.key === k)?.label ?? k ?? "";
const NL_UNDERTONE: Record<string, string> = { warm: "warm", cool: "koel", neutral: "neutraal" };
const NL_CHROMA: Record<string, string> = { very_low: "zeer laag", low: "laag", medium: "middel", high: "hoog", very_high: "zeer hoog" };
const NL_HERO: Record<string, string> = { always: "hele ruimte", often: "vaak hele ruimte", accent_only: "alleen accent" };
const NL_RISK: Record<string, string> = {
  low_light: "oogt snel dof bij weinig licht",
  cool_neutral_cast: "kan koel/grijs trekken bij noorderlicht",
  yellow_sensitive: "kan geel ogen bij warm (kunst)licht",
  high_chroma: "zeer verzadigd, vraagt om rust eromheen",
};
// Zonmomenten uit de intake vertaald naar lichtrichting.
const SUN_DIR: Record<string, string> = {
  ochtend: "ochtendzon (oost): warm en helder in de ochtend, koeler later op de dag",
  middag: "middagzon (zuid): veel en warm licht",
  avond: "avondzon (west): koel overdag, warm oranje licht aan het eind van de dag",
  noord: "koel daglicht (noord): constant, koel en grijzig licht",
};
const g1 = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

function colorTable(): string {
  const rows = rollColors.map((c) => {
    const x = c as unknown as Record<string, unknown>;
    const risks = ((x.riskTags as string[]) ?? []).filter((t) => NL_RISK[t]).map((t) => NL_RISK[t]);
    const lef = [x.lef_subtiel_ok && "subtiel", x.lef_in_balans_ok && "in balans", x.lef_statement_ok && "statement"].filter(Boolean).join("/");
    return [
      `${c.name} [${c.id}]`,
      `${String(x.subname ?? "")} (${String(x.familyPrimary ?? "")})`,
      `LRV ${x.lrv}`,
      `ondertoon ${NL_UNDERTONE[String(x.undertone)] ?? x.undertone} (temp ${x.temperatureScore})`,
      `chroma ${NL_CHROMA[String(x.chroma)] ?? x.chroma}`,
      `gebruik: ${NL_HERO[String(x.heroSuitability)] ?? x.heroSuitability}`,
      lef ? `lef: ${lef}` : "",
      ((x.moodTags as string[]) ?? []).length ? `sfeer: ${(x.moodTags as string[]).join(", ")}` : "",
      ((x.styleTags as string[]) ?? []).length ? `stijl: ${(x.styleTags as string[]).join(", ")}` : "",
      ((x.pairs as string[]) ?? []).length ? `combineert met: ${(x.pairs as string[]).join(", ")}` : "",
      risks.length ? `let op: ${risks.join("; ")}` : "",
      String(x.hex ?? ""),
    ].filter(Boolean).join(" | ");
  });
  return rows.map((r) => `- ${r}`).join("\n");
}

function packList(): string {
  const byId = new Map(rollColors.map((c) => [c.id, c.name]));
  return SAMPLE_PACKS.map((p) => `- ${p.displayName} Sample Pack [${p.id}]: ${p.colorIds.map((id) => byId.get(id) ?? id).join(", ")}`).join("\n");
}

// Foto's krijgen een vaste id (F = ruimte, S = sample, I = inspiratie). Dezelfde namen staan in de zip,
// zodat de styliste de bestanden als bijlage in de chat kan slepen en het model per foto kan verwijzen.
export interface PromptPhoto { id: string; room: string; type: "ruimtefoto" | "samplefoto" | "inspiratiebeeld"; path: string; url?: string; file: string }
export type PromptPhotos = PromptPhoto[];

const slug = (s: string) => s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "") || "foto";
export function listPhotos(intake: IntakeRow, pathOf: (p: unknown) => string | null): PromptPhotos {
  const out: PromptPhotos = [];
  let f = 0, sN = 0, i = 0;
  const ext = (path: string) => (path.match(/\.([a-z0-9]+)$/i)?.[1] ?? "jpg").toLowerCase();
  for (const r of intake.rooms ?? []) for (const ph of r.photos ?? []) { const pa = pathOf(ph); if (pa) { const id = `F${++f}`; out.push({ id, room: r.label, type: "ruimtefoto", path: pa, file: `${id}-${slug(r.label)}.${ext(pa)}` }); } }
  const roomById = new Map((intake.rooms ?? []).map((r) => [r.id, r.label]));
  for (const smp of intake.samples ?? []) { const pa = smp.photo ? pathOf(smp.photo) : null; if (pa) { const id = `S${++sN}`; out.push({ id, room: (smp.roomId && roomById.get(smp.roomId)) || "sample", type: "samplefoto", path: pa, file: `${id}-${slug(smp.name || "sample")}.${ext(pa)}` }); } }
  for (const ph of intake.inspiration_images ?? []) { const pa = pathOf(ph); if (pa) { const id = `I${++i}`; out.push({ id, room: "inspiratie", type: "inspiratiebeeld", path: pa, file: `${id}-inspiratie.${ext(pa)}` }); } }
  return out;
}

// Onwaarschijnlijke maten: niet stilzwijgend overnemen, eerst laten controleren.
export function maatSignalen(intake: IntakeRow): string[] {
  const out: string[] = [];
  for (const r of intake.rooms ?? []) {
    const m = intake.room_measures?.[r.id];
    if (!m) continue;
    for (const w of m.walls ?? []) {
      const b = Number(w.w) || 0, h = Number(w.h) || 0;
      if (h > 3.5) out.push(`${r.label}: muurhoogte ${g1(h)} m is ongebruikelijk hoog`);
      if (b > 15) out.push(`${r.label}: muurbreedte ${g1(b)} m is ongebruikelijk (misschien vloermaat of optelling?)`);
    }
    for (const c of m.ceilings ?? []) {
      const a = Number(c.l) || 0, b = Number(c.b) || 0, lo = Math.min(a, b), hi = Math.max(a, b);
      if (lo > 0 && lo <= 3 && hi / lo > 4) out.push(`${r.label}: plafond ${g1(a)} × ${g1(b)} m lijkt eerder een muur`);
    }
    const c = calcRoom(m);
    if (c.wall_m2 > 150) out.push(`${r.label}: ${g1(c.wall_m2)} m² muur is erg veel voor één ruimte`);
    if ((r.surfaces ?? []).includes("muren") && c.wall_m2 > 0 && c.wall_m2 < 12) out.push(`${r.label}: ${g1(c.wall_m2)} m² muur is weinig voor een hele ruimte`);
  }
  return out;
}

export function buildAdvicePrompt(intake: IntakeRow, photos: PromptPhotos): string {
  const p = (intake.payload ?? {}) as Record<string, unknown>;
  const first = (intake.contact_name ?? "").trim().split(/\s+/)[0] || "de klant";
  const roomById = new Map((intake.rooms ?? []).map((r) => [r.id, r.label]));
  const L: string[] = [];

  L.push("Je bent de voorbereidend kleuradviseur van Roll, een Nederlands verfmerk. Maak een intern beslisblad voor een professionele interieurstyliste die een online kleuradvies van 30 minuten voert. Je helpt haar één passend kleurplan te kiezen, de laatste onzekerheden op te lossen en een concrete vervolgstap af te spreken. Dit is een werkdocument, geen bericht aan de klant.");
  L.push("");
  L.push("Je krijgt hieronder de intake, een lijst foto's met id (F = ruimte, S = sample, I = inspiratie; de styliste voegt de bestanden als bijlage toe met dezelfde namen), de Roll-collectie en de Sample Packs. Gebruik uitsluitend kleuren uit de collectie met exacte naam en id. Verzin geen kleuren, waarnemingen, maten of prijzen.");
  L.push("");
  L.push("# Werkwijze");
  L.push("1. **Begin bij de klantbeslissing.** Formuleer de hulpvraag in één zin. Bepaal welk vast element het plan stuurt (bank, vloer, keuken). Scheid wat blijft, wat verandert en wat nog onbekend is. Geef een al geteste favoriet voorrang als kandidaat, maar controleer waar en waarom de klant hem mooi vond.");
  L.push("2. **Lees de foto's als bewijs, met grenzen.** Leg per foto vast wat zichtbaar is (bank, vloer, gordijnen, bestaande wand, proefvlak, deur, materiaal, zichtlijn) en noem de foto-id. Onderscheid waarneming van interpretatie. Een foto bewijst geen exacte verfkleur, ondertoon of windrichting. Is een foto niet als bijlage meegegeven of niet te openen, zeg dat letterlijk per foto-id en doe geen uitspraken over de inhoud.");
  L.push("3. **Maak eerst één plan voor het geheel.** Welke kleur wordt de verbindende basis, waar komt de diepere of uitgesproken kleur, hoe dragen plafond, deuren en kozijnen bij? Beoordeel doorgangen en zichtlijnen; zijn die onbekend, maak het een beslispunt. Geef vloer en keuken meer gewicht dan accessoires. Vertaal inspiratie naar kenmerken (licht, warmte, contrast, verzadiging, materiaal); kopieer niet automatisch een kleur uit een sfeerbeeld.");
  L.push("4. **Toets elke kandidaat** per oppervlak aan daglicht, gebruiksmoment en kunstlicht, aangrenzende kleuren, vaste materialen en sfeer. LRV, ondertoon en chroma zijn houvast, geen mechanische regels: noorderlicht vraagt meestal warm of neutraal, avondgebruik maakt kleuren warmer, LRV onder 40 is diep. Een donkere hoofdkleur mag als bewuste keuze. Een kleur met 'gebruik: alleen accent' alleen op een benoemd accentoppervlak.");
  L.push("5. **Durf te kiezen.** Eén voorlopig voorkeursplan en maximaal één alternatief met een wezenlijk andere uitkomst. Geen twee richtingen per kamer. Noem het belangrijkste risico en welke observatie de keuze nog kan veranderen.");
  L.push("6. **Bereid het gesprek voor.** Maximaal vijf vragen, gerangschikt op invloed op de kleurkeuze. Eerst vaste elementen en onbekende proefkleuren verifiëren, dan kandidaten naast bank en vloer vergelijken, dan kiezen, dan het vervolg afspreken. Vraag niet naar wat de intake al betrouwbaar zegt.");
  L.push("7. **Kleine samplekeuze.** Maximaal drie te vergelijken hoofdkleuren voor het hele project. Een al aanwezige sample telt mee als test; adviseer die niet opnieuw. Losse stickers als maar enkele kleuren relevant zijn; een Sample Pack alleen als het merendeel ervan het beslispunt helpt; een verftester bij twijfel over schaal of ondertoon. Stickers en testers bestaan alleen voor Roll-kleuren.");
  L.push("8. **Controleer de invoer.** Neem onwaarschijnlijke maten niet over (zie 'Maten controleren'). Bereken geen liters of prijs. Geef geen kleurmatch met een ander merk op basis van een schermbeeld of naam.");
  L.push("");
  L.push("# Output: intern beslisblad");
  L.push("A. **In één oogopslag**: klantvraag, kleuranker, al geteste favoriet en grootste open vraag. Maximaal vier regels.");
  L.push("B. **Wat de foto's toevoegen**: tabel `foto-id | waarneming | betekenis voor de keuze | te verifiëren`. Meld hier welke foto's niet zijn bekeken.");
  L.push("C. **Voorlopig plan** voor alle ruimtes: tabel `ruimte en oppervlak | Roll-kleur [id] | reden | risico of voorwaarde`. Plafond en houtwerk alleen als ze geschilderd worden.");
  L.push("D. **Echt alternatief**: maximaal één plan, het verschil met de voorkeur en het signaal om over te stappen.");
  L.push("E. **Beslisregel**: `Als [controleerbare waarneming of antwoord], dan [voorkeur]. Als [andere uitkomst], dan [alternatief].`");
  L.push("F. **Gesprekskaart**: maximaal vijf gerangschikte vragen en de 30-minutenvolgorde: verifiëren, vergelijken, kiezen, vervolgstap.");
  L.push("G. **Samples en actie**: bestaande sample, maximaal nodige nieuwe samples (sticker, tester of pack) met per sample welke vraag hij beantwoordt, tegen welk materiaal en bij welk licht. Zet 'maten controleren' als hoeveelheden nog niet betrouwbaar zijn.");
  L.push("H. **Kleurenregister**: alleen kleuren uit het plan of sampleadvies, met naam, id, LRV, ondertoon en toegestane toepassing.");
  L.push("");
  L.push("Schrijf in helder Nederlands voor een styliste: concreet, compact, zorgvuldig met onzekerheid. Geen gedachtestreepjes. Geen klantmail.");
  L.push("");

  L.push("# Intake");
  L.push(`- Klant: ${first}`);
  L.push(`- Hulpvraag: ${intake.main_question || "niet ingevuld"}`);
  if ((intake.help_needs ?? []).length) L.push(`- Waar hulp bij nodig: ${intake.help_needs!.join(", ")}`);
  if (p.questionScope) L.push(`- Vraag gaat over: ${p.questionScope === "een" ? "één ruimte" : "meerdere ruimtes"}`);
  L.push(`- Planning: ${lbl(PLANNING, intake.planning) || "onbekend"}${intake.painter ? ` · schilderen: ${lbl(PAINTERS, intake.painter)}` : ""}`);
  L.push("");
  L.push("## Sfeer en smaak");
  if ((intake.moods ?? []).length) L.push(`- Gewenst gevoel: ${intake.moods!.join(", ")}`);
  if (intake.boldness) L.push(`- Uitgesprokenheid: ${intake.boldness} van 5 (1 = rustig en ingetogen, 5 = verras me)`);
  const likes = (intake.inspiration_likes ?? []).map((id) => INSPIRATIONS.find((x) => x.id === id)?.label ?? id);
  if (likes.length) L.push(`- Gekozen sfeerbeelden: ${likes.join(", ")}`);
  if (p.noSfeerImage) L.push("- Geen van de sfeerbeelden paste");
  if ((intake.rooms ?? []).length > 1 && p.sfeerSameAll != null) L.push(p.sfeerSameAll ? "- Zelfde sfeer in alle ruimtes" : `- Sfeer verschilt per ruimte${p.sfeerExceptionNote ? `: ${String(p.sfeerExceptionNote)}` : ""}`);
  if (intake.inspiration_note) L.push(`- Toelichting inspiratie: ${intake.inspiration_note.trim()}`);
  if (intake.pinterest_url) L.push(`- Pinterest: ${intake.pinterest_url}`);
  if (intake.other_inspiration_url) L.push(`- Andere inspiratielink: ${intake.other_inspiration_url}`);
  const insp = photos.filter((x) => x.type === "inspiratiebeeld");
  if (insp.length) L.push(`- Eigen inspiratiebeelden: ${insp.map((x) => x.id).join(", ")}`);
  if (L[L.length - 1] === "## Sfeer en smaak") L.push("- Niet ingevuld: leid de sfeer af uit de hulpvraag en de foto's, en zet het bij de vragen.");
  L.push("");
  L.push("## Kleuren en samples");
  if ((intake.colors ?? []).length) L.push(`- Overweegt (Roll): ${intake.colors!.map((c) => c.name).join(", ")}`);
  if ((intake.samples ?? []).length) {
    L.push("- Al getest:");
    const sph = photos.filter((x) => x.type === "samplefoto");
    intake.samples!.forEach((smp) => {
      const where = smp.roomId ? roomById.get(smp.roomId) : null;
      const foto = sph.find((x) => x.file.includes(slug(smp.name || "sample")));
      L.push(`  - ${[smp.brand, smp.name].filter(Boolean).join(" ")}${smp.verdict ? `: ${smp.verdict}` : ""}${where ? ` (in ${where})` : ""}${smp.note ? `. ${smp.note}` : ""}${foto ? ` (foto ${foto.id})` : ""}`);
    });
  } else {
    L.push(`- Samples al getest: ${intake.has_samples === "nee" ? "nee" : intake.has_samples ?? "onbekend"}`);
  }
  L.push("");
  L.push("## Ruimtes");
  for (const r of intake.rooms ?? []) {
    L.push(`### ${r.label}${r.priority ? " (voorrang)" : ""}`);
    L.push(`- Te verven: ${(r.surfaces ?? []).map((x) => lbl(SURFACES, x)).join(", ") || "onbekend"}`);
    if (r.noWindows) L.push("- Licht: geen ramen");
    else if ((r.sun ?? []).length) L.push(`- Licht: ${r.sun!.map((k) => SUN_DIR[k] ?? lbl(SUN_MOMENTS, k)).join("; ")}`);
    else L.push("- Licht: onbekend");
    if (r.skylight) L.push("- Dakraam aanwezig");
    if (r.usage) L.push(`- Meest gebruikt: ${lbl(USAGE_TIMES, r.usage)}`);
    if (r.otherChanges) L.push(`- Verandert nog: ${r.otherChangesNote || "ja (vloer, meubels of gordijnen)"}`);
    const m = intake.room_measures?.[r.id];
    if (m) {
      const c = calcRoom(m);
      const lines = summarizeMeasure(m);
      if (lines.length) L.push(`- Maten volgens de klant: ${lines.join("; ")} (muur ${g1(c.wall_m2)} m², plafond ${g1(c.ceiling_m2)} m², houtwerk ${g1(c.woodwork_m2)} m²)`);
    }
    const fotos = photos.filter((x) => x.type === "ruimtefoto" && x.room === r.label);
    L.push(`- Foto's: ${fotos.length ? fotos.map((x) => x.id).join(", ") : "geen"}`);
    L.push("");
  }
  const sig = maatSignalen(intake);
  L.push("## Maten controleren");
  L.push(sig.length ? sig.map((x) => `- ${x}`).join("\n") : "- Geen opvallende maten.");
  L.push("");
  L.push("## Foto's");
  if (photos.length) {
    L.push("Formaat: foto-id | ruimte | type | bestandsnaam van de bijlage | link (7 dagen geldig, als reserve)");
    for (const x of photos) L.push(`- ${x.id} | ${x.room} | ${x.type} | ${x.file}${x.url ? ` | ${x.url}` : ""}`);
  } else L.push("- Er zijn geen foto's bij deze intake.");
  L.push("");
  L.push("# Roll-collectie");
  L.push("Formaat: naam [id] | omschrijving (familie) | LRV | ondertoon (temperatuur: negatief = koel, positief = warm) | chroma | geschikt gebruik | lef | sfeer | stijl | combineert met | aandachtspunt | hex");
  L.push(colorTable());
  L.push("");
  L.push("## Sample Packs");
  L.push(packList());
  L.push("");
  L.push("Maak nu het beslisblad (A tot en met H).");
  return L.join("\n");
}
