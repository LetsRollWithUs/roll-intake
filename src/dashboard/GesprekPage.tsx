import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { SURFACES, SUN_MOMENTS, USAGE_TIMES, PLANNING, PAINTERS, MOODS } from "@/data/intake-options";
import { CustomerPurchases, euro } from "./CustomerPurchases";
import { formatDate } from "./ui";
import { nextAction, type Phase } from "./nextAction";
import { deriveExpected, leadScore, TEMP_LABEL } from "./lead";
import { AdviceEditor } from "./AdviceEditor";
import { RollHelpForm, type RollTask } from "./RollHelpForm";
import { FollowupTasks, type FollowupTask } from "./FollowupTasks";
import { ConceptPanel } from "./ConceptPanel";
import type { OrdersResp } from "./CustomerPurchases";
import type { IntakeRow, AdviceConcept, AdvicePhase } from "./types";

interface Sent { id: string; route: string; subject: string; body: string; sent_to: string | null; sent_by: string | null; sent_at: string }
const ROUTE_LABEL: Record<string, string> = { samples: "Eerst samples testen", zelf: "Zelf verf bestellen", roll: "Hulp van Roll" };

interface Booking {
  id: string;
  start_at: string;
  end_at: string | null;
  created_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  intake_id: string | null;
  stylist_id: string | null;
  kanban_stage: string;
  samples_besteld: boolean;
  opgevolgd_at: string | null;
  upsell_offered: boolean;
  upsell_booked: boolean;
  upsell_value: number | null;
  expected_purchase_at: string | null;
  stylists: { name: string; meet_url: string | null } | null;
  services: { key: string } | null;
}
interface Commission { id: string; woo_order_id: string; verf_excl: number; amount: number; status: string; created_at: string }

const SEL = "id,start_at,end_at,created_at,status,customer_name,customer_email,customer_phone,intake_id,stylist_id,kanban_stage,samples_besteld,opgevolgd_at,upsell_offered,upsell_booked,upsell_value,expected_purchase_at, stylists(name,meet_url), services(key)";
const TZ = "Europe/Amsterdam";
const fmtDay = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
const fmtTime = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const lbl = (list: { key: string; label: string }[], key?: string | null) => list.find((x) => x.key === key)?.label ?? key ?? "";
const safeUrl = (v?: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
const STAGES = [
  { key: "ingepland", label: "Ingepland" }, { key: "advies", label: "Advies gegeven" }, { key: "opvolging", label: "In opvolging" },
  { key: "verf", label: "Verf gekocht" }, { key: "afgehaakt", label: "Afgehaakt" },
];
const COMM_STATUS: Record<string, string> = { te_controleren: "Te controleren", uitbetaalbaar: "Te factureren", uitbetaald: "Gefactureerd", vervallen: "Vervallen" };

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "?";
}

// Inklapbaar onderdeel; het onderdeel dat bij de fase past staat open.
function Panel({ id, title, hint, open, children }: { id: string; title: string; hint?: string; open: boolean; children: React.ReactNode }) {
  return (
    <details id={id} open={open} className="gp-panel rd-card-white" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
          <span className="gp-chev" aria-hidden style={{ color: "var(--rd-pink-dark)", fontSize: 15, transition: "transform .15s ease", flex: "none" }}>▸</span>
          <span className="rd-kicker rd-kicker-pink">{title}</span>
        </span>
        <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {hint && <span className="gp-hint" style={{ fontSize: 12, opacity: 0.6 }}>{hint}</span>}
          <span className="gp-toggle" style={{ fontSize: 12, fontWeight: 700, color: "var(--rd-pink-dark)", flex: "none" }}>Openen</span>
        </span>
      </summary>
      <div style={{ padding: "0 18px 18px" }}>{children}</div>
    </details>
  );
}
const Kv = ({ k, children }: { k: string; children: React.ReactNode }) => (
  <div style={{ display: "grid", gridTemplateColumns: "minmax(120px, 160px) 1fr", gap: 10, fontSize: 14, padding: "6px 0", borderTop: "1px solid var(--rd-line)" }}>
    <span style={{ opacity: 0.6 }}>{k}</span><span>{children}</span>
  </div>
);

