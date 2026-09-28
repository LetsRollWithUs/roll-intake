import { SURFACES, SUN_MOMENTS, USAGE_TIMES, PLANNING, PAINTERS, MOODS } from "@/data/intake-options";
import type { IntakeRow } from "../types";
import { Photos } from "../Photos";
import { AddPhotos } from "../AddPhotos";
import { ConceptPanel } from "../ConceptPanel";
import { CustomerPurchases, type OrdersResp } from "../CustomerPurchases";
import type { AdviceV2, SurfaceType } from "./advice";

const lbl = (list: { key: string; label: string }[], key?: string | null) => list.find((x) => x.key === key)?.label ?? key ?? "";
const safeUrl = (v?: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
const intakeType = (k: string): SurfaceType => (k === "plafond" ? "plafond" : k === "muren" ? "muren" : "houtwerk");

// Wat moet de styliste in het gesprek nog vragen? Concreet benoemd, per ruimte.
export function nogBespreken(intake: IntakeRow | null, advice: AdviceV2 | null): string[] {
  if (!intake) return ["De klant heeft de intake nog niet ingevuld."];
  const out: string[] = [];
  for (const r of intake.rooms ?? []) {
    const a = advice?.rooms.find((x) => x.room_id === r.id);
    const types = new Set((r.surfaces ?? []).map(intakeType));
    for (const t of types) {
      const s = a?.surfaces.filter((x) => x.type === t) ?? [];
      if (!s.length || s.every((x) => x.status === "bespreken")) out.push(`${t === "muren" ? "Muren" : t === "plafond" ? "Plafond" : "Houtwerk"} ${r.label.toLowerCase()} nog niet besproken`);
    }
    if (!(r.photos ?? []).some((p) => p?.path || p?.url)) out.push(`Geen foto's van de ${r.label.toLowerCase()}`);
    if (!(r.sun?.length) && !r.noWindows) out.push(`Lichtinval ${r.label.toLowerCase()} onbekend`);
    if (!intake.room_measures?.[r.id]) out.push(`Maten ${r.label.toLowerCase()} ontbreken`);
  }
  if (!intake.planning) out.push("Wanneer wil de klant schilderen?");
  if (!intake.painter) out.push("Schildert de klant zelf of een schilder?");
  return out;
}

const Row = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div className="kk-row"><span className="kk-label">{k}</span><div>{children}</div></div>
);

export function Voorbereiden({ intake, advice, email, samplesBefore, samplesAfter, onIntake, onOrders }: {
  intake: IntakeRow | null; advice: AdviceV2 | null; email: string | null; samplesBefore: boolean; samplesAfter: boolean;
  onIntake: (i: IntakeRow) => void; onOrders: (d: OrdersResp | null) => void;
}) {
  const open = nogBespreken(intake, advice);
  if (!intake) {
    return (
      <div className="kk-main">
        <p className="rd-sub" style={{ margin: 0 }}>De klant heeft de intake nog niet ingevuld. Zodra die binnen is, zie je hier de hulpvraag, ruimtes, foto's en voorkeuren.</p>
        <CustomerPurchases email={email} title="Eerdere samples en aankopen" onData={onOrders} />
      </div>
    );
  }
  return (
    <div className="kk-two">
      <div className="kk-main">
        <div>
          <span className="kk-label">Hulpvraag</span>
          <p style={{ fontSize: 18, lineHeight: 1.4, fontWeight: 700, margin: "4px 0 0" }}>{intake.main_question || "Geen hulpvraag ingevuld"}</p>
          {(intake.help_needs?.length ?? 0) > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>{intake.help_needs!.map((h) => <span key={h} className="rd-chip">{h}</span>)}</div>}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {(intake.rooms ?? []).map((r) => (
            <div key={r.id}>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{r.label}{r.priority ? " · prioriteit" : ""}</div>
              <div style={{ fontSize: 14, opacity: 0.8, margin: "2px 0 8px" }}>
                {(r.surfaces ?? []).map((s) => lbl(SURFACES, s)).join(", ") || "Oppervlak onbekend"}
                {r.noWindows ? " · geen ramen" : r.sun?.length ? ` · ${r.sun.map((k) => lbl(SUN_MOMENTS, k).toLowerCase()).join(", ")}` : ""}
                {r.skylight ? " · dakraam" : ""}{r.usage ? ` · ${lbl(USAGE_TIMES, r.usage).toLowerCase()}` : ""}
                {r.otherChanges ? ` · verandert: ${r.otherChangesNote || "ja"}` : ""}
              </div>
              <Photos photos={r.photos} size={120} />
              <AddPhotos intake={intake} room={r} onDone={onIntake} />
            </div>
          ))}
        </div>

        <Row k="Gewenste sfeer">{(intake.moods ?? []).filter((m) => MOODS.includes(m)).join(", ") || <span style={{ opacity: 0.6 }}>Niet ingevuld</span>}
          {intake.inspiration_note && <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>{intake.inspiration_note}</div>}
          <div style={{ display: "flex", gap: 12, marginTop: 4 }}>
            {safeUrl(intake.pinterest_url) && <a href={safeUrl(intake.pinterest_url)!} target="_blank" rel="noreferrer" className="rd-textlink">Pinterest</a>}
            {safeUrl(intake.other_inspiration_url) && <a href={safeUrl(intake.other_inspiration_url)!} target="_blank" rel="noreferrer" className="rd-textlink">Inspiratielink</a>}
          </div>
        </Row>
        <Row k="Overwogen kleuren">{(intake.colors?.length ?? 0) > 0 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{intake.colors!.map((c, i) => <span key={i} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />{c.name}</span>)}</div>
        ) : <span style={{ opacity: 0.6 }}>Geen</span>}</Row>
        <Row k="Samples">
          <div>{samplesBefore ? "De klant had al samples vóór het gesprek." : "Nog geen samples vóór het gesprek."}{samplesAfter ? " Na het gesprek zijn samples besteld." : ""}</div>
          {(intake.samples?.length ?? 0) > 0 && <div style={{ fontSize: 14, marginTop: 4 }}>{intake.samples!.map((s) => `${[s.brand, s.name].filter(Boolean).join(" ")}${s.verdict ? ` (${s.verdict})` : ""}`).join(" · ")}</div>}
        </Row>
        <Row k="Planning">{lbl(PLANNING, intake.planning) || <span style={{ opacity: 0.6 }}>Onbekend</span>}{intake.painter ? ` · ${lbl(PAINTERS, intake.painter)}` : ""}</Row>
        <CustomerPurchases email={email} title="Eerdere samples en aankopen" onData={onOrders} />
      </div>

      <aside className="kk-context">
        <span className="kk-label">Nog bespreken</span>
        {open.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Alles is bekend. Je kunt direct beginnen met het advies.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>{open.map((o) => <li key={o}>{o}</li>)}</ul>
        )}
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 32 }}>Voorstel voorbereiden</summary>
          <p style={{ fontSize: 13, opacity: 0.75, margin: "6px 0" }}>Een eerste kleurvoorstel op basis van de intake. Het blijft een voorstel tot jij het in het advies overneemt.</p>
          <ConceptPanel intake={intake} />
        </details>
      </aside>
    </div>
  );
}
