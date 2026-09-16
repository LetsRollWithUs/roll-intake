import type { IntakeState } from "./types";

export interface Complexity {
  score: number;
  level: "compact" | "uitgebreid";
  reasons: string[];
}

/**
 * Schat in hoe omvangrijk de vraag is. Bij een uitgebreide vraag mag de styliste
 * het Totaal Kleuradvies voorstellen; de compacte intake blijft altijd het
 * startpunt. Positief bedoeld: het is een suggestie, geen drempel.
 */
export function assessComplexity(s: IntakeState): Complexity {
  const totalSurfaces = s.rooms.reduce((n, r) => n + r.surfaces.length, 0);
  const reasons: string[] = [];

  let score = 0;
  score += s.rooms.length * 2;
  score += totalSurfaces * 0.5;
  score += s.colors.length * 0.5;
  if ((s.boldness ?? 0) >= 4) score += 2;
  if (s.helpNeeds.length >= 3) score += 1;

  if (s.rooms.length >= 3) reasons.push("meerdere ruimtes");
  if (totalSurfaces >= 6) reasons.push("veel vlakken (muren, houtwerk, plafond)");
  if (s.colors.length >= 4) reasons.push("meerdere kleuren die samen moeten kloppen");
  if ((s.boldness ?? 0) >= 4) reasons.push("een gedurfde kleurwens");

  const level: Complexity["level"] = score >= 8 ? "uitgebreid" : "compact";
  return { score: Math.round(score * 10) / 10, level, reasons };
}
