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

export interface PromptPhotos {
  rooms: Record<string, string[]>; // room id -> foto-URL's
  samples: Record<string, string>; // sample id -> foto-URL
  inspiration: string[];
}

export function buildAdvicePrompt(intake: IntakeRow, photos: PromptPhotos): string {
  const p = (intake.payload ?? {}) as Record<string, unknown>;
  const first = (intake.contact_name ?? "").trim().split(/\s+/)[0] || "de klant";
  const roomById = new Map((intake.rooms ?? []).map((r) => [r.id, r.label]));
  const L: string[] = [];

  L.push(`Je bent een ervaren kleuradviseur van Roll, een Nederlands verfmerk met een eigen collectie van ${rollColors.length} kleuren. Je bereidt een online kleuradvies (videogesprek van 30 minuten) voor op basis van de intake hieronder. Adviseer uitsluitend met kleuren uit de Roll-collectie in deze prompt.`);
  L.push("");
  L.push("# Werkwijze");
  L.push("Werk stap voor stap en weeg per ruimte drie dingen mee: het licht, het bestaande interieur en de gewenste sfeer.");
  L.push("");
  L.push("## 1. Licht (technisch)");
  L.push("- Noorderlicht (koel, grijzig): kies warme of neutrale ondertonen. Vermijd kleuren met 'kan koel/grijs trekken bij noorderlicht'. Kleuren ogen hier donkerder dan op de sample.");
  L.push("- Oost (ochtendzon): warm in de ochtend, koeler later. Neutrale tot licht warme tinten blijven de hele dag in balans.");
  L.push("- Zuid (middagzon): veel warm licht. Verdraagt koelere tinten en meer kleur; hele lichte kleuren kunnen verbleken.");
  L.push("- West (avondzon): koel overdag, oranje aan het eind van de dag. Pas op met gele of oranje ondertonen ('kan geel ogen bij warm licht').");
  L.push("- Weinig licht of geen ramen: kies voor de hoofdkleur bij voorkeur LRV 60 of hoger, of kies bewust diep en omhullend (colour drenching). Vermijd 'oogt snel dof bij weinig licht' tenzij dat de bedoeling is.");
  L.push("- Dakraam: veel koel bovenlicht, dus vergelijkbaar met noorderlicht maar helderder.");
  L.push("- Gebruik 's avonds: kunstlicht (warm, rond 2700K) maakt kleuren warmer en geler. Weeg dat zwaarder dan daglicht als de ruimte vooral 's avonds gebruikt wordt.");
  L.push("- LRV (lichtreflectie): boven 70 licht en ruimtelijk, 40 tot 70 midden, onder 40 diep. Plafond meestal wit of een zeer lichte kleur (LRV 80+), of bewust dezelfde kleur als de muur.");
  L.push("");
  L.push("## 2. Interieur");
  L.push("- Bekijk de foto's: vloer, meubels, textiel, kozijnen, keuken, wat er blijft staan. Stem de ondertoon van de verf af op de vaste elementen (bijvoorbeeld warme eiken vloer: vermijd concurrerende oranje tinten, kies warm-neutraal, greige of een gedempt groen).");
  L.push("- Houd rekening met wat er nog verandert (vloer, meubels, gordijnen) volgens de intake.");
  L.push("- Open ruimtes en zichtlijnen: houd een samenhangende kleurfamilie aan tussen ruimtes die in elkaar overlopen.");
  L.push("- Houtwerk (kozijnen, deuren, plinten): dezelfde kleur als de muur voor rust, of bewust contrast. Benoem je keuze.");
  L.push("");
  L.push("## 3. Sfeer en lef");
  L.push("- Uitgesprokenheid 1 tot 2: neutrale tinten met lage chroma. 3: in balans. 4 tot 5: meer kleur en statement mag.");
  L.push("- Kleuren met 'gebruik: alleen accent' alleen adviseren voor een accentwand, nis, kast of houtwerk, nooit voor een hele ruimte.");
  L.push("- Gebruik de sfeer- en stijlkenmerken van de kleuren om aan te sluiten bij wat de klant mooi vindt.");
  L.push("- Heeft de klant al samples getest: gebruik favorieten en afvallers als richting (wat viel af, en waarom zou dat zijn?). Kleuren van andere merken gebruik je als referentie; vertaal ze naar de dichtstbijzijnde Roll-kleur.");
  L.push("");
  L.push("## Regels");
  L.push("- Alleen Roll-kleuren uit de lijst hieronder, met exacte naam en id. Verzin geen kleuren en adviseer geen andere merken.");
  L.push("- Per ruimte hooguit 3 kleuren om te testen, zodat de klant niet verdrinkt in keuze.");
  L.push("- Kun je de foto-links niet openen, zeg dat dan en baseer je op de beschrijving; vraag om de foto's als ze nodig zijn.");
  L.push("- Schrijf in het Nederlands, warm en helder, zonder gedachtestreepjes (—). Positief, zonder druk.");
  L.push("");
  L.push("# Gewenste output");
  L.push("1. **Samenvatting**: de vraag van de klant in 2 tot 3 zinnen, en wat opvalt aan de ruimtes.");
  L.push("2. **Per ruimte**: korte lichtanalyse (richting, hoeveelheid, gebruik) en 2 kleurrichtingen. Per richting: hoofdkleur, een alternatief, plafond, houtwerk of accent. Leg uit waarom het past bij het licht, het interieur en de sfeer, en noem eventuele risico's.");
  L.push("3. **Sample-advies**: welke kleuren testen (kleurstickers, of verftesters bij grote twijfel) of welk Sample Pack het best past, plus een korte testinstructie.");
  L.push("4. **Voor het gesprek**: wat ontbreekt in de intake en 3 tot 5 vragen om te stellen.");
  L.push(`5. **Concept klantbericht** aan ${first} (hooguit 80 woorden, je-vorm).`);
  L.push("6. **Overzicht** van alle genoemde kleuren in een tabel: naam, id, LRV, ondertoon.");
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
  const likes = (intake.inspiration_likes ?? []).map((id) => INSPIRATIONS.find((i) => i.id === id)?.label ?? id);
  if (likes.length) L.push(`- Gekozen sfeerbeelden: ${likes.join(", ")}`);
  if (p.noSfeerImage) L.push("- Geen van de sfeerbeelden paste");
  if (p.sfeerSameAll === false) L.push(`- Sfeer verschilt per ruimte${p.sfeerExceptionNote ? `: ${String(p.sfeerExceptionNote)}` : ""}`);
  if (intake.inspiration_note) L.push(`- Toelichting inspiratie: ${intake.inspiration_note}`);
  if (intake.pinterest_url) L.push(`- Pinterest: ${intake.pinterest_url}`);
  if (intake.other_inspiration_url) L.push(`- Andere inspiratielink: ${intake.other_inspiration_url}`);
  if (photos.inspiration.length) L.push(`- Eigen inspiratiebeelden:\n${photos.inspiration.map((u) => `  - ${u}`).join("\n")}`);
  if (L[L.length - 1] === "## Sfeer en smaak") L.push("- Niet ingevuld in de intake: leid de sfeer af uit de hulpvraag en de foto's, en zet het bij de vragen voor het gesprek.");
  L.push("");
  L.push("## Kleuren en samples");
  if ((intake.colors ?? []).length) L.push(`- Overweegt (Roll): ${intake.colors!.map((c) => c.name).join(", ")}`);
  if ((intake.samples ?? []).length) {
    L.push("- Al getest:");
    for (const s of intake.samples!) {
      const where = s.roomId ? roomById.get(s.roomId) : null;
      const photo = photos.samples[s.id];
      L.push(`  - ${[s.brand, s.name].filter(Boolean).join(" ")}${s.verdict ? `: ${s.verdict}` : ""}${where ? ` (in ${where})` : ""}${s.note ? `. ${s.note}` : ""}${photo ? `. Foto: ${photo}` : ""}`);
    }
  } else {
    L.push(`- Samples al getest: ${intake.has_samples === "nee" ? "nee" : intake.has_samples ?? "onbekend"}`);
  }
  L.push("");
  L.push("## Ruimtes");
  for (const r of intake.rooms ?? []) {
    L.push(`### ${r.label}${r.priority ? " (voorrang)" : ""}`);
    L.push(`- Te verven: ${(r.surfaces ?? []).map((s) => lbl(SURFACES, s)).join(", ") || "onbekend"}`);
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
      if (lines.length) L.push(`- Maten: ${lines.join("; ")} (wand ${g1(c.wall_m2)} m², plafond ${g1(c.ceiling_m2)} m², houtwerk ${g1(c.woodwork_m2)} m²)`);
    }
    const urls = photos.rooms[r.id] ?? [];
    if (urls.length) L.push(`- Foto's:\n${urls.map((u) => `  - ${u}`).join("\n")}`);
    else L.push("- Foto's: geen");
    L.push("");
  }

  L.push("# Roll-collectie");
  L.push("Formaat: naam [id] | omschrijving (familie) | LRV | ondertoon (temperatuur: negatief = koel, positief = warm) | chroma | geschikt gebruik | lef | sfeer | stijl | combineert met | aandachtspunt | hex");
  L.push(colorTable());
  L.push("");
  L.push("## Sample Packs");
  L.push(packList());
  L.push("");
  L.push("Begin nu met het advies volgens de gewenste output.");
  return L.join("\n");
}
