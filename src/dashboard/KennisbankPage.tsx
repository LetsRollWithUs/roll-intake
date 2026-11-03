import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";
// De vaste controle van de chat (zelfde bestand als de edge function): alleen tonen, aanpassen gaat in de code.
// @ts-ignore: puur JavaScript zonder typen
import { REGELS } from "../../supabase/functions/_shared/controle.js";

// Kennisbank van Jouw schilderplan: wat de chat over Roll mag zeggen. De edge function projecthulp-chat leest de
// actieve regels (binnen 5 minuten) en valt terug op voorwaarden.json. Alleen beheerders (RLS is_admin).

type Feit = {
  sleutel: string;
  groep: string;
  titel: string;
  soort: "tekst" | "lijst";
  tekst: string;
  bron: string | null;
  gecontroleerd_op: string | null;
  eigenaar: string | null;
  actief: boolean;
  volgorde: number;
  bijgewerkt_door: string | null;
  updated_at: string;
};
type Oud = { id: number; sleutel: string; tekst: string; actief: boolean; door: string | null; op: string };

const vandaag = () => new Date().toISOString().slice(0, 10);
const sleutelVan = (titel: string) => titel.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);

function FeitKaart({ f, email, opgeslagen }: { f: Feit; email: string; opgeslagen: () => void }) {
  const [tekst, setTekst] = useState(f.tekst);
  const [bron, setBron] = useState(f.bron ?? "");
  const [bezig, setBezig] = useState(false);
  const [melding, setMelding] = useState("");
  const [historie, setHistorie] = useState<Oud[] | null>(null);
  useEffect(() => { setTekst(f.tekst); setBron(f.bron ?? ""); }, [f.tekst, f.bron]);
  const gewijzigd = tekst.trim() !== f.tekst || bron.trim() !== (f.bron ?? "");

  const bewaar = async (extra: Partial<Feit> = {}, tekstMelding = "Bewaard. De chat gebruikt het binnen 5 minuten.") => {
    if (!tekst.trim()) { setMelding("Leeg laten kan niet; zet hem dan uit."); return; }
    setBezig(true);
    const { error } = await supabase.from("kennisbank").update({ tekst: tekst.trim(), bron: bron.trim() || null, gecontroleerd_op: vandaag(), bijgewerkt_door: email, ...extra }).eq("sleutel", f.sleutel);
    setBezig(false);
    if (error) { setMelding("Opslaan lukte niet."); return; }
    setMelding(tekstMelding);
    setTimeout(() => setMelding(""), 4000);
    opgeslagen();
  };
  const toonHistorie = async () => {
    if (historie) { setHistorie(null); return; }
    const { data } = await supabase.from("kennisbank_historie").select("*").eq("sleutel", f.sleutel).order("op", { ascending: false }).limit(20);
    setHistorie((data as Oud[]) ?? []);
  };

  return (
    <div className="rd-card-white" style={{ opacity: f.actief ? 1 : 0.6 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", flexWrap: "wrap" }}>
        <div className="rd-card-title">{f.titel}{!f.actief && " (uit)"}</div>
        <div style={{ fontSize: 12, opacity: 0.6 }}>
          {f.gecontroleerd_op ? `Gecontroleerd ${new Date(f.gecontroleerd_op).toLocaleDateString("nl-NL")}` : "Nog niet gecontroleerd"}
          {f.bijgewerkt_door ? ` · ${f.bijgewerkt_door}` : f.eigenaar ? ` · ${f.eigenaar}` : ""}
        </div>
      </div>
      <textarea className="rd-input" rows={f.soort === "lijst" ? Math.min(12, Math.max(3, tekst.split("\n").length + 1)) : 3} style={{ width: "100%", marginTop: 8, minHeight: 72, fontSize: 14, lineHeight: 1.45 }} value={tekst} onChange={(e) => setTekst(e.target.value)} aria-label={f.titel} />
      {f.soort === "lijst" && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>Eén per regel.</div>}
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 8 }}>
        <input className="rd-input" style={{ flex: "1 1 220px", minHeight: 40, fontSize: 13 }} value={bron} onChange={(e) => setBron(e.target.value)} placeholder="Bron (pagina, besluit, productblad)" aria-label={`Bron van ${f.titel}`} />
        <button className="rd-plan-chip is-on" disabled={bezig || !gewijzigd} onClick={() => bewaar()}>Bewaren</button>
        {!gewijzigd && <button className="rd-plan-chip" disabled={bezig} onClick={() => bewaar({}, "Gemarkeerd als gecontroleerd.")}>Klopt nog</button>}
        <button className="rd-plan-chip" disabled={bezig} onClick={() => bewaar({ actief: !f.actief }, f.actief ? "Uitgezet: de chat noemt dit niet meer." : "Aangezet.")}>{f.actief ? "Zet uit" : "Zet aan"}</button>
        <button className="rd-textlink" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 13 }} onClick={toonHistorie}>{historie ? "Verberg eerdere versies" : "Eerdere versies"}</button>
      </div>
      {melding && <p className="rd-sub" role="status" style={{ margin: "6px 0 0", fontWeight: 600 }}>{melding}</p>}
      {historie && (
        <div style={{ marginTop: 10, fontSize: 13 }}>
          {historie.length === 0 ? <p className="rd-sub" style={{ margin: 0 }}>Nog niet eerder gewijzigd.</p> : historie.map((h) => (
            <div key={h.id} style={{ borderTop: "1px solid #eee", padding: "6px 0" }}>
              <div style={{ opacity: 0.6, fontSize: 12 }}>Tot {formatDate(h.op)}{h.door ? ` (${h.door})` : ""}{h.actief ? "" : ", stond uit"}</div>
              <div style={{ whiteSpace: "pre-wrap" }}>{h.tekst}</div>
              <button className="rd-textlink" style={{ background: "none", border: 0, cursor: "pointer", fontSize: 12, padding: 0 }} onClick={() => setTekst(h.tekst)}>Deze tekst terugzetten</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Nieuw({ groepen, email, klaar }: { groepen: string[]; email: string; klaar: () => void }) {
  const [open, setOpen] = useState(false);
  const [groep, setGroep] = useState(groepen[0] ?? "");
  const [titel, setTitel] = useState("");
  const [tekst, setTekst] = useState("");
  const [bron, setBron] = useState("");
  const [fout, setFout] = useState("");
  if (!open) return <button className="rd-plan-chip" onClick={() => setOpen(true)}>Nieuw feit</button>;
  const voegToe = async () => {
    const sleutel = sleutelVan(titel);
    if (!groep.trim() || !sleutel || !tekst.trim()) { setFout("Vul groep, titel en tekst in."); return; }
    const { error } = await supabase.from("kennisbank").insert({ sleutel, groep: groep.trim(), titel: titel.trim(), tekst: tekst.trim(), bron: bron.trim() || null, gecontroleerd_op: vandaag(), eigenaar: email, bijgewerkt_door: email, volgorde: 500 });
    if (error) { setFout(error.code === "23505" ? "Er bestaat al een feit met deze titel." : "Toevoegen lukte niet."); return; }
    setOpen(false); setTitel(""); setTekst(""); setBron(""); setFout("");
    klaar();
  };
  return (
    <div className="rd-card-white" style={{ display: "grid", gap: 8 }}>
      <div className="rd-card-title">Nieuw feit</div>
      <input className="rd-input" list="kb-groepen" value={groep} onChange={(e) => setGroep(e.target.value)} placeholder="Groep" aria-label="Groep" />
      <datalist id="kb-groepen">{groepen.map((g) => <option key={g} value={g} />)}</datalist>
      <input className="rd-input" value={titel} onChange={(e) => setTitel(e.target.value)} placeholder="Titel, bijvoorbeeld: Levertijd België" aria-label="Titel" />
      <textarea className="rd-input" rows={3} value={tekst} onChange={(e) => setTekst(e.target.value)} placeholder="Wat de chat mag zeggen" aria-label="Tekst" />
      <input className="rd-input" value={bron} onChange={(e) => setBron(e.target.value)} placeholder="Bron" aria-label="Bron" />
      {fout && <p className="rd-sub" style={{ margin: 0, color: "var(--rd-pink-dark)" }}>{fout}</p>}
      <div style={{ display: "flex", gap: 8 }}>
        <button className="rd-plan-chip is-on" onClick={voegToe}>Toevoegen</button>
        <button className="rd-plan-chip" onClick={() => setOpen(false)}>Annuleren</button>
      </div>
    </div>
  );
}

export function KennisbankPage() {
  const [feiten, setFeiten] = useState<Feit[]>([]);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState("");
  const [email, setEmail] = useState("");
  const [groep, setGroep] = useState("");
  const [zoek, setZoek] = useState("");

  const laad = async () => {
    const { data, error } = await supabase.from("kennisbank").select("*").order("volgorde").order("titel");
    if (error) setFout("Laden lukte niet. Ben je ingelogd als beheerder?");
    setFeiten((data as Feit[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    laad();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "Roll"));
  }, []);

  const groepen = useMemo(() => [...new Set(feiten.map((f) => f.groep))], [feiten]);
  // Wat langer dan een half jaar niet is nagekeken, valt op.
  const oud = feiten.filter((f) => f.actief && (!f.gecontroleerd_op || Date.now() - new Date(f.gecontroleerd_op).getTime() > 183 * 864e5)).length;
  const zichtbaar = feiten.filter((f) => (!groep || f.groep === groep) && (!zoek.trim() || `${f.titel} ${f.tekst}`.toLowerCase().includes(zoek.trim().toLowerCase())));

  return (
    <div>
      <h1 className="rd-h2" style={{ margin: "0 0 4px" }}>Kennisbank</h1>
      <p className="rd-sub" style={{ marginTop: 0, maxWidth: 720 }}>
        Wat de chat van Jouw schilderplan over Roll mag zeggen. Wat hier niet staat, beweert hij niet; dan verwijst hij naar de klantenservice.
        Een wijziging gebruikt de chat binnen 5 minuten. Productteksten (zoals droogtijden) komen rechtstreeks van de productpagina's.
      </p>
      {oud > 0 && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)", fontWeight: 600 }}>{oud} {oud === 1 ? "feit is" : "feiten zijn"} langer dan een half jaar niet nagekeken.</p>}
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap", alignItems: "center" }}>
        <button className={`rd-plan-chip${!groep ? " is-on" : ""}`} onClick={() => setGroep("")}>Alles ({feiten.length})</button>
        {groepen.map((g) => <button key={g} className={`rd-plan-chip${groep === g ? " is-on" : ""}`} onClick={() => setGroep(g)}>{g}</button>)}
        <input className="rd-input" style={{ maxWidth: 220, minHeight: 44 }} placeholder="Zoek" value={zoek} onChange={(e) => setZoek(e.target.value)} aria-label="Zoek in de kennisbank" />
      </div>
      {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)" }}>{fout}</p>}
      {loading ? <p className="rd-sub">Laden...</p> : (
        <div style={{ display: "grid", gap: 10 }}>
          {(groep ? [groep] : groepen).map((g) => {
            const lijst = zichtbaar.filter((f) => f.groep === g);
            if (!lijst.length) return null;
            return (
              <section key={g} style={{ display: "grid", gap: 8 }}>
                <h2 className="rd-card-title" style={{ margin: "14px 0 2px", fontSize: 18 }}>{g}</h2>
                {lijst.map((f) => <FeitKaart key={f.sleutel} f={f} email={email} opgeslagen={laad} />)}
              </section>
            );
          })}
          <div style={{ marginTop: 8 }}><Nieuw groepen={groepen} email={email} klaar={laad} /></div>
        </div>
      )}

      <section className="rd-card-white" style={{ marginTop: 24 }}>
        <div className="rd-card-title" style={{ marginBottom: 6 }}>Vaste controle</div>
        <p className="rd-sub" style={{ marginTop: 0 }}>Elk antwoord loopt langs deze regels voordat de klant het ziet. Aanpassen gaat via Claude in de code; de merken hierboven zijn wel hier te beheren.</p>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 14, lineHeight: 1.5 }}>
          {(REGELS as { id: string; uitleg: string }[]).map((r) => <li key={r.id}><strong>{r.id}</strong>: {r.uitleg}</li>)}
        </ul>
      </section>
    </div>
  );
}
