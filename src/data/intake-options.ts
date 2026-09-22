import type {
  SurfaceKey,
  DaylightKey,
  DaylightDir,
  SunMoment,
  UsageTime,
  SampleSource,
  Verdict,
  PlanningKey,
  PainterKey,
} from "@/lib/types";

export interface RoomType {
  key: string;
  label: string;
}

export const ROOM_TYPES: RoomType[] = [
  { key: "woonkamer", label: "Woonkamer" },
  { key: "keuken", label: "Keuken" },
  { key: "eetkamer", label: "Eetkamer" },
  { key: "hal", label: "Hal / gang" },
  { key: "slaapkamer", label: "Slaapkamer" },
  { key: "kinderkamer", label: "Kinderkamer" },
  { key: "werkkamer", label: "Werkkamer" },
  { key: "badkamer", label: "Badkamer" },
  { key: "toilet", label: "Toilet" },
  { key: "zolder", label: "Zolder" },
  { key: "anders", label: "Andere ruimte" },
];

export const SURFACES: { key: SurfaceKey; label: string }[] = [
  { key: "muren", label: "Muren" },
  { key: "plafond", label: "Plafond" },
  { key: "kozijnen", label: "Kozijnen" },
  { key: "deuren", label: "Deuren" },
  { key: "houtwerk", label: "Ander houtwerk" },
];

// Wanneer valt de zon binnen? (meerdere mogelijk)
export const SUN_MOMENTS: { key: SunMoment; label: string }[] = [
  { key: "ochtend", label: "Ochtendzon" },
  { key: "middag", label: "Middagzon" },
  { key: "avond", label: "Avondzon" },
  { key: "noord", label: "Koel daglicht (noorden)" },
];

// Wanneer gebruik je de ruimte het meest? Kunstlicht vs daglicht bepaalt hoe kleuren overkomen.
export const USAGE_TIMES: { key: UsageTime; label: string; sub: string }[] = [
  { key: "overdag", label: "Overdag", sub: "Vooral daglicht" },
  { key: "avond", label: "Vooral 's avonds", sub: "Kunstlicht bepaalt de sfeer" },
  { key: "heledag", label: "De hele dag door", sub: "" },
];

// Legacy (oude concepten); niet meer in de UI.
export const DAYLIGHT: { key: DaylightKey; label: string }[] = [
  { key: "veel", label: "Veel licht" },
  { key: "gemiddeld", label: "Gemiddeld" },
  { key: "weinig", label: "Weinig licht" },
];
export const DAYLIGHT_DIRS: { key: DaylightDir; label: string }[] = [
  { key: "noord", label: "Noord" },
  { key: "oost", label: "Oost" },
  { key: "zuid", label: "Zuid" },
  { key: "west", label: "West" },
  { key: "meerdere", label: "Meerdere kanten" },
  { key: "onbekend", label: "Weet ik niet" },
];

// Gevoel, geen interieurstijl. "Stoer & industrieel" bewust weggelaten.
export const MOODS: string[] = [
  "Warm & geborgen",
  "Rustig & sereen",
  "Fris & licht",
  "Natuurlijk & aards",
  "Klassiek & tijdloos",
  "Speels & kleurrijk",
  "Modern & strak",
  "Zacht & romantisch",
  "Donker & sfeervol",
];

export const SAMPLE_SOURCES: { key: SampleSource; label: string }[] = [
  { key: "nee", label: "Nee, nog niet" },
  { key: "roll", label: "Ja, van Roll" },
  { key: "andere", label: "Ja, van andere merken" },
  { key: "allebei", label: "Van allebei" },
];

export const VERDICTS: { key: Verdict; label: string }[] = [
  { key: "favoriet", label: "Favoriet" },
  { key: "twijfel", label: "Twijfel" },
  { key: "valt-af", label: "Valt af" },
];

// Concrete adviesvragen (geen gewenste uitkomsten).
export const HELP_NEEDS: string[] = [
  "Eén kleur kiezen",
  "Kleuren combineren",
  "Aansluiten op mijn interieur",
  "Kleuren tussen ruimtes laten samenwerken",
  "Kiezen tussen samples",
  "Muren, plafond en houtwerk combineren",
  "Compleet kleurpalet bepalen",
];

// Wie gaat schilderen (leadkwalificatie: bij een schilder loopt de verf vaak via de schilder).
export const PAINTERS: { key: PainterKey; label: string }[] = [
  { key: "zelf", label: "Ik schilder zelf" },
  { key: "schilder", label: "Een schilder doet het" },
  { key: "deels", label: "Deels zelf, deels schilder" },
];

export const PLANNING: { key: PlanningKey; label: string }[] = [
  { key: "2weken", label: "Binnen 2 weken" },
  { key: "maand", label: "Binnen een maand" },
  { key: "3maanden", label: "Binnen 3 maanden" },
  { key: "later", label: "Later" },
  { key: "weet-niet", label: "Weet ik nog niet" },
];

// Kleurfamilies voor het bladeren door alle Roll-kleuren.
export interface ColorFamily {
  key: string;
  label: string;
  families: string[]; // matcht op familyPrimary
  dark?: boolean; // matcht op lightnessBand === 'dark'
}

export const COLOR_FAMILIES: ColorFamily[] = [
  { key: "wit", label: "Wit & crème", families: ["White"] },
  { key: "beige", label: "Beige & bruin", families: ["Beige", "Greige", "Brown"] },
  { key: "grijs", label: "Grijs", families: ["Grey"] },
  { key: "blauw", label: "Blauw", families: ["Blue", "Teal"] },
  { key: "groen", label: "Groen", families: ["Green"] },
  { key: "roze", label: "Roze & rood", families: ["Pink", "Red"] },
  { key: "geel", label: "Geel & oranje", families: ["Yellow", "Orange"] },
  { key: "paars", label: "Paars", families: ["Purple"] },
  { key: "donker", label: "Donker", families: [], dark: true },
];
