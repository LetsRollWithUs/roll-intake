// Genereert src/data/sample-packs.ts uit de gecureerde bron in de Quiz-shop.
//
// De Quiz-shop (Quiz/src/data/sample-packs.ts) is de ENIGE bron van waarheid
// voor de packsamenstelling (welke Roll-kleuren in welke bundel zitten).
// WooCommerce kent de packs wel als product (prijs/voorraad), maar niet de
// kleursamenstelling; die is met de hand gecureerd en leeft dus in code.
//
// Gebruik:  npm run sync:packs
// Pad overschrijven:  QUIZ_PACKS_PATH=/pad/naar/sample-packs.ts npm run sync:packs
//
// Draai dit lokaal als de shop-packs wijzigen; het resultaat wordt gecommit en
// door Vercel meegedeployed. Zo is er één bron en geen handmatige dubbele data.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const intakeRoot = resolve(here, "..");

const SOURCE =
  process.env.QUIZ_PACKS_PATH ||
  process.argv[2] ||
  resolve(intakeRoot, "../Quiz/src/data/sample-packs.ts");
const OUT = resolve(intakeRoot, "src/data/sample-packs.ts");
const ROLL_COLORS = resolve(intakeRoot, "src/data/roll-colors.ts");

function fail(msg) {
  console.error(`\n[sync:packs] ${msg}\n`);
  process.exit(1);
}

let src;
try {
  src = readFileSync(SOURCE, "utf8");
} catch {
  fail(`Bronbestand niet gevonden: ${SOURCE}\nGeef het juiste pad via QUIZ_PACKS_PATH of als argument.`);
}

// Pak de inhoud van de SAMPLE_PACKS-array.
const arrMatch = src.match(/SAMPLE_PACKS[^=]*=\s*\[([\s\S]*?)\n\];/);
if (!arrMatch) fail("Kon de SAMPLE_PACKS-array niet vinden in de bron.");

// Elk pack-object bevat geen geneste accolades (arrays gebruiken []),
// dus we matchen op {...} zonder binnenste accolades.
const blocks = arrMatch[1].match(/\{[^{}]*\}/g) || [];
if (!blocks.length) fail("Geen pack-objecten gevonden in SAMPLE_PACKS.");

const str = (block, key) => {
  const m = block.match(new RegExp(`${key}:\\s*['"\`]([^'"\`]*)['"\`]`));
  return m ? m[1] : null;
};
const num = (block, key) => {
  const m = block.match(new RegExp(`${key}:\\s*([0-9]+)`));
  return m ? Number(m[1]) : null;
};
const ids = (block) => {
  const m = block.match(/colorIds:\s*\[([\s\S]*?)\]/);
  if (!m) return [];
  return [...m[1].matchAll(/['"`]([^'"`]+)['"`]/g)].map((x) => x[1]);
};

const packs = blocks.map((b) => {
  const id = str(b, "id");
  const displayName = str(b, "displayName") ?? str(b, "name") ?? id;
  const colorIds = ids(b);
  const colorCount = num(b, "colorCount") ?? colorIds.length;
  const description = str(b, "description") ?? "";
  if (!id) fail("Een pack-object mist een id.");
  return { id, displayName, colorCount, colorIds, description };
});

// Validatie: kloppen colorCount en bestaan alle colorIds in roll-colors?
let knownColorIds = null;
try {
  const rc = readFileSync(ROLL_COLORS, "utf8");
  knownColorIds = new Set([...rc.matchAll(/"id":\s*"([^"]+)"/g)].map((m) => m[1]));
} catch {
  console.warn("[sync:packs] roll-colors.ts niet gelezen; colorId-validatie overgeslagen.");
}

let warnings = 0;
for (const p of packs) {
  if (p.colorCount !== p.colorIds.length) {
    console.warn(`[sync:packs] ${p.id}: colorCount=${p.colorCount} maar ${p.colorIds.length} colorIds.`);
    warnings++;
  }
  if (knownColorIds) {
    for (const cid of p.colorIds) {
      if (!knownColorIds.has(cid)) {
        console.warn(`[sync:packs] ${p.id}: onbekende colorId "${cid}" (staat niet in roll-colors.ts).`);
        warnings++;
      }
    }
  }
}

const body = packs
  .map(
    (p) =>
      `  { id: ${JSON.stringify(p.id)}, displayName: ${JSON.stringify(p.displayName)}, colorCount: ${p.colorCount}, colorIds: ${JSON.stringify(
        p.colorIds,
      )}, description: ${JSON.stringify(p.description)} },`,
  )
  .join("\n");

const out = `// GEGENEREERD BESTAND - NIET HANDMATIG BEWERKEN.
// Bron van waarheid: de Quiz-shop (src/data/sample-packs.ts).
// Regenereer met:  npm run sync:packs
// Laatste sync: ${new Date().toISOString()}
//
// Sample-bundels (kleurfamilie-packs). colorIds matchen roll-colors.ts.
// Alleen wat de intake nodig heeft: geen prijs/afbeelding.

export interface SamplePack {
  id: string;
  displayName: string;
  colorCount: number;
  colorIds: string[];
  description: string;
}

export const SAMPLE_PACKS: SamplePack[] = [
${body}
];
`;

writeFileSync(OUT, out, "utf8");
console.log(`[sync:packs] ${packs.length} packs geschreven naar src/data/sample-packs.ts${warnings ? ` (${warnings} waarschuwing(en))` : ""}.`);