export function GesprekPage() {
  const { bookingId } = useParams();
  const [b, setB] = useState<Booking | null>(null);
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [others, setOthers] = useState<Booking[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [sends, setSends] = useState<Sent[]>([]);
  const [task, setTask] = useState<RollTask | null>(null);
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [orders, setOrders] = useState<OrdersResp | null | undefined>(undefined); // undefined = nog aan het laden
  const [adoptVersion, setAdoptVersion] = useState(0); // remount van de advies-editor na "Overnemen in advies"
  const [loading, setLoading] = useState(true);

  // Concept overnemen: kleurrichtingen worden VOORGESTELDE regels in het SAMPLE-advies; de styliste past aan.
  const adoptConcept = async (c: AdviceConcept) => {
    if (!intake) return;
    const existing = intake.advice_sample;
    const rooms = c.richtingen.flatMap((r) => r.kleuren.map((k) => ({
      room: r.titel, surface: k.toepassing, color: k.naam, status: "voorgesteld" as const, product: "Muurverf", m2: "", liters: "", motivation: r.waarom,
    })));
    const next: AdvicePhase = {
      answer: existing?.answer?.trim() ? existing.answer : c.samenvatting,
      rooms: (existing?.rooms?.filter((r) => r.room.trim() || r.color.trim()) ?? []).concat(rooms),
      sample_instruction: existing?.sample_instruction ?? "",
      next_step: existing?.next_step ?? "",
      internal: existing?.internal ?? "",
      plan: existing?.plan ?? { what: "", who: "", when: "" },
      route: "samples",
      products: existing?.products ?? [],
    };
    const { error } = await supabase.from("intake").update({ advice_sample: next }).eq("id", intake.id);
    if (!error) { setIntake({ ...intake, advice_sample: next }); setAdoptVersion((v) => v + 1); const el = document.getElementById("sample") as HTMLDetailsElement | null; if (el) el.open = true; el?.scrollIntoView({ behavior: "smooth", block: "start" }); }
  };

  const loadTasks = async (bid: string) => {
    const { data } = await supabase.from("followup_tasks").select("id,action,owner,due_date,kind,outcome,note,done_at,created_at").eq("booking_id", bid).order("created_at", { ascending: true });
    setTasks((data as FollowupTask[]) ?? []);
  };

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("bookings").select(SEL).eq("id", bookingId).maybeSingle();
      const cur = (data as unknown as Booking) ?? null;
      setB(cur);
      if (!cur) { setLoading(false); return; }
      const email = (cur.customer_email ?? "").trim().toLowerCase();
      const { data: rt } = await supabase.from("roll_tasks").select("id,type,status,owner,due_date,payload,result,created_at,updated_at").eq("booking_id", cur.id).order("created_at", { ascending: false }).limit(1);
      setTask(((rt as RollTask[]) ?? [])[0] ?? null);
      await loadTasks(cur.id);
      const [it, all, cm, sd] = await Promise.all([
        cur.intake_id ? supabase.from("intake").select("*").eq("id", cur.intake_id).maybeSingle() : Promise.resolve({ data: null }),
        email ? supabase.from("bookings").select(SEL).ilike("customer_email", email).neq("status", "cancelled").order("start_at", { ascending: false }) : Promise.resolve({ data: [] }),
        email ? supabase.from("commissions").select("id,woo_order_id,verf_excl,amount,status,created_at").ilike("customer_email", email).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
        cur.intake_id ? supabase.from("advice_sends").select("id,route,subject,body,sent_to,sent_by,sent_at").eq("intake_id", cur.intake_id).order("sent_at", { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      setIntake((it.data as IntakeRow) ?? null);
      setOthers(((all.data as unknown as Booking[]) ?? []).filter((x) => x.id !== cur.id));
      setCommissions((cm.data as Commission[]) ?? []);
      setSends((sd.data as Sent[]) ?? []);
      setLoading(false);
    })();
  }, [bookingId]);

  // Na versturen: verzendlog opnieuw ophalen zodat "Versturen & overdragen" meteen klopt.
  const reloadSends = async () => {
    if (!b?.intake_id) return;
    const { data } = await supabase.from("advice_sends").select("id,route,subject,body,sent_to,sent_by,sent_at").eq("intake_id", b.intake_id).order("sent_at", { ascending: false });
    setSends((data as Sent[]) ?? []);
  };

  const patch = async (jsonPatch: Record<string, unknown>, local: Partial<Booking>) => {
    if (!b) return;
    setB({ ...b, ...local });
    await supabase.rpc("kanban_update", { p_booking_id: b.id, p_patch: jsonPatch });
  };

  const action = useMemo(() => (b ? nextAction({
    id: b.id, status: b.status, start_at: b.start_at, kanban_stage: b.kanban_stage, samples_besteld: b.samples_besteld,
    opgevolgd_at: b.opgevolgd_at, expected_purchase_at: b.expected_purchase_at, intake_id: b.intake_id,
    intake: intake ? { advisor_outcome: intake.advisor_outcome, advisor_summary: intake.advisor_summary, advisor_followup_sent_at: intake.advisor_followup_sent_at, planning: intake.planning } : null,
    rollTask: task ? { type: task.type, status: task.status, owner: task.owner } : null,
    openTasks: tasks.filter((t) => !t.done_at).map((t) => ({ action: t.action, owner: t.owner, due_date: t.due_date })),
  }) : null), [b, intake, task, tasks]);

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (!b || !action) return <div><Link to="/beheer/gesprekken" className="rd-textlink">← Adviesgesprekken</Link><p className="rd-sub">Gesprek niet gevonden.</p></div>;

  const name = b.customer_name || intake?.contact_name || "Klant";
  const email = b.customer_email || intake?.contact_email || null;
  const meet = safeUrl(b.stylists?.meet_url);
  const past = new Date(b.start_at).getTime() < Date.now();
  const phase: Phase = action.phase;
  const openPanel = (p: Phase[]) => p.includes(phase);

  // Intake: wat ontbreekt?
  const rooms = intake?.rooms ?? [];
  const missing: string[] = [];
  if (intake) {
    if (!rooms.some((r) => (r.photos?.length ?? 0) > 0)) missing.push("foto's");
    if (!rooms.some((r) => (r.sun?.length ?? 0) > 0 || r.noWindows)) missing.push("lichtinval");
    if (!intake.planning) missing.push("planning");
    if (!intake.painter) missing.push("wie schildert");
    if (!intake.has_samples) missing.push("samples-info");
  }
  const samplesBefore = b.services?.key === "post_sample" || (!!intake?.has_samples && intake.has_samples !== "nee");
  const lead = intake ? leadScore({ rooms: intake.rooms, planning: intake.planning, painter: intake.painter }) : null;
  const expected = b.expected_purchase_at ?? (past ? deriveExpected(b.start_at, intake?.planning ?? null) : null);
  const totalCommission = commissions.filter((c) => c.status !== "vervallen").reduce((s, c) => s + Number(c.amount), 0);

  // Traject in 6 stappen. States: done | active | attention | skip | todo.
  const sentRoutes = new Set(sends.map((s) => s.route));
  const sampleSentAt = sends.find((s) => s.route === "samples")?.sent_at ?? null;
  const verfSentAt = sends.find((s) => s.route === "zelf" || s.route === "roll")?.sent_at ?? null;
  const boughtVerf = (orders?.product_items ?? 0) > 0 || commissions.some((c) => c.status !== "vervallen") || b.kanban_stage === "verf";
  const boughtSamples = (orders?.sample_items ?? 0) > 0 || b.samples_besteld;
  const sampleSkipped = samplesBefore && !sentRoutes.has("samples");
  const verfAdviceDone = sentRoutes.has("zelf") || sentRoutes.has("roll") || intake?.advisor_outcome === "color_chosen";
  type St = "done" | "active" | "attention" | "skip" | "todo";
  const steps: { n: number; label: string; state: St; to?: string }[] = [
    { n: 1, label: "Afspraak", state: b.status === "paid_unplaced" ? "attention" : past ? "done" : "active", to: "top" },
    { n: 2, label: "Intake", state: intake ? "done" : past ? "attention" : "active", to: "voorbereiding" },
    { n: 3, label: "Sample-advies", state: sentRoutes.has("samples") ? "done" : sampleSkipped ? "skip" : (intake && past && !verfAdviceDone) ? "active" : "todo", to: "sample" },
    { n: 4, label: "Opvolging samples", state: b.opgevolgd_at ? "done" : boughtSamples ? "active" : (sentRoutes.has("samples") || boughtSamples) ? "todo" : "skip", to: "opvolging" },
    { n: 5, label: "Verf-advies", state: verfAdviceDone ? "done" : boughtVerf ? "done" : (sentRoutes.has("samples") || sampleSkipped || b.opgevolgd_at) ? "active" : "todo", to: "verf" },
    { n: 6, label: "Offerte / kopen", state: boughtVerf ? "done" : verfAdviceDone ? "active" : "todo", to: "versturen" },
  ];
  const goToStep = (to?: string) => {
    if (to === "top" || !to) { window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    const el = document.getElementById(to);
    if (!el) return;
    if (el.tagName === "DETAILS") (el as HTMLDetailsElement).open = true;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const STEP_C: Record<St, { bg: string; ink: string; ring?: string }> = {
    done: { bg: "var(--rd-aubergine)", ink: "#fff" },
    active: { bg: "var(--rd-pink)", ink: "var(--rd-aubergine)", ring: "var(--rd-pink-dark)" },
    attention: { bg: "var(--rd-pink-dark)", ink: "#fff", ring: "var(--rd-pink-dark)" },
    skip: { bg: "var(--rd-grey-light)", ink: "rgba(47,33,65,.45)" },
    todo: { bg: "var(--rd-grey-light)", ink: "rgba(47,33,65,.55)" },
  };

  return (
    <div style={{ maxWidth: 900 }}>
      <style>{`
        .gp-panel[open] > summary .gp-chev{transform:rotate(90deg)}
        .gp-panel[open] > summary .gp-toggle{display:none}
        .gp-panel:not([open]) > summary .gp-hint{display:none}
        .gp-panel > summary:hover{background:var(--rd-grey-light)}
      `}</style>
      <Link to="/beheer/gesprekken" className="rd-textlink" style={{ textDecoration: "none" }}>← Adviesgesprekken</Link>

      {/* KOP */}
      <div className="rd-card-white" style={{ marginTop: 8, padding: 0, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{ width: 52, height: 52, borderRadius: 99, background: "var(--rd-lavender)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 17, flex: "none" }}>{initials(name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div className="rd-kicker" style={{ opacity: 0.55, fontSize: 11 }}>Klant</div>
            <h1 className="rd-h2" style={{ margin: 0 }}>{name}</h1>
            <div style={{ fontSize: 14, display: "flex", gap: 12, flexWrap: "wrap" }}>
              {email && <a href={`mailto:${email}`} style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{email}</a>}
              {b.customer_phone && <a href={`tel:${b.customer_phone}`} style={{ color: "var(--rd-aubergine)", fontWeight: 600 }}>{b.customer_phone}</a>}
              {others.length > 0 && <Link to={`/beheer/klant/${b.id}`} className="rd-textlink" style={{ fontSize: 13 }}>{others.length + 1} gesprekken · klantkaart</Link>}
            </div>
          </div>
          {lead && <span className="rd-chip" style={{ background: TEMP_LABEL[lead.temp].bg, color: TEMP_LABEL[lead.temp].ink, fontWeight: 700 }}>{TEMP_LABEL[lead.temp].label}</span>}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", borderTop: "1px solid var(--rd-line)" }}>
          <div style={{ padding: "12px 18px", borderRight: "1px solid var(--rd-line)" }}>
            <div className="rd-kicker" style={{ opacity: 0.55, fontSize: 11 }}>Afspraak</div>
            <div style={{ fontWeight: 700, textTransform: "capitalize" }}>{fmtDay(b.start_at)}</div>
            <div style={{ fontSize: 14 }}>{fmtTime(b.start_at)}{b.end_at ? ` tot ${fmtTime(b.end_at)}` : ""} · {b.stylists?.name ?? "—"}{past ? " · geweest" : ""}</div>
            {meet && !past && <a href={meet} target="_blank" rel="noreferrer" className="rd-btn rd-btn-primary" style={{ textDecoration: "none", padding: "8px 14px", marginTop: 8, display: "inline-block" }}>Start videogesprek</a>}
            {b.status === "paid_unplaced" && <span className="rd-chip" style={{ background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700, marginTop: 8, display: "inline-block" }}>Nog inplannen</span>}
          </div>
          <div style={{ padding: "12px 18px", borderRight: "1px solid var(--rd-line)" }}>
            <div className="rd-kicker" style={{ opacity: 0.55, fontSize: 11 }}>Intake</div>
            {intake ? (
              <>
                <div style={{ fontWeight: 700 }}>Ontvangen {formatDate(intake.created_at)}</div>
                <div style={{ fontSize: 13, marginTop: 2 }}>{missing.length ? <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>Ontbreekt: {missing.join(", ")}</span> : <span style={{ opacity: 0.7 }}>Compleet</span>}</div>
                <Link to={`/beheer/${intake.id}`} className="rd-textlink" style={{ fontSize: 13 }}>Volledige intake</Link>
              </>
            ) : (
              <div style={{ fontWeight: 700, color: "var(--rd-pink-dark)" }}>Nog niet ingevuld</div>
            )}
          </div>
          <div style={{ padding: "12px 18px", background: "var(--rd-grey-light)" }}>
            <div className="rd-kicker rd-kicker-pink" style={{ fontSize: 11 }}>Volgende actie · {action.owner}</div>
            <div style={{ fontWeight: 800, fontSize: 15, lineHeight: 1.3 }}>{action.title}</div>
            {action.sub && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{action.sub}</div>}
            {action.to && action.to !== `/beheer/gesprek/${b.id}` && <Link to={action.to} className="rd-btn rd-btn-primary" style={{ textDecoration: "none", padding: "8px 14px", marginTop: 8, display: "inline-block" }}>Ga naar de actie</Link>}
          </div>
        </div>
      </div>

      {/* Traject in stappen */}
      <div className="rd-card-white" style={{ marginTop: 12, padding: "14px 12px" }}>
        <div style={{ display: "flex", gap: 4, alignItems: "flex-start", overflowX: "auto" }} className="rd-hide-scroll">
          {steps.map((s, i) => {
            const c = STEP_C[s.state];
            return (
              <div key={s.n} style={{ display: "flex", alignItems: "flex-start", flex: "1 0 auto" }}>
                <button
                  type="button"
                  onClick={() => goToStep(s.to)}
                  title={`Naar ${s.label}`}
                  style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6, width: 92, textAlign: "center", background: "none", border: 0, cursor: "pointer", padding: "2px 0", font: "inherit", color: "inherit", borderRadius: 10 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 99, background: c.bg, color: c.ink, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, boxShadow: c.ring ? `0 0 0 3px ${c.ring}33` : "none", border: c.ring ? `1.5px solid ${c.ring}` : "1.5px solid transparent" }}>
                    {s.state === "done" ? "✓" : s.state === "skip" ? "–" : s.n}
                  </div>
                  <span style={{ fontSize: 11.5, lineHeight: 1.2, fontWeight: s.state === "active" || s.state === "attention" ? 700 : 500, color: s.state === "skip" ? "rgba(47,33,65,.45)" : "var(--rd-aubergine)" }}>{s.label}</span>
                  {s.state === "active" && <span className="rd-chip" style={{ fontSize: 10, padding: "1px 7px", background: "var(--rd-pink)", color: "var(--rd-aubergine)", fontWeight: 700 }}>nu</span>}
                  {s.state === "attention" && <span className="rd-chip" style={{ fontSize: 10, padding: "1px 7px", background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 }}>actie</span>}
                  {s.state === "skip" && <span style={{ fontSize: 10, opacity: 0.5 }}>n.v.t.</span>}
                </button>
                {i < steps.length - 1 && <div style={{ height: 2, background: "var(--rd-line)", flex: 1, minWidth: 12, marginTop: 15 }} />}
              </div>
            );
          })}
        </div>
      </div>

      {/* 1 VOORBEREIDING */}
      <Panel id="voorbereiding" title="Voorbereiding" hint="door de klant ingevuld" open={openPanel(["voorbereiding", "gesprek"])}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Nog geen intake. Je ziet hier de hulpvraag, ruimtes, foto's en voorkeuren zodra de klant 'm invult.</p>
        ) : (
          <div>
            <Kv k="Hulpvraag"><strong>{intake.main_question || "niet ingevuld"}</strong>{(intake.help_needs?.length ?? 0) > 0 && <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>{intake.help_needs!.map((h) => <span key={h} className="rd-chip">{h}</span>)}</div>}</Kv>
            <Kv k="Ruimtes">
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {rooms.map((r) => (
                  <div key={r.id}>
                    <div style={{ fontWeight: 700 }}>{r.label}{r.priority ? " ★" : ""} <span style={{ fontWeight: 500, opacity: 0.6, fontSize: 13 }}>· {(r.photos?.length ?? 0)} foto('s)</span></div>
                    <div style={{ fontSize: 13, opacity: 0.8 }}>
                      {(r.surfaces ?? []).map((s) => lbl(SURFACES, s)).join(", ") || "oppervlak onbekend"}
                      {r.noWindows ? " · geen ramen" : (r.sun?.length ? ` · zon: ${r.sun.map((k) => lbl(SUN_MOMENTS, k)).join(", ")}` : " · lichtinval onbekend")}
                      {r.skylight && " · dakraam"}{r.usage && ` · ${lbl(USAGE_TIMES, r.usage)}`}
                      {r.otherChanges && ` · verandert: ${r.otherChangesNote || "ja"}`}
                    </div>
                  </div>
                ))}
                {rooms.length === 0 && <span style={{ opacity: 0.5 }}>geen ruimtes</span>}
              </div>
            </Kv>
            <Kv k="Overwogen kleuren">{(intake.colors?.length ?? 0) > 0 ? <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>{intake.colors!.map((c, i) => <span key={i} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />{c.name}</span>)}</div> : <span style={{ opacity: 0.5 }}>geen</span>}</Kv>
            <Kv k="Samples">
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {samplesBefore ? <span className="rd-chip">had al samples vóór het gesprek</span> : <span className="rd-chip" style={{ background: "var(--rd-grey-light)" }}>nog geen samples vóór het gesprek</span>}
                {b.samples_besteld && <span className="rd-chip" style={{ background: "#C9E6CE", color: "#1e4429", fontWeight: 700 }}>samples besteld na het gesprek</span>}
              </div>
              {(intake.samples?.length ?? 0) > 0 && <div style={{ fontSize: 13, marginTop: 6 }}>{intake.samples!.map((s) => `${[s.brand, s.name].filter(Boolean).join(" ")}${s.verdict ? ` (${s.verdict})` : ""}`).join(" · ")}</div>}
            </Kv>
            {((intake.moods?.length ?? 0) > 0 || intake.pinterest_url || intake.other_inspiration_url || intake.inspiration_note) && (
              <Kv k="Sfeer & inspiratie">
                {(intake.moods ?? []).filter((m) => MOODS.includes(m)).join(", ")}
                {intake.pinterest_url && <div><a href={safeUrl(intake.pinterest_url) ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>Pinterest</a></div>}
                {intake.other_inspiration_url && <div><a href={safeUrl(intake.other_inspiration_url) ?? "#"} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>Inspiratielink</a></div>}
                {intake.inspiration_note && <div style={{ fontSize: 13, opacity: 0.8 }}>{intake.inspiration_note}</div>}
              </Kv>
            )}
            <Kv k="Planning">{lbl(PLANNING, intake.planning) || <span style={{ opacity: 0.5 }}>onbekend</span>}{intake.painter && <> · {lbl(PAINTERS, intake.painter)}</>}{intake.painter === "schilder" && <span className="rd-chip" style={{ marginLeft: 8, background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 }}>let op: verf via de schilder?</span>}</Kv>
            {missing.length > 0 && <Kv k="Ontbreekt"><span style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{missing.join(", ")}</span><span style={{ opacity: 0.7 }}> · vraag ernaar in het gesprek</span></Kv>}
            {lead && <Kv k="Lead">{lead.rooms} ruimte{lead.rooms === 1 ? "" : "s"} · {lead.surfaces} oppervlak{lead.surfaces === 1 ? "" : "ken"} · <span className="rd-chip" style={{ background: TEMP_LABEL[lead.temp].bg, color: TEMP_LABEL[lead.temp].ink, fontWeight: 700 }}>{TEMP_LABEL[lead.temp].label}</span></Kv>}
          </div>
        )}
        {intake && (
          <ConceptPanel
            intake={intake}
            onConcept={(c, at) => setIntake({ ...intake, advice_concept: c, advice_concept_at: at })}
            onAdopt={adoptConcept}
          />
        )}
        <div style={{ marginTop: 12 }}>
          <CustomerPurchases email={email} title="Eerdere samples & aankopen (WooCommerce)" onData={setOrders} />
        </div>
      </Panel>

      {/* 2 SAMPLE-ADVIES (stap 3) */}
      <Panel id="sample" title="Sample-advies" hint="kleuren om thuis te testen" open={openPanel(["gesprek"]) && steps[4].state !== "active"}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Zonder intake kun je het advies nog niet vastleggen. Vraag de klant de intake in te vullen.</p>
        ) : (
          <AdviceEditor
            key={`sample:${intake.id}:${adoptVersion}`}
            intakeId={intake.id}
            phase="sample"
            value={intake.advice_sample}
            bookingId={b.id}
            customerName={name}
            stylistName={b.stylists?.name ?? ""}
            roomLabels={rooms.map((r) => r.label)}
            sentAt={sampleSentAt}
            onSaved={(bundle) => setIntake({ ...intake, advice_sample: bundle, followup_route: bundle.route, followup_plan: bundle.plan })}
            onSent={() => { reloadSends(); loadTasks(b.id); }}
          />
        )}
      </Panel>

      {/* 3 VERF-ADVIES (stap 5) */}
      <Panel id="verf" title="Verf-advies" hint="de definitieve kleur en zo bestelt de klant" open={openPanel(["gesprek", "versturen"]) && steps[4].state === "active"}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Zonder intake kun je het advies nog niet vastleggen.</p>
        ) : (
          <AdviceEditor
            key={`verf:${intake.id}:${adoptVersion}`}
            intakeId={intake.id}
            phase="verf"
            value={intake.advice_verf}
            bookingId={b.id}
            customerName={name}
            stylistName={b.stylists?.name ?? ""}
            roomLabels={rooms.map((r) => r.label)}
            sentAt={verfSentAt}
            onSaved={(bundle) => setIntake({ ...intake, advice_verf: bundle, followup_route: bundle.route, followup_plan: bundle.plan })}
            onSent={() => { reloadSends(); loadTasks(b.id); }}
          />
        )}
      </Panel>

      {/* 3 VERSTUREN & OVERDRAGEN */}
      <Panel id="versturen" title="Versturen & overdragen" hint="klantmail en hulp van Roll" open={openPanel(["versturen"])}>
        {!intake ? <p className="rd-sub" style={{ margin: 0 }}>Beschikbaar zodra er een intake en advies is.</p> : (
          <div>
            <Kv k="Vervolgrichting">{intake.followup_route ? <strong>{ROUTE_LABEL[intake.followup_route]}</strong> : <span style={{ opacity: 0.6 }}>Nog niet gekozen (bij Sample- of Verf-advies)</span>}</Kv>
            <Kv k="Adviesverslag">
              {sends.length === 0 ? (
                <span style={{ opacity: 0.6 }}>Nog niet verstuurd. Versturen doe je via "Klantmail bekijken" bij Sample- of Verf-advies.</span>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {sends.map((s) => (
                    <details key={s.id} style={{ fontSize: 13 }}>
                      <summary style={{ cursor: "pointer" }}><strong>Verstuurd {formatDate(s.sent_at)}</strong> · {ROUTE_LABEL[s.route] ?? s.route} · aan {s.sent_to}{s.sent_by ? ` · door ${s.sent_by}` : ""}</summary>
                      <div style={{ marginTop: 6, padding: "10px 12px", background: "var(--rd-grey-light)", borderRadius: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}><strong>{s.subject}</strong>{"\n\n"}{s.body}</div>
                    </details>
                  ))}
                </div>
              )}
            </Kv>
            <Kv k="Vervolgafspraak">{intake.followup_plan?.what ? <span>{intake.followup_plan.what}{intake.followup_plan.who ? ` · ${intake.followup_plan.who}` : ""}{intake.followup_plan.when ? ` · ${intake.followup_plan.when}` : ""}</span> : <span style={{ opacity: 0.6 }}>Geen</span>}</Kv>
            <Kv k="Offerte">{intake.advisor_offer_url ? <a href={intake.advisor_offer_url} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)", fontWeight: 600, wordBreak: "break-all" }}>{intake.advisor_offer_url}</a> : <span style={{ opacity: 0.6 }}>Geen offerte; de klant bestelt zelf via roll.nl (hulp: roll.nl/prijsopgave)</span>}</Kv>
            <div style={{ marginTop: 14 }}>
              <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Hulp van Roll</div>
              <p className="rd-sub" style={{ margin: "0 0 10px", fontSize: 13 }}>Roll maakt de offerte en bepaalt liters, verpakkingen en primer. Jij levert de kleuren en afmetingen aan, of laat Roll contact opnemen.</p>
              <RollHelpForm bookingId={b.id} stylistId={b.stylist_id} intake={intake} task={task} onCreated={(t) => setTask(t)} />
            </div>
          </div>
        )}
      </Panel>

      {/* 4 OPVOLGING & HISTORIE */}
      <Panel id="opvolging" title="Opvolging & historie" hint="fase, tijdlijn, gesprekken, commissie" open={openPanel(["opvolging", "klaar"])}>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", marginBottom: 6 }}>
          <select className="rd-input" value={b.kanban_stage} onChange={(e) => patch({ kanban_stage: e.target.value }, { kanban_stage: e.target.value })} style={{ height: 38, flex: "0 1 200px" }}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={b.samples_besteld} onChange={(e) => patch({ samples_besteld: e.target.checked }, { samples_besteld: e.target.checked })} /> Samples besteld na gesprek</label>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={b.upsell_offered} onChange={(e) => patch({ upsell_offered: e.target.checked }, { upsell_offered: e.target.checked })} /> Uitgebreid advies aangeboden</label>
          {b.upsell_offered && <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={b.upsell_booked} onChange={(e) => patch({ upsell_booked: e.target.checked }, { upsell_booked: e.target.checked })} /> Geboekt</label>}
          {b.upsell_booked && <input className="rd-input" inputMode="decimal" placeholder="Opdracht €" defaultValue={b.upsell_value ?? ""} onBlur={(e) => patch({ upsell_value: e.target.value }, { upsell_value: e.target.value ? Number(e.target.value) : null })} style={{ height: 36, width: 120 }} />}
        </div>

        <div style={{ margin: "12px 0 6px" }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 4 }}>Opvolgtaken</div>
          <p className="rd-sub" style={{ margin: "0 0 8px", fontSize: 13 }}>Elke taak heeft een actie, eigenaar en datum; bij afronden leg je de uitkomst vast. Een verfaankoop sluit open taken automatisch.</p>
          <FollowupTasks bookingId={b.id} stylistId={b.stylist_id} tasks={tasks} onChange={(t) => { setTasks(t); if (t.some((x) => x.done_at) && !b.opgevolgd_at) patch({ opgevolgd: true }, { opgevolgd_at: new Date().toISOString() }); }} />
        </div>
        <Kv k="Advies gekocht">{formatDate(b.created_at)}</Kv>
        <Kv k="Gesprek">{formatDate(b.start_at)}</Kv>
        <Kv k="Opgevolgd">{b.opgevolgd_at ? formatDate(b.opgevolgd_at) : <span style={{ opacity: 0.5 }}>nog niet</span>}</Kv>
        <Kv k="Verf verwacht"><input type="date" className="rd-input" value={expected ?? ""} onChange={(e) => patch({ expected_purchase_at: e.target.value }, { expected_purchase_at: e.target.value || null })} style={{ height: 34, width: 160 }} /></Kv>
        <Kv k="Gesprekken">
          {others.length === 0 ? <span style={{ opacity: 0.6 }}>Dit is het enige gesprek met deze klant.</span> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {others.map((o) => <Link key={o.id} to={`/beheer/gesprek/${o.id}`} className="rd-textlink" style={{ fontSize: 13 }}>{formatDate(o.start_at)} · {o.stylists?.name ?? "—"} · {STAGES.find((s) => s.key === o.kanban_stage)?.label}{new Date(o.start_at).getTime() > Date.now() ? " · komend" : ""}</Link>)}
            </div>
          )}
        </Kv>
        <Kv k="Commissie">{commissions.length === 0 ? <span style={{ opacity: 0.6 }}>Geen toegeschreven verfbestelling</span> : <span>{commissions.map((c) => `#${c.woo_order_id} ${euro(c.amount)} (${COMM_STATUS[c.status] ?? c.status})`).join(" · ")} · totaal <strong>{euro(totalCommission)}</strong></span>}</Kv>
      </Panel>
    </div>
  );
}
