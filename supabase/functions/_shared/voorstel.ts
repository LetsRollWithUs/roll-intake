// Bestelvoorstel: hulpfuncties rond de offerte-tool (concept, ophalen, verstuurd) en de samplekorting.
// Zie docs/offerte-endpoint-spec.md en de briefing "Offerte-tool koppeling v2".

export interface OfferLine { ruimte?: string; oppervlak?: string; soort?: string; product?: string; kleurNaam?: string; kleurHex?: string; variant?: string; aantal?: number; stukprijs?: number; totaal?: number; afbeelding?: string; url?: string }
export interface OfferTool { product?: string; aantal?: number; stukprijs?: number; totaal?: number; inMandje?: boolean; afbeelding?: string; url?: string }
export interface Offer {
  id: number | null; nummer: string | null; status: string | null;
  editUrl: string | null; klantUrl: string | null; mandUrl: string | null;
  kleurenOnbekend: string[]; regels: OfferLine[]; tools: OfferTool[];
  subtotaal: number | null; korting: { label: string; bedrag: number } | null;
  extra: { label: string; bedrag: number }[]; verzending: number | null; totaal: number | null; bijgewerkt: string | null;
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : null);
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

// Antwoord van de offerte-tool naar een vaste vorm; ontbrekende velden (oudere versie) worden null of leeg.
export function normalizeOffer(d: any): Offer {
  return {
    id: num(d?.id), nummer: d?.nummer ?? null, status: d?.status ?? null,
    editUrl: d?.editUrl ?? null, klantUrl: d?.klantUrl ?? null, mandUrl: d?.mandUrl ?? null,
    kleurenOnbekend: arr<unknown>(d?.kleurenOnbekend).map(String).slice(0, 20),
    regels: arr<OfferLine>(d?.regels).slice(0, 200),
    tools: arr<OfferTool>(d?.tools).slice(0, 50),
    subtotaal: num(d?.subtotaal),
    korting: d?.korting && typeof d.korting === "object" ? { label: String(d.korting.label ?? "Korting"), bedrag: num(d.korting.bedrag) ?? 0 } : null,
    extra: arr<any>(d?.extra).map((e) => ({ label: String(e?.label ?? ""), bedrag: num(e?.bedrag) ?? 0 })).filter((e) => e.label),
    verzending: num(d?.verzending), totaal: num(d?.totaal), bijgewerkt: d?.bijgewerkt ?? null,
  };
}

// Heeft dit e-mailadres samples gekocht? Dan geldt de Sample korting (10%), met de bijbehorende coupon:
// k7m4xr voor stickers en bundels, p9n3qv voor verftesters. Bij beide kiezen we k7m4xr (zelfde 10%).
export async function sampleDiscount(email: string, wooUrl: string, wooAuth: string): Promise<{ type: "sample"; coupon: string; label: string; pct: number } | null> {
  const e = email.trim().toLowerCase();
  if (!/.+@.+\..+/.test(e)) return null;
  try {
    const res = await fetch(`${wooUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(e)}&per_page=50&orderby=date&order=desc`, { headers: { Authorization: wooAuth } });
    if (!res.ok) return null;
    const orders = await res.json();
    let stickers = false, testers = false;
    for (const o of Array.isArray(orders) ? orders : []) {
      if (String(o.billing?.email ?? "").toLowerCase() !== e) continue;
      if (!["processing", "completed", "on-hold"].includes(o.status)) continue;
      for (const li of o.line_items ?? []) {
        const sku = String(li.sku ?? "").toUpperCase();
        if (/^SMP[-_](STK|PCK)/.test(sku)) stickers = true;
        else if (/^SMP[-_]TST/.test(sku)) testers = true;
      }
    }
    if (!stickers && !testers) return null;
    return { type: "sample", coupon: stickers ? "k7m4xr" : "p9n3qv", label: "Sample korting", pct: 10 };
  } catch {
    return null;
  }
}

// Heeft dit e-mailadres na een moment verf of andere producten (geen samples) besteld?
export async function orderedSince(email: string, sinceIso: string, wooUrl: string, wooAuth: string): Promise<boolean> {
  const e = email.trim().toLowerCase();
  try {
    const res = await fetch(`${wooUrl}/wp-json/wc/v3/orders?search=${encodeURIComponent(e)}&after=${encodeURIComponent(sinceIso)}&per_page=20`, { headers: { Authorization: wooAuth } });
    if (!res.ok) return false;
    const orders = await res.json();
    return (Array.isArray(orders) ? orders : []).some((o: any) =>
      String(o.billing?.email ?? "").toLowerCase() === e &&
      ["processing", "completed", "on-hold"].includes(o.status) &&
      (o.line_items ?? []).some((li: any) => !/^(SMP|ADV)[-_]/i.test(String(li.sku ?? ""))));
  } catch {
    return false;
  }
}

export const MAATWERK_GRENS = 1000;
export const PILOT_AANTAL = 5;
export const ROLL_WHATSAPP = "085 369 62 44";
