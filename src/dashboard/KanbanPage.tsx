import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";

interface Card {
  id: string;
  start_at: string;
  status: string;
  customer_name: string | null;
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
  offerte?: boolean;
}

const COLS = [
  { key: "ingepland", label: "Ingepland" },
  { key: "advies", label: "Advies gegeven" },
  { key: "opvolging", label: "In opvolging" },
  { key: "verf", label: "Verf gekocht" },
  { key: "afgehaakt", label: "Afgehaakt" },
] as const;

const TZ = "Europe/Amsterdam";
const fmt = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function KanbanPage() {
  const [cards, setCards] = useState<Card[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylists, setStylists] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: adm } = await supabase.rpc("is_admin");
      setIsAdmin(adm === true);
      if (adm === true) {
        const { data: st } = await supabase.from("stylists").select("id,name").eq("active", true).order("name");
        setStylists((st as { id: string; name: string }[]) ?? []);
      }
      const { data } = await supabase
        .from("bookings")
        .select("id,start_at,status,customer_name,customer_phone,intake_id,stylist_id,kanban_stage,samples_besteld,opgevolgd_at,upsell_offered,upsell_booked,upsell_value, stylists(name)")
        .in("status", ["confirmed", "paid_unplaced"])
        .order("start_at", { ascending: true });
      const list = (data as unknown as Card[]) ?? [];
      // Offerte-badge uit de gekoppelde intake.
      const ids = list.map((c) => c.intake_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: its } = await supabase.from("intake").select("id,advisor_offer_url").in("id", ids);
        const offer = new Map((its ?? []).map((i: any) => [i.id, !!i.advisor_offer_url]));
        for (const c of list) c.offerte = c.intake_id ? offer.get(c.intake_id) ?? false : false;
      }
      setCards(list);
      setLoading(false);
    })();
  }, []);

  const patch = async (id: string, jsonPatch: Record<string, unknown>, local: Partial<Card>) => {
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...local } : c)));
    await supabase.rpc("kanban_update", { p_booking_id: id, p_patch: jsonPatch });
  };

  const visible = useMemo(
    () => (isAdmin && filter !== "all" ? cards.filter((c) => c.stylist_id === filter) : cards),
    [cards, isAdmin, filter],
  );

  if (loading) return <p className="rd-sub">Laden...</p>;

  const Badge = ({ children }: { children: React.ReactNode }) => (
    <span className="rd-chip" style={{ fontSize: 11, padding: "2px 8px" }}>{children}</span>
  );

  const card = (c: Card) => {
    const open = expanded === c.id;
    return (
      <div key={c.id} className="rd-card-white" style={{ padding: "10px 12px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: "var(--rd-pink-dark)" }}>{fmt(c.start_at)}</div>
        <div style={{ fontWeight: 800, fontSize: 15, marginTop: 1 }}>{c.customer_name || "Klant"}</div>
        {isAdmin && <div style={{ fontSize: 12, opacity: 0.6 }}>{c.stylists?.name ?? "—"}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {c.samples_besteld && <Badge>samples</Badge>}
          {c.opgevolgd_at && <Badge>opgevolgd</Badge>}
          {c.offerte && <Badge>offerte</Badge>}
          {c.upsell_offered && <Badge>upsell{c.upsell_booked ? " ✓" : ""}</Badge>}
          {c.status === "paid_unplaced" && <Badge>plan nog in</Badge>}
        </div>

        <div style={{ display: "flex", gap: 6, marginTop: 10, alignItems: "center", flexWrap: "wrap" }}>
          <select
            className="rd-input"
            value={c.kanban_stage}
            onChange={(e) => patch(c.id, { kanban_stage: e.target.value }, { kanban_stage: e.target.value })}
            aria-label="Fase"
            style={{ height: 34, flex: "1 1 130px", minWidth: 0, fontSize: 13, padding: "4px 8px" }}
          >
            {COLS.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
          </select>
          {c.intake_id && (
            <Link to={`/beheer/${c.intake_id}`} className="rd-textlink" style={{ fontSize: 12, minHeight: 30 }}>Intake</Link>
          )}
          <button className="rd-textlink" style={{ fontSize: 12, minHeight: 30, opacity: 0.7 }} onClick={() => setExpanded(open ? null : c.id)}>
            {open ? "Minder" : "Acties"}
          </button>
        </div>

        {open && (
          <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6, borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={c.samples_besteld} onChange={(e) => patch(c.id, { samples_besteld: e.target.checked }, { samples_besteld: e.target.checked })} />
              Samples besteld
            </label>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={!!c.opgevolgd_at} onChange={(e) => patch(c.id, { opgevolgd: e.target.checked }, { opgevolgd_at: e.target.checked ? new Date().toISOString() : null })} />
              Opgevolgd
            </label>
            <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
              <input type="checkbox" checked={c.upsell_offered} onChange={(e) => patch(c.id, { upsell_offered: e.target.checked }, { upsell_offered: e.target.checked })} />
              Uitgebreid advies aangeboden
            </label>
            {c.upsell_offered && (
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", paddingLeft: 24 }}>
                <label style={{ fontSize: 13, display: "flex", gap: 8, alignItems: "center" }}>
                  <input type="checkbox" checked={c.upsell_booked} onChange={(e) => patch(c.id, { upsell_booked: e.target.checked }, { upsell_booked: e.target.checked })} />
                  Geboekt
                </label>
                {c.upsell_booked && (
                  <input
                    className="rd-input"
                    inputMode="decimal"
                    placeholder="Opdracht €"
                    defaultValue={c.upsell_value ?? ""}
                    onBlur={(e) => patch(c.id, { upsell_value: e.target.value }, { upsell_value: e.target.value ? Number(e.target.value) : null })}
                    style={{ height: 32, width: 110, fontSize: 13 }}
                  />
                )}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Gesprekken</h1>
          <p className="rd-sub" style={{ marginTop: 0 }}>Je trajecten per fase. Zet de fase met het keuzemenu; onder "Acties" leg je samples, opvolging en upsell vast.</p>
        </div>
        {isAdmin && stylists.length > 0 && (
          <select className="rd-input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 38, flex: "0 0 auto" }}>
            <option value="all">Alle stylisten</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 14, marginTop: 12 }} className="rd-hide-scroll">
        {COLS.map((col) => {
          const items = visible.filter((c) => c.kanban_stage === col.key);
          return (
            <div key={col.key} style={{ flex: "0 0 268px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 4px" }}>
                <span className="rd-kicker rd-kicker-pink">{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.5 }}>{items.length}</span>
              </div>
              {items.length === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.4, padding: "8px 4px" }}>Leeg</div>
              ) : items.map(card)}
            </div>
          );
        })}
      </div>
    </div>
  );
}
