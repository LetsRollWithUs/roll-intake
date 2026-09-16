import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { RoomsStep } from "@/components/steps/RoomsStep";
import { PhotosStep } from "@/components/steps/PhotosStep";
import { SfeerStep } from "@/components/steps/SfeerStep";
import { ColorsStep } from "@/components/steps/ColorsStep";
import { VraagStep } from "@/components/steps/VraagStep";
import { SummaryStep } from "@/components/steps/SummaryStep";
import { useIntake } from "@/lib/store";
import { submitIntake } from "@/lib/submit";
import { lockDocument } from "@/lib/lock-document";
import type { Room } from "@/lib/types";

type StepScreen = "rooms" | "photos" | "sfeer" | "colors" | "vraag";
type Screen = "intro" | StepScreen | "summary" | "done";

const FLOW: StepScreen[] = ["rooms", "photos", "sfeer", "colors", "vraag"];
const TOTAL = FLOW.length;

const META: Record<Screen, { kicker: string; title: string; sub: string }> = {
  intro: { kicker: "", title: "", sub: "" },
  rooms: {
    kicker: "Stap 1 · Ruimtes",
    title: "Welke ruimtes wil je aanpakken?",
    sub: "Tik een ruimte aan om hem toe te voegen. Meerdere van hetzelfde mag ook, bijvoorbeeld twee slaapkamers.",
  },
  photos: {
    kicker: "Stap 2 · Foto's & licht",
    title: "Laat je ruimtes zien",
    sub: "Een paar foto's en de lichtinval helpen de styliste enorm. Alles is optioneel.",
  },
  sfeer: {
    kicker: "Stap 3 · Sfeer",
    title: "Welk gevoel zoek je?",
    sub: "Kies wat bij je past. Er is geen goed of fout.",
  },
  colors: {
    kicker: "Stap 4 · Kleuren & inspiratie",
    title: "Kleuren die je aanspreken",
    sub: "Zoek Roll-kleuren die je mooi vindt, of deel andere inspiratie.",
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
  done: { kicker: "", title: "", sub: "" },
};

export function App() {
  const { state, update, reset } = useIntake();
  const [screen, setScreen] = useState<Screen>("intro");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => lockDocument(), []);

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

  // ── Verzonden ────────────────────────────────────────────────────────────
  if (screen === "done") {
    return (
      <Shell
        step={0}
        total={TOTAL}
        title="Dankjewel, je intake is onderweg"
        sub="De interieurstyliste bekijkt jouw ruimtes en stuurt je binnen 30 minuten een persoonlijk voorstel per e-mail."
        footer={
          <button
            className="rd-btn rd-btn-outline rd-btn-lg"
            onClick={() => {
              reset();
              setScreen("intro");
            }}
          >
            Nieuwe intake starten
          </button>
        }
      >
        <div className="rd-card-white" style={{ textAlign: "center", padding: "26px 18px" }}>
          <div
            className="rd-ring is-on"
            aria-hidden
            style={{ width: 48, height: 48, fontSize: 24, margin: "0 auto 12px" }}
          >
            ✓
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Goed gedaan!</p>
          <p className="rd-sub" style={{ marginTop: 6 }}>
            Houd je mail in de gaten, ook je spam voor de zekerheid.
          </p>
        </div>
      </Shell>
    );
  }

  const idx = screen === "summary" ? TOTAL : FLOW.indexOf(screen as StepScreen);
  const meta = META[screen];

  const goBack = () => {
    if (screen === "summary") return setScreen("vraag");
    if (idx <= 0) return setScreen("intro");
    setScreen(FLOW[idx - 1]);
  };
  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitIntake(state);
      setScreen("done");
    } catch (e) {
      setSubmitError(
        "Versturen lukte niet. Controleer je internetverbinding en probeer het nog eens.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goNext = () => {
    if (screen === "summary") return handleSubmit();
    if (idx < TOTAL - 1) return setScreen(FLOW[idx + 1]);
    setScreen("summary");
  };

  const emailOk = /.+@.+\..+/.test(state.contactEmail.trim());
  const canAdvance =
    screen === "rooms"
      ? state.rooms.length > 0
      : screen === "summary"
        ? emailOk && !submitting
        : true;

  const footer = (
    <button
      className="rd-btn rd-btn-primary rd-btn-lg"
      onClick={goNext}
      disabled={!canAdvance}
      style={!canAdvance ? { opacity: 0.4 } : undefined}
    >
      {screen === "summary"
        ? submitting
          ? "Bezig met versturen..."
          : "Versturen naar de styliste"
        : "Volgende"}
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
      {screen === "photos" && <PhotosStep rooms={state.rooms} setRooms={setRooms} />}
      {screen === "sfeer" && (
        <SfeerStep
          moods={state.moods}
          inspirationLikes={state.inspirationLikes}
          boldness={state.boldness}
          onMoods={(moods) => update({ moods })}
          onLikes={(inspirationLikes) => update({ inspirationLikes })}
          onBoldness={(boldness) => update({ boldness })}
        />
      )}
      {screen === "colors" && (
        <ColorsStep
          colors={state.colors}
          inspirationNote={state.inspirationNote}
          onColors={(colors) => update({ colors })}
          onNote={(inspirationNote) => update({ inspirationNote })}
        />
      )}
      {screen === "vraag" && (
        <VraagStep
          helpNeeds={state.helpNeeds}
          mainQuestion={state.mainQuestion}
          contactName={state.contactName}
          contactEmail={state.contactEmail}
          onHelpNeeds={(helpNeeds) => update({ helpNeeds })}
          onQuestion={(mainQuestion) => update({ mainQuestion })}
          onName={(contactName) => update({ contactName })}
          onEmail={(contactEmail) => update({ contactEmail })}
        />
      )}
      {screen === "summary" && (
        <>
          <SummaryStep state={state} onEdit={(s) => setScreen(s)} />
          {!emailOk && (
            <p className="rd-sub" style={{ textAlign: "center", marginTop: 14 }}>
              Vul bij stap 5 je e-mailadres in om te kunnen versturen.
            </p>
          )}
          {submitError && (
            <p
              style={{
                textAlign: "center",
                marginTop: 14,
                color: "var(--rd-pink-dark)",
                fontWeight: 600,
                fontSize: 14,
              }}
            >
              {submitError}
            </p>
          )}
        </>
      )}
    </Shell>
  );
}
