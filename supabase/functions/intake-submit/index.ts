// Opslaan van de klant-intake via de server, met Turnstile-controle.
// - concept (anon + turnstile): bewaart naam en e-mail zodra de klant die invult.
// - prepare (anon + turnstile): geeft upload-links voor de foto's en een ticket om af te ronden.
// - submit (anon + ticket): rondt de intake af via submit_intake.
// Het ticket (HMAC, 2 uur geldig, gebonden aan het intake-id) voorkomt dat de klant
// voor het afronden nog een tweede keer gecontroleerd moet worden.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { turnstileGate, TURNSTILE_BLOCKED_MSG } from "../_shared/turnstile.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "intake-photos";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const PATH = /^[0-9a-f-]{36}\/(rooms\/[\w-]{1,64}|samples|inspiration)\/[\w-]{1,64}\.[a-z0-9]{1,5}$/;
const TICKET_TTL = 2 * 3600;

async function hmac(msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(SB_SERVICE), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
async function makeTicket(id: string): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + TICKET_TTL;
  return `${exp}.${await hmac(`${id}.${exp}`)}`;
}
async function ticketOk(id: string, ticket: unknown): Promise<boolean> {
  if (typeof ticket !== "string") return false;
  const [exp, sig] = ticket.split(".");
  if (!exp || !sig || Number(exp) < Date.now() / 1000) return false;
  return sig === (await hmac(`${id}.${exp}`));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json();
    const id = String(body.id ?? "");
    if (!UUID.test(id)) return j({ error: "ongeldig id" }, 400);
    const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });

    if (body.action === "concept") {
      const email = String(body.email ?? "").trim().slice(0, 200);
      if (!/.+@.+\..+/.test(email)) return j({ error: "ongeldig e-mailadres" }, 400);
      if (!(await turnstileGate(admin, req, body.turnstile_token, "intake_concept"))) return j({ error: TURNSTILE_BLOCKED_MSG }, 403);
      const { error } = await admin.from("intake").insert({
        id, status: "concept", contact_name: String(body.name ?? "").trim().slice(0, 200) || null, contact_email: email,
      });
      // 23505 = concept bestaat al; naam en e-mail worden bij afronden alsnog overschreven.
      if (error && error.code !== "23505") return j({ error: error.message }, 500);
      return j({ ok: true });
    }

    if (body.action === "prepare") {
      const paths: unknown = body.paths ?? [];
      if (!Array.isArray(paths) || paths.length > 80) return j({ error: "ongeldige foto's" }, 400);
      // Onbekende paden slaan we over (die foto blijft dan leeg), de rest gaat gewoon door.
      const valid = (paths as unknown[]).filter((p): p is string => typeof p === "string" && PATH.test(p) && p.startsWith(id + "/"));
      if (!(await turnstileGate(admin, req, body.turnstile_token, "intake_submit"))) return j({ error: TURNSTILE_BLOCKED_MSG }, 403);
      const uploads: Record<string, string> = {};
      for (const p of valid) {
        const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(p, { upsert: true });
        if (!error && data) uploads[p] = data.token;
      }
      return j({ uploads, ticket: await makeTicket(id) });
    }

    if (body.action === "submit") {
      if (!(await ticketOk(id, body.ticket))) return j({ error: TURNSTILE_BLOCKED_MSG }, 403);
      if (!body.row || typeof body.row !== "object") return j({ error: "geen gegevens" }, 400);
      const { error } = await admin.rpc("submit_intake", { p_id: id, p_row: body.row });
      if (error) return j({ error: error.message }, 500);
      return j({ ok: true });
    }

    return j({ error: "onbekende actie" }, 400);
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
