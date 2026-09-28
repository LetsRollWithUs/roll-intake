// Alleen lokaal (npm run dev): de klantkaart-fases met fictieve gegevens, om de opmaak te bekijken zonder login.
import { useState } from "react";
import type { IntakeRow } from "../types";
import { initialAdvice, type AdviceV2 } from "./advice";
import { Voorbereiden } from "./Voorbereiden";
import { AdviesFase } from "./AdviesFase";
import { Afronden } from "./Afronden";

const intake = {
  id: "00000000-0000-0000-0000-000000000000", created_at: new Date().toISOString(), status: "verzonden",
  contact_name: "Sanne de Vries", contact_email: "sanne@voorbeeld.nl",
  main_question: "Welke warme kleur past in de woonkamer bij onze eikenhouten vloer, zonder dat het donker wordt?",
  help_needs: ["Kleur kiezen", "Combinaties"], moods: [], colors: [{ id: "spiced-latte", name: "Spiced Latte", hex: "#AC7C59" }],
  rooms: [
    { id: "r1", typeKey: "woonkamer", label: "Woonkamer", surfaces: ["muren", "plafond"], sun: ["middag"], photos: [] },
    { id: "r2", typeKey: "keuken", label: "Keuken", surfaces: ["muren"], sun: [], noWindows: false, photos: [] },
  ],
  samples: [{ id: "s1", brand: "Roll", name: "Home Safari", verdict: "favoriet" }], has_samples: "roll",
  planning: "binnen_maand", painter: "zelf", room_measures: { r1: { walls: [{ w: 4, h: 2.6 }], ceilings: [] } },
  advice_sample: null, advice_verf: null,
} as unknown as IntakeRow;

export function KlantDemo() {
  const [advice, setAdviceState] = useState<AdviceV2>(() => {
    const a = initialAdvice(intake);
    a.rooms[0].surfaces[0] = { ...a.rooms[0].surfaces[0], status: "bevestigd", colors: [{ id: "shadow-nap", name: "Shadow Nap", hex: "#5D5C5C", source: "roll" }], note: "Geeft diepte naast de lichte vloer." };
    a.rooms[1].surfaces[0] = { ...a.rooms[1].surfaces[0], status: "testen", colors: [{ id: "leaf-love", name: "Leaf Love", hex: "#9DA37C", source: "roll" }, { id: "farrow-ball-standaard-2001-strong-white", name: "2001 Strong White", hex: "#EEEEE2", source: "ark", brand: "Farrow & Ball", roll_code: "030009" }] };
    return a;
  });
  const [room, setRoom] = useState<string | null>("r1");
  const [fase, setFase] = useState<"voor" | "advies" | "af">(() => (new URLSearchParams(location.search).get("fase") as "voor" | "advies" | "af") || "advies");
  return (
    <div className="kk" style={{ padding: 24 }}>
      <style>{`.kk{max-width:1180px;margin:0 auto;color:var(--rd-aubergine)}.kk-label{font-size:13px;font-weight:700;color:rgba(47,33,65,.62)}.kk-h2{font-size:19px;font-weight:800;margin:0 0 8px}.kk-main{display:flex;flex-direction:column;gap:20px;min-width:0}.kk-two{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:32px;align-items:start}.kk-grid{display:grid;grid-template-columns:200px minmax(0,1fr) 300px;gap:24px;align-items:start}.kk-context{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:var(--rd-grey-light);position:sticky;top:16px}.kk-surface{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-top:1px solid var(--rd-line)}.kk-card{display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:18px;background:#fff;border:1px solid var(--rd-line)}.kk-row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;font-size:15px;line-height:1.5;padding-top:12px;border-top:1px solid var(--rd-line)}@media (max-width:980px){.kk-grid,.kk-two{grid-template-columns:1fr}.kk-context{position:static}}`}</style>
      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {(["voor", "advies", "af"] as const).map((f) => <button key={f} className={`rd-plan-chip${fase === f ? " is-on" : ""}`} onClick={() => setFase(f)}>{f}</button>)}
      </div>
      {fase === "voor" && <Voorbereiden intake={intake} advice={advice} email="sanne@voorbeeld.nl" samplesBefore samplesAfter={false} onIntake={() => {}} onOrders={() => {}} />}
      {fase === "advies" && <AdviesFase advice={advice} setAdvice={(fn) => setAdviceState(fn)} intakeRooms={intake.rooms ?? []} roomId={room} setRoomId={setRoom} />}
      {fase === "af" && <Afronden intake={{ ...intake, advice_verf: { answer: "", rooms: [{ room_id: "r1", room: "Woonkamer", surface: "Muren", color: "Shadow Nap", status: "definitief", product: "Muurverf", m2: "", liters: "", motivation: "" }], sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" }, route: "roll", products: [] }, advice_sample: { answer: "", rooms: [], sample_instruction: "", next_step: "", internal: "", plan: { what: "", who: "", when: "" }, route: "samples", products: [] } }}
        advice={advice} setMessage={(v) => setAdviceState((a) => ({ ...a, message: v }))} bookingId="demo" stylistId={null} stylistName="Selene" customerName="Sanne de Vries" customerEmail="sanne@voorbeeld.nl"
        rooms={intake.rooms ?? []} task={null} sends={[]} onIntake={() => {}} onTask={() => {}} onSent={() => {}} onEditAdvice={() => setFase("advies")} />}
    </div>
  );
}
