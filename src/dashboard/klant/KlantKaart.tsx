import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import type { IntakeRow } from "../types";
import type { RollTask } from "../RollHelpForm";
import { RollTaskStatus } from "../RollHelpForm";
import { FollowupTasks, type FollowupTask } from "../FollowupTasks";
import { SampleCheckin } from "../SampleCheckin";
import { euro, type OrdersResp } from "../CustomerPurchases";
import { formatDate } from "../ui";
import { derive, initialAdvice, summarize, type AdviceV2 } from "./advice";
import { Voorbereiden, nogBespreken } from "./Voorbereiden";
import { OfferteEditor } from "./OfferteEditor";
import { Afronden, type Sent } from "./Afronden";

// Klantkaart: één rustige werkplek in drie vaste fases (Voorbereiden, Advies en offerte, Afronden).
// Kleuren, maten en producten leven in de editor van roll.nl/offerte (zelfde back-end), ingebed in fase 2.
// Het advies wordt één keer per ruimte en oppervlak vastgelegd en automatisch opgeslagen.

interface Booking {
  id: string; start_at: string; end_at: string | null; created_at: string; status: string;
  customer_name: string | null; customer_email: string | null; customer_phone: string | null;
  intake_id: string | null; stylist_id: string | null; kanban_stage: string; samples_besteld: boolean;
  opgevolgd_at: string | null; gesprek_gevoerd_at: string | null; archived_at: string | null;
  stylists: { name: string; meet_url: string | null } | null; services: { key: string } | null;
}
interface Commission { id: string; woo_order_id: string; amount: number; status: string; created_at: string }
type Fase = "voorbereiden" | "advies" | "afronden";
type Save = "idle" | "saving" | "saved" | "error";

const SEL = "id,start_at,end_at,created_at,status,customer_name,customer_email,customer_phone,intake_id,stylist_id,kanban_stage,samples_besteld,opgevolgd_at,gesprek_gevoerd_at,archived_at, stylists(name,meet_url), services(key)";
const TZ = "Europe/Amsterdam";
const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const time = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso)).replace(":", ".");
const day = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(new Date(iso));
const safeUrl = (v?: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);
const ROUTE_LABEL: Record<string, string> = { samples: "Sampleadvies", zelf: "Verfadvies (zelf bestellen)", roll: "Verfadvies met bestelvoorstel", offerte: "Bestelvoorstel" };
const STAGES = [["ingepland", "Ingepland"], ["advies", "Advies gegeven"], ["opvolging", "In opvolging"], ["verf", "Verf gekocht"], ["afgehaakt", "Afgehaakt"]] as const;
const FASES: { key: Fase; label: string }[] = [{ key: "voorbereiden", label: "Voorbereiden" }, { key: "advies", label: "Advies" }, { key: "afronden", label: "Afronden" }];

function afspraakLabel(b: Booking): string {
  if (b.status === "manual" || b.status === "paid_unplaced") return "Afspraak nog niet gepland";
  const d = new Date(b.start_at);
  const today = dayKey(new Date());
  if (dayKey(d) === today) return `Vandaag om ${time(b.start_at)}`;
  return `${d.getTime() < Date.now() ? "Gesprek was " : ""}${day(b.start_at)} om ${time(b.start_at)}`;
}
function betaalLabel(b: Booking): { t: string; tone: "ok" | "warn" | "muted" } {
  if (b.status === "manual") return { t: "Gratis advies", tone: "muted" };
  if (b.status === "paid_unplaced") return { t: "Betaling ontvangen · nog inplannen", tone: "warn" };
  return { t: "Betaling ontvangen", tone: "ok" };
}

