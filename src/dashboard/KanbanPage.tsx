import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { deriveExpected, leadScore, TEMP_LABEL, todayKey, planningLabel } from "./lead";
import { bookLinkMail, planLinkMail } from "./bookingLink";

interface Card {
  id: string;
  start_at: string;
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
  toolkit_offered_at: string | null;
  stylists: { name: string } | null;
  services: { key: string } | null;
  // uit de intake
  offerte?: boolean;
  planning?: string | null;
  painter?: string | null;
  hasSamplesBefore?: boolean;
  rooms?: { surfaces?: string[] }[] | null;
}

// Losse intake: ingevuld zonder afspraak. Status per e-mailadres: afspraak, tegoed (betaald) of niets.
interface Loose {
  id: string;
  created_at: string;
  contact_name: string | null;
  contact_email: string | null;
  rooms: { surfaces?: string[] }[] | null;
  planning: string | null;
  painter: string | null;
  mail: { kind: "afspraak" | "tegoed" | "niets"; bookingId?: string; startAt?: string; linkable?: boolean; token?: string };
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
const fmtD = (iso: string) => new Intl.DateTimeFormat("nl-NL", { timeZone: TZ, day: "numeric", month: "short" }).format(new Date(iso));
function initials(name: string): string {
  const p = name.trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "?";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
}

export function KanbanPage() {
  const navigate = useNavigate();
  const [cards, setCards] = useState<Card[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [stylists, setStylists] = useState<{ id: string; name: string }[]>([]);
  const [filter, setFilter] = useState<string>("all");
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [showArchive, setShowArchive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loose, setLoose] = useState<Loose[]>([]);
  const [pickStylist, setPickStylist] = useState<Record<string, string>>({});
  const [reloadKey, setReloadKey] = useState(0);

  // Afgeronde trajecten (verf gekocht / afgehaakt) ouder dan 30 dagen gaan in het archief.
  const ARCHIVE_DAYS = 30;
  const archiveCutoff = Date.now() - ARCHIVE_DAYS * 864e5;
  const isFinal = (key: string) => key === "verf" || key === "afgehaakt";

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
        .select("id,start_at,created_at,status,customer_name,customer_email,customer_phone,intake_id,stylist_id,kanban_stage,samples_besteld,opgevolgd_at,upsell_offered,upsell_booked,upsell_value,expected_purchase_at,toolkit_offered_at, stylists(name), services(key)")
        .in("status", ["confirmed", "paid_unplaced", "manual"])
        .order("start_at", { ascending: true });
      const list = (data as unknown as Card[]) ?? [];
      const ids = list.map((c) => c.intake_id).filter((x): x is string => !!x);
      if (ids.length) {
        const { data: its } = await supabase.from("intake").select("id,advisor_offer_url,planning,painter,has_samples,rooms").in("id", ids);
        const byId = new Map(((its as any[]) ?? []).map((i) => [i.id, i]));
        for (const c of list) {
          const i = c.intake_id ? byId.get(c.intake_id) : null;
          c.offerte = !!i?.advisor_offer_url;
          c.planning = i?.planning ?? null;
          c.painter = i?.painter ?? null;
          c.rooms = i?.rooms ?? null;
          c.hasSamplesBefore = c.services?.key === "post_sample" || (!!i?.has_samples && i.has_samples !== "nee");
        }
      }
      for (const c of list) if (c.hasSamplesBefore === undefined) c.hasSamplesBefore = c.services?.key === "post_sample";
      setCards(list);

      // Beheer: losse intakes (ingevuld, geen afspraak) met de status per e-mailadres.
      if (adm === true) {
        const { data: li } = await supabase.from("intake").select("id,created_at,contact_name,contact_email,rooms,planning,painter")
          .eq("status", "verzonden").is("booking_id", null).not("advisor_status", "in", "(afgerond,afgewezen)")
          .order("created_at", { ascending: false }).limit(50);
        const rows = (li as any[]) ?? [];
        const linked = new Set(list.map((c) => c.intake_id).filter(Boolean));
        const emails = [...new Set(rows.map((r) => (r.contact_email ?? "").toLowerCase()).filter(Boolean))];
        const { data: cr } = emails.length
          ? await supabase.from("advice_credits").select("buyer_email,status,scheduled_at,manage_token").eq("status", "paid")
          : { data: [] };
        const creditBy = new Map(((cr as any[]) ?? []).filter((c) => !c.scheduled_at && c.buyer_email).map((c) => [String(c.buyer_email).toLowerCase(), c.manage_token as string]));
        const bookingBy = new Map<string, Card>();
        for (const c of list) if (c.status !== "manual" && c.customer_email) { const k = c.customer_email.toLowerCase(); if (!bookingBy.has(k)) bookingBy.set(k, c); }
        setLoose(rows.filter((r) => !linked.has(r.id)).map((r) => {
          const k = (r.contact_email ?? "").toLowerCase();
          const b = k ? bookingBy.get(k) : undefined;
          const token = k ? creditBy.get(k) : undefined;
          const mail: Loose["mail"] = b ? { kind: "afspraak", bookingId: b.id, startAt: b.start_at, linkable: !b.intake_id }
            : token ? { kind: "tegoed", token } : { kind: "niets" };
          return { ...r, mail } as Loose;
        }));
      }
      setLoading(false);
    })();
  }, [reloadKey]);

  // Losse intake in de flow zetten (niet betaald, geen afspraak), of koppelen aan een bestaande afspraak.
  const toFlow = async (intakeId: string, stage: string) => {
    const l = loose.find((x) => x.id === intakeId);
    if (!l) return;
    const ok = window.confirm(`${l.contact_name || "Deze klant"} in de flow zetten (${COLS.find((c) => c.key === stage)?.label})? Er is nog niet betaald en er staat geen afspraak.`);
    if (!ok) return;
    const { error } = await supabase.rpc("intake_to_flow", { p_intake_id: intakeId, p_stage: stage, p_stylist_id: pickStylist[intakeId] || null });
    if (error) { window.alert("In de flow zetten lukte niet: " + error.message); return; }
    setReloadKey((k) => k + 1);
  };
  const linkToBooking = async (l: Loose) => {
    if (!l.mail.bookingId) return;
    const { error } = await supabase.rpc("link_intake_booking", { p_intake_id: l.id, p_booking_id: l.mail.bookingId });
    if (error) { window.alert("Koppelen lukte niet: " + error.message); return; }
    setReloadKey((k) => k + 1);
  };

  const move = async (id: string, stage: string) => {
    if (id.startsWith("intake:")) { if (stage !== "losse") await toFlow(id.slice(7), stage); return; }
    if (stage === "losse") return;
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, kanban_stage: stage } : c)));
    await supabase.rpc("kanban_update", { p_booking_id: id, p_patch: { kanban_stage: stage } });
  };

  const visible = useMemo(
    () => (isAdmin && filter !== "all" ? cards.filter((c) => c.stylist_id === filter) : cards),
    [cards, isAdmin, filter],
  );

  if (loading) return <p className="rd-sub">Laden...</p>;

  const Badge = ({ children, tone }: { children: React.ReactNode; tone?: "pink" | "warn" | "ok" }) => (
    <span className="rd-chip" style={{
      fontSize: 11, padding: "2px 8px",
      ...(tone === "pink" ? { background: "var(--rd-pink)", color: "var(--rd-aubergine)", fontWeight: 700 } : {}),
      ...(tone === "warn" ? { background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 } : {}),
      ...(tone === "ok" ? { background: "#C9E6CE", color: "#1e4429", fontWeight: 700 } : {}),
    }}>{children}</span>
  );

  const card = (c: Card) => {
    const name = c.customer_name || "Klant";
    const dragging = dragId === c.id;
    const past = new Date(c.start_at).getTime() < Date.now();
    const open = c.kanban_stage !== "verf" && c.kanban_stage !== "afgehaakt";
    const expected = c.expected_purchase_at ?? (past ? deriveExpected(c.start_at, c.planning) : null);
    const overdue = open && past && !!expected && expected < todayKey();
    const lead = leadScore({ rooms: c.rooms, planning: c.planning, painter: c.painter });
    const t = TEMP_LABEL[lead.temp];
    return (
      <div
        key={c.id}
        draggable
        onDragStart={(e) => { setDragId(c.id); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", c.id); }}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        onClick={(e) => { if ((e.target as HTMLElement).closest("select,button,input,label,a")) return; navigate(`/beheer/gesprek/${c.id}`); }}
        className="rd-card-white"
        style={{ padding: "12px 14px", cursor: "grab", opacity: dragging ? 0.45 : 1, boxShadow: "0 1px 2px rgba(47,33,65,.06), 0 6px 18px rgba(47,33,65,.06)", border: overdue ? "1px solid var(--rd-pink-dark)" : "1px solid transparent" }}
        title="Klik voor het klantdossier, sleep om de fase te wijzigen"
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 99, background: "var(--rd-lavender)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flex: "none" }}>{initials(name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 12, color: "var(--rd-pink-dark)", fontWeight: 700 }}>{c.status === "manual" ? "Geen afspraak" : `${past ? "Gesprek " : ""}${fmt(c.start_at)}`}</div>
          </div>
          {c.intake_id && (
            <span className="rd-chip" style={{ fontSize: 11, padding: "2px 8px", background: t.bg, color: t.ink, fontWeight: 700, flex: "none" }} title={`Omvang ${lead.rooms} ruimte(s), ${lead.surfaces} oppervlak(ken)`}>{t.label}</span>
          )}
        </div>

        {/* Tijdlijn */}
        <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 8, lineHeight: 1.5 }}>
          <span>{c.status === "manual" ? "In de flow gezet" : "Gekocht"} {fmtD(c.created_at)}</span>
          {c.opgevolgd_at && <span> · Opgevolgd {fmtD(c.opgevolgd_at)}</span>}
          {open && expected && <span style={overdue ? { color: "var(--rd-pink-dark)", fontWeight: 700 } : undefined}> · Verf verwacht {fmtD(expected)}</span>}
          {c.intake_id && (c.rooms?.length ?? 0) > 0 && <span> · {lead.rooms} ruimte{lead.rooms === 1 ? "" : "s"}{planningLabel(c.planning) ? ` · ${planningLabel(c.planning)?.toLowerCase()}` : ""}</span>}
        </div>
        {isAdmin && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>{c.stylists?.name ?? "—"}</div>}

        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>
          {c.hasSamplesBefore && <Badge>samples vooraf</Badge>}
          {c.samples_besteld && <Badge tone="ok">samples na gesprek</Badge>}
          {c.opgevolgd_at && <Badge>opgevolgd</Badge>}
          {c.offerte && <Badge>offerte</Badge>}
          {c.upsell_offered && <Badge tone="pink">upsell{c.upsell_booked ? " ✓" : ""}</Badge>}
          {c.painter === "schilder" && <Badge tone="warn">schilder</Badge>}
          {c.painter === "deels" && <Badge>deels schilder</Badge>}
          {overdue && <Badge tone="warn">verwachte datum verstreken</Badge>}
          {c.status === "paid_unplaced" && <Badge tone="warn">plan nog in</Badge>}
          {c.status === "manual" && <Badge tone="warn">niet betaald · geen afspraak</Badge>}
        </div>

        <select className="rd-input" value={c.kanban_stage} onChange={(e) => move(c.id, e.target.value)} aria-label="Fase" style={{ marginTop: 10, height: 32, width: "100%", fontSize: 12, padding: "2px 8px", opacity: 0.85 }}>
          {COLS.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
        </select>
      </div>
    );
  };

  const looseCard = (l: Loose) => {
    const name = l.contact_name || l.contact_email || "Klant";
    const dragging = dragId === `intake:${l.id}`;
    const lead = leadScore({ rooms: l.rooms, planning: l.planning, painter: l.painter });
    const t = TEMP_LABEL[lead.temp];
    const status = l.mail.kind === "afspraak"
      ? <Badge tone="ok">afspraak {l.mail.startAt ? fmt(l.mail.startAt) : ""}{l.mail.linkable ? " · nog niet gekoppeld" : ""}</Badge>
      : l.mail.kind === "tegoed" ? <Badge tone="pink">betaald · nog niet ingepland</Badge>
      : <Badge tone="warn">niet betaald · geen afspraak</Badge>;
    return (
      <div
        key={`intake:${l.id}`}
        draggable
        onDragStart={(e) => { setDragId(`intake:${l.id}`); e.dataTransfer.effectAllowed = "move"; e.dataTransfer.setData("text/plain", `intake:${l.id}`); }}
        onDragEnd={() => { setDragId(null); setOver(null); }}
        onClick={(e) => { if ((e.target as HTMLElement).closest("select,button,input,label,a")) return; navigate(`/beheer/${l.id}`); }}
        className="rd-card-white"
        style={{ padding: "12px 14px", cursor: "grab", opacity: dragging ? 0.45 : 1, border: "1.5px dashed var(--rd-lavender-mid, #BBB1CB)", boxShadow: "none" }}
        title="Klik voor de intake, sleep naar een fase om de klant in de flow te zetten"
      >
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div style={{ width: 34, height: 34, borderRadius: 99, background: "var(--rd-grey-light)", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 12, flex: "none" }}>{initials(name)}</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</div>
            <div style={{ fontSize: 12, opacity: 0.7, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{l.contact_email}</div>
          </div>
          <span className="rd-chip" style={{ fontSize: 11, padding: "2px 8px", background: t.bg, color: t.ink, fontWeight: 700, flex: "none" }}>{t.label}</span>
        </div>
        <div style={{ fontSize: 11.5, opacity: 0.75, marginTop: 8 }}>
          Intake {fmtD(l.created_at)}{(l.rooms?.length ?? 0) > 0 ? ` · ${lead.rooms} ruimte${lead.rooms === 1 ? "" : "s"}` : ""}{planningLabel(l.planning) ? ` · ${planningLabel(l.planning)?.toLowerCase()}` : ""}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 8 }}>{status}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 10 }}>
          {l.mail.kind === "afspraak" && l.mail.linkable && (
            <button className="rd-btn rd-btn-primary" onClick={() => linkToBooking(l)} style={{ height: 32, fontSize: 12.5 }}>Koppel aan deze afspraak</button>
          )}
          {l.mail.kind === "tegoed" && l.contact_email && l.mail.token && (
            <a className="rd-btn rd-btn-outline" href={planLinkMail(l.contact_name, l.contact_email, l.mail.token)} style={{ height: 32, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center" }}>Stuur planlink</a>
          )}
          {l.mail.kind === "niets" && l.contact_email && (
            <a className="rd-btn rd-btn-outline" href={bookLinkMail(l.contact_name, l.contact_email)} style={{ height: 32, fontSize: 12.5, display: "flex", alignItems: "center", justifyContent: "center" }}>Stuur boekingslink</a>
          )}
          {stylists.length > 0 && (
            <select className="rd-input" value={pickStylist[l.id] ?? ""} onChange={(e) => setPickStylist((p) => ({ ...p, [l.id]: e.target.value }))} aria-label="Styliste" style={{ height: 32, fontSize: 12, padding: "2px 8px" }}>
              <option value="">Styliste bij in de flow zetten: nog niemand</option>
              {stylists.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
            </select>
          )}
          <select className="rd-input" value="" onChange={(e) => e.target.value && toFlow(l.id, e.target.value)} aria-label="In de flow zetten" style={{ height: 32, fontSize: 12, padding: "2px 8px", opacity: 0.85 }}>
            <option value="">Zet in de flow…</option>
            {COLS.map((col) => <option key={col.key} value={col.key}>{col.label}</option>)}
          </select>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Adviesgesprekken</h1>
          <p className="rd-sub" style={{ marginTop: 0 }}>Sleep een kaartje naar een andere fase, of gebruik het keuzemenu. Klik op een kaartje voor het klantdossier.</p>
        </div>
        {isAdmin && stylists.length > 0 && (
          <select className="rd-input" value={filter} onChange={(e) => setFilter(e.target.value)} style={{ height: 38, flex: "0 0 auto" }}>
            <option value="all">Alle stylisten</option>
            {stylists.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        )}
      </div>

      <div style={{ display: "flex", gap: 12, overflowX: "auto", paddingBottom: 14, marginTop: 14 }} className="rd-hide-scroll">
        {isAdmin && (
          <div style={{ flex: "0 0 272px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 18, minHeight: 200, background: "transparent", border: "1.5px dashed var(--rd-line)" }}>
            <div style={{ padding: "4px 6px 2px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span className="rd-kicker rd-kicker-pink">Intake, geen afspraak</span>
                <span style={{ fontSize: 12, fontWeight: 800, background: "#fff", borderRadius: 99, padding: "1px 8px", opacity: 0.8 }}>{loose.length}</span>
              </div>
              <div style={{ fontSize: 11.5, opacity: 0.6, marginTop: 2, lineHeight: 1.4 }}>Sleep naar een fase om de klant toch in de flow te zetten.</div>
            </div>
            {loose.length === 0 ? <div style={{ fontSize: 12, opacity: 0.45, padding: "10px 6px" }}>Geen losse intakes</div> : loose.map(looseCard)}
          </div>
        )}
        {COLS.map((col) => {
          const all = visible.filter((c) => c.kanban_stage === col.key);
          const items = isFinal(col.key) && !showArchive ? all.filter((c) => new Date(c.start_at).getTime() >= archiveCutoff) : all;
          const archived = all.length - items.length;
          const isOver = over === col.key;
          return (
            <div
              key={col.key}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; if (over !== col.key) setOver(col.key); }}
              onDragLeave={() => setOver((o) => (o === col.key ? null : o))}
              onDrop={(e) => { e.preventDefault(); const id = e.dataTransfer.getData("text/plain") || dragId; if (id) move(id, col.key); setDragId(null); setOver(null); }}
              style={{ flex: "0 0 272px", minWidth: 0, display: "flex", flexDirection: "column", gap: 8, padding: 8, borderRadius: 18, minHeight: 200, background: isOver ? "var(--rd-lavender)" : "var(--rd-grey-light)", outline: isOver ? "2px dashed var(--rd-pink-dark)" : "2px dashed transparent", transition: "background .12s ease" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "4px 6px 2px" }}>
                <span className="rd-kicker rd-kicker-pink">{col.label}</span>
                <span style={{ fontSize: 12, fontWeight: 800, background: "#fff", borderRadius: 99, padding: "1px 8px", opacity: 0.8 }}>{items.length}</span>
              </div>
              {items.length === 0 && archived === 0 ? (
                <div style={{ fontSize: 12, opacity: 0.45, padding: "10px 6px" }}>Sleep hierheen</div>
              ) : items.map(card)}
              {isFinal(col.key) && archived > 0 && (
                <button className="rd-textlink" onClick={() => setShowArchive(true)} style={{ fontSize: 12, alignSelf: "center", opacity: 0.7 }}>+ {archived} in archief (ouder dan {ARCHIVE_DAYS} dagen)</button>
              )}
              {isFinal(col.key) && showArchive && all.length > 0 && (
                <button className="rd-textlink" onClick={() => setShowArchive(false)} style={{ fontSize: 12, alignSelf: "center", opacity: 0.7 }}>Archief verbergen</button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
