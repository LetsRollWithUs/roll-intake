import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { SURFACES, DAYLIGHT, DAYLIGHT_DIRS, SUN_MOMENTS, USAGE_TIMES, PLANNING } from "@/data/intake-options";
import { INSPIRATIONS } from "@/data/inspiration";
import { rollColors } from "@/data/roll-colors";
import { STATUSES, type AdvisorStatus } from "./status";
import { OUTCOMES, BUY_MOMENTS, PRODUCTS } from "./outcome";
import { StatusPill, formatDate } from "./ui";
import type { IntakeRow, DbPhoto, AdviceRow } from "./types";

function lbl(list: { key: string; label: string }[], key?: string | null): string {
  if (!key) return "";
  return list.find((x) => x.key === key)?.label ?? key;
}
function surfaceLabels(keys?: string[]): string {
  return (keys ?? []).map((k) => lbl(SURFACES, k)).join(", ");
}
// Alleen echte http(s)-links tonen; alles anders (javascript:, data:, rommel) als platte tekst.
function safeUrl(v?: string | null): string | null {
  return v && /^https?:\/\//i.test(v.trim()) ? v.trim() : null;
}

const PHOTO_BUCKET = "intake-photos";

const SAMPLE_STATUS: Record<string, string> = {
  nee: "Nog geen samples getest",
  ja: "Ja, samples getest",
  roll: "Ja, van Roll",
  andere: "Ja, van andere merken",
  allebei: "Ja, van Roll en andere merken",
};

