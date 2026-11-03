-- Kennisbank van Jouw schilderplan: de feiten die de chat mag noemen, beheerd op intake.roll.nl/beheer/kennisbank.
-- De edge function projecthulp-chat leest de actieve regels (service role) en valt terug op voorwaarden.json.
create table if not exists public.kennisbank (
  sleutel text primary key,
  groep text not null,
  titel text not null,
  soort text not null default 'tekst' check (soort in ('tekst', 'lijst')),
  tekst text not null,
  bron text,
  gecontroleerd_op date,
  eigenaar text,
  actief boolean not null default true,
  volgorde int not null default 0,
  bijgewerkt_door text,
  updated_at timestamptz not null default now()
);

-- Elke wijziging bewaren: wat er stond, wie het veranderde en wanneer.
create table if not exists public.kennisbank_historie (
  id bigint generated always as identity primary key,
  sleutel text not null,
  tekst text not null,
  actief boolean not null,
  door text,
  op timestamptz not null default now()
);

create or replace function public.kennisbank_bewaar_oud() returns trigger language plpgsql as $$
begin
  if old.tekst is distinct from new.tekst or old.actief is distinct from new.actief then
    insert into public.kennisbank_historie (sleutel, tekst, actief, door) values (old.sleutel, old.tekst, old.actief, old.bijgewerkt_door);
  end if;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists kennisbank_historie_trg on public.kennisbank;
create trigger kennisbank_historie_trg before update on public.kennisbank for each row execute function public.kennisbank_bewaar_oud();

alter table public.kennisbank enable row level security;
alter table public.kennisbank_historie enable row level security;
drop policy if exists "kennisbank beheer" on public.kennisbank;
create policy "kennisbank beheer" on public.kennisbank for all to authenticated using (is_admin()) with check (is_admin());
drop policy if exists "kennisbank historie lezen" on public.kennisbank_historie;
create policy "kennisbank historie lezen" on public.kennisbank_historie for select to authenticated using (is_admin());

