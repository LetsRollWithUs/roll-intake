import { supabase } from "@/lib/supabase";
import { deriveExpected, daysSince, TOOLKIT_DAYS, todayKey } from "./lead";

// Openstaande acties, afgeleid uit boekingen/intakes/meldingen. Gebruikt door het belletje,
// de notificatiepagina en het Overzicht. Niets wordt opgeslagen: elke keer vers berekend.
export interface Notif {
  id: string;
  kind: "vandaag" | "opvolgen" | "advies" | "check" | "toolkit" | "plan" | "melding";
  title: string;
  sub?: string;
  to?: string;
}

const TZ = "Europe/Amsterdam";
const dayKey = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const fmtD = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));

export const KIND_LABEL: Record<Notif["kind"], string> = {
  vandaag: "Vandaag",
  plan: "Inplannen",
  advies: "Advies vastleggen",
  opvolgen: "Opvolgen",
  check: "Achteraan gaan",
  toolkit: "Toolkit-korting",
  melding: "Systeem",
};

// stylistId: eigen styliste (of gekozen styliste voor de beheerder). null = alles (beheerder).
export async function loadNotifications(opts: { isAdmin: boolean; stylistId: string | null }): Promise<Notif[]> {
  const out: Notif[] = [];
  let q = supabase
    .from("bookings")
    .select("id,start_at,status,customer_name,intake_id,kanban_stage,samples_besteld,opgevolgd_at,expected_purchase_at,toolkit_offered_at,stylist_id, stylists(name)")
    .in("status", ["confirmed", "paid_unplaced"]);
  if (opts.stylistId) q = q.eq("stylist_id", opts.stylistId);
  const { data } = await q;
  const rows = (data as any[]) ?? [];
  const today = dayKey(new Date().toISOString());
  const nowMs = Date.now();
  const who = (r: any) => (opts.isAdmin && !opts.stylistId && r.stylists?.name ? ` · ${r.stylists.name}` : "");

  // Intake-gegevens (uitkomst + planning) voor advies-check en verwachte aankoopdatum.
  const intakeIds = rows.map((r) => r.intake_id).filter(Boolean);
  const intakeById = new Map<string, any>();
  if (intakeIds.length) {
    const { data: its } = await supabase.from("intake").select("id,advisor_outcome,planning").in("id", intakeIds);
    for (const i of (its as any[]) ?? []) intakeById.set(i.id, i);
  }

  for (const r of rows) {
    const name = r.customer_name || "Klant";
    const past = new Date(r.start_at).getTime() < nowMs;
    const open = r.kanban_stage !== "verf" && r.kanban_stage !== "afgehaakt";
    const it = r.intake_id ? intakeById.get(r.intake_id) : null;

    if (r.status === "paid_unplaced") {
      out.push({ id: `plan-${r.id}`, kind: "plan", title: `${name} heeft betaald maar staat nog niet ingepland`, sub: "Plaats de afspraak via Boekingen" + who(r), to: "/beheer/boekingen" });
      continue;
    }
    if (dayKey(r.start_at) === today && new Date(r.start_at).getTime() > nowMs - 3600e3) {
      out.push({ id: `vandaag-${r.id}`, kind: "vandaag", title: `${timeFmt.format(new Date(r.start_at))} gesprek met ${name}`, sub: (r.intake_id ? "Intake staat klaar" : "Intake nog niet ingevuld") + who(r), to: `/beheer/klant/${r.id}` });
    }
    if (past && it && !it.advisor_outcome && (r.kanban_stage === "advies" || r.kanban_stage === "ingepland")) {
      out.push({ id: `advies-${r.id}`, kind: "advies", title: `Leg het advies vast voor ${name}`, sub: "Uitkomst en samenvatting nog niet ingevuld" + who(r), to: `/beheer/${r.intake_id}` });
    }
    if (open && r.samples_besteld && !r.opgevolgd_at) {
      out.push({ id: `opvolg-${r.id}`, kind: "opvolgen", title: `${name} heeft samples besteld`, sub: "Nog niet opgevolgd: stuur een persoonlijk berichtje" + who(r), to: `/beheer/klant/${r.id}` });
    }
    if (open && past) {
      const expected = r.expected_purchase_at ?? deriveExpected(r.start_at, it?.planning ?? null);
      if (expected < todayKey()) {
        out.push({ id: `check-${r.id}`, kind: "check", title: `${name}: verf verwacht op ${fmtD(expected)}, nog niet gekocht`, sub: "Ga erachteraan en check wat er speelt" + who(r), to: `/beheer/klant/${r.id}` });
      }
      if (daysSince(r.start_at) >= TOOLKIT_DAYS && !r.toolkit_offered_at) {
        out.push({ id: `toolkit-${r.id}`, kind: "toolkit", title: `${name}: ${TOOLKIT_DAYS}+ dagen zonder verf`, sub: "Bied de gratis toolkit aan als extra zetje" + who(r), to: `/beheer/klant/${r.id}` });
      }
    }
  }

  if (opts.isAdmin && !opts.stylistId) {
    const { data: al } = await supabase.from("system_alerts").select("id,message").is("acknowledged_at", null).order("created_at", { ascending: false }).limit(20);
    for (const a of (al as any[]) ?? []) out.push({ id: `melding-${a.id}`, kind: "melding", title: a.message, sub: "Systeemmelding", to: "/beheer/meldingen" });
  }
  return out;
}
