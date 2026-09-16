import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { RoomsStep } from "@/components/steps/RoomsStep";
import { SurfacesStep } from "@/components/steps/SurfacesStep";
import { PhotosStep } from "@/components/steps/PhotosStep";
import { SfeerBeeldenStep } from "@/components/steps/SfeerBeeldenStep";
import { GevoelStep } from "@/components/steps/GevoelStep";
import { ColorsSamplesStep } from "@/components/steps/ColorsSamplesStep";
import { InspiratieStep } from "@/components/steps/InspiratieStep";
import { VraagStep } from "@/components/steps/VraagStep";
import { PlanningStep } from "@/components/steps/PlanningStep";
import { useIntake } from "@/lib/store";
import { submitIntake } from "@/lib/submit";
import { lockDocument } from "@/lib/lock-document";
import type { Room } from "@/lib/types";

type StepScreen =
  | "rooms"
  | "surfaces"
  | "photos"
  | "beelden"
  | "gevoel"
  | "kleuren"
  | "inspiratie"
  | "vraag"
  | "planning";
type Screen = "intro" | StepScreen | "done";

const FLOW: StepScreen[] = [
  "rooms",
  "surfaces",
  "photos",
  "beelden",
  "gevoel",
  "kleuren",
  "inspiratie",
  "vraag",
  "planning",
];
const TOTAL = FLOW.length;