insert into public.kennisbank (sleutel, groep, titel, soort, tekst, bron, gecontroleerd_op, eigenaar, volgorde) values
('verzending.gratis', 'Verzending en levertijd', 'Gratis verzending', 'tekst', 'Gratis verzending vanaf € 150.', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 0),
('verzending.verf', 'Verzending en levertijd', 'Levertijd verf en behang', 'tekst', 'Verf (ook behang) besteld voor 23:59 op maandag tot en met donderdag of op zondag, is meestal de volgende dag in huis, ''s avonds. Op vrijdag besteld voor 9:00: meestal dezelfde avond in huis. Op vrijdag na 9:00 of in het weekend tot zondag 23:59 besteld: maandagavond.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 10),
('verzending.samples', 'Verzending en levertijd', 'Levertijd samples', 'tekst', 'Samples besteld voor 16:00 zijn meestal de volgende dag in huis. In het weekend versturen we niet: op vrijdag voor 16:00 besteld komt zaterdag, in het weekend besteld gaat maandag de deur uit. Samples komen via de brievenbus, je hoeft er niet voor thuis te zijn.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 20),
('verzending.let_op', 'Verzending en levertijd', 'Verf en samples samen, of België', 'tekst', 'Zitten verf en samples in dezelfde bestelling, of gaat het naar België, dan weet de klantenservice de precieze levertijd.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 30),
('afhalen', 'Verzending en levertijd', 'Afhalen', 'tekst', 'Afhalen kan in Bunschoten. Kies afhalen bij het afrekenen, dan mailen we je het adres.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 40),
('klantenservice.bereikbaar', 'Klantenservice', 'Bereikbaar', 'tekst', 'Maandag tot en met vrijdag van 9:00 tot 17:00, in het weekend gesloten.', 'roll.nl/contact', '2026-11-03', 'Ingmar', 50),
('klantenservice.kanalen', 'Klantenservice', 'Kanalen', 'tekst', 'WhatsApp (via roll.nl/contact), mail naar hello@roll.nl, bellen naar 085 369 62 44, of het formulier op roll.nl/contact.', 'roll.nl/contact', '2026-11-03', 'Ingmar', 60),
('klantenservice.meekijken', 'Klantenservice', 'Snel meekijken via WhatsApp', 'tekst', 'Even snel een vraag of een kleur laten checken? App ons gerust via WhatsApp, dat kan altijd. Het is minder uitgebreid dan het online kleuradvies, maar meekijken kan altijd.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 70),
('betalen', 'Bestellen en betalen', 'Betalen', 'tekst', 'Betalen kan met iDEAL, creditcard, Apple Pay, Bancontact en KBC. Wat er voor jou kan, zie je bij het afrekenen.', 'Webshop (Mollie), gecheckt 3 november 2026', '2026-11-03', 'Ingmar', 80),
('samplekorting', 'Bestellen en betalen', 'Samplekorting', 'tekst', 'Wie samples bestelt, krijgt € 10 korting op een bestelling vanaf € 100 (inclusief btw; de samples zelf tellen niet mee voor die € 100). De kortingscode zit bij de samples.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 90),
('samples', 'Producten en advies', 'Samples', 'tekst', 'Je kiest kleurstickers (los of in een sample pack met kleuren uit dezelfde richting) of verftesters: een potje van 50 ml echte verf om op de muur te proberen.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 100),
('spullen', 'Producten en advies', 'Spullen en sets', 'tekst', 'Alles is los te koop, en er zijn sets: Muurverf set klein (roller 10 cm, verfbak, platte kwast, schilderstape), Muurverf set groot (roller 18 cm, ruime verfbak, platte kwast, schilderstape), Schilderset lakken (lakroller 10 cm, verfbak, ronde kwast, schilderstape) en de Behang set voor renovlies. Het pakket in je plan zet de spullen die je nodig hebt al klaar.', 'Webshop, gecheckt 3 november 2026', '2026-11-03', 'Ingmar', 110),
('lakwerk_buiten', 'Producten en advies', 'Lakwerk buiten', 'tekst', 'Voor buitendeuren en kozijnen: de primer en daarna zijdeglans of hoogglans; die zijn sterker dan mat en ideaal voor buiten. Is de ondergrond goed, dan meestal twee lagen lak. Een kale of slechte ondergrond maak je eerst goed met de primer. Matte lak is alleen voor binnen.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 120),
('kleuradvies', 'Producten en advies', 'Online kleuradvies', 'tekst', 'Online kleuradvies: 30 minuten videobellen met een stylist van Roll. De actuele prijs komt live uit de webshop (normaal € 59; loopt er een aanbieding, dan noem je die). Boeken via de knop Boek online kleuradvies.', 'Webshop (prijs live), Ingmar', '2026-11-03', 'Ingmar', 130),
('schilders', 'Producten en advies', 'Schilders', 'tekst', 'Roll werkt nu nog niet samen met schilders.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 140),
('retour.termijn', 'Retour', 'Termijn', 'tekst', 'Aanmelden binnen 14 dagen na ontvangst, via de klantenservice.', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 150),
('retour.wel', 'Retour', 'Wat wel retour kan', 'lijst', 'Ongeopende basis-witte verf met intacte verzegeling
Ongeopende Roll-waaier
Ongebruikt verfgereedschap in de originele verpakking
Onbeschadigd behang in de originele folie', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 160),
('retour.niet', 'Retour', 'Wat niet retour kan', 'lijst', 'Verf die speciaal op kleur is gemengd (alles met een kleurnaam of nummer anders dan wit of transparant)
Behang dat op maat is gesneden
Geopende, aangebroken of gebruikte blikken, emmers en testers
Losse onderdelen uit een voordeelpakket', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 170),
('retour.kosten', 'Retour', 'Kosten', 'tekst', 'Terugsturen is voor eigen rekening, tenzij Roll een fout maakte. Gaat de hele bestelling retour, dan krijg je ook de verzendkosten van de heenzending terug.', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 180),
('retour.terugbetaling', 'Retour', 'Terugbetaling', 'tekst', 'Binnen 7 dagen na ontvangst van de producten in goede, nieuwe staat.', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 190),
('retour.defect', 'Retour', 'Defect of verkeerd geleverd', 'tekst', 'Beschadigd, defect of verkeerd geleverd: eerst contact met de klantenservice, dan stuurt Roll een gratis retourlabel.', 'https://roll.nl/ruilen-retourneren/', '2026-11-03', 'Ingmar', 200),
('regels_voor_de_bot', 'Regels voor de bot', 'Hoe de bot deze feiten gebruikt', 'lijst', 'Gebruik retour nooit als geruststelling bij de hoeveelheid: op kleur gemengde verf kan niet retour.
Levertijden noem je met ''meestal''; beloof nooit een vaste bezorgdatum.
De samplekorting mag je noemen als het over samples gaat, hooguit een keer per gesprek. Noem nooit een kortingscode.
Noem geen termijnen, levertijden of kosten die hier niet staan; verwijs dan naar de klantenservice.', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 210),
('merken.concurrenten', 'Merken', 'Noemt de bot nooit uit zichzelf (de klant mag het zelf noemen; dan een keer bevestigen)', 'lijst', 'Flexa
Histor
Sikkens
Levis
Wijzonol
Sigma
Boss
Rambo
Dulux
Alabastine
Painting the Past
Pure & Original
Pure and Original
Farrow & Ball
Farrow and Ball
Little Greene
Mylands
Annie Sloan
Benjamin Moore
Jotun
Caparol
Tikkurila
Alpina
Ressource
Graham & Brown
Hammerite
Praxis
Gamma
Karwei
Hornbach
Action
Copagro
Remmers
Osmo
Xyladecor
Trimetal
Herbol
Kymo', 'Afspraak', '2026-11-03', 'Ingmar', 900),
('merken.nooit', 'Merken', 'Noemt de bot nooit, ook niet als de klant het zelf noemt', 'lijst', 'Relius
Ecotex', 'Ingmar (besluit 3 november 2026)', '2026-11-03', 'Ingmar', 910)
on conflict (sleutel) do nothing;
