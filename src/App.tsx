import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { RoomsStep } from "@/components/steps/RoomsStep";
import { useIntake } from "@/lib/store";
import { lockDocument } from "@/lib/lock-document";
import type { Room } from "@/lib/types";

type Screen = "intro" | "rooms" | "photos" | "sfeer" | "colors" | "vraag" | "summary";

const FLOW: Screen[] = ["rooms", "photos", "sfeer", "colors", "vraag"];
const TOTAL = FLOW.length;

const STEP_TITLES: Record<Screen, { kicker: string; title: string; sub: string }> = {
  intro: { kicker: "", title: "", sub: "" },
  rooms: {
    kicker: "Stap 1 · Ruimtes",
    title: "Welke ruimtes wil je aanpakken?",
    sub: "Tik een ruimte aan om hem toe te voegen. Meerdere van hetzelfde mag ook, bijvoorbeeld twee slaapkamers.",
  },
  photos: {
    kicker: "Stap 2 · Foto's & licht",
    title: "Laat je ruimtes zien",
    sub: "Een paar foto's en de lichtinval helpen de styliste enorm.",
  },
  sfeer: {
    kicker: "Stap 3 · Sfeer",
    title: "Welk gevoel zoek je?",
    sub: "Kies wat bij je past. Er is geen goed of fout.",
  },
  colors: {
    kicker: "Stap 4 · Kleuren & inspiratie",
    title: "Kleuren die je aanspreken",
    sub: "Ken je al Roll-kleuren of heb je inspiratie? Deel het hier.",
  },
  vraag: {
    kicker: "Stap 5 · Jouw vraag",
    title: "Waar mogen we je mee helpen?",
    sub: "Vertel in je eigen woorden waar je tegenaan loopt.",
  },
  summary: {
    kicker: "Bijna klaar",
    title: "Je intake in het kort",
    sub: "Controleer je gegevens en verstuur ze naar de styliste.",
  },
};

export function App() {
  const { state, update } = useIntake();
  const [screen, setScreen] = useState<Screen>("intro");

  useEffect(() => {
    const unlock = lockDocument();
    return unlock;
  }, []);

  const setRooms = (updater: (prev: Room[]) => Room[]) =>
    update((prev) => ({ rooms: updater(prev.rooms) }));

  // ── Intro ──────────────────────────────────────────────────────────────
  if (screen === "intro") {
    return (
      <Shell
        step={0}
        total={TOTAL}
        title={
          <>
            Persoonlijk kleuradvies,
            <br />
            in een paar minuten voorbereid
          </>
        }
        sub="Vul deze korte intake in, dan gaat een interieurstyliste met jouw ruimtes aan de slag. Je kunt tussendoor stoppen, we bewaren je antwoorden."
        footer={
          <button className="rd-btn rd-btn-primary rd-btn-lg" onClick={() => setScreen("rooms")}>
            Beginnen
          </button>
        }
      >
        <div className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            "5 korte stappen, ongeveer 5 minuten",
            "Je persoonlijke advies binnen 30 minuten",
            "Alles draait om jouw gevoel en jouw ruimte",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span
                className="rd-ring is-on"
                aria-hidden
                style={{ width: 22, height: 22, fontSize: 12 }}
              >
                ✓
              </span>
              <span style={{ fontWeight: 600, fontSize: 15, lineHeight: 1.3 }}>{t}</span>
            </div>
          ))}
        </div>
      </Shell>
    );
  }

  const idx = FLOW.indexOf(screen as Screen);
  const meta = STEP_TITLES[screen];

  const goBack = () => {
    if (screen === "summary") return setScreen("vraag");
    if (idx <= 0) return setScreen("intro");
    setScreen(FLOW[idx - 1]);
  };
  const goNext = () => {
    if (idx >= 0 && idx < TOTAL - 1) return setScreen(FLOW[idx + 1]);
    setScreen("summary");
  };

  const canAdvance = screen === "rooms" ? state.rooms.length > 0 : true;

  const footer = (
    <button
      className="rd-btn rd-btn-primary rd-btn-lg"
      onClick={goNext}
      disabled={!canAdvance}
      style={!canAdvance ? { opacity: 0.4 } : undefined}
    >
      {screen === "summary" ? "Versturen" : "Volgende"}
    </button>
  );

  return (
    <Shell
      step={screen === "summary" ? TOTAL : idx + 1}
      total={TOTAL}
      onBack={goBack}
      kicker={meta.kicker}
      title={meta.title}
      sub={meta.sub}
      footer={footer}
    >
      {screen === "rooms" && <RoomsStep rooms={state.rooms} setRooms={setRooms} />}
      {screen !== "rooms" && (
        <div className="rd-card-white" style={{ textAlign: "center", padding: "28px 18px" }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>
            In aanbouw
          </div>
          <p style={{ margin: 0, fontWeight: 600, fontSize: 15, lineHeight: 1.4 }}>
            Deze stap bouwen we in de volgende ronde. Je kunt alvast doorklikken om de flow te
            bekijken.
          </p>
        </div>
      )}
    </Shell>
  );
}
