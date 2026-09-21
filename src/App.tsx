import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Shell } from "@/components/Shell";
import { ContactStep } from "@/components/steps/ContactStep";
import { RoomsStep } from "@/components/steps/RoomsStep";
import { SurfacesStep } from "@/components/steps/SurfacesStep";
import { PhotosStep } from "@/components/steps/PhotosStep";
import { SfeerBeeldenStep } from "@/components/steps/SfeerBeeldenStep";
import { GevoelStep } from "@/components/steps/GevoelStep";
import { ColorsSamplesStep } from "@/components/steps/ColorsSamplesStep";
import { InspiratieStep, isUrlish } from "@/components/steps/InspiratieStep";
import { VraagStep } from "@/components/steps/VraagStep";
import { PlanningStep } from "@/components/steps/PlanningStep";
import { supabase } from "@/lib/supabase";
import { useIntake, loadScreen, saveScreen, clearIntakeSession } from "@/lib/store";
import { submitIntake, saveConceptLead } from "@/lib/submit";
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
type Screen = "intro" | "contact" | StepScreen | "done";

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
    sub: "Kies maximaal 3 omschrijvingen. Er is geen goed of fout.",
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
    sub: "Vertel wat je uit het gesprek wilt halen en wanneer je aan de slag wilt.",
  },
  planning: {
    kicker: "Stap 9 · Afronden",
    title: "Klopt alles?",
    sub: "Controleer je intake. Zodra je hem instuurt, bereidt je kleuradviseur het gesprek ermee voor.",
  },
};

