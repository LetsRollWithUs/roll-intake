import type { SurfaceKey, DaylightKey, DaylightDir } from "@/lib/types";

export interface RoomType {
  key: string;
  label: string;
}

// Volgorde zoals mensen door een huis lopen: leefruimtes eerst.
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
  { key: "onbekend", label: "Weet ik niet" },
];

// Sfeerwoorden voor stap 3. Geen goed of fout, puur gevoel.
export const MOODS: string[] = [
  "Warm & geborgen",
  "Rustig & sereen",
  "Fris & licht",
  "Natuurlijk & aards",
  "Stoer & industrieel",
  "Klassiek & tijdloos",
  "Speels & kleurrijk",
  "Modern & strak",
  "Zacht & romantisch",
  "Donker & sfeervol",
];

export const HELP_NEEDS: string[] = [
  "Eén kleur kiezen die past",
  "Kleuren die samen kloppen",
  "Durven met kleur",
  "Rust brengen",
  "Ruimte groter laten voelen",
  "Houtwerk en muren op elkaar",
];
