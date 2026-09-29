import { useState } from "react";
import type { DbRoom } from "../types";
import { Photos } from "../Photos";
import { SUN_MOMENTS, USAGE_TIMES, SURFACES } from "@/data/intake-options";
import { ColorPicker } from "./ColorPicker";
import { KEUZE_LABEL, TYPE_LABEL, colorLabel, newSurface, roomProgress, uid, type AdviceRoomV2, type AdviceSurface, type AdviceV2, type Keuze, type PickedColor, type SurfaceType } from "./advice";

const lbl = (list: { key: string; label: string }[], key?: string | null) => list.find((x) => x.key === key)?.label ?? key ?? "";
const TONE: Record<string, { bg: string; ink: string }> = {
  todo: { bg: "var(--rd-grey-light)", ink: "var(--rd-aubergine)" },
  test: { bg: "var(--rd-pink)", ink: "var(--rd-aubergine)" },
  ok: { bg: "#C9E6CE", ink: "#1e4429" },
};

export function AdviesFase({ advice, setAdvice, intakeRooms, roomId, setRoomId }: {
  advice: AdviceV2;
  setAdvice: (fn: (a: AdviceV2) => AdviceV2) => void;
  intakeRooms: DbRoom[];
  roomId: string | null;
  setRoomId: (id: string) => void;
}) {
  const room = advice.rooms.find((r) => r.room_id === roomId) ?? advice.rooms[0];
  const intakeRoom = intakeRooms.find((r) => r.id === room?.room_id) ?? null;
  const [picker, setPicker] = useState<{ surfaceId: string; replace?: string } | null>(null);
  const [undo, setUndo] = useState<{ roomId: string; surface: AdviceSurface; index: number } | null>(null);

  const updRoom = (id: string, fn: (r: AdviceRoomV2) => AdviceRoomV2) => setAdvice((a) => ({ ...a, rooms: a.rooms.map((r) => (r.room_id === id ? fn(r) : r)) }));
  const updSurface = (sid: string, p: Partial<AdviceSurface>) => room && updRoom(room.room_id, (r) => ({ ...r, surfaces: r.surfaces.map((s) => (s.id === sid ? { ...s, ...p } : s)) }));
  const addSurface = (type: SurfaceType) => room && updRoom(room.room_id, (r) => ({ ...r, surfaces: [...r.surfaces, newSurface(type, type === "accent" ? "" : undefined)] }));
  const removeSurface = (s: AdviceSurface) => {
    if (!room) return;
    const index = room.surfaces.findIndex((x) => x.id === s.id);
    updRoom(room.room_id, (r) => ({ ...r, surfaces: r.surfaces.filter((x) => x.id !== s.id) }));
    setUndo({ roomId: room.room_id, surface: s, index });
    setTimeout(() => setUndo((u) => (u?.surface.id === s.id ? null : u)), 8000);
  };
  const restore = () => {
    if (!undo) return;
    updRoom(undo.roomId, (r) => { const list = [...r.surfaces]; list.splice(undo.index, 0, undo.surface); return { ...r, surfaces: list }; });
    setUndo(null);
  };
  const addRoom = () => {
    const id = `extra-${uid()}`;
    setAdvice((a) => ({ ...a, rooms: [...a.rooms, { room_id: id, label: "Nieuwe ruimte", surfaces: [newSurface("muren")] }] }));
    setRoomId(id);
  };
  const pick = (c: PickedColor) => {
    if (!picker || !room) return;
    const s = room.surfaces.find((x) => x.id === picker.surfaceId);
    if (!s) return;
    // Bevestigd = één kleur; bij testen meerdere kandidaten.
    const colors = s.status === "testen"
      ? (picker.replace ? s.colors.map((x) => (x.id === picker.replace ? c : x)) : s.colors.some((x) => x.id === c.id) ? s.colors : [...s.colors, c])
      : [c];
    updSurface(s.id, { colors });
    setPicker(null);
  };

  if (!room) return <p className="rd-sub">Deze intake heeft nog geen ruimtes.</p>;
  const pickerSurface = picker ? room.surfaces.find((s) => s.id === picker.surfaceId) : null;

  return (
    <div className="kk-grid">
      {/* Ruimtes */}
      <nav aria-label="Ruimtes" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {advice.rooms.map((r) => {
          const p = roomProgress(r);
          const on = r.room_id === room.room_id;
          return (
            <button key={r.room_id} onClick={() => setRoomId(r.room_id)} aria-current={on}
              style={{ textAlign: "left", padding: "10px 12px", borderRadius: 12, font: "inherit", color: "inherit", cursor: "pointer", minHeight: 44, background: on ? "#fff" : "transparent", border: `1.5px solid ${on ? "var(--rd-aubergine)" : "var(--rd-line)"}` }}>
              <span style={{ display: "block", fontWeight: 700, fontSize: 15 }}>{r.label}</span>
              <span style={{ display: "inline-block", marginTop: 4, fontSize: 12, fontWeight: 700, padding: "1px 8px", borderRadius: 99, background: TONE[p.tone].bg, color: TONE[p.tone].ink }}>{p.label}</span>
            </button>
          );
        })}
        <button className="rd-textlink" onClick={addRoom} style={{ alignSelf: "flex-start", minHeight: 40 }}>+ Ruimte toevoegen</button>
      </nav>

      {/* Werkvlak */}
      <section aria-label={`Advies ${room.label}`} style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
        <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span className="kk-label">Ruimte</span>
          <input className="rd-input" value={room.label} onChange={(e) => updRoom(room.room_id, (r) => ({ ...r, label: e.target.value }))} style={{ height: 44, fontWeight: 700, fontSize: 16 }} />
        </label>

        {room.surfaces.map((s) => (
          <div key={s.id} className="kk-surface">
            <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
              <strong style={{ fontSize: 15 }}>{TYPE_LABEL[s.type]}</strong>
              {(s.type === "accent" || room.surfaces.filter((x) => x.type === s.type).length > 1) && (
                <input className="rd-input" value={s.name === TYPE_LABEL[s.type] ? "" : s.name} onChange={(e) => updSurface(s.id, { name: e.target.value || TYPE_LABEL[s.type] })}
                  placeholder={s.type === "accent" ? "Welke wand? Bijv. Achter de bank" : s.type === "houtwerk" ? "Welk deel? Bijv. Kozijnen, deuren, radiator" : s.type === "muren" ? "Welke muren? Bijv. Muren zithoek" : "Welk deel?"}
                  aria-label={`Naam ${TYPE_LABEL[s.type].toLowerCase()}`} style={{ height: 38, flex: "1 1 220px" }} />
              )}
              <button className="rd-textlink" onClick={() => removeSurface(s)} style={{ marginLeft: "auto", fontSize: 13, opacity: 0.7 }}>Verwijderen</button>
            </div>

            <div role="radiogroup" aria-label="Keuzestatus" style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(["bespreken", "testen", "bevestigd"] as Keuze[]).map((k) => (
                <button key={k} role="radio" aria-checked={s.status === k} className={`rd-plan-chip${s.status === k ? " is-on" : ""}`} style={{ minHeight: 40 }}
                  onClick={() => updSurface(s.id, { status: k, colors: k === "bevestigd" ? s.colors.slice(0, 1) : s.colors })}>{KEUZE_LABEL[k]}</button>
              ))}
            </div>

            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              {s.colors.map((c) => (
                <span key={c.id} style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", borderRadius: 12, border: "1px solid var(--rd-line)", background: "#fff" }}>
                  <span aria-hidden style={{ width: 28, height: 28, borderRadius: 8, background: c.hex ?? "var(--rd-grey-light)", border: "1px solid rgba(47,33,65,.12)" }} />
                  <span style={{ fontSize: 14 }}>
                    <strong>{c.name}</strong>
                    {c.source === "ark" && <span style={{ display: "block", fontSize: 12, opacity: 0.7 }}>Referentiekleur {c.brand}{c.roll_code ? ` · bij Roll ${c.roll_name ?? "Roll"} - ${c.roll_code}` : ""}</span>}
                  </span>
                  <button className="rd-textlink" style={{ fontSize: 12.5 }} onClick={() => setPicker({ surfaceId: s.id, replace: c.id })}>Wijzig</button>
                  <button className="rd-textlink" style={{ fontSize: 12.5, opacity: 0.7 }} aria-label={`${colorLabel(c)} weghalen`} onClick={() => updSurface(s.id, { colors: s.colors.filter((x) => x.id !== c.id) })}>×</button>
                </span>
              ))}
              {(s.colors.length === 0 || s.status === "testen") && (
                <button className="rd-btn rd-btn-outline" onClick={() => setPicker({ surfaceId: s.id })} style={{ width: "auto", padding: "0 16px", minHeight: 44 }}>
                  {s.colors.length === 0 ? "Kies kleur" : "+ Testkleur"}
                </button>
              )}
            </div>
            {s.status === "bevestigd" && s.colors.length === 0 && <span style={{ fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Kies de bevestigde kleur voor dit oppervlak.</span>}

            <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <span className="kk-label">Toelichting voor de klant</span>
              <textarea className="rd-input" value={s.note} onChange={(e) => updSurface(s.id, { note: e.target.value })} placeholder="Waarom deze kleur hier werkt. Komt in het verslag." style={{ minHeight: 64, paddingTop: 10, resize: "vertical", lineHeight: 1.45 }} />
            </label>
          </div>
        ))}

        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          <span className="kk-label" style={{ alignSelf: "center" }}>Toevoegen:</span>
          <button className="rd-textlink" onClick={() => addSurface("muren")}>+ Muren</button>
          <button className="rd-textlink" onClick={() => addSurface("accent")}>+ Accentwand</button>
          <button className="rd-textlink" onClick={() => addSurface("plafond")}>+ Plafond</button>
          <button className="rd-textlink" onClick={() => addSurface("houtwerk")}>+ Hout &amp; metaal</button>
        </div>
        {undo && (
          <div role="status" style={{ display: "flex", gap: 12, alignItems: "center", fontSize: 14, padding: "10px 12px", borderRadius: 12, background: "var(--rd-grey-light)" }}>
            {TYPE_LABEL[undo.surface.type]} verwijderd. <button className="rd-textlink" onClick={restore}>Ongedaan maken</button>
          </div>
        )}
      </section>

      {/* Context van deze ruimte */}
      <aside aria-label="Uit de intake" className="kk-context">
        <span className="kk-label">Uit de intake</span>
        {intakeRoom ? (
          <>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>
              <div><strong>Schilderen:</strong> {(intakeRoom.surfaces ?? []).map((s) => lbl(SURFACES, s)).join(", ") || "onbekend"}</div>
              <div><strong>Licht:</strong> {intakeRoom.noWindows ? "geen ramen" : (intakeRoom.sun?.length ? intakeRoom.sun.map((k) => lbl(SUN_MOMENTS, k)).join(", ") : "onbekend")}{intakeRoom.skylight ? ", dakraam" : ""}</div>
              {intakeRoom.usage && <div><strong>Gebruik:</strong> {lbl(USAGE_TIMES, intakeRoom.usage)}</div>}
              {intakeRoom.otherChanges && <div><strong>Verandert:</strong> {intakeRoom.otherChangesNote || "ja"}</div>}
            </div>
            <Photos photos={intakeRoom.photos} size={92} />
          </>
        ) : <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>Deze ruimte staat niet in de intake.</p>}
      </aside>

      <ColorPicker open={!!picker} initial={picker?.replace ? pickerSurface?.colors.find((c) => c.id === picker.replace) ?? null : null}
        title={pickerSurface ? `Kleur voor ${pickerSurface.type === "accent" ? pickerSurface.name || "accentwand" : TYPE_LABEL[pickerSurface.type].toLowerCase()} · ${room.label}` : "Kies een kleur"}
        onPick={pick} onClose={() => setPicker(null)} />
    </div>
  );
}
