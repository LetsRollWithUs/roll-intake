import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { laadVerdelingen } from "./OffertesPage";

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
// Offertes voor eigen klanten: de verdelingen komen uit de instellingen, zodat de uitleg klopt als beheer er een uitzet.
function EigenKlanten() {
  const [paren, setParen] = useState<[number, number][]>([[10, 10], [15, 5], [20, 0]]);
  useEffect(() => { laadVerdelingen().then(setParen).catch(() => {}); }, []);
  const pct = (n: number) => `${String(n).replace(".", ",")}%`;
  return (
    <Block kicker="Je eigen klanten" title="Zelf een offerte maken">
      <p style={{ margin: 0 }}>
        Heb je een klant uit je eigen netwerk, dus zonder adviesgesprek via Roll? Dan maak je zelf een offerte
        onder <Link to="/beheer/offertes" style={{ color: "inherit", fontWeight: 700 }}>Offertes</Link>. Je vult de naam
        en het e-mailadres van je klant in en bouwt de offerte in dezelfde editor als bij het verfplan: ruimtes, maten,
        kleuren en wat er verder nodig is.
      </p>
      <p style={{ margin: 0 }}><strong>Jij kiest per offerte de verdeling:</strong></p>
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        {paren.map(([c, k]) => (
          <li key={`${c}-${k}`}>{pct(c)} commissie voor jou en {k > 0 ? `${pct(k)} korting voor je klant` : "geen korting voor je klant"}.</li>
        ))}
      </ul>
      <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
        <li>De korting geldt op de verf. Andere kortingscodes werken er niet naast, en de korting werkt alleen via de link van jouw offerte.</li>
        <li>Je kunt de verdeling aanpassen tot je klant bestelt.</li>
        <li>Versturen doe je per mail, of je kopieert de link en deelt hem zelf, bijvoorbeeld via WhatsApp.</li>
        <li>Je commissie wordt berekend over het bedrag zonder btw en verzending. Bij elke offerte zie je wat hij je oplevert.</li>
      </ul>
      <p style={{ margin: 0 }}>
        <strong>Had je klant kort geleden een adviesgesprek via Roll?</strong> Dan is het een Roll-klant: je krijgt 10%
        commissie en de klant krijgt de samplekorting van de winkel, geen extra korting. Heeft deze klant toch een
        steuntje nodig om te bestellen, vraag dan korting aan bij Roll. Dat kan bij de offerte, of bij Afronden via
        "Roll laten meekijken". Leg kort uit waarom; Roll laat je weten of het kan.
      </p>
      <p style={{ margin: 0 }}>
        Bestelt je klant, dan staat je commissie bij <Link to="/beheer/commissie" style={{ color: "inherit", fontWeight: 700 }}>Commissie</Link>,
        samen met je andere commissie. Die factureer je periodiek aan Roll.
      </p>
    </Block>
  );
}

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
        Fijn dat je meedoet. Hieronder in het kort waarom we dit doen, wat we van een gesprek verwachten,
        hoe Online Advies werkt, waarmee je adviseert en hoe je met dit beheer werkt.
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

        <Block kicker="Hoe Online Advies werkt" title="Van boeking tot bestelling">
          <p style={{ margin: 0 }}>
            De klant boekt een gesprek en vult vooraf de intake in: ruimtes, foto's, lichtinval, de sfeer
            die ze zoeken en wat ze al hebben getest. Jij bereidt je daarmee voor.
          </p>
          <p style={{ margin: 0 }}>
            Tijdens de 30 minuten (videogesprek) geef je persoonlijk kleuradvies en sluit je af met een
            compacte samenvatting: de geadviseerde kleuren en de volgende stap.
          </p>
          <p style={{ margin: 0 }}>
            Daarna kiest de klant: eerst samples testen, of direct verf bestellen. Twijfelt iemand, dan volg
            je persoonlijk op. Een verfaankoop die aan jou wordt toegeschreven levert je commissie op.
          </p>
        </Block>

        <Block kicker="De tools" title="Waarmee je adviseert">
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 6 }}>
            <li><strong>Kleursamples (stickers):</strong> goedkoop en snel, de kleur direct op de muur bekijken in het echte licht van de ruimte.</li>
            <li><strong>Verftesters:</strong> echte verf voor een groter proefvlak, ideaal bij twijfel tussen dicht bij elkaar liggende tinten.</li>
            <li><strong>Sample packs:</strong> een set kleuren per familie (bijvoorbeeld Greige of Donkerblauw) om naast elkaar te vergelijken.</li>
            <li><strong>Verfcalculator:</strong> reken de benodigde liters uit op basis van de m². Roll dekt ongeveer 8 m² per liter; reken meestal op twee lagen.</li>
          </ul>
          <p style={{ margin: 0 }}>
            Adviseer bewust welk product en hoeveel er nodig is. In de intake leg je de kleuren, m² en liters
            vast bij het verfplan, zodat de klant makkelijk kan bestellen en Roll er een verfplan van maakt.
          </p>
        </Block>

        <EigenKlanten />

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
            een verfplan van maken.
          </Step>
          <Step n={4} title="Agenda: jouw beschikbaarheid">
            In Agenda beheer je je werktijden en je vaste videolink. Zo weet het systeem wanneer klanten bij
            jou kunnen boeken en krijgt elke afspraak de juiste link.
          </Step>
          <Step n={5} title="Boekingen: verzetten of overdragen">
            Onder Boekingen kun je een afspraak verzetten of aan een collega overdragen als dat nodig is. De
            klant krijgt daar automatisch bericht over.
          </Step>
          <Step n={6} title="Offertes: voor je eigen klanten">
            Onder Offertes maak je een offerte voor een klant uit je eigen netwerk en kies je de verdeling tussen
            jouw commissie en de korting voor je klant. Op je startpagina zie je wat er loopt en wat het oplevert.
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
