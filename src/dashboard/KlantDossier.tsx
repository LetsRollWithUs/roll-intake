import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { CustomerPurchases, euro } from "./CustomerPurchases";
import { formatDate } from "./ui";

// Klantkaart: alleen klantgegevens, alle gesprekken, aankopen, commissie en contacthistorie.
// Werken doe je op de gesprekspagina ("Open gesprek").
interface Booking {
  id: string;
  start_at: string;
  status: string;
  customer_name: string | null;
  customer_email: string | null;
  customer_phone: string | null;
  intake_id: string | null;
  kanban_stage: string;
  stylists: { name: string } | null;
}
interface Commission { id: string; woo_order_id: string; verf_excl: number; amount: number; status: string; created_at: string }
interface Sent { id: string; advisor_followup_sent_at: string | null; advisor_outcome: string | null }

const SEL = "id,start_at,status,customer_name,customer_email,customer_phone,intake_id,kanban_stage, stylists(name)";
const STAGE: Record<string, string> = { ingepland: "Ingepland", advies: "Advies gegeven", opvolging: "In opvolging", verf: "Verf gekocht", afgehaakt: "Afgehaakt" };
const COMM_STATUS: Record<string, string> = { te_controleren: "Te controleren", uitbetaalbaar: "Te factureren", uitbetaald: "Gefactureerd", vervallen: "Vervallen" };
const TZ = "Europe/Amsterdam";
const fmtLong = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const initials = (name: string) => { const p = name.trim().split(/\s+/).filter(Boolean); return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "?"; };

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="rd-card-white" style={{ marginTop: 12 }}><div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>{title}</div>{children}</div>;
}

export function KlantDossier() {
  const { bookingId } = useParams();
  const [current, setCurrent] = useState<Booking | null>(null);
  const [gesprekken, setGesprekken] = useState<Booking[]>([]);
  const [commissions, setCommissions] = useState<Commission[]>([]);
  const [sent, setSent] = useState<Sent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: b } = await supabase.from("bookings").select(SEL).eq("id", bookingId).maybeSingle();
      const cur = (b as unknown as Booking) ?? null;
      setCurrent(cur);
      if (!cur) { setLoading(false); return; }
      const email = (cur.customer_email ?? "").trim().toLowerCase();
      const { data: all } = email
        ? await supabase.from("bookings").select(SEL).ilike("customer_email", email).neq("status", "cancelled").order("start_at", { ascending: false })
        : { data: [cur] };
      const list = ((all as unknown as Booking[]) ?? [cur]);
      setGesprekken(list);
      const ids = list.map((g) => g.intake_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: its } = await supabase.from("intake").select("id,advisor_followup_sent_at,advisor_outcome").in("id", ids);
        setSent(((its as Sent[]) ?? []).filter((i) => i.advisor_followup_sent_at));
      }
      if (email) {
        const { data: cm } = await supabase.from("commissions").select("id,woo_order_id,verf_excl,amount,status,created_at").ilike("customer_email", email).order("created_at", { ascending: false });
        setCommissions((cm as Commission[]) ?? []);
      }
      setLoading(false);
    })();
  }, [bookingId]);

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (!current) return <div><Link to="/beheer/gesprekken" className="rd-textlink">← Adviesgesprekken</Link><p className="rd-sub">Klant niet gevonden.</p></div>;

  const name = current.customer_name || "Klant";
  const email = current.customer_email;
  const total = commissions.filter((c) => c.status !== "vervallen").reduce((s, c) => s + Number(c.amount), 0);

  return (
    <div style={{ maxWidth: 880 }}>
      <Link to={`/beheer/gesprek/${current.id}`} className="rd-textlink" style={{ textDecoration: "none" }}>← Terug naar het gesprek</Link>

      <div className="rd-card-white" style={{ marginTop: 8, display: "flex", gap: 16, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ width: 56, height: 56, borderRadius: 99, background: "var(--rd-lavender)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 19, flex: "none" }}>{initials(name)}</div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div className="rd-kicker" style={{ opacity: 0.55, fontSize: 11 }}>Klantkaart</div>
          <h1 className="rd-h2" style={{ margin: 0 }}>{name}</h1>
          <div style={{ fontSize: 14, marginTop: 2, display: "flex", gap: 12, flexWrap: "wrap" }}>
            {email && <a href={`mailto:${email}`} style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{email}</a>}
            {current.customer_phone && <a href={`tel:${current.customer_phone}`} style={{ color: "var(--rd-aubergine)", fontWeight: 600 }}>{current.customer_phone}</a>}
          </div>
          <div style={{ fontSize: 13, opacity: 0.65, marginTop: 4 }}>{gesprekken.length} gesprek{gesprekken.length === 1 ? "" : "ken"}</div>
        </div>
      </div>

      <Section title="Gesprekken">
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {gesprekken.map((g) => {
            const upcoming = new Date(g.start_at).getTime() > Date.now();
            return (
              <div key={g.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", flexWrap: "wrap", padding: "10px 12px", borderRadius: 12, border: "1px solid var(--rd-line)", background: g.id === current.id ? "var(--rd-grey-light)" : "transparent" }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{fmtLong(g.start_at)}{upcoming && <span className="rd-chip" style={{ marginLeft: 8, fontSize: 11, textTransform: "none" }}>komend</span>}</div>
                  <div style={{ fontSize: 12, opacity: 0.65 }}>{g.stylists?.name ?? "—"} · {STAGE[g.kanban_stage] ?? g.kanban_stage}{g.status === "paid_unplaced" ? " · nog inplannen" : ""}{g.intake_id ? "" : " · geen intake"}</div>
                </div>
                <Link to={`/beheer/gesprek/${g.id}`} className="rd-btn rd-btn-primary" style={{ textDecoration: "none", padding: "8px 14px" }}>Open gesprek</Link>
              </div>
            );
          })}
        </div>
      </Section>

      <CustomerPurchases email={email} title="Samples & aankopen (WooCommerce)" />

      <Section title="Commissie">
        {commissions.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Geen toegeschreven verfbestelling gevonden.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {commissions.map((c) => (
              <div key={c.id} style={{ display: "flex", justifyContent: "space-between", gap: 8, fontSize: 14, borderTop: "1px solid var(--rd-line)", paddingTop: 6 }}>
                <span>#{c.woo_order_id} · verf {euro(c.verf_excl)} · {formatDate(c.created_at)}</span>
                <span><strong>{euro(c.amount)}</strong> <span style={{ opacity: 0.6 }}>· {COMM_STATUS[c.status] ?? c.status}</span></span>
              </div>
            ))}
            <div style={{ textAlign: "right", fontWeight: 700, marginTop: 4 }}>Totaal {euro(total)}</div>
          </div>
        )}
      </Section>

      <Section title="Contacthistorie">
        {sent.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Nog geen adviesverslag verstuurd.</p> : (
          <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 14 }}>
            {sent.map((s) => <div key={s.id}>Adviesverslag verstuurd {formatDate(s.advisor_followup_sent_at)}{s.advisor_outcome ? ` · richting: ${s.advisor_outcome === "samples_needed" ? "samples" : s.advisor_outcome === "color_chosen" ? "verf" : "opvolgen"}` : ""}</div>)}
          </div>
        )}
      </Section>
    </div>
  );
}
