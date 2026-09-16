// Placeholder-sfeerbeelden uit de Roll-library (dezelfde renders als de
// smaakstap op advies.roll.nl). Later te vervangen door een eigen selectie.
import kleur1 from "@/assets/inspiration/kleur-1.webp";
import kleur2 from "@/assets/inspiration/kleur-2.webp";
import kleur3 from "@/assets/inspiration/kleur-3.webp";
import licht1 from "@/assets/inspiration/licht-1.webp";
import licht2 from "@/assets/inspiration/licht-2.webp";
import licht3 from "@/assets/inspiration/licht-3.webp";
import warm1 from "@/assets/inspiration/warm-1.webp";
import warm2 from "@/assets/inspiration/warm-2.webp";
import warm3 from "@/assets/inspiration/warm-3.webp";

export interface Inspiration {
  id: string;
  src: string;
  /** Korte sfeeromschrijving, puur gevoel. */
  label: string;
}

export const INSPIRATIONS: Inspiration[] = [
  { id: "licht-1", src: licht1, label: "Licht & luchtig" },
  { id: "warm-1", src: warm1, label: "Rustig blauw" },
  { id: "kleur-1", src: kleur1, label: "Zacht & warm" },
  { id: "licht-2", src: licht2, label: "Fris & helder" },
  { id: "warm-2", src: warm2, label: "Aards & geborgen" },
  { id: "kleur-2", src: kleur2, label: "Speels met kleur" },
  { id: "licht-3", src: licht3, label: "Sereen & kalm" },
  { id: "warm-3", src: warm3, label: "Diep & sfeervol" },
  { id: "kleur-3", src: kleur3, label: "Fris & kleurig" },
];
