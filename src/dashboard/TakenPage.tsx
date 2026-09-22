import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";
import { TASK_STATUS, TASK_TYPE, type RollTask } from "./RollHelpForm";

// Roll-taken (beheerder): offertes en contactverzoeken van stylisten, met eigenaar, opvolgdatum en status.
interface Row extends RollTask {
  booking_id: string | null;
  intake_id: string | null;
  requested_by: string | null;
  bookings: { customer_name: string | null; customer_email: string | null } | null;
  stylists: { name: string } | null;
}

const NEXT: Record<RollTask["status"], RollTask["status"] | null> = { aangevraagd: "opgepakt", opgepakt: "verstuurd", verstuurd: "afgerond", afgerond: null };
const NEXT_LABEL: Record<RollTask["status"], string> = { aangevraagd: "Oppakken", opgepakt: "Markeer verstuurd", verstuurd: "Afronden", afgerond: "" };

export function TakenPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [me, setMe] = useState("");
  const [filter, setFilter] = useState<"open" | "alles">("open");
  const [loading, setLoading] = useState(true);
  const [drafts, setDrafts] = useState<Record<string, { owner: string; due: string; url: string; note: string }>>({});

  const load = async () => {
    const { data } = await supabase
      .from("roll_tasks")
      .select("id,type,status,owner,due_date,payload,result,created_at,updated_at,booking_id,intake_id,requested_by, bookings(customer_name,customer_email), stylists(name)")
      .order("created_at", { ascending: false });
    const list = (data as unknown as Row[]) ?? [];
    setRows(list);
    setDrafts(Object.fromEntries(list.map((t) => [t.id, { owner: t.owner ?? "", due: t.due_date ?? "", url: t.result?.offer_url ?? "", note: t.result?.note ?? "" }])));
  };

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      setMe(u?.user?.email ?? "");
      await load();
      setLoading(false);
    })();
  }, []);

  const save = async (t: Row, extra: Partial<Row> = {}) => {
    const d = drafts[t.id];
    const patch: Record<string, unknown> = {
      owner: d.owner.trim() || null, due_date: d.due || null,
      result: { offer_url: d.url.trim() || undefined, note: d.note.trim() || undefined },
      updated_at: new Date().toISOString(), ...extra,
    };
    await supabase.from("roll_tasks").update(patch).eq("id", t.id);
    // De offerte-link ook op de intake zetten, zodat gesprekspagina en klantmail 'm tonen.
    if (d.url.trim() && t.intake_id) await supabase.from("intake").update({ advisor_offer_url: d.url.trim() }).eq("id", t.intake_id);
    await load();
  };

  const visible = useMemo(() => (filter === "open" ? rows.filter((t) => t.status !== "afgerond") : rows), [rows, filter]);

  if (loading) return <p className="rd-sub">Laden...</p>;

  return (
    <div style={{ maxWidth: 900 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Roll-taken</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>Offertes en contactverzoeken van stylisten. Geef ze een eigenaar en opvolgdatum en werk de status bij.</p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0 14px" }}>
        <button className={`rd-plan-chip${filter === "open" ? " is-on" : ""}`} onClick={() => setFilter("open")}>Open ({rows.filter((t) => t.status !== "afgerond").length})</button>
        <button className={`rd-plan-chip${filter === "alles" ? " is-on" : ""}`} onClick={() => setFilter("alles")}>Alles</button>
      </div>
      {visible.length === 0 ? <p className="rd-sub">Geen taken.</p> : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {visible.map((t) => {
            const d = drafts[t.id] ?? { owner: "", due: "", url: "", note: "" };
            const overdue = t.status !== "afgerond" && t.due_date && t.due_date < new Date().toISOString().slice(0, 10);
            return (
              <div key={t.id} className="rd-card-white" style={{ border: overdue ? "1px solid var(--rd-pink-dark)" : "1px solid transparent" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800, fontSize: 15 }}>{TASK_TYPE[t.type]} · {t.bookings?.customer_name || "Klant"}</div>
                    <div style={{ fontSize: 13, opacity: 0.7 }}>Aangevraagd {formatDate(t.created_at)} door {t.requested_by ?? t.stylists?.name ?? "—"}{t.bookings?.customer_email ? ` · ${t.bookings.customer_email}` : ""}</div>
                    {t.booking_id && <Link to={`/beheer/gesprek/${t.booking_id}`} className="rd-textlink" style={{ fontSize: 13 }}>Open gesprek</Link>}
                  </div>
                  <span className="rd-chip" style={{ background: t.status === "afgerond" ? "#C9E6CE" : "var(--rd-aubergine)", color: t.status === "afgerond" ? "#1e4429" : "#fff", fontWeight: 700 }}>{TASK_STATUS[t.status]}{overdue ? " · te laat" : ""}</span>
                </div>

                {/* Aanvraag */}
                {(t.payload?.rooms?.length ?? 0) > 0 && (
                  <div style={{ marginTop: 10, fontSize: 13, display: "flex", flexDirection: "column", gap: 3 }}>
                    {t.payload.rooms.map((r, i) => (
                      <div key={i}><strong>{[r.room, r.surface].filter(Boolean).join(", ") || "Ruimte"}</strong> · {r.color || "kleur ?"}{r.color_status === "definitief" ? "" : " (voorbehoud)"} · {r.product || "product ?"}{r.m2 ? ` · ${r.m2} m²` : r.dimensions ? ` · ${r.dimensions}` : " · afmetingen ontbreken"}{r.substrate ? ` · ${r.substrate}` : ""}</div>
                    ))}
                  </div>
                )}
                {(t.payload?.planning || t.payload?.notes) && <div style={{ fontSize: 13, opacity: 0.8, marginTop: 6 }}>{t.payload.planning && <>Planning: {t.payload.planning}. </>}{t.payload.notes}</div>}

                {/* Beheer */}
                <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", marginTop: 12 }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <input className="rd-input" placeholder="Eigenaar (e-mail)" value={d.owner} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, owner: e.target.value } })} style={{ height: 38, flex: 1 }} />
                    {me && d.owner !== me && <button className="rd-plan-chip" onClick={() => setDrafts({ ...drafts, [t.id]: { ...d, owner: me } })} title="Aan mij toewijzen">ik</button>}
                  </div>
                  <input type="date" className="rd-input" value={d.due} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, due: e.target.value } })} style={{ height: 38 }} />
                  <input className="rd-input" placeholder="Offerte-link" value={d.url} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, url: e.target.value } })} style={{ height: 38 }} />
                  <input className="rd-input" placeholder="Notitie voor de styliste" value={d.note} onChange={(e) => setDrafts({ ...drafts, [t.id]: { ...d, note: e.target.value } })} style={{ height: 38 }} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                  <button className="rd-plan-chip" onClick={() => save(t)}>Opslaan</button>
                  {NEXT[t.status] && <button className="rd-plan-chip is-on" onClick={() => save(t, { status: NEXT[t.status]! } as Partial<Row>)}>{NEXT_LABEL[t.status]}</button>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
