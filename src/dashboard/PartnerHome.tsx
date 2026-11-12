import { supabase } from "@/lib/supabase";

// Een partner zoals het dashboard hem kent (public.partners via mijn_toegang()).
export type Partner = { id: string; slug: string; soort: "makelaar" | "creator" | "merk" | "schilder" | "overig"; naam: string };

export const SOORT_LABEL: Record<Partner["soort"], string> = {
  makelaar: "Makelaar",
  creator: "Creator",
  merk: "Merk",
  schilder: "Schilder",
  overig: "Partner",
};

// Startpagina voor wie bij een partner hoort en geen styliste is. De blokken per soort
// (kaarten, kortingscode, bestellingen, commissie) komen hier te staan; tot die tijd een nette landing.
export function PartnerHome({ partners, email }: { partners: Partner[]; email: string }) {
  return (
    <div style={{ maxWidth: 620, margin: "32px auto 0" }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 8 }}>Roll · Dashboard</div>
      <h1 className="rd-h2" style={{ marginBottom: 16 }}>Welkom</h1>
      {partners.map((p) => (
        <div key={p.id} className="rd-card-white" style={{ marginBottom: 12 }}>
          <div className="rd-sub" style={{ margin: 0, fontSize: 13, fontWeight: 700 }}>{SOORT_LABEL[p.soort]}</div>
          <div className="rd-h2-sm" style={{ margin: "2px 0 8px" }}>{p.naam}</div>
          <p className="rd-sub" style={{ margin: 0 }}>
            Je bent ingelogd als {email}. Je cijfers staan hier zodra je dashboard is klaargezet. Vragen? Mail naar{" "}
            <a href="mailto:hallo@roll.nl" style={{ color: "inherit", fontWeight: 600 }}>hallo@roll.nl</a>.
          </p>
        </div>
      ))}
      <button className="rd-textlink" style={{ minHeight: 40, marginTop: 4 }} onClick={() => supabase.auth.signOut()}>Uitloggen</button>
    </div>
  );
}
