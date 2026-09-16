// Datamodel voor de interieurintake. Ruimtes en kleuren zijn dynamisch:
// je kunt er meerdere toevoegen, ook meerdere van hetzelfde type.

export type SurfaceKey = "muren" | "plafond" | "kozijnen" | "deuren" | "houtwerk";

export type DaylightKey = "veel" | "gemiddeld" | "weinig";
export type DaylightDir = "noord" | "oost" | "zuid" | "west" | "onbekend";

export interface RoomPhoto {
  id: string;
  /** Object-URL voor preview in de browser (niet persistent). */
  url: string;
  name: string;
  /** Het echte bestand voor upload; blijft niet bewaard na herladen. */
  file?: File;
}

export interface Room {
  id: string;
  /** Sleutel uit ROOM_TYPES, of "anders". */
  typeKey: string;
  /** Weergavenaam, standaard afgeleid van het type, door de bezoeker aan te passen. */
  label: string;
  surfaces: SurfaceKey[];
  daylight?: DaylightKey;
  daylightDir?: DaylightDir;
  photos: RoomPhoto[];
}

export interface ColorPick {
  id: string;
  /** Roll-kleur-id als het een Roll-kleur is, anders leeg. */
  rollId?: string;
  name: string;
  hex?: string;
  /** "houden", "weg", "twijfel" of vrije notitie. */
  verdict?: "houden" | "weg" | "twijfel";
  note?: string;
}

export interface IntakeState {
  rooms: Room[];
  moods: string[];
  /** Durf: 1 (rustig) tot 5 (gedurfd). */
  boldness?: number;
  colors: ColorPick[];
  /** Ids van aangevinkte inspiratiebeelden (sfeerboard). */
  inspirationLikes: string[];
  inspirationNote: string;
  helpNeeds: string[];
  mainQuestion: string;
  contactName: string;
  contactEmail: string;
  updatedAt: number;
}

export function emptyState(): IntakeState {
  return {
    rooms: [],
    moods: [],
    boldness: undefined,
    colors: [],
    inspirationLikes: [],
    inspirationNote: "",
    helpNeeds: [],
    mainQuestion: "",
    contactName: "",
    contactEmail: "",
    updatedAt: Date.now(),
  };
}
