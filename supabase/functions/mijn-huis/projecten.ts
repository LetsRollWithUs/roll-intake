// Projecten (huizen) en ruimtes voor Mijn huis. Eigenaar is de WooCommerce-gebruiker (woo_user_id) die de
// plugin meestuurt; elke schrijfactie controleert dat project en ruimte bij die gebruiker horen.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { ROLL_COLORS } from "../_shared/roll-collection.ts";

const KLEUR_IDS = new Set(ROLL_COLORS.map((c: any) => c.id));
const RUIMTE_KOLOMMEN =
  "id,project_id,naam,soort,kleur_id,test_kleuren,plafond_mee,plafond_kleur_id,omtrek_m,hoogte_m,aftrek_m2,muur_m2,plafond_m2,ondergrond,status_klant,quiz_result_id,sort,updated_at";

// ILIKE zonder jokers: % en _ in een e-mailadres mogen nooit andere adressen matchen.
export const exact = (e: string) => e.replace(/[\\%_]/g, "\\$&");
const tekst = (v: unknown, max = 80) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const kleur = (v: unknown) => (typeof v === "string" && KLEUR_IDS.has(v) ? v : null);
const getal = (v: unknown, max = 1000) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n <= max ? Math.round(n * 100) / 100 : null;
};

const RUIMTE: Record<string, string> = {
  woonkamer: "Woonkamer", slaapkamer: "Slaapkamer", keuken: "Keuken", badkamer: "Badkamer", hal: "Gang en hal",
  kinderkamer: "Kinderkamer", werkkamer: "Werkkamer", eetkamer: "Eetkamer", wc: "Toilet", anders: "Andere ruimte",
};

