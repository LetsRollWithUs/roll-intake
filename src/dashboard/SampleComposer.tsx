import { useMemo, useState } from "react";
import { rollColors } from "@/data/roll-colors";
import { SAMPLE_PACKS } from "@/data/sample-packs";
import type { AdviceProduct } from "./types";

// Samenstellen van het sample-mandje: per kleur sticker of tester, plus bundels met namen.
const byId = new Map(rollColors.map((c) => [c.id, c]));
const PRICE = { sticker: "€ 2,50", tester: "€ 7,-", pack: "€ 10,-" };
type ColorKind = "sticker" | "tester";

interface Props {
  value: AdviceProduct[];
  onChange: (p: AdviceProduct[]) => void;
  suggested: { id: string; name: string; hex: string }[]; // kleuren uit het advies
}

export function SampleComposer({ value, onChange, suggested }: Props) {
  const [vorm, setVorm] = useState<ColorKind>("sticker"); // standaardvorm voor nieuw toegevoegde kleuren
  const [q, setQ] = useState("");
  const [showBundels, setShowBundels] = useState(false);

  const isColor = (p: AdviceProduct) => p.kind === "sticker" || p.kind === "tester";
  const hasColor = (id: string) => value.some((p) => isColor(p) && p.ref === id);
  const colorKind = (id: string) => value.find((p) => isColor(p) && p.ref === id)?.kind as ColorKind | undefined;
  const hasPack = (id: string) => value.some((p) => p.kind === "pack" && p.ref === id);

  const addColor = (id: string, name: string) => { if (!hasColor(id)) onChange([...value, { kind: vorm, ref: id, name }]); };
  const removeColor = (id: string) => onChange(value.filter((p) => !(isColor(p) && p.ref === id)));
  const toggleColor = (id: string, name: string) => (hasColor(id) ? removeColor(id) : addColor(id, name));
  const setColorKind = (id: string, kind: ColorKind) => onChange(value.map((p) => (isColor(p) && p.ref === id ? { ...p, kind } : p)));
  const addPack = (id: string, name: string) => { if (!hasPack(id)) onChange([...value, { kind: "pack", ref: id, name }]); };
  const removePack = (id: string) => onChange(value.filter((p) => !(p.kind === "pack" && p.ref === id)));

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return [];
    return rollColors.filter((c) => c.name.toLowerCase().includes(s) || (c.subname ?? "").toLowerCase().includes(s) || (c.familyPrimary ?? "").toLowerCase().includes(s)).slice(0, 18);
  }, [q]);

  // Best passende bundel op basis van de geadviseerde kleuren (voor de "aanbevolen"-badge).
  const bestPackId = useMemo(() => {
    const ids = new Set(suggested.map((s) => s.id));
    let best: { id: string; overlap: number } | null = null;
    for (const p of SAMPLE_PACKS) { const o = p.colorIds.filter((id) => ids.has(id)).length; if (o > 0 && (!best || o > best.overlap)) best = { id: p.id, overlap: o }; }
    return best?.id ?? null;
  }, [suggested]);
  const bundels = useMemo(() => [...SAMPLE_PACKS].sort((a, b) => (a.id === bestPackId ? -1 : b.id === bestPackId ? 1 : 0)), [bestPackId]);

  const colorItems = value.filter(isColor);
  const packItems = value.filter((p) => p.kind === "pack");
  const swatch = (hex: string, size = 20) => <span style={{ width: size, height: size, borderRadius: 6, background: hex, border: "1px solid rgba(0,0,0,.12)", flex: "none", display: "inline-block" }} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="rd-kicker rd-kicker-pink">Samples samenstellen</div>
      <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>Kies per ruimte de kleuren die de klant thuis test. Standaard als kleursticker; zet 'm op verftester als de klant dat liever heeft. Of voeg een hele bundel toe.</p>

      {/* Standaardvorm voor nieuw toegevoegde kleuren */}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ fontSize: 12.5, opacity: 0.7 }}>Nieuwe kleur toevoegen als:</span>
        {(["sticker", "tester"] as ColorKind[]).map((k) => (
          <button key={k} className={`rd-seg${vorm === k ? " is-on" : ""}`} onClick={() => setVorm(k)} style={{ fontSize: 12.5 }}>
            {k === "sticker" ? `Kleursticker ${PRICE.sticker}` : `Verftester ${PRICE.tester}`}
          </button>
        ))}
      </div>

      {/* Snel toevoegen: kleuren uit het advies */}
      {suggested.length > 0 && (
        <div>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.55, marginBottom: 5 }}>Uit je advies</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {suggested.map((c) => (
              <button key={c.id} onClick={() => toggleColor(c.id, c.name)} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer", border: hasColor(c.id) ? "1.5px solid var(--rd-aubergine)" : "1px solid var(--rd-line)", background: hasColor(c.id) ? "var(--rd-grey-light)" : "transparent" }}>
                {swatch(c.hex, 14)} {c.name} {hasColor(c.id) ? "✓" : "+"}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Kleur zoeken */}
      <div>
        <input className="rd-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Zoek een kleur op naam of familie (bijv. Zen Den, greige, blauw)" style={{ height: 42 }} />
        {q.trim() && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 6, marginTop: 8 }}>
            {results.length === 0 ? <span className="rd-sub" style={{ fontSize: 13, opacity: 0.6 }}>Geen kleur gevonden.</span> : results.map((c) => (
              <button key={c.id} onClick={() => toggleColor(c.id, c.name)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 8px", borderRadius: 10, cursor: "pointer", textAlign: "left", background: hasColor(c.id) ? "var(--rd-grey-light)" : "#fff", border: hasColor(c.id) ? "1.5px solid var(--rd-aubergine)" : "1px solid var(--rd-line)", font: "inherit", color: "inherit" }}>
                {swatch(c.hex)}
                <span style={{ minWidth: 0, flex: 1 }}><span style={{ fontWeight: 700, fontSize: 13, display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</span><span style={{ fontSize: 11, opacity: 0.6 }}>{c.subname}</span></span>
                <span style={{ fontSize: 13, opacity: 0.7 }}>{hasColor(c.id) ? "✓" : "+"}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Gekozen samples */}
      {(colorItems.length > 0 || packItems.length > 0) && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "10px 12px", background: "var(--rd-grey-light)", borderRadius: 12 }}>
          <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: ".04em", textTransform: "uppercase", opacity: 0.55 }}>In de mail ({colorItems.length + packItems.length})</div>
          {colorItems.map((p) => {
            const c = byId.get(p.ref);
            return (
              <div key={`c-${p.ref}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                {swatch(c?.hex ?? "#ccc", 18)}
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: "1 1 100px", minWidth: 0 }}>{p.name}</span>
                <div style={{ display: "flex", gap: 3 }}>
                  {(["sticker", "tester"] as ColorKind[]).map((k) => (
                    <button key={k} className={`rd-seg${colorKind(p.ref) === k ? " is-on" : ""}`} onClick={() => setColorKind(p.ref, k)} style={{ fontSize: 11.5, padding: "4px 8px" }}>{k === "sticker" ? "Sticker" : "Tester"}</button>
                  ))}
                </div>
                <span style={{ fontSize: 12, opacity: 0.6, width: 44, textAlign: "right" }}>{p.kind === "sticker" ? PRICE.sticker : PRICE.tester}</span>
                <button className="rd-textlink" onClick={() => removeColor(p.ref)} aria-label="Verwijderen" style={{ opacity: 0.6 }}>✕</button>
              </div>
            );
          })}
          {packItems.map((p) => {
            const pack = SAMPLE_PACKS.find((x) => x.id === p.ref);
            return (
              <div key={`p-${p.ref}`} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <span style={{ display: "flex", gap: 2 }}>{(pack?.colorIds ?? []).slice(0, 5).map((id) => swatch(byId.get(id)?.hex ?? "#ccc", 14))}</span>
                <span style={{ fontWeight: 700, fontSize: 13.5, flex: "1 1 100px", minWidth: 0 }}>{p.name}</span>
                <span className="rd-chip" style={{ fontSize: 11 }}>bundel</span>
                <span style={{ fontSize: 12, opacity: 0.6, width: 44, textAlign: "right" }}>{PRICE.pack}</span>
                <button className="rd-textlink" onClick={() => removePack(p.ref)} aria-label="Verwijderen" style={{ opacity: 0.6 }}>✕</button>
              </div>
            );
          })}
        </div>
      )}

      {/* Bundels */}
      <div>
        <button className="rd-textlink" onClick={() => setShowBundels((s) => !s)} style={{ fontWeight: 700 }}>{showBundels ? "▾" : "▸"} Bundels (sample packs)</button>
        {showBundels && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
            {bundels.map((pack) => {
              const on = hasPack(pack.id);
              const names = pack.colorIds.map((id) => byId.get(id)?.name ?? id).join(", ");
              return (
                <div key={pack.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "10px 12px", borderRadius: 10, border: on ? "1.5px solid var(--rd-aubergine)" : "1px solid var(--rd-line)" }}>
                  <span style={{ display: "flex", gap: 2, flex: "none", paddingTop: 2 }}>{pack.colorIds.slice(0, 5).map((id) => swatch(byId.get(id)?.hex ?? "#ccc", 14))}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{pack.displayName} Sample Pack {pack.id === bestPackId && <span className="rd-chip" style={{ fontSize: 10 }}>aanbevolen</span>}</div>
                    <div style={{ fontSize: 12, opacity: 0.65, lineHeight: 1.4 }}>{pack.colorCount} kleuren · {names}</div>
                  </div>
                  <button className={`rd-btn ${on ? "rd-btn-outline" : "rd-btn-primary"}`} onClick={() => (on ? removePack(pack.id) : addPack(pack.id, `${pack.displayName} Sample Pack`))} style={{ width: "auto", padding: "0 14px", height: 34, flex: "none" }}>{on ? "Toegevoegd ✓" : `Toevoegen ${PRICE.pack}`}</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
