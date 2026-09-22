import { Link } from "react-router-dom";

// Kleine sectiekaart met kop en inhoud.
function Block({ kicker, title, children }: { kicker: string; title: string; children: React.ReactNode }) {
  return (
    <section className="rd-card-white" style={{ padding: "18px 20px" }}>
      <div className="rd-kicker rd-kicker-pink" style={{ marginBottom: 6 }}>{kicker}</div>
      <h2 className="rd-h2-sm" style={{ margin: "0 0 10px" }}>{title}</h2>
      <div style={{ fontSize: 15, lineHeight: 1.6, display: "flex", flexDirection: "column", gap: 10 }}>
        {children}
      </div>
    </section>
  );
}

// Genummerd stappenrijtje voor "hoe het beheer werkt".
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <span
        aria-hidden
        style={{
          width: 26, height: 26, borderRadius: 99, background: "var(--rd-lavender)", color: "var(--rd-aubergine)",
          display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flex: "none",
        }}
      >
        {n}
      </span>
      <div>
        <div style={{ fontWeight: 700 }}>{title}</div>
        <div style={{ fontSize: 14, opacity: 0.8, lineHeight: 1.55 }}>{children}</div>
      </div>
    </div>
  );
}

export function OnboardingPage() {
  return (
    <div style={{ maxWidth: 720 }}>
      <h1 className="rd-h2" style={{ margin: "2px 0 4px" }}>Welkom bij Roll Kleuradvies</h1>
      <p className="rd-sub" style={{ marginTop: 0 }}>
        Fijn dat je meedoet. Hieronder in het kort waarom we dit doen, wat we van een gesprek verwachten
        en hoe je met dit beheer werkt.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 16 }}>
        <Block kicker="Waarom we dit doen" title="Kleur maakt een huis een thuis">
          <p style={{ margin: 0 }}>
            De juiste kleur verandert hoe een ruimte voelt. Toch durven veel mensen de knoop niet door te
            hakken: ze zijn bang voor een miskoop, of zien door de bomen het bos niet meer. Daar komen wij
            in beeld.
          </p>
          <p style={{ margin: 0 }}>
            Met online kleuradvies brengen we de expertise van Roll naar iedereen thuis, waar ze ook wonen.
            Roll is een commercieel bedrijf: we willen verkopen en groeien. Dat doen we door mensen echt
            goed te helpen, want dat is precies wat ze onthouden en doorvertellen. Jij bent daarin het
            gezicht van Roll: het moment waarop iemand zich gezien voelt, met vertrouwen kiest en met een
            gerust gevoel bestelt.
          </p>
        </Block>

        <Block kicker="Wat we van het gesprek verwachten" title="Advies en verkoop gaan hand in hand">
          <p style={{ margin: 0 }}>
            Een gesprek duurt 30 minuten en heeft twee doelen die elkaar versterken:
          </p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li>
              <strong>Advies:</strong> help de klant echt verder met een concreet, persoonlijk kleuradvies.
              Luister, kijk goed naar de intake en foto's, en geef richting in plaats van tien opties.
            </li>
            <li>
              <strong>Verkoop:</strong> durf te verkopen. Vertaal je advies naar een concrete bestelling,
              meestal samples om thuis te testen of direct de verf als de keuze vaststaat, en vraag er ook
              echt om. Adviseer met overtuiging welk product en hoeveel er nodig is.
            </li>
          </ul>
          <p style={{ margin: 0 }}>
            Deze twee versterken elkaar: goed advies maakt de aankoop een logische, prettige stap. Help de
            klant ook in beweging te komen, want uitstel is de grootste vijand van een mooi resultaat. Doe
            dat met een concrete vervolgstap die past bij hun schilderplanning, niet met kunstmatige
            tijdsdruk. Er geldt een vaste 10% samplekorting op de verf; daar komen geen losse tijdskortingen
            bovenop. Smeed het ijzer als het heet is, en sluit elk gesprek af met een heldere volgende stap.
          </p>
        </Block>

        <Block kicker="Hoe het beheer werkt" title="Zo werk je met dit dashboard">
          <Step n={1} title="Start: jouw afspraken">
            Op je startpagina zie je de afspraken die voor jou klaarstaan, met vandaag bovenaan. Per afspraak
            open je in één klik de intake en, als die er is, je vaste videolink.
          </Step>
          <Step n={2} title="Bereid je voor met de intake">
            De klant vult vooraf een intake in: ruimtes, foto's, lichtinval, sfeer, geteste samples en de
            hoofdvraag. Lees die door voor het gesprek, dan kun je meteen gericht adviseren.
          </Step>
          <Step n={3} title="Leg na het gesprek de uitkomst vast">
            Zet in de intake de status, je notities en de uitkomst (samples nodig, kleur gekozen of opvolgen)
            met de geadviseerde kleuren. Zo krijgt de klant automatisch de juiste opvolgmail en kan Roll er
            een offerte van maken.
          </Step>
          <Step n={4} title="Agenda: jouw beschikbaarheid">
            In Agenda beheer je je werktijden en je vaste videolink. Zo weet het systeem wanneer klanten bij
            jou kunnen boeken en krijgt elke afspraak de juiste link.
          </Step>
          <Step n={5} title="Boekingen: verzetten of overdragen">
            Onder Boekingen kun je een afspraak verzetten of aan een collega overdragen als dat nodig is. De
            klant krijgt daar automatisch bericht over.
          </Step>
        </Block>

        <div className="rd-card-white" style={{ padding: "16px 20px", display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>Klaar om te beginnen?</span>
          <Link to="/beheer" className="rd-btn rd-btn-primary" style={{ textDecoration: "none", padding: "8px 16px" }}>
            Naar je afspraken
          </Link>
          <Link to="/beheer/agenda" className="rd-textlink" style={{ minHeight: 32 }}>
            Eerst je agenda instellen
          </Link>
        </div>
      </div>
    </div>
  );
}
