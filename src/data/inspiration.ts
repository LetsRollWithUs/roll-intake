// Sfeerbeelden voor de intake: zes duidelijk verschillende richtingen, elk een
// echt ander interieur (licht, temperatuur, kleurintensiteit en kamertype) met
// de muur in een Roll-kleur. Bron: de moodrenders van advies.roll.nl.
import aards from "@/assets/inspiration/sfeer-aards-geborgen.webp";
import diep from "@/assets/inspiration/sfeer-diep-sfeervol.webp";
import licht from "@/assets/inspiration/sfeer-licht-luchtig.webp";
import rustig from "@/assets/inspiration/sfeer-rustig-koel.webp";
import speels from "@/assets/inspiration/sfeer-speels-kleurig.webp";
import zacht from "@/assets/inspiration/sfeer-zacht-warm.webp";
// Eerdere set (zelfde kamer in andere kleuren); bewaard zodat oude intakes hun keuze blijven tonen.
import kleur1 from "@/assets/inspiration/kleur-1.webp";
import kleur3 from "@/assets/inspiration/kleur-3.webp";
import licht1 from "@/assets/inspiration/licht-1.webp";
import warm1 from "@/assets/inspiration/warm-1.webp";
import warm2 from "@/assets/inspiration/warm-2.webp";
import warm3 from "@/assets/inspiration/warm-3.webp";

export interface Inspiration {
  id: string;
  src: string;
  /** Korte sfeeromschrijving, puur gevoel. */
  label: string;
  /** Roll-kleur op de muur van het beeld (hint voor de styliste en het advies). */
  kleur?: string;
}

export const INSPIRATIONS: Inspiration[] = [
  { id: "licht-luchtig", src: licht, label: "Licht & luchtig", kleur: "Fresh Sheets" },
  { id: "rustig-koel", src: rustig, label: "Rustig & koel", kleur: "Dawn Fog" },
  { id: "zacht-warm", src: zacht, label: "Zacht & warm", kleur: "Group Hug" },
  { id: "aards-geborgen", src: aards, label: "Aards & geborgen", kleur: "Fired Up" },
  { id: "diep-sfeervol", src: diep, label: "Diep & sfeervol", kleur: "Dark Ash" },
  { id: "speels-kleurig", src: speels, label: "Speels & kleurig", kleur: "Sunny Cheerio" },
];

const EERDER: Inspiration[] = [
  { id: "licht-1", src: licht1, label: "Licht & luchtig" },
  { id: "warm-1", src: warm1, label: "Rustig & koel" },
  { id: "kleur-1", src: kleur1, label: "Zacht & warm" },
  { id: "warm-2", src: warm2, label: "Aards & geborgen" },
  { id: "warm-3", src: warm3, label: "Diep & sfeervol" },
  { id: "kleur-3", src: kleur3, label: "Speels & kleurig" },
];

/** Sfeerbeeld op id, ook uit de eerdere set (voor het dashboard). */
export const inspiratie = (id: string): Inspiration | undefined =>
  INSPIRATIONS.find((x) => x.id === id) ?? EERDER.find((x) => x.id === id);
