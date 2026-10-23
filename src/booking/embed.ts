// Boeken als pop-up op roll.nl (iframe). ?embed=1 of automatisch als de pagina in een frame staat.
// - berichten naar de ouderpagina: {type:'roll-intake', event, ...}
// - betalen opent in het hoofdvenster (de ouder krijgt ook een 'checkout'-bericht met pay_url als terugval)
// - UTM-parameters uit de iframe-URL gaan mee naar de bestelling

const params = () => new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");

export function isEmbed(): boolean {
  if (typeof window === "undefined") return false;
  if (params().get("embed") === "1") return true;
  try { return window.self !== window.top; } catch { return true; }
}

// Doel van postMessage: roll.nl (of een subdomein), afgeleid van de verwijzende pagina; lokaal ook localhost.
function parentOrigin(): string {
  try {
    const o = new URL(document.referrer).origin;
    if (/^https:\/\/([a-z0-9-]+\.)*roll\.nl$/.test(o)) return o;
    if (import.meta.env.DEV && /^http:\/\/localhost(:\d+)?$/.test(o)) return o;
  } catch { /* geen referrer */ }
  return "https://roll.nl";
}

export function postToParent(event: "step" | "checkout" | "close", data: Record<string, unknown> = {}): void {
  if (!isEmbed() || window.parent === window) return;
  try { window.parent.postMessage({ type: "roll-intake", event, ...data }, parentOrigin()); } catch { /* ouder niet bereikbaar */ }
}

/** Naar de betaalpagina: in een iframe in het hoofdvenster, anders gewoon in dit venster. */
export function goToPayment(payUrl: string, data: Record<string, unknown> = {}): void {
  if (!isEmbed()) { window.location.href = payUrl; return; }
  postToParent("checkout", { ...data, pay_url: payUrl });
  try {
    (window.top as Window).location.href = payUrl;
  } catch {
    // Navigeren van het hoofdvenster geblokkeerd (sandbox): de ouderpagina handelt het 'checkout'-bericht af,
    // en als laatste redmiddel openen we de betaalpagina in een nieuw tabblad.
    setTimeout(() => window.open(payUrl, "_blank", "noopener"), 400);
  }
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export function utmParams(): Record<string, string> | undefined {
  const p = params();
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) { const v = p.get(k); if (v) out[k] = v.slice(0, 120); }
  return Object.keys(out).length ? out : undefined;
}

/** Plan van roll.nl/kleurplan (?kleurplan=<token>): gaat mee met de boeking, zodat de intake al is ingevuld. */
export function kleurplanToken(): string | undefined {
  const t = params().get("kleurplan") ?? "";
  return /^\d+-[a-f0-9]{24}$/.test(t) ? t : undefined;
}
