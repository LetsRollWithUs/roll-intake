// Datamodel voor de interieurintake. Ruimtes, samples, kleuren en
// inspiratiebeelden zijn dynamisch: je kunt er meerdere toevoegen.

export type SurfaceKey = "muren" | "plafond" | "kozijnen" | "deuren" | "houtwerk";

export type DaylightKey = "veel" | "gemiddeld" | "weinig";
export type DaylightDir = "noord" | "oost" | "zuid" | "west" | "meerdere" | "onbekend";
export type UsageTime = "ochtend" | "middag" | "avond" | "hele-dag";

export type SampleSource = "nee" | "roll" | "andere" | "allebei";
export type Verdict = "favoriet" | "twijfel" | "valt-af";
export type PlanningKey = "2weken" | "maand" | "3maanden" | "later" | "weet-niet";

export interface UploadedImage {
  id: string;
  /** Object-URL voor preview (niet persistent). */
  url: string;
  name: string;
  /** Het echte bestand voor upload; blijft niet bewaard na herladen. */
  file?: File;
}

export interface Room {
  id: string;
  /** Sleutel uit ROOM_TYPES, of "anders". */
  typeKey: string;
  /** Weergavenaam, standaard afgeleid van het type, aan te passen. */
  label: string;
  surfaces: SurfaceKey[];
  daylight?: DaylightKey;
  daylightDir?: DaylightDir;
  usage?: UsageTime;
  /** Voorrang bij 3+ ruimtes (30-minuten-gesprek). */
  priority?: boolean;
  photos: UploadedImage[];
}

/** Een Roll-kleur die iemand overweegt. */
export interface ColorPick {
  id: string;
  rollId?: string;
  name: string;
  hex?: string;
}

/** Een sample of kleur die iemand al thuis heeft. */
export interface SampleItem {
  id: string;
  brand: string;
  /** Optioneel gekoppeld aan een ruimte (room.id). */
  roomId?: string;
  name: string;
  verdict: Verdict;
  note?: string;
  photo?: UploadedImage;
}

export interface IntakeState {
  rooms: Room[];

  // Sfeer
  inspirationLikes: string[]; // max 2 sfeerbeelden
  noSfeerImage?: boolean; // "Geen van deze"
  moods: string[]; // max 3 omschrijvingen
  boldness?: number; // 1-5, hoe uitgesproken (optioneel)
  sfeerSameAll?: boolean; // geldt de sfeer voor alle ruimtes?
  sfeerExceptionNote: string; // uitzondering bij meerdere ruimtes

  // Kleuren & samples
  hasSamples?: SampleSource;
  samples: SampleItem[];
  colors: ColorPick[]; // Roll-kleuren die iemand overweegt

  // Eigen inspiratie
  pinterestUrl: string;
  otherInspirationUrl: string;
  inspirationImages: UploadedImage[]; // max 5
  inspirationNote: string;

  // Context
  hasOtherChanges?: boolean; // verandert er iets aan vloer/meubels/gordijnen?
  otherChangesNote: string;

  // Jouw vraag
  helpNeeds: string[]; // max 2
  mainQuestion: string; // verplicht
  questionScope?: "een" | "meerdere"; // voor één of meerdere ruimtes

  // Planning & contact
  planning?: PlanningKey;
  contactName: string;
  contactEmail: string;

  updatedAt: number;
}

export function emptyState(): IntakeState {
  return {
    rooms: [],
    inspirationLikes: [],
    noSfeerImage: false,
    moods: [],
    boldness: undefined,
    sfeerSameAll: undefined,
    sfeerExceptionNote: "",
    hasSamples: undefined,
    samples: [],
    colors: [],
    pinterestUrl: "",
    otherInspirationUrl: "",
    inspirationImages: [],
    inspirationNote: "",
    hasOtherChanges: undefined,
    otherChangesNote: "",
    helpNeeds: [],
    mainQuestion: "",
    questionScope: undefined,
    planning: undefined,
    contactName: "",
    contactEmail: "",
    updatedAt: Date.now(),
  };
}
