import { supabase } from "@/lib/supabase";

// Openstaande acties, afgeleid uit boekingen/intakes/meldingen. Gebruikt door het belletje,
// de notificatiepagina en het Overzicht. Niets wordt opgeslagen: elke keer vers berekend.
export interface Notif {
  id: string;
  kind: "vandaag" | "opvolgen" | "advies" | "plan" | "melding";
  title: string;
  sub?: string;
  to?: string;
}

const TZ = "Europe/Amsterdam";
const dayKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
const timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

export const KIND_LABEL: Record<Notif["kind"], string> = {
  vandaag: "Vandaag",
  opvolgen: "Opvolgen",
  advies: "Advies vastleggen",
  plan: "Inplannen",
  melding: "Systeem",
};

// stylistId: eigen styliste (of gekozen styliste voor de beheerder). null = alles (beheerder).
export async function loadNotifications(opts: { isAdmin: boolean; stylistId: string | null }): Promise<Notif[]> {
  const out: Notif[] = [];
  let q = supabase
    .from("bookings")
    .select("id,start_at,status,customer_name,intake_id,kanban_stage,samples_besteld,opgevolgd_at,stylist_id, stylists(name)")
    .in("status", ["confirmed", "paid_unplaced"]);
  if (opts.stylistId) q = q.eq("stylist_id", opts.stylistId);
  const { data } = await q;
  const rows = (data as any[]) ?? [];
  const today = dayKey(new Date().toISOString());
  const nowMs = Date.now();
  const who = (r: any) => (opts.isAdmin && !opts.stylistId && r.stylists?.name ? ` · ${r.stylists.name}` : "");

  for (const r of rows) {
    const name = r.customer_name || "Klant";
    if (r.status === "paid_unplaced") {
      out.push({
        id: `plan-${r.id}`, kind: "plan",
        title: `${name} heeft betaald maar staat nog niet ingepland`,
        sub: "Plaats de afspraak via Boekingen" + who(r), to: "/beheer/boekingen",
      });
      continue;
    }
    if (dayKey(r.start_at) === today && new Date(r.start_at).getTime() > nowMs - 3600e3) {
      out.push({
        id: `vandaag-${r.id}`, kind: "vandaag",
        title: `${timeFmt.format(new Date(r.start_at))} gesprek met ${name}`,
        sub: (r.intake_id ? "Intake staat klaar" : "Intake nog niet ingevuld") + who(r), to: `/beheer/klant/${r.id}`,
      });
    }
    if (r.samples_besteld && !r.opgevolgd_at && r.kanban_stage !== "verf" && r.kanban_stage !== "afgehaakt") {
      out.push({
        id: `opvolg-${r.id}`, kind: "opvolgen",
        title: `${name} heeft samples besteld`,
        sub: "Nog niet opgevolgd: stuur een persoonlijk berichtje" + who(r), to: `/beheer/klant/${r.id}`,
      });
    }
  }

  // Gesprek geweest, maar uitkomst nog niet vastgelegd.
  const past = rows.filter(
    (r) => r.status === "confirmed" && new Date(r.start_at).getTime() < nowMs && r.intake_id &&
      (r.kanban_stage === "advies" || r.kanban_stage === "ingepland"),
  );
  if (past.length) {
    const { data: its } = await supabase.from("intake").select("id,advisor_outcome").in("id", past.map((r) => r.intake_id));
    const noOutcome = new Set(((its as any[]) ?? []).filter((i) => !i.advisor_outcome).map((i) => i.id));
    for (const r of past) {
      if (noOutcome.has(r.intake_id)) {
        out.push({
          id: `advies-${r.id}`, kind: "advies",
          title: `Leg het advies vast voor ${r.customer_name || "klant"}`,
          sub: "Uitkomst en samenvatting nog niet ingevuld" + who(r), to: `/beheer/${r.intake_id}`,
        });
      }
    }
  }

  if (opts.isAdmin && !opts.stylistId) {
    const { data: al } = await supabase
      .from("system_alerts").select("id,message").is("acknowledged_at", null)
      .order("created_at", { ascending: false }).limit(20);
    for (const a of (al as any[]) ?? []) out.push({ id: `melding-${a.id}`, kind: "melding", title: a.message, sub: "Systeemmelding", to: "/beheer/meldingen" });
  }
  return out;
}