const META: Record<StepScreen, { kicker: string; title: string; sub?: string }> = {
  rooms: {
    kicker: "Stap 1 · Ruimtes",
    title: "Welke ruimtes wil je aanpakken?",
    sub: "Tik een ruimte aan om hem toe te voegen. Meerdere van hetzelfde mag ook.",
  },
  surfaces: {
    kicker: "Stap 2 · Wat ga je schilderen?",
    title: "Wat wil je per ruimte schilderen?",
    sub: "Kies wat er onder handen komt. Dit bepaalt mee het advies.",
  },
  photos: {
    kicker: "Stap 3 · Foto's & licht",
    title: "Laat ons de ruimte zien",
    sub: "Foto's zijn een van de belangrijkste inputs voor je advies.",
  },
  beelden: {
    kicker: "Stap 4 · Sfeerbeelden",
    title: "Welke interieurs spreken je aan?",
    sub: "Kies maximaal 2 beelden die het dichtst bij jouw richting komen.",
  },
  gevoel: {
    kicker: "Stap 5 · Gewenst gevoel",
    title: "Hoe wil je dat het straks voelt?",
    sub: "Kies maximaal 3 woorden. Er is geen goed of fout.",
  },
  kleuren: {
    kicker: "Stap 6 · Kleuren & samples",
    title: "Wat heb je al, en wat overweeg je?",
    sub: "Wat je al hebt geprobeerd helpt enorm bij het advies.",
  },
  inspiratie: {
    kicker: "Stap 7 · Inspiratie",
    title: "Laat zien wat je mooi vindt",
    sub: "Optioneel, maar vaak goud waard voor je adviseur.",
  },
  vraag: {
    kicker: "Stap 8 · Jouw vraag",
    title: "Waar mogen we je mee helpen?",
    sub: undefined,
  },
  planning: {
    kicker: "Stap 9 · Planning & afronden",
    title: "Bijna klaar",
    sub: "Nog twee dingen, dan gaat je intake naar je kleuradviseur.",
  },
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
        title="Haal alles uit je 30 minuten kleuradvies"
        sub="Beantwoord een paar korte vragen en laat je ruimtes zien. Zo kan je kleuradviseur zich vooraf voorbereiden en gebruiken we het gesprek om echt keuzes te maken."
        footer={
          <button className="rd-btn rd-btn-primary rd-btn-lg" onClick={() => setScreen("rooms")}>
            Beginnen
          </button>
        }
      >
        <div className="rd-card-white" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          {[
            "Ongeveer 5 minuten",
            "Foto's, kleuren en inspiratie bij de hand? Dan gaat het nog sneller",
            "Je antwoorden worden tussendoor bewaard",
          ].map((t) => (
            <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
              <span className="rd-ring is-on" aria-hidden style={{ width: 22, height: 22, fontSize: 12 }}>
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
        title="Dankjewel, je intake is binnen"
        sub="Je kleuradviseur bereidt het gesprek nu voor met jouw ruimtes, kleuren en inspiratie."
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
            We nemen contact op om je 30 minuten kleuradvies in te plannen.
          </p>
        </div>
      </Shell>
    );
  }

  const idx = FLOW.indexOf(screen as StepScreen);
  const meta = META[screen as StepScreen];

  const emailOk = /.+@.+\..+/.test(state.contactEmail.trim());

  // Validatie per stap
  let canAdvance = true;
  let hint = "";
  switch (screen) {
    case "rooms":
      canAdvance = state.rooms.length > 0;
      hint = "Voeg minstens één ruimte toe.";
      break;
    case "photos":
      canAdvance = state.rooms.every((r) => r.photos.length >= 2 && !!r.daylight);
      hint = "Voeg per ruimte minimaal 2 foto's toe en kies hoeveel daglicht er is.";
      break;
    case "beelden":
      canAdvance = state.inspirationLikes.length > 0;
      hint = "Kies minstens één beeld.";
      break;
    case "gevoel":
      canAdvance = state.moods.length > 0;
      hint = "Kies minstens één woord.";
      break;
    case "kleuren":
      canAdvance =
        state.hasSamples !== undefined &&
        (state.hasSamples === "nee" || state.samples.some((s) => s.name.trim() !== ""));
      hint =
        state.hasSamples === undefined
          ? "Geef aan of je al kleuren of samples thuis hebt."
          : "Vul bij elke toegevoegde kleur minstens de kleurnaam in.";
      break;
    case "vraag":
      canAdvance = state.mainQuestion.trim() !== "";
      hint = "Vul in waar je na het gesprek duidelijkheid over wilt hebben.";
      break;
    case "planning":
      canAdvance = state.contactName.trim() !== "" && emailOk && !submitting;
      hint = "Vul je naam en een geldig e-mailadres in.";
      break;
    default:
      canAdvance = true;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitIntake(state);
      setScreen("done");
    } catch {
      setSubmitError(
        "Versturen lukte niet. Controleer je internetverbinding en probeer het nog eens.",
      );
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => (idx <= 0 ? setScreen("intro") : setScreen(FLOW[idx - 1]));
  const goNext = () => {
    if (screen === "planning") return handleSubmit();
    setScreen(FLOW[idx + 1]);
  };

  const footer = (
    <button
      className="rd-btn rd-btn-primary rd-btn-lg"
      onClick={goNext}
      disabled={!canAdvance}
      style={!canAdvance ? { opacity: 0.4 } : undefined}
    >
      {screen === "planning"
        ? submitting
          ? "Bezig met versturen..."
          : "Versturen naar je kleuradviseur"
        : "Volgende"}
    </button>
  );

  const goEdit = (t: string) => {
    const map: Record<string, StepScreen> = {
      rooms: "rooms",
      surfaces: "surfaces",
      photos: "photos",
      beelden: "beelden",
      gevoel: "gevoel",
      kleuren: "kleuren",
      inspiratie: "inspiratie",
      vraag: "vraag",
    };
    setScreen(map[t] ?? "rooms");
  };

  return (
    <Shell
      step={idx + 1}
      total={TOTAL}
      onBack={goBack}
      kicker={meta.kicker}
      title={meta.title}
      sub={meta.sub}
      footer={footer}
    >
      {screen === "rooms" && <RoomsStep rooms={state.rooms} setRooms={setRooms} />}
      {screen === "surfaces" && <SurfacesStep rooms={state.rooms} setRooms={setRooms} />}
      {screen === "photos" && <PhotosStep rooms={state.rooms} setRooms={setRooms} />}
      {screen === "beelden" && (
        <SfeerBeeldenStep
          inspirationLikes={state.inspirationLikes}
          onLikes={(inspirationLikes) => update({ inspirationLikes })}
        />
      )}
      {screen === "gevoel" && (
        <GevoelStep
          moods={state.moods}
          boldness={state.boldness}
          onMoods={(moods) => update({ moods })}
          onBoldness={(boldness) => update({ boldness })}
        />
      )}
      {screen === "kleuren" && (
        <ColorsSamplesStep
          hasSamples={state.hasSamples}
          samples={state.samples}
          colors={state.colors}
          onHasSamples={(hasSamples) => update({ hasSamples })}
          onSamples={(samples) => update({ samples })}
          onColors={(colors) => update({ colors })}
        />
      )}
      {screen === "inspiratie" && (
        <InspiratieStep
          pinterestUrl={state.pinterestUrl}
          otherInspirationUrl={state.otherInspirationUrl}
          inspirationImages={state.inspirationImages}
          inspirationNote={state.inspirationNote}
          onPinterest={(pinterestUrl) => update({ pinterestUrl })}
          onOther={(otherInspirationUrl) => update({ otherInspirationUrl })}
          onImages={(inspirationImages) => update({ inspirationImages })}
          onNote={(inspirationNote) => update({ inspirationNote })}
        />
      )}
      {screen === "vraag" && (
        <VraagStep
          helpNeeds={state.helpNeeds}
          mainQuestion={state.mainQuestion}
          onHelpNeeds={(helpNeeds) => update({ helpNeeds })}
          onQuestion={(mainQuestion) => update({ mainQuestion })}
        />
      )}
      {screen === "planning" && (
        <PlanningStep
          state={state}
          onPlanning={(planning) => update({ planning })}
          onName={(contactName) => update({ contactName })}
          onEmail={(contactEmail) => update({ contactEmail })}
          onEdit={goEdit}
        />
      )}

      {!canAdvance && hint && (
        <p className="rd-sub" style={{ textAlign: "center", marginTop: 16 }}>
          {hint}
        </p>
      )}
      {submitError && (
        <p
          style={{
            textAlign: "center",
            marginTop: 12,
            color: "var(--rd-pink-dark)",
            fontWeight: 600,
            fontSize: 14,
          }}
        >
          {submitError}
        </p>
      )}
    </Shell>
  );
}