function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => { window.removeEventListener("keydown", k); prev?.focus?.(); };
  }, [onClose]);
  return (
    <div role="dialog" aria-modal="true" aria-label={title} onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 70, background: "rgba(47,33,65,.35)", display: "flex", justifyContent: "flex-end" }}>
      <div ref={ref} tabIndex={-1} onClick={(e) => e.stopPropagation()} style={{ width: "min(460px, 100%)", height: "100%", background: "var(--rd-white, #fff)", overflowY: "auto", padding: "20px 22px", display: "flex", flexDirection: "column", gap: 14, outline: "none" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="kk-h2" style={{ margin: 0 }}>{title}</h2>
          <button className="rd-textlink" onClick={onClose}>Sluiten</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function NotesField({ intake, onSaved }: { intake: IntakeRow; onSaved: (v: string) => void }) {
  const initial = intake.advice_internal ?? intake.advisor_notes ?? "";
  const [v, setV] = useState(initial);
  const [state, setState] = useState<Save>("idle");
  const last = useRef(initial);
  const save = async () => {
    if (v === last.current) return;
    setState("saving");
    const { error } = await supabase.from("intake").update({ advice_internal: v.trim() || null, advisor_notes: v.trim() || null }).eq("id", intake.id);
    if (error) { setState("error"); return; }
    last.current = v; onSaved(v); setState("saved");
  };
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <span style={{ fontSize: 14 }}>Alleen voor jou en Roll: twijfels, afspraken, informatie voor de offerte. Deze notities gaan nooit naar de klant.</span>
      <textarea className="rd-input" value={v} onChange={(e) => { setV(e.target.value); setState("idle"); }} onBlur={save} style={{ minHeight: 220, paddingTop: 10, resize: "vertical", lineHeight: 1.5 }} />
      <span role="status" style={{ fontSize: 13, opacity: 0.75 }}>{state === "saving" ? "Opslaan..." : state === "saved" ? "Opgeslagen" : state === "error" ? "Opslaan mislukt · klik buiten het veld om het opnieuw te proberen" : "Slaat op zodra je het veld verlaat"}</span>
    </label>
  );
}

export function KlantKaart() {
  const { bookingId } = useParams();
  const [b, setB] = useState<Booking | null>(null);
  const [intake, setIntake] = useState<IntakeRow | null>(null);
  const [advice, setAdviceState] = useState<AdviceV2 | null>(null);
  const [save, setSave] = useState<Save>("idle");
  const [task, setTask] = useState<RollTask | null>(null);
  const [tasks, setTasks] = useState<FollowupTask[]>([]);
  const [sends, setSends] = useState<Sent[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [others, setOthers] = useState<{ id: string; start_at: string; stylists: { name: string } | null }[]>([]);
  const [orders, setOrders] = useState<OrdersResp | null>(null);
  const [drawer, setDrawer] = useState<null | "klant" | "historie" | "notities" | "taken">(null);
  const [meer, setMeer] = useState(false);
  const [loading, setLoading] = useState(true);
  const storeKey = `klantkaart:${bookingId}`;
  const [fase, setFaseState] = useState<Fase>(() => { try { return (JSON.parse(localStorage.getItem(`klantkaart:${bookingId}`) ?? "{}").fase as Fase) || "voorbereiden"; } catch { return "voorbereiden"; } });
  const remember = (p: Record<string, unknown>) => { try { const cur = JSON.parse(localStorage.getItem(storeKey) ?? "{}"); localStorage.setItem(storeKey, JSON.stringify({ ...cur, ...p })); } catch { /* opslag niet beschikbaar */ } };
  const setFase = (f: Fase) => { setFaseState(f); remember({ fase: f }); window.scrollTo({ top: 0 }); };

  const loadSends = useCallback(async (iid: string | null) => {
    if (!iid) return;
    const { data } = await supabase.from("advice_sends").select("id,route,subject,body,sent_to,sent_by,sent_at").eq("intake_id", iid).order("sent_at", { ascending: false });
    setSends((data as Sent[]) ?? []);
  }, []);
  const loadTasks = useCallback(async (bid: string) => {
    const { data } = await supabase.from("followup_tasks").select("id,action,owner,due_date,kind,outcome,note,done_at,created_at").eq("booking_id", bid).order("created_at", { ascending: true });
    setTasks((data as FollowupTask[]) ?? []);
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("bookings").select(SEL).eq("id", bookingId).maybeSingle();
      const cur = (data as unknown as Booking) ?? null;
      setB(cur);
      if (!cur) { setLoading(false); return; }
      const email = (cur.customer_email ?? "").trim().toLowerCase();
      const [it, rt, cm, ob] = await Promise.all([
        cur.intake_id ? supabase.from("intake").select("*").eq("id", cur.intake_id).maybeSingle() : Promise.resolve({ data: null }),
        supabase.from("roll_tasks").select("id,type,status,owner,due_date,payload,result,created_at,updated_at").eq("booking_id", cur.id).order("created_at", { ascending: false }).limit(1),
        email ? supabase.from("commissions").select("id,woo_order_id,amount,status,created_at").ilike("customer_email", email).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
        email ? supabase.from("bookings").select("id,start_at, stylists(name)").ilike("customer_email", email).neq("status", "cancelled").neq("id", cur.id).order("start_at", { ascending: false }) : Promise.resolve({ data: [] }),
      ]);
      const i = (it.data as IntakeRow) ?? null;
      setIntake(i);
      if (i) {
        // Onopgeslagen lokale invoer (bijv. na een verbroken verbinding) gaat voor.
        let local: AdviceV2 | null = null;
        try { const raw = localStorage.getItem(`advies-onopgeslagen:${i.id}`); local = raw ? JSON.parse(raw) : null; } catch { /* geen opslag */ }
        setAdviceState(local ?? initialAdvice(i));
        if (local) setSave("error");
      }
      setTask(((rt.data as RollTask[]) ?? [])[0] ?? null);
      setCommissions((cm.data as Commission[]) ?? []);
      setOthers((ob.data as unknown as typeof others) ?? []);
      await Promise.all([loadSends(cur.intake_id), loadTasks(cur.id)]);
      setLoading(false);
    })();
  }, [bookingId, loadSends, loadTasks]);

  // Automatisch opslaan, 800 ms na de laatste wijziging. Bij een fout blijft de invoer lokaal bewaard.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const intakeRef = useRef<IntakeRow | null>(null);
  const adviceRef = useRef<AdviceV2 | null>(null);
  useEffect(() => { adviceRef.current = advice; }, [advice]);
  useEffect(() => { intakeRef.current = intake; }, [intake]);
  const persist = useCallback(async (a: AdviceV2, cur: IntakeRow) => {
    setSave("saving");
    const d = derive(a, { sample: cur.advice_sample, verf: cur.advice_verf });
    const s = summarize(a);
    const outcome = s.bevestigd.length && !s.testen.length ? "color_chosen" : s.testen.length ? "samples_needed" : cur.advisor_outcome;
    const next = { ...a, updated_at: new Date().toISOString() };
    const patch = { advice_v2: next, advice_sample: d.advice_sample, advice_verf: d.advice_verf, ...(d.advisor_advice.length ? { advisor_advice: d.advisor_advice } : {}), advisor_summary: a.message.trim() || null, advisor_outcome: outcome, advisor_updated_at: next.updated_at };
    const { error } = await supabase.from("intake").update(patch).eq("id", cur.id);
    if (error) { try { localStorage.setItem(`advies-onopgeslagen:${cur.id}`, JSON.stringify(a)); } catch { /* geen opslag */ } setSave("error"); return; }
    try { localStorage.removeItem(`advies-onopgeslagen:${cur.id}`); } catch { /* geen opslag */ }
    setIntake((i) => (i ? { ...i, ...patch } as IntakeRow : i));
    setSave("saved");
  }, []);
  const setAdvice = useCallback((fn: (a: AdviceV2) => AdviceV2) => {
    setAdviceState((prev) => (prev ? fn(prev) : prev));
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => { if (intakeRef.current && adviceRef.current) persist(adviceRef.current, intakeRef.current); }, 800);
  }, [persist]);
  const retry = () => { if (advice && intake) persist(advice, intake); };
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (save === "saving" || save === "error") { e.preventDefault(); } };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [save]);

  const patchBooking = async (jsonPatch: Record<string, unknown>, local: Partial<Booking>) => {
    if (!b) return;
    setB({ ...b, ...local });
    await supabase.rpc("kanban_update", { p_booking_id: b.id, p_patch: jsonPatch });
  };
  const archive = async (on: boolean) => {
    if (!b) return;
    const { error } = await supabase.rpc("dossier_archive", { p_booking_id: b.id, p_intake_id: null, p_archive: on });
    if (!error) setB({ ...b, archived_at: on ? new Date().toISOString() : null });
    setMeer(false);
  };

  const next = useMemo(() => {
    if (!b) return null;
    const sent = new Set(sends.map((x) => x.route));
    if (!intake) return { t: "Wacht op de intake van de klant", f: "voorbereiden" as Fase };
    if (task && (task.status === "aangevraagd" || task.status === "opgepakt")) return { t: task.owner ? `Roll pakt dit op: ${task.owner}` : "Bij Roll, nog geen eigenaar", f: "afronden" as Fase };
    if (!b.gesprek_gevoerd_at && new Date(b.start_at).getTime() > Date.now() && b.status !== "manual") return { t: "Bereid het gesprek voor", f: "voorbereiden" as Fase };
    if (intake.offer_status === "besteld") return { t: "Besteld. Het traject is rond", f: "afronden" as Fase };
    if (intake.offer_status === "verstuurd") return { t: "Advies en offerte verstuurd · wacht op de bestelling", f: "afronden" as Fase };
    const vl = ((intake.offer_meta as { offer?: { vlakken?: { status?: string }[] } } | null)?.offer?.vlakken ?? []);
    const testen = vl.some((v) => v.status === "testen");
    if (!intake.offer_meta?.id) return { t: "Leg het advies vast: per oppervlak bevestigd of eerst testen", f: "advies" as Fase };
    if (testen && !sent.has("samples")) return { t: "Verstuur het sampleadvies", f: "afronden" as Fase };
    if (testen) return { t: "Check-in: kies per oppervlak de winnende kleur", f: "afronden" as Fase };
    if (!sent.has("roll") && !sent.has("zelf")) return { t: "Verstuur advies en offerte", f: "afronden" as Fase };
    return { t: "Rond het advies af", f: "afronden" as Fase };
  }, [b, intake, sends, task]);

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (!b) return <div><Link to="/beheer/gesprekken" className="rd-textlink">← Adviesgesprekken</Link><p className="rd-sub">Deze klant is niet gevonden.</p></div>;

  const name = b.customer_name || intake?.contact_name || "Klant";
  const email = b.customer_email || intake?.contact_email || null;
  const meet = safeUrl(b.stylists?.meet_url);
  const upcoming = b.status !== "manual" && new Date(b.start_at).getTime() > Date.now() - 60 * 60000;
  const pay = betaalLabel(b);
  const samplesBefore = b.services?.key === "post_sample" || (!!intake?.has_samples && intake.has_samples !== "nee");
  const openItems = nogBespreken(intake, advice);
  const openTasks = tasks.filter((t) => !t.done_at).length + (task && task.status !== "afgerond" ? 1 : 0);

  return (
    <div className="kk">
      <style>{`
        .kk{max-width:1180px;padding-bottom:96px;color:var(--rd-aubergine)}
        .kk-label{font-size:13px;font-weight:700;color:rgba(47,33,65,.62)}
        .kk-h2{font-size:19px;font-weight:800;margin:0 0 8px;text-wrap:balance}
        .kk-main{display:flex;flex-direction:column;gap:20px;min-width:0}
        .kk-two{display:grid;grid-template-columns:minmax(0,1fr) 320px;gap:32px;align-items:start}
        .kk-grid{display:grid;grid-template-columns:200px minmax(0,1fr) 300px;gap:24px;align-items:start}
        .kk-context{display:flex;flex-direction:column;gap:10px;padding:16px;border-radius:16px;background:var(--rd-grey-light);position:sticky;top:16px}
        .kk-surface{display:flex;flex-direction:column;gap:12px;padding:16px 0;border-top:1px solid var(--rd-line)}
        .kk-card{display:flex;flex-direction:column;gap:12px;padding:20px;border-radius:18px;background:#fff;border:1px solid var(--rd-line)}
        .kk-row{display:grid;grid-template-columns:150px minmax(0,1fr);gap:12px;font-size:15px;line-height:1.5;padding-top:12px;border-top:1px solid var(--rd-line)}
        .kk-tabs{display:flex;gap:4px;padding:4px;border-radius:14px;background:var(--rd-grey-light);width:max-content;max-width:100%;overflow-x:auto}
        .kk-tab{border:0;background:transparent;font:inherit;font-weight:700;font-size:15px;color:var(--rd-aubergine);padding:10px 18px;border-radius:11px;cursor:pointer;min-height:44px;white-space:nowrap}
        .kk-tab[aria-selected="true"]{background:#fff;box-shadow:0 1px 3px rgba(47,33,65,.12)}
        .kk-tab:focus-visible,.kk button:focus-visible,.kk a:focus-visible{outline:2px solid var(--rd-pink-dark);outline-offset:2px}
        .kk-bar{position:fixed;left:0;right:0;bottom:0;z-index:40;background:rgba(255,255,255,.96);border-top:1px solid var(--rd-line);backdrop-filter:blur(6px)}
        .kk-bar-in{max-width:1180px;margin:0 auto;padding:12px 16px;display:flex;justify-content:space-between;align-items:center;gap:12px}
        .kk-link{background:none;border:0;font:inherit;font-size:14px;font-weight:700;color:var(--rd-aubergine);cursor:pointer;padding:8px 4px;min-height:40px;text-decoration:underline;text-underline-offset:3px;text-decoration-color:rgba(47,33,65,.3)}
        @media (max-width:980px){.kk-grid{grid-template-columns:1fr}.kk-two{grid-template-columns:1fr}.kk-context{position:static}}
        @media (max-width:560px){.kk-row{grid-template-columns:1fr;gap:2px}}
      `}</style>

      <Link to="/beheer/gesprekken" className="rd-textlink" style={{ textDecoration: "none", fontSize: 14 }}>← Adviesgesprekken</Link>

      {/* Klantkop */}
      <header style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="rd-h2" style={{ margin: 0 }}>{name}</h1>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center", fontSize: 15, marginTop: 4 }}>
              <span style={{ fontWeight: 700 }}>{afspraakLabel(b)}</span>
              <span style={{ opacity: 0.5 }}>·</span>
              <span>{b.stylists?.name ?? "Nog geen styliste"}</span>
              <span className="rd-chip" style={{ fontWeight: 700, ...(pay.tone === "ok" ? { background: "#C9E6CE", color: "#1e4429" } : pay.tone === "warn" ? { background: "var(--rd-pink)", color: "var(--rd-aubergine)" } : {}) }}>{pay.t}</span>
              {b.gesprek_gevoerd_at && <span className="rd-chip">Gesprek gevoerd {formatDate(b.gesprek_gevoerd_at)}</span>}
              {b.archived_at && <span className="rd-chip">Gearchiveerd</span>}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center", position: "relative" }}>
            <button className="kk-link" onClick={() => setDrawer("klant")}>Klantgegevens</button>
            <button className="kk-link" onClick={() => setDrawer("historie")}>Historie</button>
            <button className="kk-link" onClick={() => setDrawer("notities")}>Notities</button>
            <button className="kk-link" onClick={() => setDrawer("taken")}>Taken{openTasks ? ` (${openTasks})` : ""}</button>
            <button className="kk-link" aria-expanded={meer} onClick={() => setMeer((v) => !v)}>Meer</button>
            {meer && (
              <div role="menu" style={{ position: "absolute", right: 0, top: "100%", zIndex: 30, background: "#fff", border: "1px solid var(--rd-line)", borderRadius: 14, boxShadow: "0 10px 30px rgba(47,33,65,.14)", padding: 12, display: "flex", flexDirection: "column", gap: 8, minWidth: 250 }}>
                <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  <span className="kk-label">Fase op het bord</span>
                  <select className="rd-input" value={b.kanban_stage} onChange={(e) => patchBooking({ kanban_stage: e.target.value }, { kanban_stage: e.target.value })} style={{ height: 40 }}>
                    {STAGES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                  </select>
                </label>
                {b.gesprek_gevoerd_at
                  ? <button className="kk-link" style={{ textAlign: "left" }} onClick={() => { patchBooking({ gesprek_gevoerd: false }, { gesprek_gevoerd_at: null }); setMeer(false); }}>Gesprek gevoerd ongedaan maken</button>
                  : <button className="kk-link" style={{ textAlign: "left" }} onClick={() => { patchBooking({ gesprek_gevoerd: true }, { gesprek_gevoerd_at: new Date().toISOString() }); setMeer(false); }}>Markeer gesprek als gevoerd</button>}
                <button className="kk-link" style={{ textAlign: "left" }} onClick={() => archive(!b.archived_at)}>{b.archived_at ? "Terugzetten uit het archief" : "Archiveren"}</button>
                <Link to={`/beheer/gesprek-oud/${b.id}`} className="kk-link" style={{ textAlign: "left" }}>Oude weergave openen</Link>
              </div>
            )}
          </div>
        </div>

        {next && (
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", padding: "12px 16px", borderRadius: 14, background: "var(--rd-lavender)" }}>
            <span style={{ fontSize: 15 }}><strong>Volgende stap:</strong> {next.t}</span>
            {next.f !== fase && <button className="kk-link" onClick={() => setFase(next.f)}>Ga naar {FASES.find((f) => f.key === next.f)?.label.toLowerCase()}</button>}
            {!b.gesprek_gevoerd_at && b.status !== "manual" && new Date(b.start_at).getTime() < Date.now() && (
              <button className="kk-link" onClick={() => patchBooking({ gesprek_gevoerd: true }, { gesprek_gevoerd_at: new Date().toISOString() })}>Markeer gesprek als gevoerd</button>
            )}
          </div>
        )}

        <div role="tablist" aria-label="Werkfases" className="kk-tabs">
          {FASES.map((f) => (
            <button key={f.key} role="tab" aria-selected={fase === f.key} className="kk-tab" onClick={() => setFase(f.key)}>{f.label}</button>
          ))}
        </div>
      </header>

      {/* Werkvlak */}
      <main style={{ marginTop: 22 }}>
        {fase === "voorbereiden" && (
          <Voorbereiden intake={intake} advice={advice} email={email} samplesBefore={samplesBefore} samplesAfter={b.samples_besteld}
            onIntake={(i) => setIntake(i)} onOrders={setOrders} />
        )}
        {fase === "advies" && (intake && advice ? (
          <OfferteEditor intake={intake} bookingId={b.id} modus="advies" onIntake={(p) => setIntake((cur) => (cur ? { ...cur, ...p } : cur))} />
        ) : <p className="rd-sub">Zonder intake kun je het advies nog niet vastleggen.</p>)}
        {fase === "afronden" && (intake && advice ? (
          <Afronden intake={intake} message={advice.message} setMessage={(v) => setAdvice((a) => ({ ...a, message: v }))} bookingId={b.id} stylistId={b.stylist_id} stylistName={b.stylists?.name ?? ""}
            customerName={name} customerEmail={email} task={task} sends={sends}
            onIntake={(p) => setIntake((cur) => (cur ? { ...cur, ...p } : cur))} onTask={setTask}
            onSent={() => { loadSends(b.intake_id); loadTasks(b.id); }} onEditOffer={() => setFase("advies")} />
        ) : <p className="rd-sub">Zonder intake kun je nog niet afronden.</p>)}
      </main>

      {/* Actiebalk: opslagstatus links, één hoofdactie rechts */}
      <div className="kk-bar">
        <div className="kk-bar-in">
          <span role="status" style={{ fontSize: 14, display: "flex", gap: 8, alignItems: "center" }}>
            {save === "saving" && "Opslaan..."}
            {save === "saved" && "Opgeslagen"}
            {save === "error" && <>Opslaan mislukt · <button className="kk-link" onClick={retry}>Probeer opnieuw</button></>}
            {save === "idle" && fase === "voorbereiden" && (openItems.length ? `${openItems.length} punt${openItems.length === 1 ? "" : "en"} om te bespreken` : "Klaar voor het gesprek")}
          </span>
          <span style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {fase === "voorbereiden" && upcoming && meet && <a href={meet} target="_blank" rel="noreferrer" className="kk-link">Open videogesprek</a>}
            {fase === "voorbereiden" && <button className="rd-btn rd-btn-primary" onClick={() => setFase("advies")} disabled={!intake} style={{ width: "auto", padding: "0 24px", minHeight: 44 }}>Start advies</button>}
            {fase === "advies" && <button className="rd-btn rd-btn-primary" onClick={() => setFase("afronden")} style={{ width: "auto", padding: "0 24px", minHeight: 44 }}>Naar afronden</button>}
          </span>
        </div>
      </div>

      {/* Zijpanelen */}
      {drawer === "klant" && (
        <Drawer title="Klantgegevens" onClose={() => setDrawer(null)}>
          <div style={{ fontSize: 15, lineHeight: 1.7 }}>
            <div><strong>{name}</strong></div>
            {email && <div><a href={`mailto:${email}`} className="rd-textlink">{email}</a></div>}
            {b.customer_phone && <div><a href={`tel:${b.customer_phone}`} className="rd-textlink">{b.customer_phone}</a></div>}
          </div>
          <div style={{ fontSize: 14 }}><span className="kk-label">Afspraak</span><div>{afspraakLabel(b)} · {b.stylists?.name ?? "nog geen styliste"}</div><div>{pay.t}</div></div>
          {intake && <Link to={`/beheer/${intake.id}`} className="rd-textlink">Bekijk volledige intake</Link>}
          {orders && <div style={{ fontSize: 14 }}><span className="kk-label">Aankopen</span><div>{orders.order_count} bestelling{orders.order_count === 1 ? "" : "en"} · {euro(orders.total_spent)} · {orders.sample_items} samples</div></div>}
          {others.length > 0 && (
            <div style={{ fontSize: 14 }}><span className="kk-label">Andere gesprekken</span>
              {others.map((o) => <div key={o.id}><Link to={`/beheer/gesprek/${o.id}`} className="rd-textlink">{formatDate(o.start_at)} · {o.stylists?.name ?? "styliste onbekend"}</Link></div>)}
            </div>
          )}
        </Drawer>
      )}
      {drawer === "historie" && (
        <Drawer title="Historie" onClose={() => setDrawer(null)}>
          {sends.length === 0 && !intake?.offer_sent_at && commissions.length === 0 ? <p className="rd-sub">Er is nog niets verstuurd.</p> : null}
          {sends.map((s) => (
            <details key={s.id} style={{ fontSize: 14, borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
              <summary style={{ cursor: "pointer", minHeight: 32 }}><strong>{ROUTE_LABEL[s.route] ?? s.route}</strong> · verstuurd {formatDate(s.sent_at)}{s.sent_by ? ` door ${s.sent_by}` : ""}</summary>
              <div style={{ marginTop: 6, padding: "10px 12px", background: "var(--rd-grey-light)", borderRadius: 10, whiteSpace: "pre-wrap", lineHeight: 1.5 }}><strong>{s.subject}</strong>{"\n\n"}{s.body}</div>
            </details>
          ))}
          {commissions.length > 0 && (
            <div style={{ fontSize: 14, borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
              <span className="kk-label">Bestellingen met commissie</span>
              {commissions.map((c) => <div key={c.id}>#{c.woo_order_id} · {formatDate(c.created_at)} · commissie {euro(Number(c.amount))}</div>)}
            </div>
          )}
        </Drawer>
      )}
      {drawer === "notities" && intake && (
        <Drawer title="Interne notities" onClose={() => setDrawer(null)}>
          <NotesField intake={intake} onSaved={(v) => setIntake({ ...intake, advice_internal: v, advisor_notes: v })} />
        </Drawer>
      )}
      {drawer === "taken" && (
        <Drawer title="Taken en opvolging" onClose={() => setDrawer(null)}>
          {task && <RollTaskStatus task={task} />}
          <FollowupTasks bookingId={b.id} stylistId={b.stylist_id} tasks={tasks} onChange={(t) => { setTasks(t); if (t.some((x) => x.done_at) && !b.opgevolgd_at) patchBooking({ opgevolgd: true }, { opgevolgd_at: new Date().toISOString() }); }} />
          {intake && (sends.some((s) => s.route === "samples") || intake.sample_checkin) && (
            <div style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 12 }}>
              <span className="kk-label">Check-in samples</span>
              <SampleCheckin intake={intake} tasks={tasks} startEditing={false} onSaved={(p) => { setIntake({ ...intake, ...p }); loadTasks(b.id); }} />
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