// Opslagpad van een foto: nieuwe rijen hebben `path`, oude rijen een publieke URL waar we het pad uit halen.
function photoPath(p: DbPhoto): string | null {
  if (p.path) return p.path;
  if (!p.url) return null;
  const m = p.url.match(/\/object\/(?:public|sign)\/intake-photos\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// Foto's staan in een privé bucket; adviseurs krijgen kortlevende signed URLs (1 uur).
function Photos({ photos }: { photos?: (DbPhoto | null)[] }) {
  const list = (photos ?? []).filter((p): p is DbPhoto => !!p && !!photoPath(p));
  const key = list.map((p) => photoPath(p)).join("|");
  const [signed, setSigned] = useState<Record<string, string>>({});

  useEffect(() => {
    const paths = list.map((p) => photoPath(p)).filter((x): x is string => !!x);
    if (paths.length === 0) return;
    let stale = false;
    supabase.storage.from(PHOTO_BUCKET).createSignedUrls(paths, 3600).then(({ data }) => {
      if (stale || !data) return;
      const map: Record<string, string> = {};
      for (const d of data) if (d.path && d.signedUrl) map[d.path] = d.signedUrl;
      setSigned(map);
    });
    return () => {
      stale = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (list.length === 0) return <span style={{ opacity: 0.5, fontSize: 13 }}>Geen foto's</span>;
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
      {list.map((p, i) => {
        const src = signed[photoPath(p)!];
        const box = { width: 84, height: 84, borderRadius: 10, display: "block" as const };
        if (!src) return <div key={i} style={{ ...box, background: "var(--rd-grey-light)" }} aria-label="Foto laden" />;
        return (
          <a key={i} href={src} target="_blank" rel="noreferrer">
            <img src={src} alt="" style={{ ...box, objectFit: "cover" }} />
          </a>
        );
      })}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rd-card-white" style={{ marginTop: 12 }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  );
}

interface OrderItem { name: string; sku: string; qty: number; total: number; kind: "sample" | "product" }
interface CustomerOrder { id: number; number: string; date: string | null; status: string; total: number; currency: string; items: OrderItem[] }
interface OrdersResp { ok: boolean; orders: CustomerOrder[]; order_count: number; total_spent: number; sample_items: number; product_items: number }

const euro = (n: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(n || 0);
const WOO_STATUS: Record<string, string> = { processing: "Betaald", completed: "Afgerond", "on-hold": "In behandeling" };

// Toont wat deze klant al bij Roll kocht (samples, verf, producten) + besteed bedrag.
function CustomerPurchases({ email }: { email: string | null }) {
  const [data, setData] = useState<OrdersResp | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!email) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      const { data: d, error } = await supabase.functions.invoke("booking", {
        body: { action: "customer_orders", email },
      });
      if (error || !(d as OrdersResp | null)?.ok) setFailed(true);
      else setData(d as OrdersResp);
      setLoading(false);
    })();
  }, [email]);

  return (
    <Section title="Aankopen van deze klant">
      {loading ? (
        <p className="rd-sub" style={{ margin: 0 }}>Aankopen ophalen...</p>
      ) : failed ? (
        <p className="rd-sub" style={{ margin: 0 }}>Kon de aankopen nu niet ophalen.</p>
      ) : !data || data.order_count === 0 ? (
        <p className="rd-sub" style={{ margin: 0 }}>Nog geen aankopen gevonden bij dit e-mailadres.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            <span className="rd-chip" style={{ background: "var(--rd-pink-dark)", color: "#fff", fontWeight: 700 }}>
              Totaal besteed {euro(data.total_spent)}
            </span>
            <span className="rd-chip">{data.order_count} bestelling{data.order_count === 1 ? "" : "en"}</span>
            {data.sample_items > 0 && <span className="rd-chip">{data.sample_items} sample(s)</span>}
            {data.product_items > 0 && <span className="rd-chip">{data.product_items} product(en)</span>}
          </div>
          {data.orders.map((o) => (
            <div key={o.id} style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>
                  #{o.number} · {formatDate(o.date)}
                  <span style={{ fontWeight: 600, opacity: 0.6 }}> · {WOO_STATUS[o.status] ?? o.status}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{euro(o.total)}</div>
              </div>
              <div style={{ marginTop: 4, display: "flex", flexDirection: "column", gap: 2 }}>
                {o.items.map((it, i) => (
                  <div key={i} style={{ fontSize: 13, opacity: 0.85, display: "flex", gap: 6, alignItems: "center" }}>
                    <span
                      className="rd-chip"
                      style={{ fontSize: 11, padding: "1px 7px", background: it.kind === "sample" ? "var(--rd-lavender)" : "var(--rd-grey-light)" }}
                    >
                      {it.kind === "sample" ? "sample" : "product"}
                    </span>
                    <span>{it.qty}× {it.name}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Section>
  );
}

export function IntakeDetail() {
  const { id } = useParams();
  const [row, setRow] = useState<IntakeRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [status, setStatus] = useState<AdvisorStatus>("nieuw");
  const [notes, setNotes] = useState("");
  const [reason, setReason] = useState("");
  const [outcome, setOutcome] = useState<string>("");
  const [advice, setAdvice] = useState<AdviceRow[]>([]);
  const [buyMoment, setBuyMoment] = useState<string>("");
  const [nextAction, setNextAction] = useState("");
  const [offerUrl, setOfferUrl] = useState("");
  const [summary, setSummary] = useState("");
  const [offerNotes, setOfferNotes] = useState("");
  const [followupSentAt, setFollowupSentAt] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [sendingFollowup, setSendingFollowup] = useState(false);
  const [followupMsg, setFollowupMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase.from("intake").select("*").eq("id", id).maybeSingle();
      if (!data) setNotFound(true);
      else {
        const r = data as IntakeRow;
        setRow(r);
        setStatus((r.advisor_status as AdvisorStatus) ?? "nieuw");
        setNotes(r.advisor_notes ?? "");
        setReason(r.advisor_rejected_reason ?? "");
        setOutcome(r.advisor_outcome ?? "");
        setBuyMoment(r.advisor_buy_moment ?? "");
        setNextAction(r.advisor_next_action ?? "");
        setOfferUrl(r.advisor_offer_url ?? "");
        setSummary(r.advisor_summary ?? "");
        setOfferNotes(r.advisor_offer_notes ?? "");
        setFollowupSentAt(r.advisor_followup_sent_at ?? null);
        // Advies-regels: bewaard, anders voorgevuld met de ruimtes uit de intake.
        const saved = r.advisor_advice ?? [];
        if (saved.length > 0) setAdvice(saved);
        else
          setAdvice(
            (r.rooms ?? []).map((rm) => ({ room: rm.label, color: "", product: "Muurverf", liters: "", m2: "" })),
          );
      }
      setLoading(false);
    })();
  }, [id]);

  const setAdviceRow = (i: number, patch: Partial<AdviceRow>) =>
    setAdvice((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addAdviceRow = () =>
    setAdvice((prev) => [...prev, { room: "", color: "", product: "Muurverf", liters: "", m2: "" }]);
  const removeAdviceRow = (i: number) => setAdvice((prev) => prev.filter((_, idx) => idx !== i));

  const persist = async () => {
    const cleanAdvice = advice.filter((a) => a.room.trim() || a.color.trim() || a.liters.trim() || (a.m2 ?? "").trim());
    return supabase
      .from("intake")
      .update({
        advisor_status: status,
        advisor_notes: notes || null,
        advisor_rejected_reason: status === "afgewezen" ? reason || null : null,
        advisor_outcome: outcome || null,
        advisor_advice: cleanAdvice,
        advisor_buy_moment: buyMoment || null,
        advisor_next_action: nextAction || null,
        advisor_offer_url: offerUrl.trim() || null,
        advisor_summary: summary.trim() || null,
        advisor_offer_notes: offerNotes.trim() || null,
        advisor_updated_at: new Date().toISOString(),
      })
      .eq("id", id);
  };

  const save = async () => {
    setSaving(true);
    setSaved(false);
    const { error } = await persist();
    setSaving(false);
    if (!error) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    }
  };

  // Slaat op en stuurt de opvolgmail (samples of verf) via Klaviyo.
  const sendFollowup = async () => {
    setSendingFollowup(true);
    setFollowupMsg(null);
    const { error } = await persist();
    if (error) {
      setSendingFollowup(false);
      setFollowupMsg("Opslaan mislukte, mail niet verstuurd.");
      return;
    }
    const { data, error: fnErr } = await supabase.functions.invoke("booking", {
      body: { action: "advies_done", intake_id: id },
    });
    setSendingFollowup(false);
    if (fnErr || !(data as { ok?: boolean } | null)?.ok) {
      setFollowupMsg("Versturen lukte niet. Probeer het later opnieuw.");
      return;
    }
    setFollowupSentAt(new Date().toISOString());
    setFollowupMsg("Opvolgmail verstuurd ✓");
    setTimeout(() => setFollowupMsg(null), 3000);
  };

  if (loading) return <p className="rd-sub">Laden...</p>;
  if (notFound || !row)
    return (
      <div>
        <Link to="/beheer" className="rd-textlink">
          ← Terug
        </Link>
        <p className="rd-sub">Intake niet gevonden.</p>
      </div>
    );

  const p = row.payload ?? {};
  const likeThumbs = (row.inspiration_likes ?? [])
    .map((idk) => INSPIRATIONS.find((x) => x.id === idk))
    .filter(Boolean) as { src: string; label: string }[];

  return (
    <div>
      <Link to="/beheer" className="rd-textlink" style={{ textDecoration: "none" }}>
        ← Alle intakes
      </Link>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, marginTop: 8 }}>
        <div>
          <h1 className="rd-h2" style={{ marginBottom: 2 }}>
            {row.contact_name || "Naamloos"}
          </h1>
          <a href={`mailto:${row.contact_email}`} style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>
            {row.contact_email}
          </a>
          <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>
            Binnengekomen {formatDate(row.created_at)}
            {row.status === "concept" && " · concept (niet afgerond)"}
          </div>
        </div>
        <StatusPill status={row.advisor_status} />
      </div>

      {/* Workflow */}
      <div className="rd-card-white" style={{ marginTop: 16, background: "var(--rd-grey-light)" }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
          Workflow
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {STATUSES.map((s) => (
            <button
              key={s.key}
              className={`rd-plan-chip${status === s.key ? " is-on" : ""}`}
              onClick={() => setStatus(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>

        {status === "afgewezen" && (
          <div style={{ marginTop: 12 }}>
            <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
              Reden van afwijzing
            </div>
            <textarea
              className="rd-input"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Waarom haakte de klant af? Bijv. budget, timing, koos ander merk."
              style={{ height: 72, paddingTop: 10, resize: "none", lineHeight: 1.4 }}
            />
          </div>
        )}

        {/* Uitkomst van het gesprek (stuurt straks de opvolging) */}
        <datalist id="detail-roll-colors">
          {rollColors.map((c) => (
            <option key={c.id} value={c.name} />
          ))}
        </datalist>

        <div style={{ marginTop: 16, borderTop: "1px solid var(--rd-line)", paddingTop: 14 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>
            Uitkomst van het gesprek
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {OUTCOMES.map((o) => (
              <button
                key={o.key}
                className={`rd-plan-chip${outcome === o.key ? " is-on" : ""}`}
                onClick={() => setOutcome(outcome === o.key ? "" : o.key)}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        {/* Gesprekssamenvatting (kan mee in de opvolgmail) */}
        <div style={{ marginTop: 14 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Gesprekssamenvatting
          </div>
          <textarea
            className="rd-input"
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            placeholder="Korte samenvatting van het gesprek voor de klant. Bijv. de richting, waarom deze kleuren passen en wat de volgende stap is."
            style={{ height: 110, paddingTop: 12, resize: "vertical", lineHeight: 1.45 }}
          />
          <p className="rd-sub" style={{ marginTop: 4 }}>
            Deze samenvatting kan mee in de opvolgmail naar de klant.
          </p>
        </div>

        {/* Offerte-input voor Roll: advies per ruimte */}
        <div style={{ marginTop: 14 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 8 }}>
            Offerte-input: geadviseerde kleuren per ruimte
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {advice.map((a, i) => (
              <div key={i} style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" }}>
                <input
                  className="rd-input"
                  value={a.room}
                  onChange={(e) => setAdviceRow(i, { room: e.target.value })}
                  placeholder="Ruimte"
                  style={{ flex: "1 1 120px", minWidth: 0, height: 44 }}
                />
                <input
                  className="rd-input"
                  value={a.color}
                  onChange={(e) => setAdviceRow(i, { color: e.target.value })}
                  placeholder="Kleur"
                  list="detail-roll-colors"
                  style={{ flex: "1 1 130px", minWidth: 0, height: 44 }}
                />
                <select
                  className="rd-input"
                  value={a.product}
                  onChange={(e) => setAdviceRow(i, { product: e.target.value })}
                  style={{ flex: "0 1 120px", minWidth: 0, height: 44 }}
                >
                  {PRODUCTS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
                <input
                  className="rd-input"
                  value={a.m2 ?? ""}
                  onChange={(e) => setAdviceRow(i, { m2: e.target.value })}
                  placeholder="m²"
                  inputMode="decimal"
                  aria-label="Oppervlakte in m²"
                  style={{ flex: "0 1 70px", minWidth: 0, height: 44 }}
                />
                <input
                  className="rd-input"
                  value={a.liters}
                  onChange={(e) => setAdviceRow(i, { liters: e.target.value })}
                  placeholder="Liters"
                  inputMode="decimal"
                  style={{ flex: "0 1 80px", minWidth: 0, height: 44 }}
                />
                <button
                  className="rd-textlink"
                  onClick={() => removeAdviceRow(i)}
                  aria-label="Regel verwijderen"
                  style={{ minHeight: 44, opacity: 0.6 }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
          <button className="rd-textlink" onClick={addAdviceRow} style={{ minHeight: 40 }}>
            + Regel toevoegen
          </button>
        </div>

        {/* Koopmoment */}
        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 8 }}>
            Koopmoment
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {BUY_MOMENTS.map((b) => (
              <button
                key={b.key}
                className={`rd-plan-chip${buyMoment === b.key ? " is-on" : ""}`}
                onClick={() => setBuyMoment(buyMoment === b.key ? "" : b.key)}
              >
                {b.label}
              </button>
            ))}
          </div>
        </div>

        {/* Offerte-link (verf-route) */}
        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Offerte-link (verf-route)
          </div>
          <input
            className="rd-input"
            type="url"
            value={offerUrl}
            onChange={(e) => setOfferUrl(e.target.value)}
            placeholder="https://roll.nl/offerte/... (laat leeg → klant gaat naar /prijsopgave)"
          />
        </div>

        {/* Offerte-notitie voor het Roll-kantoor (intern) */}
        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Offerte-notitie voor Roll (intern)
          </div>
          <textarea
            className="rd-input"
            value={offerNotes}
            onChange={(e) => setOfferNotes(e.target.value)}
            placeholder="Alles wat Roll nodig heeft om de offerte op te maken. Bijv. bijzondere wensen, aantal m² totaal, gewenste korting, primer nodig, leverwensen."
            style={{ height: 90, paddingTop: 12, resize: "vertical", lineHeight: 1.45 }}
          />
        </div>

        {/* Vervolgactie */}
        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Vervolgactie
          </div>
          <input
            className="rd-input"
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            placeholder="Bijv. samples nasturen, over 1 week terugbellen, offerte maken."
          />
        </div>

        <div style={{ marginTop: 12 }}>
          <div className="rd-kicker" style={{ opacity: 0.6, marginBottom: 6 }}>
            Advies / notities
          </div>
          <textarea
            className="rd-input"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Jouw kleuradvies, voorstellen en interne notities."
            style={{ height: 140, paddingTop: 12, resize: "vertical", lineHeight: 1.45 }}
          />
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 12, flexWrap: "wrap" }}>
          <button
            className="rd-btn rd-btn-primary"
            onClick={save}
            disabled={saving}
            style={{ width: "auto", padding: "0 24px", ...(saving ? { opacity: 0.5 } : {}) }}
          >
            {saving ? "Opslaan..." : "Opslaan"}
          </button>
          <a
            className="rd-btn rd-btn-outline"
            href="https://roll.nl/offerte"
            target="_blank"
            rel="noreferrer"
            style={{ width: "auto", padding: "0 22px", textDecoration: "none" }}
          >
            Offerte maken ↗
          </a>
          {saved && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>Opgeslagen ✓</span>}
          {row.advisor_updated_at && !saved && (
            <span style={{ fontSize: 12, opacity: 0.55 }}>Laatst bijgewerkt {formatDate(row.advisor_updated_at)}</span>
          )}
        </div>
        <p className="rd-sub" style={{ marginTop: 8 }}>
          Opent de prijsopgave op roll.nl in een nieuw tabblad (log daar in). De kleuren en ruimtes
          van deze intake staan hieronder ter referentie.
        </p>

        {/* Opvolgmail sturen */}
        <div style={{ marginTop: 14, borderTop: "1px solid var(--rd-line)", paddingTop: 14 }}>
          <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>
            Opvolgmail naar de klant
          </div>
          <p className="rd-sub" style={{ marginTop: 0 }}>
            {outcome === "samples_needed"
              ? "Stuurt de klant een mail om de geadviseerde kleuren als samples te bestellen (stickers of verftesters)."
              : outcome === "color_chosen"
              ? "Stuurt de klant een mail om de verf te bestellen, via je offerte-link hierboven of anders /prijsopgave."
              : outcome === "followup_needed"
              ? "Stuurt de klant een korte opvolgmail. Vul eventueel een offerte-link in voor de verf-route."
              : "Kies eerst een uitkomst van het gesprek om de juiste opvolgmail te sturen."}
          </p>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <button
              className="rd-btn rd-btn-primary"
              onClick={sendFollowup}
              disabled={sendingFollowup || !outcome}
              style={{ width: "auto", padding: "0 22px", ...(sendingFollowup || !outcome ? { opacity: 0.5 } : {}) }}
            >
              {sendingFollowup ? "Versturen..." : "Opslaan + opvolgmail sturen"}
            </button>
            {followupMsg && <span style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{followupMsg}</span>}
            {followupSentAt && !followupMsg && (
              <span style={{ fontSize: 12, opacity: 0.55 }}>Laatst verstuurd {formatDate(followupSentAt)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Aankopen van de klant (uit WooCommerce) */}
      <CustomerPurchases email={row.contact_email} />

      {/* Vraag */}
      <Section title="Jouw vraag">
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
          {row.main_question || <span style={{ opacity: 0.5 }}>Niet ingevuld</span>}
        </p>
        {(p.questionScope as string) && (
          <p style={{ margin: "8px 0 0", fontSize: 13, opacity: 0.7 }}>
            Voor: {p.questionScope === "een" ? "één ruimte" : "meerdere ruimtes"}
          </p>
        )}
        {(row.help_needs?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
            {row.help_needs!.map((h) => (
              <span key={h} className="rd-chip">
                {h}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Ruimtes */}
      <Section title={`Ruimtes (${row.rooms?.length ?? 0})`}>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {(row.rooms ?? []).map((r) => (
            <div key={r.id}>
              <div style={{ fontWeight: 800, fontSize: 15 }}>
                {r.label} {r.priority && <span title="Voorrang">★</span>}
              </div>
              <div style={{ fontSize: 13, opacity: 0.75, margin: "2px 0 8px" }}>
                {surfaceLabels(r.surfaces)}
                {r.noWindows
                  ? " · geen ramen"
                  : (r.sun?.length ? ` · zon: ${r.sun.map((k) => lbl(SUN_MOMENTS, k)).join(", ")}` : "")}
                {r.skylight && " · dakraam"}
                {r.usage && ` · ${lbl(USAGE_TIMES, r.usage)}`}
                {/* legacy */}
                {!r.sun && r.daylight && ` · ${lbl(DAYLIGHT, r.daylight)}`}
                {!r.sun && r.daylightDir && ` · licht uit ${lbl(DAYLIGHT_DIRS, r.daylightDir)}`}
              </div>
              {r.otherChanges === true && (
                <div style={{ fontSize: 13, opacity: 0.75, margin: "0 0 8px" }}>
                  Verandert nog: vloer/meubels/gordijnen{r.otherChangesNote ? ` — ${r.otherChangesNote}` : ""}
                </div>
              )}
              <Photos photos={r.photos} />
            </div>
          ))}
        </div>
      </Section>

      {/* Sfeer */}
      <Section title="Sfeer">
        {likeThumbs.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
            {likeThumbs.map((t, i) => (
              <div key={i} style={{ textAlign: "center" }}>
                <img src={t.src} alt={t.label} style={{ width: 84, height: 84, objectFit: "cover", borderRadius: 10 }} />
                <div style={{ fontSize: 11, opacity: 0.6, marginTop: 3 }}>{t.label}</div>
              </div>
            ))}
          </div>
        ) : (
          p.noSfeerImage === true && <p style={{ margin: "0 0 8px", fontSize: 13, opacity: 0.6 }}>Geen sfeerbeeld gekozen</p>
        )}
        <div style={{ fontSize: 14 }}>
          {(row.moods?.length ?? 0) > 0 && <div>Gevoel: {row.moods!.join(", ")}</div>}
          {row.boldness ? <div>Uitgesprokenheid: {row.boldness}/5</div> : null}
          {p.sfeerSameAll === false && (
            <div style={{ marginTop: 4 }}>
              Sfeer verschilt per ruimte{p.sfeerExceptionNote ? `: ${p.sfeerExceptionNote}` : ""}
            </div>
          )}
        </div>
      </Section>

      {/* Kleuren & samples */}
      <Section title="Kleuren & samples">
        <div style={{ fontSize: 14, marginBottom: 8 }}>
          Al thuis: {SAMPLE_STATUS[row.has_samples ?? ""] ?? row.has_samples ?? "onbekend"}
        </div>
        {(row.colors?.length ?? 0) > 0 && (
          <div style={{ marginBottom: 10 }}>
            <div className="rd-kicker" style={{ opacity: 0.55, marginBottom: 6 }}>
              Overweegt (Roll)
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {row.colors!.map((c, i) => (
                <span key={i} className="rd-chip" style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 99, background: c.hex, border: "1px solid rgba(0,0,0,.1)" }} />
                  {c.name}
                </span>
              ))}
            </div>
          </div>
        )}
        {(row.samples?.length ?? 0) > 0 && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {row.samples!.map((s) => (
              <div key={s.id} style={{ borderTop: "1px solid var(--rd-line)", paddingTop: 8 }}>
                <div style={{ fontWeight: 700, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
                  {s.hex && (
                    <span aria-hidden style={{ width: 14, height: 14, borderRadius: 4, background: s.hex, border: "1px solid rgba(0,0,0,.12)", flex: "none" }} />
                  )}
                  {[s.brand, s.name].filter(Boolean).join(" · ")}{" "}
                  {s.verdict && <span style={{ fontWeight: 600, opacity: 0.6 }}>({s.verdict})</span>}
                </div>
                {s.note && <div style={{ fontSize: 13, opacity: 0.75, marginTop: 2 }}>{s.note}</div>}
                {s.photo?.url && (
                  <div style={{ marginTop: 6 }}>
                    <Photos photos={[s.photo]} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Inspiratie */}
      <Section title="Inspiratie">
        <div style={{ fontSize: 14, display: "flex", flexDirection: "column", gap: 4 }}>
          {safeUrl(row.pinterest_url) && (
            <a href={safeUrl(row.pinterest_url)!} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>
              Pinterest-board
            </a>
          )}
          {safeUrl(row.other_inspiration_url) && (
            <a href={safeUrl(row.other_inspiration_url)!} target="_blank" rel="noreferrer" style={{ color: "var(--rd-pink-dark)" }}>
              Andere link
            </a>
          )}
          {row.inspiration_note && <div style={{ opacity: 0.85 }}>{row.inspiration_note}</div>}
        </div>
        {(row.inspiration_images?.length ?? 0) > 0 && (
          <div style={{ marginTop: 10 }}>
            <Photos photos={row.inspiration_images ?? undefined} />
          </div>
        )}
      </Section>

      {/* Planning */}
      <Section title="Planning">
        <div style={{ fontSize: 14 }}>
          Wil schilderen: {lbl(PLANNING, row.planning) || "onbekend"}
          {row.complexity_level && ` · inschatting: ${row.complexity_level}`}
        </div>
      </Section>
    </div>
  );
}
