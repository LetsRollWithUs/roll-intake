import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rollColors } from "@/data/roll-colors";
import type { PickedColor } from "./advice";

// Eén kleurkiezer voor muren, plafonds, houtwerk en samplekandidaten.
// Standaard de Roll-kleuren; "Andere kleuren" zoekt in de kleurendatabase van roll.nl
// (dezelfde bron als de offerte-tool: ark-kleurmatch, 24.000+ referentiekleuren).
const KM = "https://roll.nl/wp-json/ark-kleurmatch/v1";
interface KmColor { id: string; brand: string; line: string | null; name: string; hex: string; family?: string; rollName?: string; rollCode?: string }
interface KmBrand { brand: string; count: number; lines: { line: string; count: number }[] }

export function ColorPicker({ open, initial, onPick, onClose, title = "Kies een kleur" }: {
  open: boolean; initial?: PickedColor | null; onPick: (c: PickedColor) => void; onClose: () => void; title?: string;
}) {
  const [tab, setTab] = useState<"roll" | "ark">(initial?.source === "ark" ? "ark" : "roll");
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<PickedColor | null>(initial ?? null);
  const [brands, setBrands] = useState<KmBrand[]>([]);
  const [brand, setBrand] = useState("");
  const [line, setLine] = useState("");
  const [results, setResults] = useState<KmColor[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [more, setMore] = useState(false);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement;
    setSel(initial ?? null);
    setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); (returnFocus.current as HTMLElement | null)?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open || tab !== "ark" || brands.length) return;
    fetch(`${KM}/brands`).then((r) => r.json()).then((d) => setBrands(Array.isArray(d) ? d : [])).catch(() => {});
  }, [open, tab, brands.length]);

  // Zoeken in de database, in delen van 60.
  useEffect(() => {
    if (!open || tab !== "ark") return;
    const t = setTimeout(async () => {
      if (!q.trim() && !brand) { setResults([]); setTotal(null); setMore(false); return; }
      setLoading(true); setErr(false);
      try {
        const p = new URLSearchParams({ per_page: "60", page: String(page) });
        if (q.trim()) p.set("search", q.trim());
        if (brand) p.set("brand", brand);
        if (line) p.set("line", line);
        const r = await fetch(`${KM}/colors?${p}`);
        const d = await r.json();
        const list: KmColor[] = Array.isArray(d) ? d : [];
        // De database geeft per keer maximaal 30; zonder totaal-header: meer zolang een volle pagina terugkomt.
        const hdr = r.headers.get("X-WP-Total");
        setTotal(hdr ? Number(hdr) : page === 1 ? list.length : null);
        setMore(hdr ? page * list.length < Number(hdr) : list.length >= 30);
        // Exacte code-overeenkomst eerst.
        const needle = q.trim().toLowerCase();
        const exact = (c: KmColor) => needle && (c.name.toLowerCase().startsWith(needle + " ") || c.name.toLowerCase() === needle || c.hex.toLowerCase() === needle);
        const sortedList = [...list].sort((a, b) => Number(exact(b)) - Number(exact(a)));
        setResults((prev) => (page === 1 ? sortedList : [...prev, ...sortedList]));
      } catch { setErr(true); }
      setLoading(false);
    }, 280);
    return () => clearTimeout(t);
  }, [open, tab, q, brand, line, page]);
  useEffect(() => { setPage(1); }, [q, brand, line, tab]);

  const rollList = useMemo(() => {
    const n = q.trim().toLowerCase();
    return n ? rollColors.filter((c) => c.name.toLowerCase().includes(n) || (c.subname ?? "").toLowerCase().includes(n) || c.hex.toLowerCase() === n) : rollColors;
  }, [q]);
  const kmTotal = useMemo(() => brands.reduce((s, b) => s + b.count, 0), [brands]);
  const lines = brands.find((b) => b.brand === brand)?.lines ?? [];

  if (!open) return null;
  const swatch = (hex: string | null, size = 44) => <span aria-hidden style={{ width: size, height: size, borderRadius: 10, background: hex ?? "var(--rd-grey-light)", border: "1px solid rgba(47,33,65,.12)", flex: "none", display: "block" }} />;
  const isSel = (id: string) => sel?.id === id;

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 90, background: "rgba(47,33,65,.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="rd-card-white" onClick={(e) => e.stopPropagation()} style={{ width: "min(760px, 100%)", height: "min(640px, 92vh)", display: "flex", flexDirection: "column", padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px 10px", display: "flex", flexDirection: "column", gap: 10, borderBottom: "1px solid var(--rd-line)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
            <strong style={{ fontSize: 17 }}>{title}</strong>
            <button className="rd-textlink" onClick={onClose}>Sluiten</button>
          </div>
          <div role="tablist" style={{ display: "flex", gap: 6 }}>
            <button role="tab" aria-selected={tab === "roll"} className={`rd-plan-chip${tab === "roll" ? " is-on" : ""}`} onClick={() => setTab("roll")}>Roll kleuren ({rollColors.length})</button>
            <button role="tab" aria-selected={tab === "ark"} className={`rd-plan-chip${tab === "ark" ? " is-on" : ""}`} onClick={() => setTab("ark")}>Andere kleuren {kmTotal ? `(${kmTotal.toLocaleString("nl-NL")})` : "24.000+"}</button>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input ref={inputRef} className="rd-input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tab === "roll" ? "Zoek op naam" : "Zoek op naam, kleurcode of HEX"} aria-label="Zoeken" style={{ height: 42, flex: "1 1 220px" }} />
            {tab === "ark" && (
              <>
                <select className="rd-input" value={brand} onChange={(e) => { setBrand(e.target.value); setLine(""); }} aria-label="Merk" style={{ height: 42, flex: "0 1 180px" }}>
                  <option value="">Alle merken</option>
                  {brands.map((b) => <option key={b.brand} value={b.brand}>{b.brand} ({b.count})</option>)}
                </select>
                {lines.length > 0 && (
                  <select className="rd-input" value={line} onChange={(e) => setLine(e.target.value)} aria-label="Lijn of waaier" style={{ height: 42, flex: "0 1 180px" }}>
                    <option value="">Alle lijnen</option>
                    {lines.map((l) => <option key={l.line} value={l.line}>{l.line} ({l.count})</option>)}
                  </select>
                )}
              </>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: "auto", padding: "12px 18px" }}>
          {tab === "roll" ? (
            rollList.length === 0 ? <p className="rd-sub">Geen kleur gevonden. Controleer de naam, of zoek bij Andere kleuren.</p> : (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 8 }}>
                {rollList.map((c) => (
                  <button key={c.id} onClick={() => setSel({ id: c.id, name: c.name, hex: c.hex, source: "roll" })} aria-pressed={isSel(c.id)}
                    style={{ display: "flex", gap: 10, alignItems: "center", textAlign: "left", padding: 8, borderRadius: 12, cursor: "pointer", font: "inherit", color: "inherit", background: isSel(c.id) ? "var(--rd-lavender)" : "#fff", border: `1.5px solid ${isSel(c.id) ? "var(--rd-aubergine)" : "var(--rd-line)"}`, minHeight: 60 }}>
                    {swatch(c.hex)}
                    <span style={{ minWidth: 0 }}><span style={{ display: "block", fontWeight: 700, fontSize: 13.5 }}>{c.name}</span><span style={{ display: "block", fontSize: 12, opacity: 0.65 }}>{c.subname}</span></span>
                  </button>
                ))}
              </div>
            )
          ) : (
            <>
              {!q.trim() && !brand && <p className="rd-sub">Zoek op naam of kleurcode, bijvoorbeeld "Strong White" of "2001", of kies eerst een merk.</p>}
              {err && <p className="rd-sub">Zoeken lukte niet. Controleer je verbinding en probeer het opnieuw.</p>}
              {total === 0 && results.length === 0 && !loading && (q.trim() || brand) && <p className="rd-sub">Geen kleur gevonden. Controleer de naam of code, of laat Roll meekijken.</p>}
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {results.map((c) => (
                  <button key={c.id} onClick={() => setSel({ id: c.id, name: c.name, hex: c.hex, source: "ark", brand: c.brand, line: c.line, roll_name: c.rollName ?? null, roll_code: c.rollCode ?? null })} aria-pressed={isSel(c.id)}
                    style={{ display: "flex", gap: 12, alignItems: "center", textAlign: "left", padding: 8, borderRadius: 12, cursor: "pointer", font: "inherit", color: "inherit", background: isSel(c.id) ? "var(--rd-lavender)" : "#fff", border: `1.5px solid ${isSel(c.id) ? "var(--rd-aubergine)" : "var(--rd-line)"}`, minHeight: 56 }}>
                    {swatch(c.hex, 40)}
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "block", fontWeight: 700, fontSize: 14 }}>{c.name}</span>
                      <span style={{ display: "block", fontSize: 12.5, opacity: 0.7 }}>{c.brand}{c.line ? ` · ${c.line}` : ""}{c.rollCode ? ` · mengcode ${c.rollCode}` : ""}</span>
                    </span>
                  </button>
                ))}
              </div>
              {loading && <p className="rd-sub">Zoeken...</p>}
              {!loading && more && (
                <button className="rd-textlink" onClick={() => setPage((p) => p + 1)} style={{ marginTop: 10 }}>Meer laden ({results.length} getoond)</button>
              )}
            </>
          )}
        </div>

        <div style={{ padding: "12px 18px", borderTop: "1px solid var(--rd-line)", display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
          <span style={{ fontSize: 13.5, display: "flex", gap: 8, alignItems: "center", minWidth: 0 }}>
            {sel ? <>{swatch(sel.hex, 22)}<span><strong>{sel.name}</strong>{sel.source === "ark" && sel.brand ? <span style={{ opacity: 0.7 }}> · referentiekleur {sel.brand}</span> : null}</span></> : <span style={{ opacity: 0.6 }}>Nog geen kleur gekozen</span>}
          </span>
          <button className="rd-btn rd-btn-primary" disabled={!sel} onClick={() => sel && onPick(sel)} style={{ width: "auto", padding: "0 22px", minHeight: 44, ...(sel ? {} : { opacity: 0.5 }) }}>Gebruik deze kleur</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
