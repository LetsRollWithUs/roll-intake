// Uitkomst van het gesprek: dit stuurt straks de opvolging (Klaviyo-flow).
export const OUTCOMES: { key: string; label: string }[] = [
  { key: "samples_needed", label: "Samples nodig" },
  { key: "color_chosen", label: "Kleur gekozen" },
  { key: "followup_needed", label: "Vervolgadvies nodig" },
];

export const BUY_MOMENTS: { key: string; label: string }[] = [
  { key: "nu", label: "Nu" },
  { key: "2weken", label: "Binnen 2 weken" },
  { key: "later", label: "Later" },
];

export const PRODUCTS: string[] = ["Muurverf", "Lak"];

export function outcomeLabel(key?: string | null): string {
  return OUTCOMES.find((o) => o.key === key)?.label ?? "";
}
export function buyMomentLabel(key?: string | null): string {
  return BUY_MOMENTS.find((b) => b.key === key)?.label ?? "";
}
