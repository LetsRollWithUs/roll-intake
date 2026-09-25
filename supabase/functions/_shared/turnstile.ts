// Cloudflare Turnstile: controleert op de server dat een verzoek van een mens komt.
// TURNSTILE_MODE = "enforce" blokkeert bij een ongeldig antwoord; elke andere waarde
// (standaard) is meet-modus: alleen loggen, niemand tegenhouden.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";

const SECRET = Deno.env.get("TURNSTILE_SECRET_KEY") ?? "";
const ENFORCE = (Deno.env.get("TURNSTILE_MODE") ?? "").toLowerCase() === "enforce";

export type TurnstileResult = { ok: boolean; codes: string[]; hostname: string | null };

export async function verifyTurnstile(token: unknown, ip: string | null): Promise<TurnstileResult> {
  if (!SECRET) return { ok: false, codes: ["missing-secret"], hostname: null };
  if (typeof token !== "string" || !token) return { ok: false, codes: ["missing-token"], hostname: null };
  try {
    const form = new FormData();
    form.append("secret", SECRET);
    form.append("response", token);
    if (ip) form.append("remoteip", ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const d = await r.json();
    return { ok: !!d.success, codes: d["error-codes"] ?? [], hostname: d.hostname ?? null };
  } catch {
    return { ok: false, codes: ["verify-unreachable"], hostname: null };
  }
}

/**
 * Controleert het token en legt de uitkomst vast in turnstile_log. Geeft true terug als het
 * verzoek door mag. In meet-modus altijd true; in enforce-modus alleen bij een geldig token
 * (of als Cloudflare zelf onbereikbaar is, zodat een storing daar geen klanten tegenhoudt).
 */
export async function turnstileGate(admin: SupabaseClient, req: Request, token: unknown, action: string): Promise<boolean> {
  const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const res = await verifyTurnstile(token, ip);
  const allowed = !ENFORCE || res.ok || res.codes.includes("verify-unreachable");
  try {
    await admin.from("turnstile_log").insert({
      action, ok: res.ok, codes: res.codes, hostname: res.hostname, mode: ENFORCE ? "enforce" : "log", blocked: !allowed,
    });
  } catch { /* loggen is best-effort */ }
  return allowed;
}

export const TURNSTILE_BLOCKED_MSG = "We konden niet controleren of je verzoek klopt. Ververs de pagina en probeer het opnieuw.";
