import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";

// Maandoverzicht per styliste voor de facturatie: verfcommissie, bezoekvergoedingen (thuisadvies)
// en de afdracht aan Roll (10%) over aanvullend interieuradvies. Een styliste ziet alleen zichzelf (RLS).

const eur = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n);
const UITKOMST: Record<string, string> = { uitgevoerd: "Uitgevoerd", geannuleerd_ruim: "Ruim vooraf geannuleerd/verzet", geannuleerd_kort: "Binnen 24 uur geannuleerd/verzet", dichte_deur: "Onderweg of dichte deur" };
const AFDRACHT = 0.1;

function monthRange(ym: string): [string, string] {
  const [y, m] = ym.split("-").map(Number);
  return [new Date(Date.UTC(y, m - 1, 1)).toISOString(), new Date(Date.UTC(y, m, 1)).toISOString()];
}

interface Row { stylist_id: string; name: string; commissie: number; commissieN: number; bezoek: number; bezoekN: number; parkeren: number; upsell: number; afdracht: number; upsellN: number }

export function MaandOverzicht() {
  const now = new Date();
  const [ym, setYm] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`);
  const [data, setData] = useState<{ rows: Row[]; visits: any[]; upsells: any[] } | null>(null);

  useEffect(() => {
    (async () => {
      setData(null);
      const [from, to] = monthRange(ym);
      const [{ data: st }, { data: cm }, { data: tv }, { data: up }] = await Promise.all([
        supabase.from("stylists").select("id,name"),
        supabase.from("commissions").select("stylist_id,amount,status,created_at").gte("created_at", from).lt("created_at", to).neq("status", "vervallen"),
        supabase.from("thuis_visits").select("id,booking_id,stylist_id,planned_at,outcome,fee,parking,created_at, bookings(customer_name)").gte("created_at", from).lt("created_at", to).order("created_at"),
        supabase.from("bookings").select("id,stylist_id,customer_name,upsell_value,upsell_booked_at").eq("upsell_booked", true).gte("upsell_booked_at", from).lt("upsell_booked_at", to),
      ]);
      const names = new Map(((st as { id: string; name: string }[]) ?? []).map((s) => [s.id, s.name]));
      const by = new Map<string, Row>();
      const row = (sid: string) => {
        if (!by.has(sid)) by.set(sid, { stylist_id: sid, name: names.get(sid) ?? "Onbekend", commissie: 0, commissieN: 0, bezoek: 0, bezoekN: 0, parkeren: 0, upsell: 0, afdracht: 0, upsellN: 0 });
        return by.get(sid)!;
      };
      for (const c of (cm as any[]) ?? []) { if (!c.stylist_id) continue; const r = row(c.stylist_id); r.commissie += Number(c.amount ?? 0); r.commissieN++; }
      for (const v of (tv as any[]) ?? []) { if (!v.stylist_id) continue; const r = row(v.stylist_id); r.bezoek += Number(v.fee ?? 0); r.parkeren += Number(v.parking ?? 0); r.bezoekN++; }
      for (const u of (up as any[]) ?? []) { if (!u.stylist_id) continue; const r = row(u.stylist_id); r.upsell += Number(u.upsell_value ?? 0); r.afdracht += Number(u.upsell_value ?? 0) * AFDRACHT; r.upsellN++; }
      setData({ rows: [...by.values()].sort((a, b) => a.name.localeCompare(b.name)), visits: (tv as any[]) ?? [], upsells: (up as any[]) ?? [] });
    })();
  }, [ym]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    return { v: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, l: d.toLocaleDateString("nl-NL", { month: "long", year: "numeric" }) };
  }), []); // eslint-disable-line react-hooks/exhaustive-deps

  const csv = () => {
    if (!data) return;
    const lines = [["Styliste", "Verfcommissie", "Aantal orders", "Bezoekvergoeding", "Aantal bezoeken", "Parkeerkosten", "Te factureren door styliste", "Interieuradvies omzet", "Afdracht aan Roll (10%)"].join(";")];
    for (const r of data.rows) lines.push([r.name, r.commissie.toFixed(2), r.commissieN, r.bezoek.toFixed(2), r.bezoekN, r.parkeren.toFixed(2), (r.commissie + r.bezoek + r.parkeren).toFixed(2), r.upsell.toFixed(2), r.afdracht.toFixed(2)].join(";").replace(/\./g, ","));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" }));
    a.download = `maandoverzicht-${ym}.csv`;
    a.click();
  };

  return (
    <div className="rd-card-white" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "center" }}>
        <div className="rd-kicker rd-kicker-pink">Maandoverzicht voor de facturatie</div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <select className="rd-input" value={ym} onChange={(e) => setYm(e.target.value)} style={{ height: 40 }} aria-label="Maand">
            {months.map((m) => <option key={m.v} value={m.v}>{m.l}</option>)}
          </select>
          <button className="rd-btn rd-btn-outline" onClick={csv} disabled={!data?.rows.length} style={{ width: "auto", padding: "0 14px", minHeight: 40 }}>Download CSV</button>
        </div>
      </div>
      {!data ? <p className="rd-sub">Laden...</p> : data.rows.length === 0 ? <p className="rd-sub">Geen commissie, bezoeken of interieuradvies in deze maand.</p> : (
        <div style={{ overflowX: "auto", marginTop: 12 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14, minWidth: 720 }}>
            <thead>
              <tr style={{ textAlign: "left", fontSize: 12, opacity: 0.7 }}>
                <th style={{ padding: "6px 8px" }}>Styliste</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Verfcommissie</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Bezoekvergoeding</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Parkeerkosten</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Te factureren</th>
                <th style={{ padding: "6px 8px", textAlign: "right" }}>Afdracht interieuradvies</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.stylist_id} style={{ borderTop: "1px solid var(--rd-line)" }}>
                  <td style={{ padding: "8px", fontWeight: 700 }}>{r.name}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(r.commissie)} <span style={{ opacity: 0.6 }}>({r.commissieN})</span></td>
                  <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{eur(r.bezoek)} <span style={{ opacity: 0.6 }}>({r.bezoekN})</span></td>
                  <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.parkeren ? eur(r.parkeren) : "-"}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{eur(r.commissie + r.bezoek + r.parkeren)}</td>
                  <td style={{ padding: "8px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{r.upsellN ? `${eur(r.afdracht)} (10% van ${eur(r.upsell)})` : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.visits.length > 0 && (
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 600 }}>Thuisbezoeken deze maand ({data.visits.length})</summary>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginTop: 8, fontSize: 13 }}>
                {data.visits.map((v) => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <span>{v.planned_at ? new Date(v.planned_at).toLocaleDateString("nl-NL", { day: "numeric", month: "short" }) : "-"} · {v.bookings?.customer_name ?? "Klant"} · {UITKOMST[v.outcome] ?? v.outcome}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums" }}>{eur(Number(v.fee))}{Number(v.parking) > 0 ? ` + ${eur(Number(v.parking))} parkeren` : ""}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
          <p style={{ fontSize: 12, opacity: 0.65, margin: "10px 0 0" }}>
            Bedragen exclusief btw; parkeerkosten zoals betaald. Verfcommissie op orderdatum, zonder vervallen commissie. De afdracht over interieuradvies (10%) geldt voor de eerste aanvullende opdracht uit een Roll-klant en wordt met de factuur verrekend.
          </p>
        </div>
      )}
    </div>
  );
}
