// Cloudflare Turnstile in de browser: haalt vlak voor een verzoek een token op.
// De widget blijft onzichtbaar en verschijnt alleen als Cloudflare om een klik vraagt.
// Lukt het niet (geblokkeerd script, time-out), dan komt er null terug en beslist de server.

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

// Lokaal de testsleutel van Cloudflare (werkt op elke host), live de echte site key.
const SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY ??
  (import.meta.env.DEV ? "1x00000000000000000000AA" : "0x4AAAAAAE-2hkeZXEX1hRUP");

let scriptP: Promise<void> | null = null;
function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (!scriptP) {
    scriptP = new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => { scriptP = null; reject(new Error("turnstile laden mislukt")); };
      document.head.appendChild(s);
    });
  }
  return scriptP;
}

/** Vooraf laden, zodat het token straks sneller klaar is. */
export function preloadTurnstile(): void {
  loadScript().catch(() => {});
}

export async function getTurnstileToken(action: string, timeoutMs = 60000): Promise<string | null> {
  try {
    await loadScript();
    const ts = window.turnstile;
    if (!ts) return null;
    const host = document.createElement("div");
    host.style.cssText = "position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:9999";
    document.body.appendChild(host);
    return await new Promise<string | null>((resolve) => {
      let widgetId: string | null = null;
      let settled = false;
      const done = (v: string | null) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        try { if (widgetId) ts.remove(widgetId); } catch { /* al weg */ }
        host.remove();
        resolve(v);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      widgetId = ts.render(host, {
        sitekey: SITE_KEY,
        action,
        appearance: "interaction-only",
        language: "nl",
        callback: (t: string) => done(t),
        "error-callback": () => { done(null); return true; },
        "timeout-callback": () => done(null),
        "unsupported-callback": () => done(null),
      });
    });
  } catch {
    return null;
  }
}
