import { deriveExpected, todayKey } from "./lead";

// De volgende actie wordt afgeleid uit de stand van zaken, nooit handmatig gekozen.
// Zo weet een styliste zonder uitleg wat ze nu moet doen en wie aan zet is.
export interface NextActionInput {
  id: string;
  status: string;
  start_at: string;
  kanban_stage: string;
  samples_besteld: boolean;
  opgevolgd_at: string | null;
  expected_purchase_at: string | null;
  intake_id: string | null;
  intake?: {
    advisor_outcome: string | null;
    advisor_summary: string | null;
    advisor_followup_sent_at: string | null;
    planning: string | null;
  } | null;
}
export type Phase = "voorbereiding" | "gesprek" | "versturen" | "opvolging" | "klaar";
export interface NextAction { title: string; sub?: string; owner: "Styliste" | "Roll" | "Niemand"; to?: string; phase: Phase }

const TZ = "Europe/Amsterdam";
const fmtD = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "long" }).format(new Date(iso));
export const CHECKIN_DAYS = 10; // na een sample-advies: check-in rond dag 10

export function checkinDate(startAt: string): string {
  const d = new Date(startAt);
  d.setDate(d.getDate() + CHECKIN_DAYS);
  return d.toISOString().slice(0, 10);
}

export function nextAction(b: NextActionInput): NextAction {
  const past = new Date(b.start_at).getTime() < Date.now();
  const it = b.intake ?? null;
  const gesprek = `/beheer/gesprek/${b.id}`;
  const intakeEdit = b.intake_id ? `/beheer/${b.intake_id}` : undefined;

  if (b.status === "paid_unplaced") {
    return { title: "Afspraak nog inplannen", sub: "De klant heeft betaald maar het moment is niet meer beschikbaar.", owner: "Roll", to: "/beheer/boekingen", phase: "voorbereiding" };
  }
  if (b.kanban_stage === "verf") return { title: "Traject afgerond: verf gekocht", owner: "Niemand", phase: "klaar" };
  if (b.kanban_stage === "afgehaakt") return { title: "Traject gesloten: afgehaakt of zoekt het zelf uit", owner: "Niemand", phase: "klaar" };

  if (!past) {
    if (b.intake_id) return { title: "Bekijk de intake en bereid je advies voor", sub: "Foto's, lichtinval en de hulpvraag bepalen je richting.", owner: "Styliste", to: gesprek, phase: "voorbereiding" };
    return { title: "Intake nog niet ingevuld; bereid je voor op basis van de boeking", sub: "De klant krijgt automatisch een herinnering.", owner: "Styliste", to: gesprek, phase: "voorbereiding" };
  }

  if (!b.intake_id) {
    return { title: "Geen intake ontvangen: neem contact op met de klant", sub: "Zonder intake kun je het advies nog niet vastleggen.", owner: "Styliste", to: gesprek, phase: "gesprek" };
  }
  const adviceDone = !!(it?.advisor_outcome && it?.advisor_summary);
  if (!adviceDone) {
    return { title: "Leg het besproken advies vast", sub: "Uitkomst, kleuren per ruimte en de samenvatting voor de klant.", owner: "Styliste", to: intakeEdit, phase: "gesprek" };
  }
  if (!it?.advisor_followup_sent_at) {
    return { title: "Controleer en verstuur het adviesverslag", sub: "De klant ontvangt de samenvatting en de volgende stap.", owner: "Styliste", to: intakeEdit, phase: "versturen" };
  }
  const expected = b.expected_purchase_at ?? deriveExpected(b.start_at, it?.planning ?? null);
  if (expected < todayKey()) {
    return { title: "Ga erachteraan: verf werd verwacht rond " + fmtD(expected), sub: "Leg de uitkomst vast: keuze gemaakt, nog twijfel, later, of hulp nodig.", owner: "Styliste", to: gesprek, phase: "opvolging" };
  }
  if ((it?.advisor_outcome === "samples_needed" || b.samples_besteld) && !b.opgevolgd_at) {
    const ci = checkinDate(b.start_at);
    return { title: `Klant test samples. Check rond ${fmtD(ci)} hoe die bevallen`, sub: "Eén persoonlijk berichtje, dan vastleggen wat eruit kwam.", owner: "Styliste", to: gesprek, phase: "opvolging" };
  }
  return { title: "Verwachte verfaankoop volgen (rond " + fmtD(expected) + ")", sub: "Niets te doen tot die datum, tenzij de klant contact opneemt.", owner: "Styliste", to: gesprek, phase: "opvolging" };
}