export function App() {
  const { state, update, reset } = useIntake();
  const [params] = useSearchParams();
  const bookingId = params.get("booking");
  const mode = params.get("mode"); // 'pre_sample' | 'post_sample'
  const isPost = mode === "post_sample";
  const [screen, setScreen] = useState<Screen>("intro");
  const [photoIdx, setPhotoIdx] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [apptStart, setApptStart] = useState<string | null>(null);
  // Gekoppelde boeking als het e-mailadres al een afspraak blijkt te hebben (organische route).
  const [coupledBookingId, setCoupledBookingId] = useState<string | null>(null);
  const [emailStatus, setEmailStatus] = useState<
    | { checking: true }
    | { checking: false; hasBooking: boolean; hasCredit: boolean; creditScheduled: boolean }
    | null
  >(null);
  const resumed = useRef(false);
  const prefilled = useRef(false);
  const lastChecked = useRef<string>("");

  useEffect(() => lockDocument(), []);

  // Hervatten: spring naar de laatst bezochte stap.
  useEffect(() => {
    if (resumed.current) return;
    resumed.current = true;
    const saved = loadScreen();
    if (saved && saved !== "intro" && saved !== "done") {
      setScreen(saved as Screen);
    }
  }, []);

  useEffect(() => {
    if (screen !== "intro" && screen !== "done") saveScreen(screen);
  }, [screen]);

  // Boekingslink: haal de afspraak op, vul het e-mailadres voor (als nog leeg) en toon de datum.
  useEffect(() => {
    if (!bookingId || prefilled.current) return;
    prefilled.current = true;
    supabase.functions.invoke("booking", { body: { action: "status", booking_id: bookingId } }).then(({ data }) => {
      const d = data as { start_at?: string; customer_email?: string } | null;
      if (!d) return;
      if (d.start_at) setApptStart(d.start_at);
      if (d.customer_email && !state.contactEmail.trim()) update({ contactEmail: d.customer_email });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  // E-mailcheck (organische route, geen boekingslink): heeft dit adres al een afspraak of tegoed?
  // Zo ja: koppel de intake automatisch aan de bestaande afspraak, anders een zachte hint.
  useEffect(() => {
    if (bookingId) return; // via de boekingslink weten we het al
    if (screen !== "contact") return;
    const email = state.contactEmail.trim().toLowerCase();
    if (!emailOk) {
      setEmailStatus(null);
      return;
    }
    if (email === lastChecked.current) return;
    const t = setTimeout(async () => {
      lastChecked.current = email;
      setEmailStatus({ checking: true });
      try {
        const { data } = await supabase.functions.invoke("booking", { body: { action: "email_status", email } });
        const d = (data ?? {}) as {
          has_booking?: boolean; booking_id?: string | null; next_start_at?: string | null;
          has_credit?: boolean; credit_scheduled?: boolean;
        };
        if (d.has_booking && d.booking_id) {
          setCoupledBookingId(d.booking_id);
          if (d.next_start_at) setApptStart(d.next_start_at);
        } else {
          setCoupledBookingId(null);
        }
        setEmailStatus({
          checking: false,
          hasBooking: !!d.has_booking,
          hasCredit: !!d.has_credit,
          creditScheduled: !!d.credit_scheduled,
        });
      } catch {
        setEmailStatus(null);
      }
    }, 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.contactEmail, screen, bookingId]);

  // De boeking waar de intake aan gekoppeld wordt: via de link, of automatisch gevonden op e-mail.
  const effectiveBookingId = bookingId ?? coupledBookingId;

  const apptLabel = apptStart
    ? new Intl.DateTimeFormat("nl-NL", { timeZone: "Europe/Amsterdam", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(apptStart))
    : null;

  const setRooms = (updater: (prev: Room[]) => Room[]) =>
    update((prev) => ({ rooms: updater(prev.rooms) }));
  const patchRoom = (id: string, p: Partial<Room>) =>
    update((prev) => ({ rooms: prev.rooms.map((r) => (r.id === id ? { ...r, ...p } : r)) }));

  const multiRoom = state.rooms.length > 1;
  const emailOk = /.+@.+\..+/.test(state.contactEmail.trim());

  // ── Intro ──────────────────────────────────────────────────────────────
  if (screen === "intro") {
    return (
      <Shell
        step={0}
        total={TOTAL}
        title={
          bookingId
            ? "Je afspraak staat, bereid hem nu voor"
            : "Haal alles uit je 30 minuten kleuradvies"
        }
        sub={
          bookingId && apptLabel
            ? `Je afspraak staat op ${apptLabel}. Vul je intake bij voorkeur daarvóór in, dan kan je kleuradviseur zich goed voorbereiden.`
            : isPost
            ? "Je hebt al samples getest. Vertel ons wat je thuis ziet, dan helpen we je in het gesprek de definitieve kleur te kiezen."
            : "Beantwoord een paar korte vragen en laat je ruimtes zien. Zo kan je kleuradviseur zich vooraf voorbereiden en gebruiken we het gesprek om echt keuzes te maken."
        }
        footer={
          <button className="rd-btn rd-btn-primary rd-btn-lg" onClick={() => setScreen("contact")}>
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

  // ── Contact (vooraan, concept-lead) ──────────────────────────────────────
  if (screen === "contact") {
    const canGo = state.contactName.trim() !== "" && emailOk;
    const goFromContact = () => {
      saveConceptLead(state).catch(() => {});
      setScreen("rooms");
    };
    return (
      <Shell
        step={0}
        total={TOTAL}
        onBack={() => setScreen("intro")}
        kicker="Even kennismaken"
        title="Hoe mogen we je bereiken?"
        footer={
          <button
            className="rd-btn rd-btn-primary rd-btn-lg"
            onClick={goFromContact}
            disabled={!canGo}
            style={!canGo ? { opacity: 0.4 } : undefined}
          >
            Beginnen
          </button>
        }
      >
        <ContactStep
          contactName={state.contactName}
          contactEmail={state.contactEmail}
          onName={(contactName) => update({ contactName })}
          onEmail={(contactEmail) => update({ contactEmail })}
        />
        {emailStatus && !emailStatus.checking && emailStatus.hasBooking && apptLabel && (
          <div className="rd-card-white" style={{ marginTop: 14, display: "flex", gap: 12, alignItems: "flex-start" }}>
            <span className="rd-ring is-on" aria-hidden style={{ width: 22, height: 22, fontSize: 12 }}>✓</span>
            <span style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.35 }}>
              Je hebt al een afspraak op {apptLabel}. We koppelen deze intake er automatisch aan, zodat je
              kleuradviseur alles bij elkaar heeft.
            </span>
          </div>
        )}
        {emailStatus && !emailStatus.checking && !emailStatus.hasBooking && emailStatus.hasCredit && !emailStatus.creditScheduled && (
          <div className="rd-card-white" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Je hebt al een online kleuradvies gekocht 🎉</span>
            <span className="rd-sub" style={{ margin: 0 }}>
              Plan je afspraak via de link in je bevestigingsmail. Deze intake vul je gerust alvast in, dan
              staat alles klaar voor het gesprek.
            </span>
          </div>
        )}
        {!canGo && (
          <p className="rd-sub" style={{ textAlign: "center", marginTop: 16 }}>
            Vul je naam en een geldig e-mailadres in.
          </p>
        )}
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
              clearIntakeSession();
              setScreen("intro");
            }}
          >
            Nieuwe intake starten
          </button>
        }
      >
        <div className="rd-card-white" style={{ textAlign: "center", padding: "26px 18px" }}>
          <div className="rd-ring is-on" aria-hidden style={{ width: 48, height: 48, fontSize: 24, margin: "0 auto 12px" }}>
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

  // Validatie (soepel: kern verplicht, rest aanrader)
  let canAdvance = true;
  let hint = "";
  const currentRoom = state.rooms[photoIdx];
  switch (screen) {
    case "rooms":
      canAdvance = state.rooms.length > 0;
      hint = "Voeg minstens één ruimte toe.";
      break;
    case "surfaces": {
      const empty = state.rooms.find((r) => r.surfaces.length === 0);
      canAdvance = !empty;
      hint = empty ? `Kies wat je in de ${empty.label.toLowerCase()} wilt schilderen.` : "";
      break;
    }
    case "photos": {
      const sunOk = !!currentRoom && ((currentRoom.sun?.length ?? 0) > 0 || currentRoom.noWindows === true);
      canAdvance = !!currentRoom && currentRoom.photos.length >= 1 && sunOk;
      hint = "Voeg minimaal 1 foto toe en geef aan wanneer de zon binnenvalt.";
      break;
    }
    case "beelden":
      canAdvance = state.inspirationLikes.length > 0 || !!state.noSfeerImage;
      hint = "Kies een beeld of tik op 'Geen van deze past'.";
      break;
    case "gevoel":
      canAdvance = state.moods.length > 0;
      hint = "Kies minstens één omschrijving.";
      break;
    case "kleuren":
      // Nooit blokkeren: lege kleurregels worden bij Volgende genegeerd.
      canAdvance = true;
      break;
    case "inspiratie":
      canAdvance = isUrlish(state.pinterestUrl) && isUrlish(state.otherInspirationUrl);
      hint = "Controleer de ingevulde links, of laat ze leeg.";
      break;
    case "vraag":
      canAdvance = state.mainQuestion.trim() !== "";
      hint = "Vul in waar je na het gesprek duidelijkheid over wilt hebben.";
      break;
    case "planning":
      canAdvance = !submitting;
      break;
  }

  const handleSubmit = async () => {
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitIntake(state, { bookingId: effectiveBookingId, mode });
      setScreen("done");
    } catch {
      setSubmitError("Versturen lukte niet. Controleer je internetverbinding en probeer het nog eens.");
    } finally {
      setSubmitting(false);
    }
  };

  const goBack = () => {
    if (screen === "photos" && photoIdx > 0) return setPhotoIdx(photoIdx - 1);
    if (idx <= 0) return setScreen("contact");
    const prev = FLOW[idx - 1];
    if (prev === "photos") setPhotoIdx(Math.max(0, state.rooms.length - 1));
    setScreen(prev);
  };
  const goNext = () => {
    if (screen === "planning") return handleSubmit();
    if (screen === "photos" && photoIdx < state.rooms.length - 1) return setPhotoIdx(photoIdx + 1);
    // Lege kleurregels opruimen zodat ze nergens blijven hangen.
    if (screen === "kleuren" && state.samples.some((s) => s.name.trim() === "")) {
      update({ samples: state.samples.filter((s) => s.name.trim() !== "") });
    }
    const next = FLOW[idx + 1];
    if (next === "photos") setPhotoIdx(0);
    setScreen(next);
  };

  const footer = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <button
        className="rd-btn rd-btn-primary rd-btn-lg"
        onClick={goNext}
        disabled={!canAdvance}
        style={!canAdvance ? { opacity: 0.4 } : undefined}
      >
        {screen === "planning"
          ? submitting
            ? "Bezig met insturen..."
            : "Intake insturen"
          : "Volgende"}
      </button>
      {screen === "planning" && !submitting && (
        <button
          className="rd-textlink"
          style={{ minHeight: 40, alignSelf: "center", opacity: 0.7 }}
          onClick={() => {
            if (window.confirm("Weet je het zeker? Je begint dan met een lege intake.")) {
              reset();
              clearIntakeSession();
              setScreen("intro");
            }
          }}
        >
          Opnieuw beginnen
        </button>
      )}
    </div>
  );

  const goEdit = (t: string) => {
    if (t === "contact") return setScreen("contact");
    if (t === "photos") setPhotoIdx(0);
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
      {screen === "photos" && currentRoom && (
        <PhotosStep room={currentRoom} index={photoIdx} total={state.rooms.length} patch={patchRoom} />
      )}
      {screen === "beelden" && (
        <SfeerBeeldenStep
          inspirationLikes={state.inspirationLikes}
          noSfeerImage={state.noSfeerImage}
          onLikes={(inspirationLikes) => update({ inspirationLikes })}
          onNone={(noSfeerImage) => update({ noSfeerImage })}
        />
      )}
      {screen === "gevoel" && (
        <GevoelStep
          moods={state.moods}
          boldness={state.boldness}
          multiRoom={multiRoom}
          sfeerSameAll={state.sfeerSameAll}
          sfeerExceptionNote={state.sfeerExceptionNote}
          onMoods={(moods) => update({ moods })}
          onBoldness={(b) => update({ boldness: b || undefined })}
          onSameAll={(sfeerSameAll) => update({ sfeerSameAll })}
          onException={(sfeerExceptionNote) => update({ sfeerExceptionNote })}
        />
      )}
      {screen === "kleuren" && (
        <ColorsSamplesStep
          hasSamples={state.hasSamples}
          samples={state.samples}
          colors={state.colors}
          rooms={state.rooms}
          onHasSamples={(hasSamples) =>
            update(hasSamples === "nee" ? { hasSamples, samples: [] } : { hasSamples })
          }
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
          multiRoom={multiRoom}
          questionScope={state.questionScope}
          planning={state.planning}
          onHelpNeeds={(helpNeeds) => update({ helpNeeds })}
          onQuestion={(mainQuestion) => update({ mainQuestion })}
          onScope={(questionScope) => update({ questionScope })}
          onPlanning={(planning) => update({ planning })}
        />
      )}
      {screen === "planning" && <PlanningStep state={state} onEdit={goEdit} />}

      {!canAdvance && hint && (
        <p className="rd-sub" style={{ textAlign: "center", marginTop: 16 }}>
          {hint}
        </p>
      )}
      {submitError && (
        <p style={{ textAlign: "center", marginTop: 12, color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>
          {submitError}
        </p>
      )}
    </Shell>
  );
}
