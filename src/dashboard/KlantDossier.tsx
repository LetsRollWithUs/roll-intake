import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CustomerPurchases, euro } from "./CustomerPurchases";
import { StatusPill, formatDate } from "./ui";
import { OUTCOMES } from "./outcome";
import type { IntakeRow } from "./types";

interface Booking {
  id: string;
  start_at: string;
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
  stylists: { name: string } | null;
}
interface Commission { id: string; woo_order_id: string; route: string; verf_excl: number; amount: number; status: string; created_at: string }

const STAGES: { key: string; label: string }[] = [
  { key: "ingepland", label: "Ingepland" },
  { key: "advies", label: "Advies gegeven" },
  { key: "opvolging", label: "In opvolging" },
  { key: "verf", label: "Verf gekocht" },
  { key: "afgehaakt", label: "Afgehaakt" },
];
const stageLabel = (k: string) => STAGES.find((s) => s.key === k)?.label ?? k;
const COMM_STATUS: Record<string, string> = { te_controleren: "Te controleren", uitbetaalbaar: "Te factureren", uitbetaald: "Uitbetaald", vervallen: "Vervallen" };
const TZ = "Europe/Amsterdam";
const fmtLong = (iso: string) =>
  new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rd-card-white" style={{ marginTop: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10, gap: 10 }}>
        <div className="rd-kicker rd-kicker-pink">{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KlantDossier() {
  const { bookingId } = useParams();
  const [current, setCurrent] = useState<Booking | null>(null);
  const [gesprekken, setGesprekken] = useState<Booking[]>([]);
  const [intakes, setIntakes] = useState<IntakeRow[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const SEL = "id,start_at,status,customer_name,customer_email,customer_phone,intake_id,stylist_id,kanban_stage,samples_besteld,opgevolgd_at,upsell_offered,upsell_booked,upsell_value, stylists(name)";

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: b } = await supabase.from("bookings").select(SEL).eq("id", bookingId).maybeSingle();
      if (!b) { setNotFound(true); setLoading(false); return; }
      const cur = b as unknown as Booking;
      setCurrent(cur);
      const email = (cur.customer_email ?? "").trim().toLowerCase();
      // Alle gesprekken van deze klant (ook toekomstige of herhaalde adviezen). RLS scoopt voor de styliste.
      const { data: all } = email
        ? await supabase.from("bookings").select(SEL).ilike("customer_email", email).neq("status", "cancelled").order("start_at", { ascending: false })
        : { data: [cur] };
      const list = ((all as unknown as Booking[]) ?? [cur]);
      setGesprekken(list);
      const ids = list.map((g) => g.intake_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: its } = await supabase.from("intake").select("*").in("id", ids).order("created_at", { ascending: false });
        setIntakes((its as IntakeRow[]) ?? []);
      }
      if (email) {
        const { data: cm } = await supabase.from("commissions").select("id,woo_order_id,route,verf_excl,amount,status,created_at").ilike("customer_email", email).order("created_at", { ascending: false });
        setCommissions((cm as Commission[]) ?? []);
      }
      setLoading(false);
    })();
  }, [bookingId]);

  const patch = async (jsonPatch: Record<string, unknown>, local: Partial<Booking>) => {
    if (!current) return;
    setCurrent({ ...current, ...local });
    setGesprekken((prev) => prev.map((g) => (g.id === current.id ? { ...g, ...local } : g)));
    await supabase.rpc("kanban_update", { p_booking_id: current.id, p_patch: jsonPatch });
  };

  // Intake die bij het huidige gesprek hoort, anders de meest recente.
  const intake = useMemo(
    () => intakes.find((i) => i.id === current?.intake_id) ?? intakes[0] ?? null,
    [intakes, current],
  );

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (notFound || !current) {
    return (
      <div>
        <Link to="/beheer/gesprekken" className="rd-textlink">← Adviesgesprekken</Link>
        <p className="rd-sub">Gesprek niet gevonden.</p>
      </div>
    );
  }

  const name = current.customer_name || intake?.contact_name || "Klant";
  const email = current.customer_email || intake?.contact_email || null;
  const outcomeLabel = OUTCOMES.find((o) => o.key === intake?.advisor_outcome)?.label;
  const advice = (intake?.advisor_advice ?? []).filter((a) => a.room || a.color);
  const totalCommission = commissions.filter((c) => c.status !== "vervallen").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div style={{ maxWidth: 880 }}>
      <Link to="/beheer/gesprekken" className="rd-textlink" style={{ textDecoration: "none" }}>← Adviesgesprekken</Link>

      {/* Klantkop */}
      <div className="rd-card-white" style={{ marginTop: 8, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 56, height: 56, borderRadius: 99, background: "var(--rd-lavender)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 19, flex: "none" }}>
          {initials(name)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h1 className="rd-h2" style={{ margin: 0 }}>{name}</h1>
          <div style={{ fontSize: 14, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {email && <a href={`mailto:${email}`} style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{email}</a>}
            {current.customer_phone && <a href={`tel:${current.customer_phone}`} style={{ color: "var(--rd-aubergine)", fontWeight: 600 }}>{current.customer_phone}</a>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>
            Styliste: {current.stylists?.name ?? "—"} · {gesprekken.length} gesprek{gesprekken.length === 1 ? "" : "ken"}
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-end" }}>
          <span className="rd-chip" style={{ background: "var(--rd-aubergine)", color: "#fff", fontWeight: 700 }}>{stageLabel(current.kanban_stage)}</span>
          {intake && <StatusPill status={intake.advisor_status} />}
        </div>
      </div>

      {/* Traject: fase + acties voor dit gesprek */}
      <Section title="Traject van dit gesprek">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <select className="rd-input" value={current.kanban_stage} onChange={(e) => patch({ kanban_stage: e.target.value }, { kanban_stage: e.target.value })} style={{ height: 40, flex: "0 1 220px" }}>
            {STAGES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={current.samples_besteld} onChange={(e) => patch({ samples_besteld: e.target.checked }, { samples_besteld: e.target.checked })} /> Samples besteld
          </label>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={!!current.opgevolgd_at} onChange={(e) => patch({ opgevolgd: e.target.checked }, { opgevolgd_at: e.target.checked ? new Date().toISOString() : null })} /> Opgevolgd
          </label>
          <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
            <input type="checkbox" checked={current.upsell_offered} onChange={(e) => patch({ upsell_offered: e.target.checked }, { upsell_offered: e.target.checked })} /> Uitgebreid advies aangeboden
          </label>
          {current.upsell_offered && (
            <>
              <label style={{ fontSize: 14, display: "flex", gap: 6, alignItems: "center" }}>
                <input type="checkbox" checked={current.upsell_booked} onChange={(e) => patch({ upsell_booked: e.target.checked }, { upsell_booked: e.target.checked })} /> Geboekt
              </label>
              {current.upsell_booked && (
                <input className="rd-input" inputMode="decimal" placeholder="Opdracht €" defaultValue={current.upsell_value ?? ""} onBlur={(e) => patch({ upsell_value: e.target.value }, { upsell_value: e.target.value ? Number(e.target.value) : null })} style={{ height: 36, width: 120 }} />
              )}
            </>
          )}
        </div>
      </Section>

      {/* Gesprekken (alle, ook toekomstige) */}
      <Section title="Gesprekken">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gesprekken.map((g) => {
            const isCur = g.id === current.id;
            return (
              <div key={g.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "8px 10px", borderRadius: 12, background: isCur ? "var(--rd-grey-light)" : "transparent", border: "1px solid var(--rd-line)" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>
                    {fmtLong(g.start_at)}
                    {new Date(g.start_at).getTime() > Date.now() && <span className="rd-chip" style={{ marginLeft: 8, fontSize: 11 }}>komend</span>}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{g.stylists?.name ?? "—"} · {stageLabel(g.kanban_stage)}{g.status === "paid_unplaced" ? " · nog inplannen" : ""}</div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {!isCur && <Link to={`/beheer/klant/${g.id}`} className="rd-textlink" style={{ fontSize: 13 }}>Open</Link>}
                  {g.intake_id && <Link to={`/beheer/${g.intake_id}`} className="rd-textlink" style={{ fontSize: 13 }}>Intake &amp; advies</Link>}
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* Intake */}
      <Section title="Intake" action={intake && <Link to={`/beheer/${intake.id}`} className="rd-textlink" style={{ fontSize: 13 }}>Volledige intake</Link>}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Nog geen intake ingevuld.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontSize: 14 }}>
            <div><span style={{ opacity: 0.6 }}>Vraag:</span> {intake.main_question || <span style={{ opacity: 0.5 }}>niet ingevuld</span>}</div>
            {(intake.rooms?.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {intake.rooms!.map((r) => <span key={r.id} className="rd-chip">{r.label}</span>)}
              </div>
            )}
            {(intake.help_needs?.length ?? 0) > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {intake.help_needs!.map((h) => <span key={h} className="rd-chip" style={{ background: "var(--rd-grey-light)" }}>{h}</span>)}
              </div>
            )}
            <div style={{ fontSize: 12, opacity: 0.55 }}>Ingevuld {formatDate(intake.created_at)}</div>
          </div>
        )}
      </Section>

      {/* Samenvatting & advies */}
      <Section title="Samenvatting & advies" action={intake && <Link to={`/beheer/${intake.id}`} className="rd-textlink" style={{ fontSize: 13 }}>Bewerken</Link>}>
        {!intake ? (
          <p className="rd-sub" style={{ margin: 0 }}>Beschikbaar zodra er een intake is.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 14 }}>
            {outcomeLabel && <span className="rd-chip" style={{ alignSelf: "flex-start", background: "var(--rd-aubergine)", color: "#fff" }}>{outcomeLabel}</span>}
            {intake.advisor_summary ? (
              <p style={{ margin: 0, whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{intake.advisor_summary}</p>
            ) : (
              <p className="rd-sub" style={{ margin: 0 }}>Nog geen gesprekssamenvatting.</p>
            )}
            {advice.length > 0 && (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {advice.map((a, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
                    <strong>{a.room || "Ruimte"}</strong>
                    <span>{a.color || "—"}</span>
                    <span style={{ opacity: 0.7 }}>{a.product}{a.m2 ? ` · ${a.m2} m²` : ""}{a.liters ? ` · ${a.liters} L` : ""}</span>
                  </div>
                ))}
              </div>
            )}
            {intake.advisor_followup_sent_at && <div style={{ fontSize: 12, opacity: 0.55 }}>Opvolgmail verstuurd {formatDate(intake.advisor_followup_sent_at)}</div>}
          </div>
        )}
      </Section>

      {/* Offerte */}
      <Section title="Offerte" action={<a href="https://roll.nl/offerte" target="_blank" rel="noreferrer" className="rd-textlink" style={{ fontSize: 13 }}>Offerte maken ↗</a>}>
        {intake?.advisor_offer_url ? (
          <a href={intake.advisor_offer_url} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14, wordBreak: "break-all" }}>{intake.advisor_offer_url}</a>
        ) : (
          <p className="rd-sub" style={{ margin: 0 }}>Nog geen offerte-link. Vul die in bij de intake zodra de offerte staat.</p>
        )}
        {intake?.advisor_offer_notes && <p style={{ fontSize: 13, opacity: 0.8, marginTop: 8, whiteSpace: "pre-wrap" }}>{intake.advisor_offer_notes}</p>}
      </Section>

      {/* Samples & aankopen (Woo) */}
      <CustomerPurchases email={email} />

      {/* Commissie */}
      <Section title="Commissie">
        {commissions.length === 0 ? (
          <p className="rd-sub" style={{ margin: 0 }}>Nog geen toegeschreven verfbestelling.</p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {commissions.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, borderTop: "1px solid var(--rd-line)", paddingTop: 6 }}>
                <span>#{c.woo_order_id} · verf {euro(c.verf_excl)} · {formatDate(c.created_at)}</span>
                <span><strong>{euro(c.amount)}</strong> <span style={{ opacity: 0.6 }}>· {COMM_STATUS[c.status] ?? c.status}</span></span>
              </div>
            ))}
            <div style={{ textAlign: "right", fontWeight: 700, marginTop: 4 }}>Totaal {euro(totalCommission)}</div>
          </div>
        )}
      </Section>
    </div>
  );
}
