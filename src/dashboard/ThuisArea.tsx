import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

// Werkgebied voor thuisadvies: vertrekpostcode + reisafstand. Leeg = geen thuisadvies.
// Beheerders beheren hier ook de uitgesloten postcodes (eilanden e.d.).

const KMS = [15, 25, 40, 60];

export function ThuisArea({ stylistId, canEdit, isAdmin, onFlash }: { stylistId: string; canEdit: boolean; isAdmin: boolean; onFlash: (t: string) => void }) {
  const [country, setCountry] = useState("NL");
  const [pc, setPc] = useState("");
  const [km, setKm] = useState(25);
  const [place, setPlace] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!stylistId) return;
    supabase.from("stylists").select("home_country,home_pc4,travel_km").eq("id", stylistId).maybeSingle().then(({ data }) => {
      const d = data as { home_country: string; home_pc4: string | null; travel_km: number | null } | null;
      setCountry(d?.home_country ?? "NL"); setPc(d?.home_pc4 ?? ""); setKm(d?.travel_km ?? 25);
    });
  }, [stylistId]);
  useEffect(() => {
    if (pc.length !== 4) { setPlace(null); return; }
    supabase.rpc("postcode_info", { p_country: country, p_pc4: pc }).then(({ data }) => setPlace((data as { place?: string } | null)?.place ?? null));
  }, [pc, country]);

  const save = async (clear = false) => {
    setSaving(true); setErr(null);
    const { error } = await supabase.rpc("set_thuis_area", { p_stylist_id: stylistId, p_country: country, p_pc4: clear ? "" : pc, p_km: clear ? 0 : km });
    setSaving(false);
    if (error) { setErr(error.message); return; }
    if (clear) setPc("");
    onFlash(clear ? "Thuisadvies uitgezet." : "Werkgebied opgeslagen.");
  };

  return (
    <div className="rd-card-white" style={{ marginTop: 12 }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 10 }}>Thuisadvies: je werkgebied</div>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Kom je ook bij klanten thuis? Vul je vertrekpostcode in en hoe ver je wilt reizen. Klanten binnen die afstand kunnen thuisadvies aanvragen. Laat je het leeg, dan doe je geen thuisadvies.
      </p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <select className="rd-input" value={country} disabled={!canEdit} onChange={(e) => setCountry(e.target.value)} style={{ height: 44, width: 140 }} aria-label="Land">
          <option value="NL">Nederland</option>
          <option value="BE">België</option>
        </select>
        <input className="rd-input" inputMode="numeric" placeholder="Postcode (4 cijfers)" value={pc} disabled={!canEdit} maxLength={4}
          onChange={(e) => setPc(e.target.value.replace(/\D/g, "").slice(0, 4))} style={{ height: 44, width: 170 }} aria-label="Vertrekpostcode" />
        <select className="rd-input" value={km} disabled={!canEdit} onChange={(e) => setKm(Number(e.target.value))} style={{ height: 44, width: 150 }} aria-label="Reisafstand">
          {KMS.map((k) => <option key={k} value={k}>Tot {k} km</option>)}
        </select>
        {canEdit && <button className="rd-btn rd-btn-primary" onClick={() => save()} disabled={saving || pc.length !== 4} style={{ width: "auto", padding: "0 20px", minHeight: 44 }}>{saving ? "Opslaan..." : "Opslaan"}</button>}
        {canEdit && pc && <button className="rd-textlink" onClick={() => save(true)} disabled={saving}>Geen thuisadvies</button>}
      </div>
      <p style={{ fontSize: 13, margin: "10px 0 0", opacity: 0.75 }}>
        {pc.length === 4 ? `Je komt bij klanten tot ${km} km van ${pc}${place ? ` (${place})` : ""}, hemelsbreed gemeten.` : "Je doet nu geen thuisadvies."}
      </p>
      {err && <p style={{ color: "var(--rd-pink-dark)", fontWeight: 600, fontSize: 14 }}>{err}</p>}
      {isAdmin && <Uitgesloten onFlash={onFlash} />}
    </div>
  );
}

function Uitgesloten({ onFlash }: { onFlash: (t: string) => void }) {
  const [rows, setRows] = useState<{ id: string; country: string; pc_from: number; pc_to: number; label: string | null }[]>([]);
  const [form, setForm] = useState({ country: "NL", from: "", to: "", label: "" });
  const load = async () => {
    const { data } = await supabase.from("thuis_excluded").select("id,country,pc_from,pc_to,label").order("country").order("pc_from");
    setRows((data as typeof rows) ?? []);
  };
  useEffect(() => { load(); }, []);
  const add = async () => {
    const f = Number(form.from), t = Number(form.to || form.from);
    if (!f || !t || t < f) return;
    const { error } = await supabase.from("thuis_excluded").insert({ country: form.country, pc_from: f, pc_to: t, label: form.label.trim() || null });
    if (!error) { setForm({ ...form, from: "", to: "", label: "" }); load(); onFlash("Uitgesloten postcode toegevoegd."); }
  };
  const del = async (id: string) => { await supabase.from("thuis_excluded").delete().eq("id", id); load(); };
  return (
    <details style={{ marginTop: 14 }}>
      <summary style={{ cursor: "pointer", fontSize: 13, color: "var(--rd-pink-dark)", fontWeight: 600 }}>Uitgesloten postcodes (alleen beheer)</summary>
      <p className="rd-sub" style={{ margin: "8px 0" }}>Postcodes waar we nooit thuisadvies doen, ook als ze binnen iemands reisafstand vallen. Bijvoorbeeld de Waddeneilanden.</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10 }}>
        {rows.map((r) => (
          <div key={r.id} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 14 }}>
            <span>{r.country} {r.pc_from}{r.pc_to !== r.pc_from ? ` t/m ${r.pc_to}` : ""}{r.label ? ` · ${r.label}` : ""}</span>
            <button className="rd-textlink" onClick={() => del(r.id)}>Verwijderen</button>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <select className="rd-input" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} style={{ height: 40, width: 90 }} aria-label="Land"><option>NL</option><option>BE</option></select>
        <input className="rd-input" placeholder="Van" inputMode="numeric" value={form.from} onChange={(e) => setForm({ ...form, from: e.target.value.replace(/\D/g, "").slice(0, 4) })} style={{ height: 40, width: 80 }} />
        <input className="rd-input" placeholder="Tot en met" inputMode="numeric" value={form.to} onChange={(e) => setForm({ ...form, to: e.target.value.replace(/\D/g, "").slice(0, 4) })} style={{ height: 40, width: 110 }} />
        <input className="rd-input" placeholder="Naam, bijv. Texel" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} style={{ height: 40, width: 160 }} />
        <button className="rd-btn rd-btn-outline" onClick={add} style={{ width: "auto", padding: "0 14px", minHeight: 40 }}>Toevoegen</button>
      </div>
    </details>
  );
}
