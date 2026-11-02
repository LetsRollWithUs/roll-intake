// Kopieert het projectmodel en de bronnen uit de Projecthulp-repo naar de edge functions.
// Draaien na een wijziging daar: node scripts/sync-projectmodel.mjs (PROJECTMODEL_PAD overschrijft het bronpad).
import { cpSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const BRON = process.env.PROJECTMODEL_PAD || join(import.meta.dirname, "..", "..", "kleurplan-plugin", "projectmodel");
const DOEL = join(import.meta.dirname, "..", "supabase", "functions", "_shared", "projectmodel");
const KOP = "// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.\n";

for (const f of readdirSync(join(BRON, "src"))) {
  writeFileSync(join(DOEL, f), KOP + readFileSync(join(BRON, "src", f), "utf8"));
}
for (const f of ["productinfo.json", "packs.json", "voorwaarden.json"]) {
  cpSync(join(BRON, "bronnen", f), join(DOEL, f));
}
console.log("projectmodel en bronnen gekopieerd naar", DOEL);
