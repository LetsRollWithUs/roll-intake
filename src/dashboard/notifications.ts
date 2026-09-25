import { supabase } from "@/lib/supabase";
import { deriveExpected, todayKey } from "./lead";

// Openstaande acties, afgeleid uit boekingen/intakes/meldingen. Gebruikt door het belletje,
// de notificatiepagina en het Overzicht. Niets wordt opgeslagen: elke keer vers berekend.
// (De toolkit-herinnering is geparkeerd; de velden blijven in de database.)
export interface Notif {
  id: string;
  kind: "vandaag" | "opvolgen" | "advies" | "versturen" | "check" | "plan" | "taak" | "roll" | "melding";
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
  versturen: "Adviesverslag versturen",
  opvolgen: "Opvolgen",
  check: "Achteraan gaan",
  taak: "Opvolgtaken",
  roll: "Roll-taken",
  melding: "Systeem",
};

// stylistId: eigen styliste (of gekozen styliste voor de beheerder). null = alles (beheerder).
export async function loadNotifications(opts: { isAdmin: boolean; stylistId: string | null }): Promise<Notif[]> {
  const out: Notif[] = [];
  let q = supabase
    .from("bookings")
    .select("id,start_at,status,customer_name,intake_id,kanban_stage,samples_besteld,opgevolgd_at,expected_purchase_at,stylist_id, stylists(name)")
    .in("status", ["confirmed", "paid_unplaced", "manual"]);
  if (opts.stylistId) q = q.eq("stylist_id", opts.stylistId);
  const { data } = await q;
  const rows = (data as any[]) ?? [];
  const today = dayKey(new Date().toISOString());
  const nowMs = Date.now();
  const who = (r: any) => (opts.isAdmin && !opts.stylistId && r.stylists?.name ? ` · ${r.stylists.name}` : "");

  const intakeIds = rows.map((r) => r.intake_id).filter(Boolean);
  const intakeById = new Map<string, any>();
  if (intakeIds.length) {
    const { data: its } = await supabase.from("intake").select("id,advisor_outcome,advisor_summary,advisor_followup_sent_at,planning").in("id", intakeIds);
    for (const i of (its as any[]) ?? []) intakeById.set(i.id, i);
  }

  for (const r of rows) {
    const name = r.customer_name || "Klant";
    const past = new Date(r.start_at).getTime() < nowMs;
    const open = r.kanban_stage !== "verf" && r.kanban_stage !== "afgehaakt";
    const it = r.intake_id ? intakeById.get(r.intake_id) : null;
    const gesprek = `/beheer/gesprek/${r.id}`;

    if (r.status === "paid_unplaced") {
      out.push({ id: `plan-${r.id}`, kind: "plan", title: `${name} heeft betaald maar staat nog niet ingepland`, sub: "Plaats de afspraak via Boekingen" + who(r), to: "/beheer/boekingen" });
      continue;
    }
    if (r.status !== "manual" && dayKey(r.start_at) === today && new Date(r.start_at).getTime() > nowMs - 3600e3) {
      out.push({ id: `vandaag-${r.id}`, kind: "vandaag", title: `${timeFmt.format(new Date(r.start_at))} gesprek met ${name}`, sub: (r.intake_id ? "Intake staat klaar" : "Intake nog niet ingevuld") + who(r), to: gesprek });
    }
    if (!open || !past) continue;

    const adviceDone = !!(it?.advisor_outcome && it?.advisor_summary);
    if (it && !adviceDone) {
      out.push({ id: `advies-${r.id}`, kind: "advies", title: `Leg het advies vast voor ${name}`, sub: "Uitkomst en samenvatting nog niet ingevuld" + who(r), to: gesprek });
      continue;
    }
    if (it && adviceDone && !it.advisor_followup_sent_at) {
      out.push({ id: `versturen-${r.id}`, kind: "versturen", title: `Verstuur het adviesverslag aan ${name}`, sub: "Advies staat klaar, de klant heeft het nog niet ontvangen" + who(r), to: gesprek });
      continue;
    }
    if (r.samples_besteld && !r.opgevolgd_at) {
      out.push({ id: `opvolg-${r.id}`, kind: "opvolgen", title: `${name} heeft samples besteld`, sub: "Nog niet opgevolgd: stuur een persoonlijk berichtje" + who(r), to: gesprek });
    }
    const expected = r.expected_purchase_at ?? deriveExpected(r.start_at, it?.planning ?? null);
    if (expected < todayKey()) {
      out.push({ id: `check-${r.id}`, kind: "check", title: `${name}: verf verwacht op ${fmtD(expected)}, nog niet gekocht`, sub: "Ga erachteraan en leg de uitkomst vast" + who(r), to: gesprek });
    }
  }

  // Open opvolgtaken die vandaag of eerder gepland staan.
  {
    let tq = supabase.from("followup_tasks").select("id,action,owner,due_date,booking_id,stylist_id, bookings(customer_name)")
      .is("done_at", null).lte("due_date", todayKey()).order("due_date", { ascending: true }).limit(30);
    if (opts.stylistId) tq = tq.eq("stylist_id", opts.stylistId);
    const { data: ft } = await tq;
    for (const t of (ft as any[]) ?? []) {
      if (t.owner === "klant") continue;
      const late = t.due_date && t.due_date < todayKey();
      out.push({
        id: `taak-${t.id}`, kind: "taak",
        title: `${t.action} · ${t.bookings?.customer_name || "klant"}`,
        sub: (late ? `Was gepland op ${t.due_date}` : "Gepland voor vandaag") + (t.owner === "roll" ? " · Roll" : ""),
        to: `/beheer/gesprek/${t.booking_id}`,
      });
    }
  }

  if (opts.isAdmin && !opts.stylistId) {
    // Open Roll-taken (offertes / contactverzoeken van stylisten).
    const { data: tasks } = await supabase.from("roll_tasks").select("id,type,status,owner,due_date, bookings(customer_name)")
      .in("status", ["aangevraagd", "opgepakt"]).order("created_at", { ascending: false }).limit(20);
    const todayStr = todayKey();
    for (const t of (tasks as any[]) ?? []) {
      const late = t.due_date && t.due_date < todayStr;
      out.push({
        id: `roll-${t.id}`, kind: "roll",
        title: `${t.type === "offerte" ? "Offerte" : "Contact"} gevraagd voor ${t.bookings?.customer_name || "klant"}${late ? " (te laat)" : ""}`,
        sub: t.owner ? `Eigenaar ${t.owner} · ${t.status}` : "Nog geen eigenaar", to: "/beheer/taken",
      });
    }
    // Intakes zonder afspraak (organische route): de klant verwacht dat Roll contact opneemt om in te plannen.
    // Weg zodra de intake aan een boeking hangt, of als hij in de intake-detail is afgerond of afgewezen.
    const { data: loose } = await supabase.from("intake").select("id,created_at,contact_name,contact_email")
      .eq("status", "verzonden").is("booking_id", null).not("advisor_status", "in", "(afgerond,afgewezen)")
      .order("created_at", { ascending: false }).limit(20);
    const looseRows = (loose as any[]) ?? [];
    if (looseRows.length) {
      const { data: linked } = await supabase.from("bookings").select("intake_id").in("intake_id", looseRows.map((i) => i.id));
      const linkedIds = new Set(((linked as any[]) ?? []).map((b) => b.intake_id));
      for (const i of looseRows) {
        if (linkedIds.has(i.id)) continue;
        out.push({
          id: `intake-${i.id}`, kind: "plan",
          title: `Intake zonder afspraak: plan het gesprek in met ${i.contact_name || i.contact_email || "de klant"}`,
          sub: `Ingevuld op ${fmtD(i.created_at)}${i.contact_email ? ` · ${i.contact_email}` : ""}`,
          to: `/beheer/${i.id}`,
        });
      }
    }
    const { data: al } = await supabase.from("system_alerts").select("id,message").is("acknowledged_at", null).order("created_at", { ascending: false }).limit(20);
    for (const a of (al as any[]) ?? []) out.push({ id: `melding-${a.id}`, kind: "melding", title: a.message, sub: "Systeemmelding", to: "/beheer/meldingen" });
  }
  return out;
}
