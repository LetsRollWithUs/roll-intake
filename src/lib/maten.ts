// Maten zijn in meters (11 nov 2026, melding styliste). Een getal dat als meter niet kan, is in centimeters (of
// millimeters) ingevuld: 410 bij een plafond wordt 4,1 m. Zelfde regel als de editor op roll.nl (verfcalculator 1.84.0)
// en als het verfplan van Charlie. De grenzen zijn ruim gekozen: een muur van 100 m of een plafond van 30 m bestaat niet.
export const MAAT_MAX = { muur: 100, hoogte: 8, plafond: 30, object: 6, plint: 60 } as const;

export function inMeter(v: number, max: number): number {
  const n = Number(v);
  if (!(n > max)) return v;
  if (n / 100 <= max) return Math.round(n) / 100;
  if (n / 1000 <= max) return Math.round(n / 10) / 100;
  return max;
}
