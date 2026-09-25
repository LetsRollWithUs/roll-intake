// Beheer van adviseur-accounts vanuit het dashboard.
// Alleen aanroepbaar door een ingelogde beheerder (advisors.role = 'beheerder').
// Gebruikt de service-role (server-side) voor auth-acties.
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "content-type": "application/json" },
  });
}

async function findUserIdByEmail(admin: any, email: string): Promise<string | null> {
  // Doorloop pagina's tot we het adres vinden.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) return null;
    const hit = data.users.find((u: any) => (u.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) break;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anon = Deno.env.get("SUPABASE_ANON_KEY")!;
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";

    // Wie roept aan?
    const caller = createClient(url, anon, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data: userRes } = await caller.auth.getUser();
    const callerEmail = (userRes?.user?.email ?? "").toLowerCase();
    const { data: isAdm } = await caller.rpc("is_admin");
    if (isAdm !== true) return json({ error: "Alleen beheerders mogen het team beheren." }, 403);

    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { action, email, name, password } = await req.json();
    const mail = String(email ?? "").trim().toLowerCase();

    if (action === "list") {
      const { data, error } = await admin.from("advisors").select("email, name").order("email");
      if (error) return json({ error: error.message }, 400);
      return json({ advisors: data });
    }

    if (action === "create") {
      if (!mail || !password || String(password).length < 8) {
        return json({ error: "E-mail en een wachtwoord van minstens 8 tekens zijn verplicht." }, 400);
      }
      const { error: cErr } = await admin.auth.admin.createUser({
        email: mail,
        password: String(password),
        email_confirm: true,
      });
      const already = cErr && /already|registered|exists/i.test(cErr.message);
      if (cErr && !already) return json({ error: cErr.message }, 400);
      const { error: aErr } = await admin
        .from("advisors")
        .upsert({ email: mail, name: name ?? null }, { onConflict: "email" });
      if (aErr) return json({ error: aErr.message }, 400);
      return json({ ok: true, existed: !!already });
    }

    if (action === "set_password") {
      if (!mail || !password || String(password).length < 8) {
        return json({ error: "Wachtwoord van minstens 8 tekens is verplicht." }, 400);
      }
      const id = await findUserIdByEmail(admin, mail);
      if (!id) return json({ error: "Account niet gevonden." }, 404);
      const { error } = await admin.auth.admin.updateUserById(id, { password: String(password) });
      if (error) return json({ error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === "delete") {
      if (mail === callerEmail) return json({ error: "Je kunt jezelf niet verwijderen." }, 400);
      await admin.from("advisors").delete().eq("email", mail);
      const id = await findUserIdByEmail(admin, mail);
      if (id) await admin.auth.admin.deleteUser(id);
      return json({ ok: true });
    }

    return json({ error: "Onbekende actie." }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
