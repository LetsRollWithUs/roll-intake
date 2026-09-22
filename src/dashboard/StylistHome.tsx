import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Stylist {
  id: string;
  name: string;
  email?: string;
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
interface Stats {
  month: number;
  done: number;
  upcoming: number;
  colorChosen: number;
}

const TZ = "Europe/Amsterdam";
const dayFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "long", day: "numeric", month: "long" });
const timeFmt = new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const monthKey = (iso: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit" }).format(new Date(iso));

const serviceLabel = (key?: string) =>
  key === "post_sample" ? "Al samples getest" : key === "pre_sample" ? "Nog geen samples" : "Kleuradvies";
const firstName = (name?: string | null) => (name ?? "").trim().split(/\s+/)[0] || "";
const safeUrl = (v?: string | null) => (v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null);

function isToday(iso: string): boolean {
  const d = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });
  return d.format(new Date(iso)) === d.format(new Date());
}

function StatTile({ value, label }: { value: number; label: string }) {
  return (
    <div className="rd-card-white" style={{ padding: "12px 14px", flex: "1 1 120px", minWidth: 0, textAlign: "center" }}>
      <div style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: "tabular-nums", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2, lineHeight: 1.25 }}>{label}</div>
    </div>
  );
}

export function StylistHome() {
  const [me, setMe] = useState<Stylist | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylists, setStylists] = useState<Stylist[]>([]);
  const [selId, setSelId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [rows, setRows] = useState<BookingRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  // Identiteit: wie ben ik, ben ik beheerder, en welke stylisten kan ik bekijken.
  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      const admin = adm === true;
      setIsAdmin(admin);
      const { data: st } = await supabase.rpc("current_stylist");
      const mine = ((st as Stylist[]) ?? [])[0] ?? null;
      setMe(mine);
      if (admin) {
        const { data: list } = await supabase.from("stylists").select("id,name,email,meet_url").eq("active", true).order("name");
        const arr = (list as Stylist[]) ?? [];
        setStylists(arr);
        setSelId(mine?.id ?? arr[0]?.id ?? null);
      } else {
        setSelId(mine?.id ?? null);
      }
      setReady(true);
    })();
  }, []);

  const effective = useMemo<Stylist | null>(() => {
    if (isAdmin) return stylists.find((s) => s.id === selId) ?? (me && me.id === selId ? me : null);
    return me;
  }, [isAdmin, stylists, selId, me]);

  // Afspraken + cijfers voor de (gekozen) styliste. RLS staat de beheerder toe alle boekingen te lezen.
  useEffect(() => {
    if (!ready) return;
    const sid = effective?.id ?? null;
    if (!sid) { setRows([]); setStats(null); setLoading(false); return; }
    let stale = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("bookings")
        .select("id,start_at,status,customer_name,customer_phone,intake_id, services(key)")
        .eq("stylist_id", sid)
        .in("status", ["confirmed", "paid_unplaced"])
        .order("start_at", { ascending: true });
      if (stale) return;
      const all = (data as unknown as BookingRow[]) ?? [];
      const nowMs = Date.now();
      const upcoming = all.filter((r) => new Date(r.start_at).getTime() >= nowMs - 2 * 3600 * 1000);
      setRows(upcoming);

      const past = all.filter((r) => new Date(r.start_at).getTime() < nowMs);
      const thisMonth = monthKey(new Date().toISOString());
      const month = all.filter((r) => monthKey(r.start_at) === thisMonth).length;
      let colorChosen = 0;
      const pastIntakeIds = past.map((r) => r.intake_id).filter((x): x is string => !!x);
      if (pastIntakeIds.length > 0) {
        const { data: its } = await supabase.from("intake").select("id,advisor_outcome").in("id", pastIntakeIds);
        if (stale) return;
        colorChosen = ((its as { advisor_outcome: string | null }[]) ?? []).filter((i) => i.advisor_outcome === "color_chosen").length;
      }
      setStats({ month, done: past.length, upcoming: upcoming.length, colorChosen });
      setLoading(false);
    })();
    return () => { stale = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, effective?.id]);

  const viewingOther = isAdmin && effective?.id !== me?.id;
  const greeting = effective?.name
    ? (viewingOther ? `Dashboard van ${firstName(effective.name)}` : `Hoi ${firstName(effective.name)} 👋`)
    : "Welkom 👋";

  const picker = isAdmin && stylists.length > 0 && (
    <div className="rd-card-white" style={{ marginBottom: 14, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
      <span style={{ fontWeight: 700, fontSize: 13 }}>Bekijk als</span>
      <select
        className="rd-input"
        value={selId ?? ""}
        onChange={(e) => setSelId(e.target.value || null)}
        style={{ flex: "1 1 200px", minWidth: 0, height: 40 }}
      >
        {stylists.map((s) => (
          <option key={s.id} value={s.id}>{s.name}{s.id === me?.id ? " (jij)" : ""}</option>
        ))}
      </select>
    </div>
  );

  const card = (r: BookingRow) => {
    const meet = safeUrl(effective?.meet_url);
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

  const { today, later } = useMemo(() => {
    const t: BookingRow[] = [];
    const l: BookingRow[] = [];
    for (const r of rows) (isToday(r.start_at) ? t : l).push(r);
    return { today: t, later: l };
  }, [rows]);

  if (!ready) return <p className="rd-sub">Laden...</p>;

  // Beheerder zonder gekozen styliste (bijv. geen actieve stylisten).
  if (isAdmin && !effective) {
    return (
      <div>
        {picker}
        <p className="rd-sub">Kies een styliste om haar dashboard te bekijken.</p>
      </div>
    );
  }
  // Niet-beheerder zonder eigen stylistprofiel.
  if (!effective) {
    return <p className="rd-sub">Dit account is nog niet aan een stylistprofiel gekoppeld. Vraag de beheerder.</p>;
  }

  return (
    <div>
      {picker}
      {viewingOther && (
        <p className="rd-sub" style={{ marginTop: 0, marginBottom: 8, fontStyle: "italic" }}>
          Je bekijkt het dashboard zoals {firstName(effective.name)} het ziet.
        </p>
      )}
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>{greeting}</h1>
      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : (
        <>
          <p className="rd-sub" style={{ marginTop: 0 }}>
            {rows.length === 0
              ? "Er staan op dit moment geen afspraken."
              : today.length > 0
              ? `${today.length} afspra${today.length === 1 ? "ak" : "aken"} vandaag.`
              : `${rows.length} afspra${rows.length === 1 ? "ak" : "aken"} in de planning.`}
          </p>

          {stats && (stats.done > 0 || stats.month > 0 || stats.upcoming > 0) && (
            <section style={{ marginTop: 12 }}>
              <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>{viewingOther ? "Cijfers" : "Jouw cijfers"}</div>
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
                Zodra er een afspraak wordt ingepland, verschijnt die hier met de intake erbij.
              </p>
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
        </>
      )}
    </div>
  );
}
