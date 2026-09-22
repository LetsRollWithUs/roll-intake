import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { SURFACES, SUN_MOMENTS, USAGE_TIMES, PLANNING, PAINTERS, MOODS } from "@/data/intake-options";
import { CustomerPurchases, euro } from "./CustomerPurchases";
import { formatDate } from "./ui";
import { nextAction, type Phase } from "./nextAction";
import { deriveExpected, leadScore, TEMP_LABEL } from "./lead";
import { AdviceEditor } from "./AdviceEditor";
import type { IntakeRow } from "./types";

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
    <details id={id} open={open} className="rd-card-white" style={{ marginTop: 12, padding: 0, overflow: "hidden" }}>
      <summary style={{ listStyle: "none", cursor: "pointer", padding: "14px 18px", display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
        <span className="rd-kicker rd-kicker-pink">{title}</span>
        {hint && <span style={{ fontSize: 12, opacity: 0.6 }}>{hint}</span>}
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
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("bookings").select(SEL).eq("id", bookingId).maybeSingle();
      const cur = (data as unknown as Booking) ?? null;
      setB(cur);
      if (!cur) { setLoading(false); return; }
      const email = (cur.customer_email ?? "").trim().toLowerCase();
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
  }) : null), [b, intake]);

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

  return (
    <div style={{ maxWidth: 900 }}>
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
        <div style={{ marginTop: 12 }}>
          <CustomerPurchases email={email} title="Eerdere samples & aankopen (WooCommerce)" />
        </div>
      </Panel>

      {/* 2 GESPREK & ADVIES */}
      <Panel id="gesprek" title="Gesprek & advies" hint="door de styliste vastgelegd" open={openPanel(["gesprek", "versturen"])}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Zonder intake kun je het advies nog niet vastleggen. Vraag de klant de intake in te vullen.</p>
        ) : (
          <AdviceEditor
            key={intake.id}
            intake={intake}
            bookingId={b.id}
            customerName={name}
            stylistName={b.stylists?.name ?? ""}
            roomLabels={rooms.map((r) => r.label)}
            onChange={(p) => { setIntake({ ...intake, ...p }); if (p.advisor_followup_sent_at) reloadSends(); }}
          />
        )}
      </Panel>

      {/* 3 VERSTUREN & OVERDRAGEN */}
      <Panel id="versturen" title="Versturen & overdragen" hint="klantmail en hulp van Roll" open={openPanel(["versturen"])}>
        {!intake ? <p className="rd-sub" style={{ margin: 0 }}>Beschikbaar zodra er een intake en advies is.</p> : (
          <div>
            <Kv k="Vervolgrichting">{intake.followup_route ? <strong>{ROUTE_LABEL[intake.followup_route]}</strong> : <span style={{ opacity: 0.6 }}>Nog niet gekozen (bij Gesprek &amp; advies)</span>}</Kv>
            <Kv k="Adviesverslag">
              {sends.length === 0 ? (
                <span style={{ opacity: 0.6 }}>Nog niet verstuurd. Versturen doe je via "Klantmail bekijken" bij Gesprek &amp; advies.</span>
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
            <p className="rd-sub" style={{ margin: "10px 0 0", fontSize: 13 }}>Fase 3: "Hulp van Roll aanvragen" met afmetingen en kleuren; Roll maakt dan de offerte.</p>
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
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={!!b.opgevolgd_at} onChange={(e) => patch({ opgevolgd: e.target.checked }, { opgevolgd_at: e.target.checked ? new Date().toISOString() : null })} /> Opgevolgd</label>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={b.upsell_offered} onChange={(e) => patch({ upsell_offered: e.target.checked }, { upsell_offered: e.target.checked })} /> Uitgebreid advies aangeboden</label>
          {b.upsell_offered && <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" checked={b.upsell_booked} onChange={(e) => patch({ upsell_booked: e.target.checked }, { upsell_booked: e.target.checked })} /> Geboekt</label>}
          {b.upsell_booked && <input className="rd-input" inputMode="decimal" placeholder="Opdracht €" defaultValue={b.upsell_value ?? ""} onBlur={(e) => patch({ upsell_value: e.target.value }, { upsell_value: e.target.value ? Number(e.target.value) : null })} style={{ height: 36, width: 120 }} />}
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
