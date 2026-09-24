import { useMemo, useState } from "react";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";
import { TrashIcon, AdviceIcon, iconBtn } from "./icons";
import type { AdviceProduct } from "./types";

// Samples voor de mail: de kleuren uit de rijen staan hier vanzelf (standaard als sticker),
// de styliste kiest per kleur sticker of tester en voegt eventueel een bundel toe.
const byId = new Map(rollColors.map((c) => [c.id, c]));
const PRICE = { sticker: 2.5, tester: 7, pack: 10 };
const eur = (n: number) => `€ ${n.toFixed(2).replace(".", ",").replace(",00", ",-")}`;
type ColorKind = "sticker" | "tester";

interface Props {
  colors: { id: string; name: string; hex: string }[]; // unieke Roll-kleuren uit de rijen
  value: AdviceProduct[]; // al gesynchroniseerd: één regel per kleur + bundels
  onChange: (p: AdviceProduct[]) => void;
}

export function SampleComposer({ colors, value, onChange }: Props) {
  const [allBundels, setAllBundels] = useState(false);
  const isColor = (p: AdviceProduct) => p.kind === "sticker" || p.kind === "tester";
  const hasPack = (id: string) => value.some((p) => p.kind === "pack" && p.ref === id);
  const setKind = (id: string, kind: ColorKind) => onChange(value.map((p) => (isColor(p) && p.ref === id ? { ...p, kind } : p)));
  const togglePack = (id: string, name: string) =>
    onChange(hasPack(id) ? value.filter((p) => !(p.kind === "pack" && p.ref === id)) : [...value, { kind: "pack", ref: id, name }]);

  // Bundels gerangschikt op overlap met de gekozen kleuren; de beste krijgt het advies-icoon.
  const ranked = useMemo(() => {
    const ids = new Set(colors.map((c) => c.id));
    return SAMPLE_PACKS.map((p) => ({ p, overlap: p.colorIds.filter((id) => ids.has(id)).length }))
      .sort((a, b) => b.overlap - a.overlap);
  }, [colors]);
  const bestId = ranked[0]?.overlap ? ranked[0].p.id : null;
  const top = ranked.filter((r) => r.overlap > 0).slice(0, 3);
  const shown = allBundels ? ranked : top;

  const colorItems = value.filter(isColor);
  const packItems = value.filter((p) => p.kind === "pack");
  const total = value.reduce((s, p) => s + (PRICE[p.kind as keyof typeof PRICE] ?? 0), 0);
  const swatch = (hex?: string, size = 16) => <span style={{ width: size, height: size, borderRadius: 5, background: hex ?? "#eee", border: "1px solid rgba(0,0,0,.12)", flex: "none", display: "inline-block" }} />;
  const label = (t: string) => <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.6, marginBottom: 6 }}>{t}</div>;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Bundels */}
      <div>
        {label("Bundels")}
        {top.length === 0 && !allBundels && <p className="rd-sub" style={{ margin: "0 0 6px", fontSize: 13 }}>Kies hierboven kleuren; dan tonen we de best passende bundels.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {shown.map(({ p, overlap }) => {
            const on = hasPack(p.id);
            const best = p.id === bestId;
            return (
              <div key={p.id} style={{ display: "flex", gap: 10, alignItems: "center", padding: "10px 12px", borderRadius: 12, border: on ? "1.5px solid var(--rd-aubergine)" : "1px solid var(--rd-line)", background: best ? "var(--rd-offwhite)" : "transparent" }}>
                <span style={{ display: "flex", gap: 2, flex: "none" }}>{p.colorIds.slice(0, 6).map((id) => <span key={id}>{swatch(byId.get(id)?.hex, 14)}</span>)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    {p.displayName} Sample Pack
                    {best && <span className="rd-chip" style={{ fontSize: 11, display: "inline-flex", gap: 4, alignItems: "center", background: "var(--rd-pink)", color: "var(--rd-aubergine)", fontWeight: 700 }}><AdviceIcon size={12} />Advies</span>}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>{p.colorIds.map((id) => byId.get(id)?.name ?? id).join(", ")}{overlap > 0 ? ` · ${overlap} van je kleuren` : ""}</div>
                </div>
                <button className={`rd-btn ${on ? "rd-btn-outline" : "rd-btn-primary"}`} onClick={() => togglePack(p.id, `${p.displayName} Sample Pack`)} style={{ width: "auto", padding: "0 14px", height: 34, flex: "none" }}>{on ? "Toegevoegd ✓" : `Toevoegen ${eur(PRICE.pack)}`}</button>
              </div>
            );
          })}
        </div>
        <button className="rd-textlink" onClick={() => setAllBundels((v) => !v)} style={{ marginTop: 6, fontSize: 13 }}>{allBundels ? "Toon alleen de beste 3" : "Alle bundels bekijken"}</button>
      </div>

      {/* Overzicht in de mail */}
      <div style={{ padding: "12px 14px", background: "var(--rd-grey-light)", borderRadius: 12 }}>
        {label(`In de mail (${colorItems.length + packItems.length})`)}
        {colorItems.length + packItems.length === 0 && <span style={{ fontSize: 13, opacity: 0.65 }}>Nog niets gekozen. Kleuren uit de rijen hierboven komen hier vanzelf bij.</span>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {colorItems.map((p) => (
            <div key={`c-${p.ref}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
              {swatch(byId.get(p.ref)?.hex, 18)}
              <span style={{ fontWeight: 700, fontSize: 13.5, flex: "1 1 110px", minWidth: 0 }}>{p.name}</span>
              <div style={{ display: "flex", gap: 3 }}>
                {(["sticker", "tester"] as ColorKind[]).map((k) => (
                  <button key={k} className={`rd-seg${p.kind === k ? " is-on" : ""}`} onClick={() => setKind(p.ref, k)} style={{ fontSize: 12, padding: "4px 10px" }}>
                    {k === "sticker" ? `Sticker ${eur(PRICE.sticker)}` : `Verftester ${eur(PRICE.tester)}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {packItems.map((p) => {
            const pack = SAMPLE_PACKS.find((x) => x.id === p.ref);
            return (
              <div key={`p-${p.ref}`} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ display: "flex", gap: 2 }}>{(pack?.colorIds ?? []).slice(0, 5).map((id) => <span key={id}>{swatch(byId.get(id)?.hex, 13)}</span>)}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: 1, minWidth: 0 }}>{p.name}</span>
                <span style={{ fontSize: 12, opacity: 0.65 }}>{eur(PRICE.pack)}</span>
                <button onClick={() => togglePack(p.ref, p.name)} aria-label="Bundel verwijderen" title="Verwijderen" style={iconBtn}><TrashIcon /></button>
              </div>
            );
          })}
        </div>
        {total > 0 && <div style={{ marginTop: 8, paddingTop: 8, borderTop: "1px solid var(--rd-line)", fontSize: 13, display: "flex", justifyContent: "space-between" }}><span style={{ opacity: 0.7 }}>Totaal samples</span><strong>{eur(total)}</strong></div>}
      </div>
    </div>
  );
}
