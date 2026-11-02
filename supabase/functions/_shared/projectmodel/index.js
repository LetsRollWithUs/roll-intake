// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/** Projectmodel v2 van Jouw schilderplan: één model voor chat en stappen. */
export * from './schema.js';
export { toepassen, geldigeKleur, normaliseer } from './wijzig.js';
export { telt, belangrijk, vlakStatus, projectStatus } from './status.js';
export { naarRekenkern, verfOndergrond, lakOndergrond, kleurNaarKern } from './naar-rekenkern.js';
export { migreer } from './migreer.js';
