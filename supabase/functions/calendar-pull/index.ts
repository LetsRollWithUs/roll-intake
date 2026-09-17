// Haalt per styliste haar iCal-feed op en schrijft de bezette tijden naar busy_blocks.
// Zo blokkeren eigen agenda-afspraken de beschikbaarheid.
// - cron (header x-cron-secret): synct alle stylisten met een feed.
// - adviseur (JWT) met body.stylist_id: synct één styliste (voor "sync nu" in het dashboard).
import { createClient } from "jsr:@supabase/supabase-js@2";
import ical from "npm:node-ical@0.20.1";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CALENDAR_CRON_SECRET") ?? "";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const j = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, "content-type": "application/json" } });

const WINDOW_DAYS = 56;
const MAX_OCCURRENCES = 500;

interface Interval { start: string; end: string; uid: string | null }

// Zet één VEVENT om naar bezette intervallen binnen het venster (incl. herhaling).
function eventIntervals(ev: any, winStart: Date, winEnd: Date): Interval[] {
  if (!ev || ev.type !== "VEVENT" || !ev.start) return [];
  const startMs = new Date(ev.start).getTime();
  let durMs = ev.end ? new Date(ev.end).getTime() - startMs : 0;
  if (!Number.isFinite(durMs) || durMs <= 0) durMs = 30 * 60000; // veilige minimale duur
  const out: Interval[] = [];

  if (ev.rrule) {
    let occ: Date[] = [];
    try {
      occ = ev.rrule.between(winStart, winEnd, true).slice(0, MAX_OCCURRENCES);
    } catch {
      occ = [];
    }
    const exdates = new Set<number>(
      ev.exdate ? Object.values(ev.exdate).map((d: any) => new Date(d).setSeconds(0, 0)) : [],
    );
    for (const o of occ) {
      if (exdates.has(new Date(o).setSeconds(0, 0))) continue;
      const s = new Date(o);
      const e = new Date(s.getTime() + durMs);
      out.push({ start: s.toISOString(), end: e.toISOString(), uid: ev.uid ?? null });
    }
    return out;
  }

  // Losse afspraak: alleen als hij het venster raakt.
  const s = new Date(startMs);
  const e = new Date(startMs + durMs);
  if (e >= winStart && s <= winEnd) {
    out.push({ start: s.toISOString(), end: e.toISOString(), uid: ev.uid ?? null });
  }
  return out;
}

async function fetchFeed(url: string): Promise<string> {
  const https = url.replace(/^webcal:\/\//i, "https://");
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(https, { signal: ctrl.signal, redirect: "follow" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

async function syncStylist(admin: any, stylist: { id: string; ical_feed_url: string }) {
  const winStart = new Date();
  const winEnd = new Date(Date.now() + WINDOW_DAYS * 864e5);
  const text = await fetchFeed(stylist.ical_feed_url); // gooit bij fout -> caller vangt
  const parsed = ical.parseICS(text);

  const rows: { stylist_id: string; start_at: string; end_at: string; source: string; external_uid: string | null }[] = [];
  for (const k of Object.keys(parsed)) {
    for (const iv of eventIntervals(parsed[k], winStart, winEnd)) {
      if (new Date(iv.end) < winStart) continue;
      rows.push({ stylist_id: stylist.id, start_at: iv.start, end_at: iv.end, source: "ical", external_uid: iv.uid });
    }
  }

  // Alleen bij een geslaagde ophaal/parse vervangen we de toekomstige blokken.
  await admin.from("busy_blocks").delete()
    .eq("stylist_id", stylist.id).eq("source", "ical").gte("end_at", winStart.toISOString());
  if (rows.length) {
    for (let i = 0; i < rows.length; i += 500) {
      await admin.from("busy_blocks").insert(rows.slice(i, i + 500));
    }
  }
  await admin.from("stylists").update({ ical_synced_at: new Date().toISOString() }).eq("id", stylist.id);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const admin = createClient(SB_URL, SB_SERVICE, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({} as any));
    const isCron = CRON_SECRET && req.headers.get("x-cron-secret") === CRON_SECRET;

    let query = admin.from("stylists").select("id,ical_feed_url").eq("active", true).not("ical_feed_url", "is", null);

    if (!isCron) {
      const caller = createClient(SB_URL, SB_ANON, {
        global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } },
        auth: { persistSession: false },
      });
      const { data: isAdv } = await caller.rpc("is_advisor");
      if (isAdv !== true) return j({ error: "Geen toegang" }, 403);
      if (!body.stylist_id) return j({ error: "stylist_id vereist" }, 400);
      query = query.eq("id", body.stylist_id);
    }

    const { data: stylists } = await query;
    const results: Record<string, unknown>[] = [];
    for (const st of (stylists ?? []) as { id: string; ical_feed_url: string }[]) {
      try {
        const n = await syncStylist(admin, st);
        results.push({ stylist_id: st.id, blocks: n });
      } catch (e) {
        results.push({ stylist_id: st.id, error: String(e) });
      }
    }
    return j({ ok: true, synced: results.length, results });
  } catch (e) {
    return j({ error: String(e) }, 500);
  }
});
