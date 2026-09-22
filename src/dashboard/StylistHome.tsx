import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Stylist {
  id: string;
  name: string;
  email: string;
  meet_url: string | null;
}
interface BookingRow {
  id: string;
  start_at: string;
  status: string;
  customer_name: string | null;
  customer_phone: string | null;
  intake_id: string | null;
  services: { key: string } | null;
}

const TZ = "Europe/Amsterdam";
const dayFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });

const serviceLabel = (key?: string) =>
  key === "post_sample" ? "Al samples getest" : key === "pre_sample" ? "Nog geen samples" : "Kleuradvies";

const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "";
const safeUrl = (v?: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

// Is een ISO-datum vandaag (in NL-tijd)?
function isToday(iso: string): boolean {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return d.format(new Date(iso)) === d.format(new Date());
}

interface Stats {
  month: number;
  done: number;
  upcoming: number;
  colorChosen: number;
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div
      className="rd-card-white"
      style={{ padding: "12px 14px", flex: "1 1 120px", minWidth: 0, textAlign: "center" }}
    >
      <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2, lineHeight: 1.25 }}>{label}</div>
    </div>
  );
}

const monthKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso));

export function StylistHome() {
  const [me, setMe] = useState<Stylist | null>(null);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: st } = await supabase.rpc("current_stylist");
      const mine = ((st as Stylist[]) ?? [])[0] ?? null;
      setMe(mine);
      // RLS beperkt dit al tot de eigen afspraken van de ingelogde styliste.
      const { data } = await supabase
        .from("bookings")
        .select("id,start_at,status,customer_name,customer_phone,intake_id, services(key)")
        .in("status", ["confirmed", "paid_unplaced"])
        .order("start_at", { ascending: true });
      const all = (data as unknown as BookingRow[]) ?? [];

      const nowMs = Date.now();
      const upcoming = all.filter((r) => new Date(r.start_at).getTime() >= nowMs - 2 * 3600 * 1000);
      setRows(upcoming);

      // Cijfers: afgeronde (verleden), deze maand, komend, en kleur-gekozen als conversie-signaal.
      const past = all.filter((r) => new Date(r.start_at).getTime() < nowMs);
      const thisMonth = monthKey(new Date().toISOString());
      const month = all.filter((r) => monthKey(r.start_at) === thisMonth).length;
      let colorChosen = 0;
      const pastIntakeIds = past.map((r) => r.intake_id).filter((x): x is string => !!x);
      if (pastIntakeIds.length > 0) {
        const { data: its } = await supabase.from("intake").select("id,advisor_outcome").in("id", pastIntakeIds);
        colorChosen = ((its as { advisor_outcome: string | null }[]) ?? []).filter((i) => i.advisor_outcome === "color_chosen").length;
      }
      setStats({ month, done: past.length, upcoming: upcoming.length, colorChosen });

      setLoading(false);
    })();
  }, []);

  const { today, later } = useMemo(() => {
    const t: BookingRow[] = [];
    const l: BookingRow[] = [];
    for (const r of rows) (isToday(r.start_at) ? t : l).push(r);
    return { today: t, later: l };
  }, [rows]);

  const greeting = me?.name ? `Hoi ${firstName(me.name)} 👋` : "Welkom 👋";

  const card = (r: BookingRow) => {
    const meet = safeUrl(me?.meet_url);
    const unplaced = r.status === "paid_unplaced";
    return (
      <div key={r.id} className="rd-card-white" style={{ padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".02em", color: "var(--rd-pink-dark)" }}>
              {timeFmt.format(new Date(r.start_at))} · {dayFmt.format(new Date(r.start_at))}
            </div>
            <div style={{ fontWeight: 800, fontSize: 17, marginTop: 2 }}>{r.customer_name || "Klant"}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2, display: "flex", gap: 8, flexWrap: "wrap" }}>
              <span>{serviceLabel(r.services?.key)}</span>
              {r.customer_phone && <span>· {r.customer_phone}</span>}
            </div>
          </div>
          {unplaced && (
            <span className="rd-chip" style={{ background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700, flex: "none" }}>
              Betaald, plan nog in
            </span>
          )}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {r.intake_id ? (
            <Link to={`/beheer/${r.intake_id}`} className="rd-btn rd-btn-primary" style={{ textDecoration: "none", padding: "8px 16px" }}>
              Bekijk intake
            </Link>
          ) : (
            <span className="rd-chip" style={{ opacity: 0.7 }}>Intake nog niet ingevuld</span>
          )}
          {meet && (
            <a href={meet} target="_blank" rel="noreferrer" className="rd-btn rd-btn-outline" style={{ textDecoration: "none", padding: "8px 16px" }}>
              Videogesprek openen
            </a>
          )}
        </div>
      </div>
    );
  };

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>{greeting}</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        {rows.length === 0
          ? "Je hebt op dit moment geen afspraken staan."
          : today.length > 0
          ? `Je hebt vandaag ${today.length} afspra${today.length === 1 ? "ak" : "aken"}.`
          : `Je hebt ${rows.length} afspra${rows.length === 1 ? "ak" : "aken"} in de planning.`}
      </p>

      {stats && (stats.done > 0 || stats.month > 0 || stats.upcoming > 0) && (
        <section style={{ marginTop: 12 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Jouw cijfers</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
            <StatTile value={stats.month} label="Deze maand" />
            <StatTile value={stats.done} label="Gesprekken gedaan" />
            <StatTile value={stats.upcoming} label="Nog ingepland" />
            <StatTile value={stats.colorChosen} label="Kleur gekozen" />
          </div>
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rd-card-white" style={{ marginTop: 14, textAlign: "center", padding: "26px 18px" }}>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 16 }}>Rustig moment</p>
          <p className="rd-sub" style={{ marginTop: 6 }}>
            Zodra er een afspraak voor je wordt ingepland, verschijnt die hier met de intake erbij.
          </p>
          <Link to="/beheer/agenda" className="rd-textlink" style={{ display: "inline-block", marginTop: 10 }}>
            Naar je agenda
          </Link>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 20, marginTop: 16 }}>
          {today.length > 0 && (
            <section>
              <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Vandaag</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{today.map(card)}</div>
            </section>
          )}
          {later.length > 0 && (
            <section>
              <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Binnenkort</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>{later.map(card)}</div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
