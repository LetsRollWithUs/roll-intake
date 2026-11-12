import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { laadVerdelingen, pct, STANDAARD, type Paar } from "./OffertesPage";

// Instellingen voor het beheer. Hier staat wat voor alle stylistes of partners tegelijk geldt.
export function InstellingenPage() {
  const [admin, setAdmin] = useState<boolean | null>(null);
  const [verdelingen, setVerdelingen] = useState<Paar[]>(STANDAARD);
  const [bewaard, setBewaard] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: adm }, v] = await Promise.all([supabase.rpc("is_admin"), laadVerdelingen()]);
      setAdmin(adm === true);
      setVerdelingen(v);
    })();
  }, []);

  const zet = async (paar: Paar, aan: boolean) => {
    const volgende = aan ? [...verdelingen, paar].sort((a, b) => a[0] - b[0]) : verdelingen.filter((p) => !(p[0] === paar[0] && p[1] === paar[1]));
    if (!volgende.length) return;
    setVerdelingen(volgende); setBewaard(false);
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from("stylist_offer_settings").update({ verdelingen: volgende, updated_at: new Date().toISOString(), updated_by: u?.user?.email ?? null }).eq("id", true);
    setBewaard(!error);
  };

  if (admin === null) return <p className="rd-sub">Laden...</p>;
  if (!admin) return <p className="rd-sub">Deze pagina is alleen voor beheerders.</p>;

  const rij: React.CSSProperties = { display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline", borderTop: "1px solid var(--rd-line)", padding: "10px 0", flexWrap: "wrap", fontSize: 14 };
  return (
    <div style={{ maxWidth: 680 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 2px" }}>Instellingen</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>Wat voor iedereen tegelijk geldt.</p>

      <div className="rd-card-white" style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="rd-kicker rd-kicker-pink">Offertes van stylistes voor eigen klanten</div>
        <strong>Welke verdelingen mogen stylistes kiezen?</strong>
        <p className="rd-sub" style={{ margin: 0, fontSize: 13 }}>De styliste kiest per offerte hoe ze haar 20% verdeelt tussen commissie voor haarzelf en korting voor haar klant. Een klant krijgt nooit meer dan 10% korting. Een wijziging geldt voor nieuwe keuzes; bestaande offertes houden hun verdeling.</p>
        {STANDAARD.map((p) => {
          const aan = verdelingen.some((v) => v[0] === p[0] && v[1] === p[1]);
          return (
            <label key={p.join("-")} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 15 }}>
              <input type="checkbox" checked={aan} disabled={aan && verdelingen.length === 1} onChange={(e) => zet(p, e.target.checked)} />
              {pct(p[0])} commissie, {p[1] > 0 ? `${pct(p[1])} korting` : "geen korting"}
            </label>
          );
        })}
        {bewaard && <span role="status" style={{ fontSize: 13, fontWeight: 600, color: "var(--rd-pink-dark)" }}>Opgeslagen.</span>}
      </div>

      <div className="rd-card-white" style={{ marginTop: 10 }}>
        <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 2 }}>Op een andere plek</div>
        <div style={{ ...rij, borderTop: 0 }}><span>Commissie en afspraken per styliste</span><Link to="/dashboard/adviseurs" className="rd-textlink" style={{ minHeight: 0 }}>Team en afspraken</Link></div>
        <div style={rij}><span>Afspraken per makelaar, creator of merk</span><Link to="/dashboard/partners" className="rd-textlink" style={{ minHeight: 0 }}>Partners</Link></div>
        <div style={rij}><span>Rekenregels van de prijsopgave en het verfplan</span><a href="https://roll.nl/offerte/beheer/" target="_blank" rel="noreferrer" className="rd-textlink" style={{ minHeight: 0 }}>Rekenbeheer op roll.nl</a></div>
      </div>
    </div>
  );
}
