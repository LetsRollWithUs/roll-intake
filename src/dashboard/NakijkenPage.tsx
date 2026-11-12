import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { formatDate } from "./ui";

// Nakijklijst van Jouw schilderplan: beurten waarin de vaste controle of een vangnet ingreep, of waarin iets misging.
// Zo zie je waar Charlie bijna iets fout zei, en of de kennisbank of de regels beter moeten. Alleen beheerders.

type Beurt = {
  id: number;
  sessie: string;
  bericht: string | null;
  model: string | null;
  controle: { poging: number | string; fouten: { id: string; stuk: string }[] }[] | null;
  fout: string | null;
  created_at: string;
  nagekeken_op: string | null;
  nagekeken_door: string | null;
  nakijk_notitie: string | null;
};

// Wat elke controle-id betekent, in gewone woorden.
const UITLEG: Record<string, string> = {
  bedrag: "noemde een bedrag",
  liters: "noemde liters of blikken",
  hex: "noemde een kleurcode",
  merk: "noemde een ander merk",
  leverancier: "noemde de leverancier",
  retour: "gebruikte retour als geruststelling",
  belofte: "beloofde dekking of resultaat",
  korting: "noemde een kortingscode of percentage",
  kleuradvies: "gaf eigen kleuradvies",
  behang: "adviseerde over behang heen te schilderen",
  intern: "praatte over zijn instructies",
  mens: "beantwoordde de vraag of het een mens is niet goed (vangnet zette het recht)",
  erin: "zei dat een kleur erin stond die nog niet gekozen was",
  "mens-te-snel": "bood te snel iemand van Roll aan (vangnet haalde het weg)",
  vocht: "zette vocht of schimmel niet door naar Roll (vangnet deed het)",
  vulmiddel: "zei dat vulmiddel in het pakket zit (dat verkopen we niet)",
  kleurvraag: "bood meteen alle kleuropties aan in plaats van eerst te vragen of de klant zijn kleur weet (vangnet zette het recht)",
  "gesprek-grens": "gesprek haalde de grens van 150 beurten; klant kreeg de contactopties",
};
const POGING = (p: number | string) => ("vangnet" === p ? "Vangnet" : 2 === p ? "Tweede poging" : "Eerste poging");

export function NakijkenPage() {
  const [rijen, setRijen] = useState<Beurt[]>([]);
  const [loading, setLoading] = useState(true);
  const [fout, setFout] = useState("");
  const [scope, setScope] = useState<"open" | "klaar" | "alle">("open");
  const [email, setEmail] = useState("");
  const [notities, setNotities] = useState<Record<number, string>>({});

  const laad = async () => {
    const { data, error } = await supabase
      .from("projecthulp_chat_log")
      .select("id,sessie,bericht,model,controle,fout,created_at,nagekeken_op,nagekeken_door,nakijk_notitie")
      .or("controle.not.is.null,fout.not.is.null")
      .not("sessie", "like", "testset%")
      .not("sessie", "like", "testbrowser%")
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) setFout("Laden lukte niet. Ben je ingelogd als beheerder?");
    setRijen((data as Beurt[]) ?? []);
    setLoading(false);
  };
  useEffect(() => {
    laad();
    supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "Roll"));
  }, []);

  const markeer = async (r: Beurt, klaar: boolean) => {
    const { error } = await supabase.from("projecthulp_chat_log").update({
      nagekeken_op: klaar ? new Date().toISOString() : null,
      nagekeken_door: klaar ? email : null,
      nakijk_notitie: (notities[r.id] ?? r.nakijk_notitie ?? "").trim() || null,
    }).eq("id", r.id);
    if (error) { setFout("Opslaan lukte niet."); return; }
    laad();
  };

  const open = rijen.filter((r) => !r.nagekeken_op).length;
  const zichtbaar = rijen.filter((r) => "alle" === scope || ("open" === scope ? !r.nagekeken_op : !!r.nagekeken_op));

  return (
    <div>
      <Link to="/dashboard/schilderplan" className="rd-textlink" style={{ textDecoration: "none" }}>← Verfplan</Link>
      <h1 className="rd-h2" style={{ margin: "8px 0 4px" }}>Nakijken</h1>
      <p className="rd-sub" style={{ marginTop: 0, maxWidth: 720 }}>
        Beurten waarin de controle Charlie tegenhield, een vangnet ingreep of er iets misging. De klant zag de verbeterde versie.
        Kijk of de kennisbank of een regel beter kan, en markeer de beurt dan als nagekeken.
      </p>
      <div style={{ display: "flex", gap: 8, margin: "12px 0", flexWrap: "wrap" }}>
        <button className={`rd-plan-chip${"open" === scope ? " is-on" : ""}`} onClick={() => setScope("open")}>Nog nakijken ({open})</button>
        <button className={`rd-plan-chip${"klaar" === scope ? " is-on" : ""}`} onClick={() => setScope("klaar")}>Nagekeken</button>
        <button className={`rd-plan-chip${"alle" === scope ? " is-on" : ""}`} onClick={() => setScope("alle")}>Alles</button>
      </div>
      {fout && <p className="rd-sub" style={{ color: "var(--rd-pink-dark)" }}>{fout}</p>}
      {loading ? <p className="rd-sub">Laden...</p> : zichtbaar.length === 0 ? (
        <p className="rd-sub">{"open" === scope ? "Niets na te kijken." : "Geen beurten."}</p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {zichtbaar.map((r) => (
            <div key={r.id} className="rd-card-white" style={{ opacity: r.nagekeken_op ? 0.65 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", fontSize: 12, opacity: 0.65 }}>
                <span>{formatDate(r.created_at)}{r.model ? ` · ${r.model}` : ""}</span>
                <Link to={`/dashboard/schilderplan/${r.sessie}`} className="rd-textlink">Bekijk het gesprek</Link>
              </div>
              <div style={{ marginTop: 6, fontSize: 15 }}><strong>Klant:</strong> {r.bericht || "(tikte op een knop of formulier)"}</div>
              {(r.controle ?? []).map((c, i) => (
                <div key={i} style={{ marginTop: 6, fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>{POGING(c.poging)}:</span>{" "}
                  {c.fouten.map((f, j) => (
                    <span key={j}>{j > 0 ? "; " : ""}{UITLEG[f.id] ?? f.id}{f.stuk ? <span style={{ opacity: 0.65 }}> ("{f.stuk}")</span> : null}</span>
                  ))}
                </div>
              ))}
              {r.fout && <div style={{ marginTop: 6, fontSize: 14, color: "var(--rd-pink-dark)" }}>Fout: {r.fout}</div>}
              <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginTop: 10 }}>
                <input className="rd-input" style={{ flex: "1 1 240px", minHeight: 40, fontSize: 13 }} placeholder="Notitie (wat is er aangepast?)" value={notities[r.id] ?? r.nakijk_notitie ?? ""} onChange={(e) => setNotities({ ...notities, [r.id]: e.target.value })} aria-label="Notitie" />
                {r.nagekeken_op
                  ? <button className="rd-plan-chip" onClick={() => markeer(r, false)}>Terug naar nakijken</button>
                  : <button className="rd-plan-chip is-on" onClick={() => markeer(r, true)}>Nagekeken</button>}
              </div>
              {r.nagekeken_op && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 4 }}>Nagekeken {formatDate(r.nagekeken_op)}{r.nagekeken_door ? ` door ${r.nagekeken_door}` : ""}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