export async function projectAction(sb: SupabaseClient, body: any): Promise<{ status: number; data: unknown }> {
  const uid = Number(body.woo_user_id);
  const alleenLezen = body.action === "plan_claim" && body.alleen_lezen === true;
  if (!alleenLezen && (!Number.isInteger(uid) || uid <= 0)) return { status: 400, data: { error: "gebruiker" } };
  const site = typeof body.site === "string" && /^[a-z0-9.-]{3,100}$/.test(body.site) ? body.site : "roll.nl";
  const email = typeof body.email === "string" && body.email.includes("@") ? body.email.trim().toLowerCase().slice(0, 200) : null;

  const eigenProject = async (pid: unknown) => {
    if (typeof pid !== "string") return null;
    const { data } = await sb.from("mh_projecten").select("id").eq("id", pid).eq("woo_user_id", uid).eq("site", site).is("archived_at", null).maybeSingle();
    return data ? data.id as string : null;
  };
  const eigenRuimte = async (rid: unknown) => {
    if (typeof rid !== "string") return null;
    const { data } = await sb.from("mh_ruimtes").select("id,project_id, mh_projecten!inner(woo_user_id,site)")
      .eq("id", rid).eq("mh_projecten.woo_user_id", uid).eq("mh_projecten.site", site).is("archived_at", null).maybeSingle();
    return data ? data as { id: string; project_id: string } : null;
  };

  switch (body.action) {
    case "projecten": {
      let { data: ps } = await sb.from("mh_projecten").select("id,naam,postcode,created_at,updated_at")
        .eq("woo_user_id", uid).eq("site", site).is("archived_at", null).order("created_at");
      // Eerste keer: maak een project uit de kleurentests bij het (bevestigde) e-mailadres.
      if ((!ps || ps.length === 0) && body.importeer && email) {
        const { data: qs } = await sb.from("quiz_results")
          .select("id,created_at,room_type,primary_color_id,secondary_colors")
          .ilike("email", exact(email)).not("primary_color_id", "is", null)
          .gte("created_at", new Date(Date.now() - 400 * 864e5).toISOString())
          .order("created_at", { ascending: false }).limit(20);
        if (qs && qs.length) {
          const { data: p } = await sb.from("mh_projecten").insert({ woo_user_id: uid, site, email, naam: "Mijn huis" }).select("id").single();
          const gezien = new Set<string>();
          const rijen = [];
          for (const q of qs as any[]) {
            const soort = q.room_type ?? "anders";
            if (gezien.has(soort)) continue;
            gezien.add(soort);
            const test = [q.primary_color_id, ...(Array.isArray(q.secondary_colors) ? q.secondary_colors.map((c: any) => c?.id) : [])]
              .filter((id: any) => KLEUR_IDS.has(id)).slice(0, 3);
            rijen.push({ project_id: p!.id, naam: RUIMTE[soort] ?? "Ruimte", soort, test_kleuren: test, quiz_result_id: q.id, sort: rijen.length });
          }
          if (rijen.length) await sb.from("mh_ruimtes").insert(rijen);
          ({ data: ps } = await sb.from("mh_projecten").select("id,naam,postcode,created_at,updated_at")
            .eq("woo_user_id", uid).eq("site", site).is("archived_at", null).order("created_at"));
        }
      }
      const ids = (ps ?? []).map((p: any) => p.id);
      const { data: rs } = ids.length
        ? await sb.from("mh_ruimtes").select(RUIMTE_KOLOMMEN).in("project_id", ids).is("archived_at", null).order("sort").order("created_at")
        : { data: [] as any[] };
      return {
        status: 200,
        data: { projecten: (ps ?? []).map((p: any) => ({ ...p, ruimtes: (rs ?? []).filter((r: any) => r.project_id === p.id) })) },
      };
    }

    case "project_opslaan": {
      const naam = tekst(body.naam, 60) || "Mijn huis";
      const postcode = tekst(body.postcode, 10).toUpperCase() || null;
      if (body.id) {
        const pid = await eigenProject(body.id);
        if (!pid) return { status: 404, data: { error: "project" } };
        await sb.from("mh_projecten").update({ naam, postcode, updated_at: new Date().toISOString() }).eq("id", pid);
        return { status: 200, data: { id: pid } };
      }
      const { count } = await sb.from("mh_projecten").select("id", { count: "exact", head: true }).eq("woo_user_id", uid).eq("site", site).is("archived_at", null);
      if ((count ?? 0) >= 10) return { status: 400, data: { error: "maximaal 10 projecten" } };
      const { data, error } = await sb.from("mh_projecten").insert({ woo_user_id: uid, site, email, naam, postcode }).select("id").single();
      if (error) return { status: 500, data: { error: "opslaan" } };
      return { status: 200, data: { id: data.id } };
    }

    case "project_weg": {
      const pid = await eigenProject(body.id);
      if (!pid) return { status: 404, data: { error: "project" } };
      await sb.from("mh_projecten").update({ archived_at: new Date().toISOString() }).eq("id", pid);
      return { status: 200, data: { ok: true } };
    }

    case "ruimte_opslaan": {
      const v = body.ruimte ?? {};
      const velden: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if ("naam" in v) velden.naam = tekst(v.naam, 60) || "Ruimte";
      if ("soort" in v) velden.soort = tekst(v.soort, 30) || null;
      if ("kleur_id" in v) velden.kleur_id = kleur(v.kleur_id);
      if ("plafond_kleur_id" in v) velden.plafond_kleur_id = kleur(v.plafond_kleur_id);
      if ("plafond_mee" in v) velden.plafond_mee = !!v.plafond_mee;
      if ("ondergrond" in v) velden.ondergrond = ["bestaand", "nieuw", "behang", "onbekend"].includes(v.ondergrond) ? v.ondergrond : "bestaand";
      if ("status_klant" in v) velden.status_klant = ["niet_getest", "twijfel", "uitgesteld", "klaar"].includes(v.status_klant) ? v.status_klant : null;
      if ("test_kleuren" in v) velden.test_kleuren = (Array.isArray(v.test_kleuren) ? v.test_kleuren : []).map(kleur).filter(Boolean).slice(0, 6);
      for (const k of ["omtrek_m", "hoogte_m", "aftrek_m2", "muur_m2", "plafond_m2"]) if (k in v) velden[k] = getal(v[k]);
      // Muuroppervlak uit de maten als omtrek en hoogte er zijn; anders telt het direct ingevulde aantal m².
      const omtrek = velden.omtrek_m as number | null | undefined, hoogte = velden.hoogte_m as number | null | undefined;
      if (omtrek && hoogte) {
        velden.muur_m2 = Math.max(0, Math.round((omtrek * hoogte - ((velden.aftrek_m2 as number) ?? 0)) * 10) / 10);
      }

      if (v.id) {
        const r = await eigenRuimte(v.id);
        if (!r) return { status: 404, data: { error: "ruimte" } };
        const { data } = await sb.from("mh_ruimtes").update(velden).eq("id", r.id).select(RUIMTE_KOLOMMEN).single();
        await sb.from("mh_projecten").update({ updated_at: new Date().toISOString() }).eq("id", r.project_id);
        return { status: 200, data: { ruimte: data } };
      }
      const pid = await eigenProject(body.project_id);
      if (!pid) return { status: 404, data: { error: "project" } };
      const { count } = await sb.from("mh_ruimtes").select("id", { count: "exact", head: true }).eq("project_id", pid).is("archived_at", null);
      if ((count ?? 0) >= 30) return { status: 400, data: { error: "maximaal 30 ruimtes" } };
      const { data, error } = await sb.from("mh_ruimtes").insert({ ...velden, project_id: pid, naam: velden.naam ?? "Ruimte", sort: count ?? 0 })
        .select(RUIMTE_KOLOMMEN).single();
      if (error) return { status: 500, data: { error: "opslaan" } };
      return { status: 200, data: { ruimte: data } };
    }

    case "plan_claim": {
      // Link uit de mail "Kleurplan bewaard": id + token. Eenmalig; maakt een project met de gekozen ruimtes,
      // aangevuld met kleuren uit de kleurentests bij hetzelfde e-mailadres.
      const [pid, token] = String(body.plan ?? "").split(".");
      if (!/^[0-9a-f-]{36}$/.test(pid ?? "") || !/^[0-9a-f]{64}$/.test(token ?? "")) return { status: 400, data: { error: "link" } };
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token))))
        .map((x) => x.toString(16).padStart(2, "0")).join("");
      const { data: plan } = await sb.from("mh_kleurplannen").select("id,email,voornaam,postcode,ruimtes,token_hash,verloopt_at,geclaimd_at")
        .eq("id", pid).maybeSingle();
      if (!plan || plan.token_hash !== hash) return { status: 404, data: { error: "link" } };
      if (plan.geclaimd_at) return { status: 409, data: { error: "al gebruikt", email: plan.email } };
      if (new Date(plan.verloopt_at).getTime() < Date.now()) return { status: 410, data: { error: "verlopen" } };
      // Alleen lezen (voor de plugin om te kiezen: inloggen, account maken of koppelen).
      if (body.alleen_lezen) return { status: 200, data: { email: plan.email, voornaam: plan.voornaam } };
      if (!email || email !== String(plan.email).toLowerCase()) return { status: 403, data: { error: "ander adres", email: plan.email } };

      const { data: geclaimd } = await sb.from("mh_kleurplannen").update({ geclaimd_at: new Date().toISOString(), woo_user_id: uid })
        .eq("id", plan.id).is("geclaimd_at", null).select("id").maybeSingle();
      if (!geclaimd) return { status: 409, data: { error: "al gebruikt" } };

      const { data: qs } = await sb.from("quiz_results").select("id,room_type,primary_color_id,secondary_colors")
        .ilike("email", exact(email)).not("primary_color_id", "is", null)
        .gte("created_at", new Date(Date.now() - 400 * 864e5).toISOString()).order("created_at", { ascending: false }).limit(20);
      const perSoort = new Map<string, any>();
      for (const q of (qs as any[]) ?? []) if (!perSoort.has(q.room_type ?? "anders")) perSoort.set(q.room_type ?? "anders", q);

      const { count } = await sb.from("mh_projecten").select("id", { count: "exact", head: true })
        .eq("woo_user_id", uid).eq("site", site).is("archived_at", null);
      const { data: p } = await sb.from("mh_projecten")
        .insert({ woo_user_id: uid, site, email, naam: (count ?? 0) > 0 ? "Mijn kleurplan" : "Mijn huis", postcode: plan.postcode }).select("id").single();
      const rijen = (plan.ruimtes as any[]).map((r, i) => {
        const q = perSoort.get(r.soort);
        const test = q ? [q.primary_color_id, ...(Array.isArray(q.secondary_colors) ? q.secondary_colors.map((c: any) => c?.id) : [])]
          .filter((id: any) => KLEUR_IDS.has(id)).slice(0, 3) : [];
        return { project_id: p!.id, naam: r.naam || RUIMTE[r.soort] || "Ruimte", soort: r.soort, test_kleuren: test, quiz_result_id: q?.id ?? null, sort: i };
      });
      if (rijen.length) await sb.from("mh_ruimtes").insert(rijen);
      await sb.from("mh_kleurplannen").update({ project_id: p!.id }).eq("id", plan.id);
      return { status: 200, data: { project_id: p!.id, voornaam: plan.voornaam } };
    }

    case "ruimte_weg": {
      const r = await eigenRuimte(body.id);
      if (!r) return { status: 404, data: { error: "ruimte" } };
      await sb.from("mh_ruimtes").update({ archived_at: new Date().toISOString() }).eq("id", r.id);
      return { status: 200, data: { ok: true } };
    }
  }
  return { status: 400, data: { error: "onbekende actie" } };
}
