// Sample-bundels (18 kleurfamilie-packs), overgenomen uit de Quiz-repo.
// colorIds matchen roll-colors.ts. Alleen wat de intake nodig heeft: geen prijs/afbeelding.

export interface SamplePack {
  id: string;
  displayName: string;
  colorCount: number;
  colorIds: string[];
  description: string;
}

export const SAMPLE_PACKS: SamplePack[] = [
  { id: "wit-sample-pack", displayName: "Wit", colorCount: 5, colorIds: ["blank-page", "fresh-sheets", "milk-foam", "sugar-whip", "lazy-linen"], description: "Vijf verfijnde wittinten" },
  { id: "lichtbeige-sample-pack", displayName: "Lichtbeige", colorCount: 5, colorIds: ["snooze-button", "early-bird", "cashmere-cloud", "off-duty", "sand-salute"], description: "Vijf lichte, warme beigetinten" },
  { id: "beige-sample-pack", displayName: "Beige", colorCount: 5, colorIds: ["powder-puff", "sandy-toes", "cuddle-mode", "soft-landing", "group-hug"], description: "Vijf warme beigetinten" },
  { id: "greige-sample-pack", displayName: "Greige", colorCount: 4, colorIds: ["morning-mist", "zen-den", "sunday-sweater", "taupe-notch"], description: "Vier greige tinten" },
  { id: "lichtgrijs-sample-pack", displayName: "Lichtgrijs", colorCount: 4, colorIds: ["feather-flow", "mist-dream", "grey-gatsby", "chill-whisper"], description: "Vier lichte grijstinten" },
  { id: "donkergrijs-sample-pack", displayName: "Donkergrijs & Zwart", colorCount: 6, colorIds: ["stone-tone", "rock-rocket", "shadow-nap", "onyx-dip", "dark-ash", "shut-eye"], description: "Zes diepe grijs- en zwarttinten" },
  { id: "grijsgroen-sample-pack", displayName: "Grijsgroen", colorCount: 3, colorIds: ["sage-blink", "dawn-fog", "leaf-love"], description: "Drie subtiele grijsgroene tinten" },
  { id: "lichtgroen-sample-pack", displayName: "Lichtgroen", colorCount: 4, colorIds: ["pistache-please", "daily-om", "field-trip", "olive-wink"], description: "Vier frisse lichtgroene tinten" },
  { id: "donkergroen-sample-pack", displayName: "Donkergroen", colorCount: 5, colorIds: ["home-safari", "lawn-order", "quiet-wild", "moss-boss", "old-forest"], description: "Vijf diepe bosgroene tinten" },
  { id: "diep-groenblauw-sample-pack", displayName: "Groenblauw", colorCount: 4, colorIds: ["easy-does", "tide-twist", "hidden-depths", "lost-orbit"], description: "Vier groenblauwe tinten" },
  { id: "lichtblauw-sample-pack", displayName: "Lichtblauw", colorCount: 5, colorIds: ["fizzy-drizzle", "sky-sofa", "sweet-horizon", "ice-breaker", "daydream-dip"], description: "Vijf frisse lichtblauwe tinten" },
  { id: "donkerblauw-sample-pack", displayName: "Donkerblauw", colorCount: 6, colorIds: ["breeze-in", "cool-story", "denim-days", "deep-dive", "navy-baby", "night-plunge"], description: "Zes klassieke donkerblauwe tinten" },
  { id: "roze-sample-pack", displayName: "Roze", colorCount: 6, colorIds: ["bubble-gum", "peach-out", "flirt-alert", "couch-crush", "pinky-promise", "berry-nice"], description: "Zes roze tinten" },
  { id: "oranje-sample-pack", displayName: "Oranje & Terra", colorCount: 6, colorIds: ["siesta-fiesta", "dulce-glow", "tan-lines", "snug-life", "cozy-cotta", "fired-up"], description: "Zes warme oranje- en terracottatinten" },
  { id: "paars-sample-pack", displayName: "Paars", colorCount: 3, colorIds: ["milky-lilac", "dear-diary", "fable-mystic"], description: "Drie paarse tinten" },
  { id: "geel-sample-pack", displayName: "Geel", colorCount: 3, colorIds: ["sunny-cheerio", "honey-drop", "strike-gold"], description: "Drie zonnige gele tinten" },
  { id: "rood-sample-pack", displayName: "Rood", colorCount: 3, colorIds: ["hot-shot", "cherry-on", "monk-mood"], description: "Drie statement rode tinten" },
  { id: "bruin-sample-pack", displayName: "Bruin", colorCount: 4, colorIds: ["teddy-bear", "spiced-latte", "desert-date", "fudgy-brownie"], description: "Vier warme bruine tinten" },
];
