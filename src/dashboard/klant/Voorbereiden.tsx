import { SURFACES, SUN_MOMENTS, USAGE_TIMES, PLANNING, PAINTERS, MOODS } from "@/data/intake-options";
import type { IntakeRow } from "../types";
import { Photos } from "../Photos";
import { AddPhotos } from "../AddPhotos";
import { ConceptPanel } from "../ConceptPanel";
import { CustomerPurchases, type OrdersResp } from "../CustomerPurchases";
import type { AdviceV2, SurfaceType } from "./advice";
import { INSPIRATIONS } from "@/data/inspiration";
import { summarizeMeasure, calcRoom } from "@/lib/verfcalc";
import { maatSignalen } from "../advicePrompt";

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
          {(intake.payload as { questionScope?: string } | null)?.questionScope && <div style={{ fontSize: 14, marginTop: 6, opacity: 0.8 }}>Gaat over: {(intake.payload as { questionScope?: string }).questionScope === "een" ? "één ruimte" : "meerdere ruimtes of het hele huis"}</div>}
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
              {intake.room_measures?.[r.id] && summarizeMeasure(intake.room_measures[r.id]).length > 0 && (
                <div style={{ fontSize: 14, margin: "0 0 8px" }}>
                  <span className="kk-label">Maten volgens de klant: </span>
                  {summarizeMeasure(intake.room_measures[r.id]).join("; ")}
                  <span style={{ opacity: 0.7 }}> ({String(Math.round(calcRoom(intake.room_measures[r.id]).wall_m2 * 10) / 10).replace(".", ",")} m² muur)</span>
                </div>
              )}
              <Photos photos={r.photos} size={120} />
              <AddPhotos intake={intake} room={r} onDone={onIntake} />
            </div>
          ))}
        </div>

        <Row k="Gewenste sfeer">
          {(intake.moods ?? []).filter((m) => MOODS.includes(m)).join(", ") || <span style={{ opacity: 0.6 }}>Niet ingevuld</span>}
          {intake.boldness ? <div style={{ fontSize: 14, marginTop: 4 }}>Durf: <strong>{intake.boldness}/5</strong> <span style={{ opacity: 0.7 }}>({intake.boldness >= 4 ? "mag uitgesproken" : intake.boldness <= 2 ? "rustig en ingetogen" : "gemiddeld"})</span></div> : null}
          {(intake.rooms?.length ?? 0) > 1 && (intake.payload as { sfeerSameAll?: boolean | null } | null)?.sfeerSameAll != null && (
            <div style={{ fontSize: 14, marginTop: 2 }}>{(intake.payload as { sfeerSameAll?: boolean }).sfeerSameAll ? "Zelfde sfeer in alle ruimtes" : `Niet overal dezelfde sfeer${(intake.payload as { sfeerExceptionNote?: string }).sfeerExceptionNote ? `: ${(intake.payload as { sfeerExceptionNote?: string }).sfeerExceptionNote}` : ""}`}</div>
          )}
        </Row>
        <Row k="Inspiratie">
          {intake.inspiration_note && <p style={{ margin: "0 0 10px", fontSize: 15, lineHeight: 1.5 }}>"{intake.inspiration_note.trim()}"</p>}
          {(intake.inspiration_likes?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span className="kk-label">Gekozen sfeerbeelden</span>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 6 }}>
                {intake.inspiration_likes!.map((id) => {
                  const ins = INSPIRATIONS.find((x) => x.id === id);
                  return ins ? (
                    <figure key={id} style={{ margin: 0, width: 120 }}>
                      <img src={ins.src} alt="" style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 10, display: "block" }} />
                      <figcaption style={{ fontSize: 12.5, marginTop: 4 }}>{ins.label}</figcaption>
                    </figure>
                  ) : <span key={id} className="rd-chip">{id}</span>;
                })}
              </div>
            </div>
          )}
          {(intake.inspiration_images?.length ?? 0) > 0 && (
            <div style={{ marginBottom: 10 }}>
              <span className="kk-label">Eigen inspiratiefoto's</span>
              <div style={{ marginTop: 6 }}><Photos photos={intake.inspiration_images as never} size={120} /></div>
            </div>
          )}
          <div style={{ display: "flex", gap: 12 }}>
            {safeUrl(intake.pinterest_url) && <a href={safeUrl(intake.pinterest_url)!} target="_blank" rel="noreferrer" className="rd-textlink">Pinterest-bord</a>}
            {safeUrl(intake.other_inspiration_url) && <a href={safeUrl(intake.other_inspiration_url)!} target="_blank" rel="noreferrer" className="rd-textlink">Inspiratielink</a>}
          </div>
          {!intake.inspiration_note && !(intake.inspiration_likes?.length) && !(intake.inspiration_images?.length) && !safeUrl(intake.pinterest_url) && !safeUrl(intake.other_inspiration_url) && <span style={{ opacity: 0.6 }}>Geen inspiratie gedeeld</span>}
        </Row>
        <Row k="Overwogen kleuren">{(intake.colors?.length ?? 0) > 0 ? (
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{intake.colors!.map((c, i) => <span key={i} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span aria-hidden style={{ width: 12, height: 12, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />{c.name}</span>)}</div>
        ) : <span style={{ opacity: 0.6 }}>Geen</span>}</Row>
        <Row k="Samples">
          <div>{samplesBefore ? "De klant had al samples vóór het gesprek." : "Nog geen samples vóór het gesprek."}{samplesAfter ? " Na het gesprek zijn samples besteld." : ""}</div>
          {(intake.samples?.length ?? 0) > 0 && (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
              {intake.samples!.map((smp) => (
                <div key={smp.id} style={{ fontSize: 14 }}>
                  <strong>{[smp.brand, smp.name].filter(Boolean).join(" ")}</strong>{smp.verdict ? ` · ${smp.verdict}` : ""}
                  {smp.roomId && (intake.rooms ?? []).find((x) => x.id === smp.roomId) ? <span style={{ opacity: 0.7 }}> · in {(intake.rooms ?? []).find((x) => x.id === smp.roomId)!.label.toLowerCase()}</span> : null}
                  {smp.note && <div style={{ opacity: 0.85 }}>"{smp.note}"</div>}
                  {smp.photo && <div style={{ marginTop: 4 }}><Photos photos={[smp.photo] as never} size={90} /></div>}
                </div>
              ))}
            </div>
          )}
        </Row>
        <Row k="Planning">{lbl(PLANNING, intake.planning) || <span style={{ opacity: 0.6 }}>Onbekend</span>}{intake.painter ? ` · ${lbl(PAINTERS, intake.painter)}` : ""}</Row>
        <CustomerPurchases email={email} title="Eerdere samples en aankopen" onData={onOrders} />
      </div>

      <aside className="kk-context">
        <span className="kk-label">Nog bespreken</span>
        {open.length === 0 ? <p style={{ margin: 0, fontSize: 14 }}>Alles is bekend. Je kunt direct beginnen met het advies.</p> : (
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.6 }}>{open.map((o) => <li key={o}>{o}</li>)}</ul>
        )}
        {maatSignalen(intake).length > 0 && (
          <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 4 }}>
            <span className="kk-label">Maten om te controleren</span>
            <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>{maatSignalen(intake).map((x) => <li key={x}>{x}</li>)}</ul>
          </div>
        )}
        <details style={{ marginTop: 8 }}>
          <summary style={{ cursor: "pointer", fontWeight: 700, fontSize: 14, minHeight: 32 }}>Beslisblad voorbereiden met AI</summary>
          <ConceptPanel intake={intake} />
        </details>
      </aside>
    </div>
  );
}
