// Genereert supabase/functions/_shared/roll-collection.ts (compacte collectie voor de conceptvoorbereiding)
// uit src/data/roll-colors.ts en src/data/sample-packs.ts. Draai: npm run sync:collection
import { readFileSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const src = readFileSync(resolve(root, "src/data/roll-colors.ts"), "utf8");

// De array begint na "rollColors ="; het einde vinden we met haakjesbalans (er staat code achter de array).
const start = src.indexOf("[", src.indexOf("rollColors"));
let depth = 0, end = -1;
for (let i = start; i < src.length; i++) {
  const ch = src[i];
  if (ch === "[") depth++;
  else if (ch === "]") { depth--; if (depth === 0) { end = i; break; } }
}
const colors = new Function(`return (${src.slice(start, end + 1)});`)();

const packsSrc = readFileSync(resolve(root, "src/data/sample-packs.ts"), "utf8");
const packs = [...packsSrc.matchAll(/\{ id: "([^"]+)", displayName: "([^"]+)", colorCount: \d+, colorIds: (\[[^\]]*\])/g)]
  .map((m) => ({ id: m[1], name: m[2], colorIds: JSON.parse(m[3]) }));

const compact = colors.map((c) => ({
  id: c.id, name: c.name, sub: c.subname ?? "", family: c.familyPrimary ?? "", light: c.lightnessBand ?? "",
  undertone: c.undertone ?? "", temp: c.temperatureScore ?? 0, chroma: c.chroma ?? "", neutral: !!c.isNeutral, lrv: c.lrv ?? null, hex: c.hex ?? "",
}));
const out = `// GEGENEREERD - niet handmatig bewerken. Bron: src/data/roll-colors.ts + sample-packs.ts. npm run sync:collection
export const ROLL_COLORS = ${JSON.stringify(compact)};
export const ROLL_PACKS = ${JSON.stringify(packs)};
`;
writeFileSync(resolve(root, "supabase/functions/_shared/roll-collection.ts"), out);
console.log(`[sync:collection] ${compact.length} kleuren, ${packs.length} bundels`);
