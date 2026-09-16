import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { STATUSES } from "./status";
import { StatusPill, formatDate } from "./ui";
import type { IntakeRow } from "./types";

export function IntakeList() {
  const [rows, setRows] = useState<IntakeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("verzonden");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("intake")
        .select(
          "id, created_at, status, contact_name, contact_email, advisor_status, main_question, rooms, planning, complexity_level",
        )
        .order("created_at", { ascending: false });
      if (error) setError(error.message);
      else setRows((data as IntakeRow[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter === "verzonden" && r.status !== "verzonden") return false;
      if (statusFilter === "concept" && r.status !== "concept") return false;
      if (statusFilter.startsWith("adv:") && r.advisor_status !== statusFilter.slice(4)) return false;
      if (term) {
        const hay = `${r.contact_name ?? ""} ${r.contact_email ?? ""} ${r.main_question ?? ""}`.toLowerCase();
        if (!hay.includes(term)) return false;
      }
      return true;
    });
  }, [rows, q, statusFilter]);

  const countVerzonden = rows.filter((r) => r.status === "verzonden").length;
  const countConcept = rows.filter((r) => r.status === "concept").length;

  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
        <input
          className="rd-input"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Zoek op naam, e-mail of vraag"
          style={{ flex: "1 1 220px", minWidth: 0 }}
        />
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
        <button
          className={`rd-plan-chip${statusFilter === "verzonden" ? " is-on" : ""}`}
          onClick={() => setStatusFilter("verzonden")}
        >
          Verzonden ({countVerzonden})
        </button>
        <button
          className={`rd-plan-chip${statusFilter === "concept" ? " is-on" : ""}`}
          onClick={() => setStatusFilter("concept")}
        >
          Concept ({countConcept})
        </button>
        {STATUSES.map((s) => (
          <button
            key={s.key}
            className={`rd-plan-chip${statusFilter === `adv:${s.key}` ? " is-on" : ""}`}
            onClick={() => setStatusFilter(`adv:${s.key}`)}
          >
            {s.label}
          </button>
        ))}
      </div>

      {loading && <p className="rd-sub">Laden...</p>}
      {error && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>Fout: {error}</p>}
      {!loading && filtered.length === 0 && <p className="rd-sub">Geen intakes gevonden.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {filtered.map((r) => (
          <Link
            key={r.id}
            to={`/beheer/${r.id}`}
            className="rd-card-white"
            style={{ textDecoration: "none", color: "inherit", display: "block" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 16 }}>
                  {r.contact_name || "Naamloos"}
                  {r.status === "concept" && (
                    <span style={{ fontWeight: 600, fontSize: 12, opacity: 0.55 }}> · concept</span>
                  )}
                </div>
                <div style={{ fontSize: 13, opacity: 0.7 }}>{r.contact_email}</div>
                {r.main_question && (
                  <div style={{ fontSize: 13, opacity: 0.85, marginTop: 6 }}>
                    {r.main_question.slice(0, 90)}
                    {r.main_question.length > 90 ? "..." : ""}
                  </div>
                )}
                <div style={{ display: "flex", gap: 10, marginTop: 8, fontSize: 12, opacity: 0.6 }}>
                  <span>{(r.rooms?.length ?? 0)} ruimte(s)</span>
                  {r.complexity_level && <span>· {r.complexity_level}</span>}
                  <span>· {formatDate(r.created_at)}</span>
                </div>
              </div>
              <StatusPill status={r.advisor_status} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
