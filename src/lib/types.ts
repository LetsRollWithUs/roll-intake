// Datamodel voor de interieurintake. Ruimtes, samples, kleuren en
// inspiratiebeelden zijn dynamisch: je kunt er meerdere toevoegen.

export type SurfaceKey = "muren" | "plafond" | "kozijnen" | "deuren" | "houtwerk";

export type DaylightKey = "veel" | "gemiddeld" | "weinig";
export type DaylightDir = "noord" | "oost" | "zuid" | "west" | "onbekend";
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
  name: string;
  verdict: Verdict;
  note?: string;
  photo?: UploadedImage;
}

export interface IntakeState {
  rooms: Room[];

  // Sfeer
  inspirationLikes: string[]; // max 2 sfeerbeelden
  moods: string[]; // max 3 woorden
  boldness?: number; // 1-5, hoe uitgesproken

  // Kleuren & samples
  hasSamples?: SampleSource;
  samples: SampleItem[];
  colors: ColorPick[]; // Roll-kleuren die iemand overweegt

  // Eigen inspiratie
  pinterestUrl: string;
  otherInspirationUrl: string;
  inspirationImages: UploadedImage[]; // max 5
  inspirationNote: string;

  // Jouw vraag
  helpNeeds: string[]; // max 2
  mainQuestion: string; // verplicht

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
    moods: [],
    boldness: undefined,
    hasSamples: undefined,
    samples: [],
    colors: [],
    pinterestUrl: "",
    otherInspirationUrl: "",
    inspirationImages: [],
    inspirationNote: "",
    helpNeeds: [],
    mainQuestion: "",
    planning: undefined,
    contactName: "",
    contactEmail: "",
    updatedAt: Date.now(),
  };
}
