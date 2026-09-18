import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

interface Alert {
  id: string;
  kind: string;
  message: string;
  payload: Record<string, unknown>;
  created_at: string;
  acknowledged_at: string | null;
}

const KIND_LABEL: Record<string, string> = {
  paid_unplaced: "Betaald, niet geplaatst",
  notification_failed: "Mail niet verstuurd",
  confirm_error: "Bevestiging mislukt",
  booking_cancelled: "Afspraak geannuleerd",
};

// Meldingen: systeemalerts waar een mens naar moet kijken, plus de staat van de mail-outbox.
export function AlertsPage() {
  const [open, setOpen] = useState<Alert[]>([]);
  const [recent, setRecent] = useState<Alert[]>([]);
  const [outbox, setOutbox] = useState<{ pending: number; dead: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: o }, { data: r }, { count: pending }, { count: dead }] = await Promise.all([
      supabase.from("system_alerts").select("*").is("acknowledged_at", null).order("created_at", { ascending: false }),
      supabase.from("system_alerts").select("*").not("acknowledged_at", "is", null).order("acknowledged_at", { ascending: false }).limit(15),
      supabase.from("notification_outbox").select("id", { count: "exact", head: true }).is("sent_at", null).lt("attempts", 6),
      supabase.from("notification_outbox").select("id", { count: "exact", head: true }).is("sent_at", null).gte("attempts", 6),
    ]);
    setOpen((o as Alert[]) ?? []);
    setRecent((r as Alert[]) ?? []);
    setOutbox({ pending: pending ?? 0, dead: dead ?? 0 });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const acknowledge = async (id: string) => {
    setBusyId(id);
    await supabase.from("system_alerts").update({ acknowledged_at: new Date().toISOString() }).eq("id", id);
    setBusyId(null);
    load();
  };

  const bookingId = (a: Alert) => (a.payload?.booking_id as string | undefined) ?? null;

  const Row = ({ a, done }: { a: Alert; done?: boolean }) => (
    <div className="rd-card-white" style={{ opacity: done ? 0.7 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ minWidth: 0, flex: 1 }}>
          <span className="rd-chip" style={{ background: done ? "var(--rd-grey-light)" : "var(--rd-pink-dark)", color: done ? "inherit" : "#fff", fontWeight: 700 }}>
            {KIND_LABEL[a.kind] ?? a.kind}
          </span>
          <div style={{ fontSize: 15, marginTop: 8 }}>{a.message}</div>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            {formatDate(a.created_at)}
            {a.payload?.customer_email ? ` · ${String(a.payload.customer_email)}` : ""}
            {a.payload?.email ? ` · ${String(a.payload.email)}` : ""}
            {done && a.acknowledged_at ? ` · afgehandeld ${formatDate(a.acknowledged_at)}` : ""}
          </div>
        </div>
        {!done && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {bookingId(a) && (
              <Link to="/beheer/boekingen" className="rd-plan-chip" style={{ textDecoration: "none" }}>
                Naar boekingen
              </Link>
            )}
            <button className="rd-plan-chip" onClick={() => acknowledge(a.id)} disabled={busyId === a.id}>
              {busyId === a.id ? "..." : "Afgehandeld"}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>
        Meldingen
      </h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Dingen die aandacht nodig hebben: betalingen zonder plek, mails die niet verstuurd konden worden.
      </p>

      {outbox && (
        <div className="rd-card-white" style={{ marginTop: 12, display: "flex", gap: 24, flexWrap: "wrap" }}>
          <div>
            <div className="rd-kicker" style={{ opacity: 0.6 }}>Mails in wachtrij</div>
            <div style={{ fontWeight: 800, fontSize: 22 }}>{outbox.pending}</div>
          </div>
          <div>
            <div className="rd-kicker" style={{ opacity: 0.6 }}>Definitief mislukt</div>
            <div style={{ fontWeight: 800, fontSize: 22, color: outbox.dead > 0 ? "var(--rd-pink-dark)" : "inherit" }}>{outbox.dead}</div>
          </div>
          <p className="rd-sub" style={{ margin: 0, alignSelf: "center", flex: "1 1 240px" }}>
            De wachtrij wordt elke minuut opnieuw geprobeerd (tot ~2 uur). Wat definitief mislukt, staat hieronder als melding.
          </p>
        </div>
      )}

      <div className="rd-kicker rd-kicker-pink" style={{ margin: "20px 0 8px" }}>
        Open ({open.length})
      </div>
      {loading ? (
        <p className="rd-sub">Laden...</p>
      ) : open.length === 0 ? (
        <p className="rd-sub">Niets open. Mooi zo.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {open.map((a) => <Row key={a.id} a={a} />)}
        </div>
      )}

      {recent.length > 0 && (
        <>
          <div className="rd-kicker" style={{ margin: "24px 0 8px", opacity: 0.6 }}>
            Recent afgehandeld
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {recent.map((a) => <Row key={a.id} a={a} done />)}
          </div>
        </>
      )}
    </div>
  );
}
