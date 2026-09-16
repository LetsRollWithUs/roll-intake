export type AdvisorStatus =
  | "nieuw"
  | "in_behandeling"
  | "advies_verstuurd"
  | "offerte"
  | "afgerond"
  | "afgewezen";

export interface StatusDef {
  key: AdvisorStatus;
  label: string;
  bg: string;
  ink: string;
}

// Pijplijn van binnenkomst tot afronding. "Afgewezen" is een eindstatus met reden.
export const STATUSES: StatusDef[] = [
  { key: "nieuw", label: "Nieuw", bg: "var(--rd-pink)", ink: "#2F2141" },
  { key: "in_behandeling", label: "In behandeling", bg: "var(--rd-lavender)", ink: "#2F2141" },
  { key: "advies_verstuurd", label: "Advies verstuurd", bg: "#CFE0F1", ink: "#1c3a54" },
  { key: "offerte", label: "Offerte", bg: "var(--rd-lime)", ink: "#3a4210" },
  { key: "afgerond", label: "Afgerond", bg: "#C9E6CE", ink: "#1e4429" },
  { key: "afgewezen", label: "Afgewezen", bg: "#F0DADF", ink: "#7a2740" },
];

export function statusDef(key: string): StatusDef {
  return STATUSES.find((s) => s.key === key) ?? STATUSES[0];
}
