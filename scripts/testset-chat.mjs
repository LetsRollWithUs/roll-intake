#!/usr/bin/env node
/**
 * Testset van Jouw schilderplan tegen de chat (edge function projecthulp-chat of de testkopie).
 *
 * Draait de 60 losse berichten en 30 gesprekken uit kleurplan-plugin/projectmodel/testset en meet per geval:
 * - het plan: wat er vastgelegd moet zijn (verwacht / eind) en wat nooit mag (verboden / nooit);
 * - de vaste controle uit supabase/functions/_shared/controle.js op elk antwoord (moet leeg zijn);
 * - een beoordeling van toon en eigen kleuradvies door Haiku (via de chat, alleen met de testsleutel).
 *
 * Vrijgavenormen (zie het plan): alle kritieke gevallen slagen, 95% van alle controles slaagt, geen enkele
 * fout uit de vaste controle en geen eigen kleuradvies. Niet gehaald = exitcode 1 (scripts/vrijgeven.sh stopt dan).
 *
 * Gebruik: node scripts/testset-chat.mjs [--alleen k01,g03] [--zonder-beoordeling] [--model gemini-3.5-flash-lite] [--beoordelaar gemini-3.5-flash]
 * Omgeving: CHAT_URL (standaard de testkopie), TESTSET_DIR, PARALLEL (standaard 4).
 * Kosten: ongeveer 165 beurten van ± 1 cent plus de beoordelingen, samen ± $2 per volledige run.
 */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { controleer, MERKEN } from '../supabase/functions/_shared/controle.js';

const HIER = dirname( fileURLToPath( import.meta.url ) );
const CHAT_URL = process.env.CHAT_URL || 'https://lsboujprrvhntgbvlvyu.supabase.co/functions/v1/projecthulp-chat-test';
const TESTSET = process.env.TESTSET_DIR || join( HIER, '../../kleurplan-plugin/projectmodel/testset' );
const PARALLEL = Number( process.env.PARALLEL || 4 );
const TOKEN = 'vergelijk-7d3f9a';
const args = process.argv.slice( 2 );
const ALLEEN = args.includes( '--alleen' ) ? String( args[ args.indexOf( '--alleen' ) + 1 ] ?? '' ).split( ',' ) : null;
const BEOORDELEN = ! args.includes( '--zonder-beoordeling' );
// Een ander model dan de live chat, om modellen te vergelijken (de chat staat dat alleen toe met de testsleutel).
const MODEL = args.includes( '--model' ) ? String( args[ args.indexOf( '--model' ) + 1 ] ?? '' ) : '';
const BEOORDELAAR = args.includes( '--beoordelaar' ) ? String( args[ args.indexOf( '--beoordelaar' ) + 1 ] ?? '' ) : '';

const berichten = JSON.parse( readFileSync( join( TESTSET, 'berichten.json' ), 'utf8' ) ).gevallen;
const gesprekken = JSON.parse( readFileSync( join( TESTSET, 'gesprekken.json' ), 'utf8' ) ).gesprekken;

// Gevallen met "context" in de testset: de stand vooraf als klantbericht(en).
const VOORAF = {
	k11: [ 'Mijn woonkamer, de muren in Sage Blink.' ],
	r06: [ 'Woonkamer, ik zoek iets licht beige.' ], r07: [ 'Woonkamer, ik zoek iets licht beige.' ], r12: [ 'Woonkamer, ik zoek iets licht beige.' ],
	r13: [ 'Woonkamer. Ik twijfel tussen Sand Salute en Cashmere Cloud.' ], r20: [ 'Woonkamer. Ik twijfel tussen Sand Salute en Cashmere Cloud.' ],
	o03: [ 'Ik wil de muren van mijn woonkamer schilderen.' ], o06: [ 'De muren van mijn woonkamer van 5 bij 4 in Sage Blink, het plafond gaat niet mee.' ], o07: [ 'De muren van mijn woonkamer van 5 bij 4 in Sage Blink, het plafond gaat niet mee.' ],
	o08: [ 'Woonkamer van 5 bij 4.' ], o09: [ 'Ik wil mijn woonkamer schilderen.' ], o10: [ 'Ik wil mijn woonkamer schilderen.' ],
	o14: [ 'Woonkamer van 5 bij 4, de muren zijn geschilderd en licht.' ], o19: [ 'Woonkamer van 5 bij 4.' ],
};
// Gesprekken die een ruimte verwachten die de klant niet noemt: die zetten we vooraf klaar.
const VOORAF_GESPREK = { g18: [ 'Ik wil de muren van mijn slaapkamer schilderen.' ] };
// Wat alleen een mens kan beoordelen (versieconflict, rekenkern stuk, terugkomen na samples).
const HANDMATIG = new Set( [ 'g04', 'g25', 'g26', 'g27' ] );

/* ---------- praten met de chat ---------- */

const rid = () => Math.random().toString( 36 ).slice( 2 ).padEnd( 10, '0' ).slice( 0, 10 );
async function post( body, poging = 0 ) {
	try {
		const r = await fetch( CHAT_URL, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify( { test: TOKEN, klantVersie: 2, ...( MODEL && ! body.beoordeel ? { model: MODEL } : {} ), ...body } ) } );
		const d = await r.json();
		if ( d.fout && poging < 1 && r.status >= 500 ) return post( body, poging + 1 );
		return d;
	} catch ( e ) {
		if ( poging < 1 ) return post( body, poging + 1 );
		return { fout: String( e.message || e ) };
	}
}
async function beoordeel( klant, antwoord ) {
	if ( ! BEOORDELEN || ! antwoord ) return null;
	return post( { sessie: 'testsetbeoordelingxxxxxxxxx', beoordeel: { klant, antwoord, ...( BEOORDELAAR ? { model: BEOORDELAAR } : {} ) } } );
}

/* ---------- het plan lezen ---------- */

const w = ( g ) => ( g && g.waarde != null ? g.waarde : null );
const zelfde = ( a, b ) => String( a ?? '' ).trim().toLowerCase() === String( b ?? '' ).trim().toLowerCase();
function ruimteVan( p, sleutel ) {
	const rr = p?.ruimtes ?? [];
	return rr.find( ( r ) => r.id === sleutel ) ?? rr.find( ( r ) => r.type === sleutel ) ?? ( sleutel ? null : rr[ 0 ] ) ?? ( rr.length === 1 ? rr[ 0 ] : null );
}
const vlakVan = ( r, soort ) => r?.vlakken.find( ( v ) => v.id === soort || v.soort === soort ) ?? null;
function kleurNaam( v ) {
	const g = w( v?.kleur?.gekozen );
	return g ? ( g.km?.rollNaam && g.type !== 'roll' ? g.km.rollNaam : g.naam ) : null;
}
const gekozenSet = ( p ) => new Set( ( p?.ruimtes ?? [] ).flatMap( ( r ) => r.vlakken.filter( ( v ) => v.kleur.status === 'gekozen' ).map( ( v ) => `${ r.id }.${ v.id }:${ kleurNaam( v ) }` ) ) );
const getal = ( x ) => ( typeof x === 'number' ? x : parseFloat( String( x ).replace( ',', '.' ) ) );
function waardeGelijk( echt, verwacht ) {
	if ( typeof verwacht === 'number' ) return Math.abs( getal( echt ) - verwacht ) < 0.051;
	return zelfde( echt, verwacht );
}

/** Een verwachte wijziging (testset-formaat) naar een controle op het plan na de beurt. */
function klopt( v, p ) {
	// Zonder ruimte in de verwachting (bijvoorbeeld twee slaapkamers): goed als het in een van de ruimtes klopt.
	if ( ! v.ruimte && v.actie !== 'ruimte-erbij' && ( p?.ruimtes ?? [] ).length > 1 ) {
		return p.ruimtes.some( ( r ) => klopt( { ...v, ruimte: r.id }, p ) );
	}
	const r = ruimteVan( p, v.ruimte ?? v.type );
	switch ( v.actie ) {
		case 'ruimte-erbij': return ( p?.ruimtes ?? [] ).some( ( x ) => x.type === v.type );
		case 'vlak-erbij': return !! vlakVan( r, v.vlak ?? v.soort );
		case 'sample': return ( p?.samples ?? [] ).some( ( s ) => zelfde( s.naam, v.kleur?.naam ) );
		case 'ongedaan': return null;
		case 'zet': {
			if ( [ 'doel', 'spullen', 'wanneer' ].includes( v.veld ) ) return v.veld === 'doel' ? !! w( p?.[ v.veld ] ) : waardeGelijk( w( p?.[ v.veld ] ), v.waarde );
			if ( ! r ) return false;
			// Lengte en breedte: "4 bij 3" of "3 bij 4" is dezelfde kamer.
			if ( v.veld === 'maat.lengte' || v.veld === 'maat.breedte' ) return waardeGelijk( w( r.maat.lengte ), v.waarde ) || waardeGelijk( w( r.maat.breedte ), v.waarde );
			if ( v.veld.startsWith( 'maat.' ) ) return waardeGelijk( w( r.maat[ v.veld.slice( 5 ) ] ), v.waarde );
			if ( v.veld === 'hoogte' ) return waardeGelijk( w( r.hoogte ), v.waarde );
			const vl = vlakVan( r, v.vlak ?? ( v.veld === 'breedte' ? 'accent' : 'muren' ) );
			if ( ! vl ) return false;
			if ( v.veld.startsWith( 'ondergrond.' ) ) return waardeGelijk( w( vl.ondergrond[ v.veld.slice( 11 ) ] ), v.waarde );
			return waardeGelijk( w( vl[ v.veld ] ), v.waarde );
		}
		case 'kleur': {
			const vl = vlakVan( r, v.vlak ?? 'muren' );
			if ( ! vl ) return false;
			const n = v.kleur?.naam;
			if ( v.wat === 'kies' && ! n ) return vl.kleur.status === 'gekozen' && ( ! v.kleur?.type || zelfde( w( vl.kleur.gekozen )?.type, v.kleur.type ) );
			if ( v.wat === 'kies' ) return vl.kleur.status === 'gekozen' && ( zelfde( kleurNaam( vl ), n ) || zelfde( w( vl.kleur.gekozen )?.naam, n ) || String( w( vl.kleur.gekozen )?.merkKleur ?? '' ).toLowerCase().includes( String( n ).toLowerCase() ) );
			if ( v.wat === 'richting' ) return !! vl.kleur.richting || vl.kleur.status === 'richting';
			const lijst = { kandidaat: 'kandidaten', favoriet: 'favorieten', afwijzen: 'afgewezen' }[ v.wat ];
			return ( vl.kleur[ lijst ] ?? [] ).some( ( k ) => zelfde( k.naam, n ) );
		}
		default: return null;
	}
}

/** Wat nooit mag (testset-tekst), vergeleken met de stand voor de beurt. */
function verbodenGebeurd( zin, voor, na, tekst ) {
	const nieuwGekozen = [ ...gekozenSet( na ) ].filter( ( x ) => ! gekozenSet( voor ).has( x ) );
	let m;
	if ( ( m = /^kleur kies (.+)$/.exec( zin ) ) && ! /op lakwerk/.test( zin ) ) return nieuwGekozen.some( ( x ) => zelfde( x.split( ':' )[ 1 ], m[ 1 ] ) );
	if ( zin === 'kleur kies' ) return nieuwGekozen.length > 0;
	if ( /kleur kies op lakwerk/.test( zin ) ) return nieuwGekozen.some( ( x ) => /\.(deuren|kozijnen|plinten|radiatoren|lambrisering|kasten)/.test( x ) );
	if ( zin === 'kleur richting' ) return ( na?.ruimtes ?? [] ).some( ( r ) => r.vlakken.some( ( v ) => v.kleur.richting && ! vlakVan( ruimteVan( voor, r.id ), v.id )?.kleur.richting ) );
	if ( /^vlak-erbij plafond/.test( zin ) ) return ( na?.ruimtes ?? [] ).some( ( r ) => vlakVan( r, 'plafond' ) && ! vlakVan( ruimteVan( voor, r.id ), 'plafond' ) );
	if ( /zet ondergrond\.afwerking geen zeker/.test( zin ) ) return ( na?.ruimtes ?? [] ).some( ( r ) => r.vlakken.some( ( v ) => w( v.ondergrond.afwerking ) === 'geen' && v.ondergrond.afwerking.bron === 'gezegd' ) );
	if ( /zet maat zonder bevestiging/.test( zin ) ) return ( na?.ruimtes ?? [] ).some( ( r ) => r.maat.lengte?.bron === 'gezegd' && ! ruimteVan( voor, r.id )?.maat.lengte );
	if ( /zet glas zonder hoogte/.test( zin ) ) return ( na?.ruimtes ?? [] ).some( ( r ) => ( r.glas ?? [] ).length > ( ruimteVan( voor, r.id )?.glas ?? [] ).length );
	if ( /merk vaker dan een keer/.test( zin ) ) return MERKEN.concat( 'LAB' ).some( ( b ) => ( tekst.match( new RegExp( `\\b${ b.replace( /[&]/g, '\\&' ) }\\b`, 'gi' ) ) ?? [] ).length > 1 );
	if ( /antwoord/.test( zin ) ) return null; // tekstregels: zie de vaste controle en de beoordeling
	return null;
}

/** Een eindwaarde uit gesprekken.json ("open of richting", "bestaat niet", getallen, lijsten). */
function eindKlopt( sleutel, verwacht, r, alle ) {
	const p = r.project;
	const alt = ( echt ) => String( verwacht ).replace( /\s*\(.*\)\s*/g, '' ).split( ' of ' ).some( ( a ) => a === 'niet gekozen' ? echt !== 'gekozen' : a === 'niet gezet' ? echt == null : zelfde( echt, a ) );
	if ( [ 'conflict', 'pakketkaart', 'bestellen', 'project', 'ontvangen-status' ].includes( sleutel ) ) return null;
	if ( sleutel === 'mens' ) return ( r.mens ?? [] ).some( ( m ) => String( m.reden ).includes( String( verwacht ).split( ' ' )[ 0 ] ) ) || alle.some( ( x ) => x.antwoord?.actie === 'overdracht' );
	if ( sleutel === 'doorverwijzing' ) return alle.some( ( x ) => [ 'stappen', 'overdracht' ].includes( x.antwoord?.actie ) );
	if ( sleutel === 'zonder' ) return ( p?.zonder ?? [] ).some( ( x ) => String( x ).toLowerCase().includes( String( verwacht ).toLowerCase() ) );
	if ( sleutel === 'samples' ) return verwacht.every( ( n ) => ( p?.samples ?? [] ).some( ( s ) => zelfde( s.naam, n ) ) );
	if ( [ 'spullen', 'wanneer' ].includes( sleutel ) ) return alt( w( p?.[ sleutel ] ) );
	if ( sleutel === 'doel' ) return String( w( p?.doel ) ?? '' ).toLowerCase().includes( String( verwacht ).toLowerCase() );
	const delen = sleutel.split( '.' );
	if ( delen[ 0 ] === 'status' ) {
		const ru = ruimteVan( p, delen[ 1 ] );
		const o = ( r.status?.onderdelen ?? [] ).find( ( x ) => x.ruimte === ru?.id && x.vlak === delen[ 2 ] );
		return alt( o?.status );
	}
	const ru = ruimteVan( p, delen[ 0 ] );
	if ( ! ru ) return false;
	if ( delen[ 1 ] === 'maat' ) return waardeGelijk( w( ru.maat[ delen[ 2 ] ] ), verwacht );
	if ( delen[ 1 ] === 'hoogte' ) return waardeGelijk( w( ru.hoogte ), verwacht );
	if ( delen[ 1 ] === 'glas' ) return ( ru.glas ?? [] ).length === verwacht;
	const vl = vlakVan( ru, delen[ 1 ] );
	if ( delen.length === 2 ) return verwacht === 'bestaat niet' ? ! vl : !! vl;
	if ( ! vl ) return false;
	if ( delen[ 2 ] === 'kleur' && delen.length === 3 ) return zelfde( kleurNaam( vl ), verwacht ) || zelfde( w( vl.kleur.gekozen )?.naam, verwacht );
	if ( delen[ 2 ] === 'kleur' && delen[ 3 ] === 'status' ) return alt( vl.kleur.status );
	if ( delen[ 2 ] === 'kleur' && delen[ 3 ] === 'type' ) return zelfde( w( vl.kleur.gekozen )?.type, verwacht );
	if ( delen[ 2 ] === 'ondergrond' ) return alt( w( vl.ondergrond[ delen[ 3 ] ] ) );
	return waardeGelijk( w( vl[ delen[ 2 ] ] ), verwacht );
}
/** Wat er echt stond, voor in het rapport. */
function eindWaarde( sleutel, r ) {
	const p = r.project, d = sleutel.split( '.' );
	if ( d[ 0 ] === 'status' ) { const ru = ruimteVan( p, d[ 1 ] ); const o = ( r.status?.onderdelen ?? [] ).find( ( x ) => x.ruimte === ru?.id && x.vlak === d[ 2 ] ); return o ? `${ o.status } ${ [ ...( o.ontbreekt ?? [] ), ...( o.controleren ?? [] ) ].join( ',' ) }` : null; }
	if ( sleutel === 'samples' ) return ( p?.samples ?? [] ).map( ( s ) => s.naam );
	if ( [ 'spullen', 'wanneer', 'doel' ].includes( sleutel ) ) return w( p?.[ sleutel ] );
	const ru = ruimteVan( p, d[ 0 ] ), vl = vlakVan( ru, d[ 1 ] );
	if ( d.length === 2 ) return vl ? 'bestaat' : 'bestaat niet';
	if ( d[ 2 ] === 'kleur' ) return vl ? { status: vl.kleur.status, naam: kleurNaam( vl ) } : null;
	if ( d[ 2 ] === 'ondergrond' ) return vl ? w( vl.ondergrond[ d[ 3 ] ] ) : null;
	return null;
}

/** "nooit" bij gesprekken: plan- en tekstregels. */
function nooitGebeurd( zin, r ) {
	const p = r.project;
	if ( /verf voor de muren in het bestelvoorstel/.test( zin ) ) return ( r.mandPlan?.ruimtes ?? [] ).some( ( x ) => x.vlakken.some( ( v ) => v.soort === 'muren' ) );
	if ( /Sage Blink als gekozen kleur/.test( zin ) ) return [ ...gekozenSet( p ) ].some( ( x ) => x.endsWith( ':Sage Blink' ) );
	if ( /badkamermuren als klaar/.test( zin ) ) return ( r.status?.onderdelen ?? [] ).some( ( o ) => o.ruimte.startsWith( 'badkamer' ) && o.vlak === 'muren' && o.status === 'klaar' );
	if ( /benaderde kleur automatisch/.test( zin ) ) return ( p?.ruimtes ?? [] ).some( ( x ) => x.vlakken.some( ( v ) => w( v.kleur.gekozen )?.type === 'merk-benaderd' && v.kleur.gekozen.door !== 'klant-kaart' ) );
	if ( /gereedschap geselecteerd/.test( zin ) ) return w( p?.spullen ) === 'niets';
	if ( /een kleur voor de muren gekozen/.test( zin ) ) return [ ...gekozenSet( p ) ].some( ( x ) => x.includes( '.muren:' ) );
	return null; // tekstregels (behang, dekking, retour) vangt de vaste controle
}

/**
 * Een tik uit gesprekken.json ({ tik: "sample Sand Salute" }) naar wat de browser echt stuurt: een tik op een
 * kaart, of de tekst van een chip.
 */
function tikVan( beurt, project ) {
	if ( typeof beurt === 'string' ) return { bericht: beurt, tik: null };
	// Wat de browser stuurt bij een ingevuld formulier of de knop Wijzig: klanten gebruiken dit het meest.
	if ( beurt.formulier ) return { bericht: '', tik: null, formulier: beurt.formulier };
	if ( beurt.wijzigForm ) return { bericht: '', tik: null, wijzigForm: beurt.wijzigForm };
	const t = String( beurt.tik ?? '' ), ruimte = project?.ruimtes?.[ 0 ]?.id ?? '';
	let m;
	if ( ( m = /^sample (.+)$/.exec( t ) ) ) return { bericht: '', tik: { actie: 'sample', wat: 'erbij', kleur: { type: 'roll', naam: m[ 1 ] } } };
	if ( ( m = /^favoriet (.+)$/.exec( t ) ) ) return { bericht: '', tik: { actie: 'kleur', ruimte, vlak: 'muren', wat: 'favoriet', kleur: { type: 'roll', naam: m[ 1 ] } } };
	if ( ( m = /^Kies deze kleur: (.+)$/.exec( t ) ) ) return { bericht: '', tik: { actie: 'kleur', ruimte, vlak: 'muren', wat: 'kies', kleur: { type: 'roll', naam: m[ 1 ] } } };
	if ( /^Klopt/.test( t ) ) return { bericht: 'Klopt', tik: null };
	return { bericht: t, tik: null };
}

/* ---------- de gevallen ---------- */

async function draaiBericht( g ) {
	const sessie = 'testset' + rid() + rid();
	const fouten = [], antwoorden = [];
	let r = { project: null }, klant = '';
	// Losse berichten zonder ruimte gingen uit van een plan dat er al is: dan eerst de woonkamer.
	const zonderRuimte = ! VOORAF[ g.id ] && ! /woonkamer|slaapkamer|keuken|eetkamer|badkamer|toilet|\bhal\b|werkkamer|kinderkamer|overloop|zolder|kamer/i.test( g.bericht );
	for ( const t of VOORAF[ g.id ] ?? ( zonderRuimte ? [ 'Ik wil de muren van mijn woonkamer schilderen.' ] : [] ) ) { klant += ' ' + t; r = await post( { sessie, aanvraagId: rid(), bericht: t } ); if ( r.fout ) break; }
	const voor = r.project;
	const eersteKaart = r.antwoord?.kaarten?.[ 0 ]?.naam;
	if ( eersteKaart && /die eerste/i.test( g.bericht ) ) g = { ...g, verwacht: ( g.verwacht ?? [] ).map( ( v ) => ( v.wat === 'kies' ? { ...v, kleur: { ...v.kleur, naam: eersteKaart } } : v ) ) };
	if ( ! r.fout ) { klant += ' ' + g.bericht; r = await post( { sessie, aanvraagId: rid(), bericht: g.bericht } ); }
	if ( r.fout ) return { id: g.id, kritiek: !! g.kritiek, soort: 'bericht', checks: 1, fouten: [ `chat gaf een fout: ${ r.fout }` ], antwoorden };
	const tekst = r.antwoord?.tekst ?? '';
	antwoorden.push( { klant: g.bericht, tekst, test: r.test } );
	let checks = 0;
	for ( const v of g.verwacht ?? [] ) {
		const k = klopt( v, r.project );
		if ( k === null ) continue;
		checks++;
		if ( ! k ) fouten.push( `verwacht niet gevonden: ${ JSON.stringify( v ) }` );
	}
	for ( const zin of g.verboden ?? [] ) {
		const k = verbodenGebeurd( zin, voor, r.project, tekst );
		if ( k === null ) continue;
		checks++;
		if ( k ) fouten.push( `verboden gebeurd: ${ zin }` );
	}
	if ( g.vraag ) { checks++; if ( ! /\?/.test( tekst ) && ! r.antwoord?.formulier && ! ( r.antwoord?.chips ?? [] ).length ) fouten.push( 'verwacht een vraag aan de klant' ); }
	return { id: g.id, kritiek: !! g.kritiek, soort: 'bericht', checks, fouten, antwoorden, klant };
}

async function draaiGesprek( g ) {
	const sessie = 'testset' + rid() + rid();
	const fouten = [], antwoorden = [];
	let r = null, klant = '';
	for ( const beurt of [ ...( VOORAF_GESPREK[ g.id ] ?? [] ), ...g.beurten ] ) {
		const { bericht: t, tik, formulier, wijzigForm } = tikVan( beurt, r?.project );
		klant += ' ' + t;
		r = await post( { sessie, aanvraagId: rid(), bericht: t, tik, formulier, wijzigForm } );
		if ( r.fout ) { fouten.push( `chat gaf een fout bij "${ t || formulier?.soort || wijzigForm }": ${ r.fout }` ); break; }
		antwoorden.push( { klant: t || ( formulier ? `(formulier ${ formulier.soort })` : wijzigForm ? `(wijzig ${ wijzigForm })` : '' ), tekst: r.antwoord?.tekst ?? '', test: r.test, antwoord: r.antwoord } );
	}
	let checks = fouten.length;
	if ( r && ! r.fout ) {
		for ( const [ k, v ] of Object.entries( g.eind ?? {} ) ) {
			const ok = eindKlopt( k, v, r, antwoorden );
			if ( ok === null ) continue;
			checks++;
			if ( ! ok ) fouten.push( `eind ${ k } is niet "${ Array.isArray( v ) ? v.join( ', ' ) : v }" (wel: ${ JSON.stringify( eindWaarde( k, r ) ) })` );
		}
		// Wat er in een antwoord moet staan, bijvoorbeeld "digitale assistent" op de vraag of het een mens is.
		for ( const [ beurt, patroon ] of Object.entries( g.antwoordBevat ?? {} ) ) {
			checks++;
			if ( ! new RegExp( patroon, 'i' ).test( antwoorden[ Number( beurt ) ]?.tekst ?? '' ) ) fouten.push( `antwoord ${ beurt } bevat niet /${ patroon }/` );
		}
		for ( const [ beurt, patroon ] of Object.entries( g.antwoordNiet ?? {} ) ) {
			checks++;
			if ( new RegExp( patroon, 'i' ).test( antwoorden[ Number( beurt ) ]?.tekst ?? '' ) ) fouten.push( `antwoord ${ beurt } bevat ten onrechte /${ patroon }/` );
		}
		for ( const [ beurt, min ] of Object.entries( g.kaartenMin ?? {} ) ) {
			checks++;
			const n = antwoorden[ Number( beurt ) ]?.antwoord?.kaarten?.length ?? 0;
			if ( n < min ) fouten.push( `antwoord ${ beurt } toont ${ n } kaarten, minstens ${ min } verwacht` );
		}
		// Welk formulier er bij een beurt verschijnt ("geen" = geen formulier).
		for ( const [ beurt, soort ] of Object.entries( g.formulierBij ?? {} ) ) {
			checks++;
			const echt = antwoorden[ Number( beurt ) ]?.antwoord?.formulier?.soort ?? 'geen';
			if ( echt !== soort ) fouten.push( `antwoord ${ beurt } toont formulier ${ echt }, verwacht ${ soort }` );
		}
		// Velden die bij een beurt in het antwoord moeten staan, en hoe vaak iets hooguit mag voorkomen.
		for ( const [ beurt, velden ] of Object.entries( g.vlag ?? {} ) ) {
			for ( const veld of velden ) {
				checks++;
				const x = antwoorden[ Number( beurt ) ]?.antwoord?.[ veld ];
				if ( ! x || ( Array.isArray( x ) && ! x.length ) ) fouten.push( `antwoord ${ beurt } heeft geen ${ veld }` );
			}
		}
		for ( const [ veld, max ] of Object.entries( g.vlagHooguit ?? {} ) ) {
			checks++;
			const n = antwoorden.filter( ( x ) => x.antwoord?.[ veld ] ).length;
			if ( n > max ) fouten.push( `${ veld } staat ${ n } keer in het gesprek, hooguit ${ max }` );
		}
		// Wat de klant na herladen ziet: het bewaarde gesprek, inclusief de teksten die de server zelf maakt.
		if ( g.gesprekBevat || g.gesprekNiet ) {
			const bewaard = await fetch( `${ CHAT_URL }?sessie=${ sessie }` ).then( ( x ) => x.json() ).catch( () => ( {} ) );
			const alles = ( bewaard.gesprek ?? [] ).map( ( b ) => b.tekst ).join( '\n' );
			for ( const patroon of g.gesprekBevat ?? [] ) { checks++; if ( ! new RegExp( patroon, 'i' ).test( alles ) ) fouten.push( `bewaard gesprek bevat niet /${ patroon }/` ); }
			for ( const patroon of g.gesprekNiet ?? [] ) { checks++; if ( new RegExp( patroon, 'i' ).test( alles ) ) fouten.push( `bewaard gesprek bevat ten onrechte /${ patroon }/` ); }
		}
		for ( const zin of g.nooit ?? [] ) {
			const k = nooitGebeurd( zin, r );
			if ( k === null ) continue;
			checks++;
			if ( k ) fouten.push( `nooit gebeurd: ${ zin }` );
		}
	}
	return { id: g.id, kritiek: !! g.kritiek, soort: 'gesprek', checks, fouten, antwoorden, klant };
}

async function inPartijen( lijst, n, f ) {
	const uit = [];
	let i = 0;
	await Promise.all( Array.from( { length: n }, async () => { while ( i < lijst.length ) { const x = lijst[ i++ ]; uit.push( await f( x ) ); process.stdout.write( '.' ); } } ) );
	return uit;
}

/* ---------- draaien en rapporteren ---------- */

const start = Date.now();
const kies = ( g ) => ! ALLEEN || ALLEEN.includes( g.id );
const bGevallen = berichten.filter( kies );
const gGevallen = gesprekken.filter( ( g ) => kies( g ) && ! HANDMATIG.has( g.id ) );
console.log( `Testset tegen ${ CHAT_URL }: ${ bGevallen.length } berichten, ${ gGevallen.length } gesprekken${ BEOORDELEN ? ', met beoordeling' : '' }.` );
const resultaten = [ ...( await inPartijen( bGevallen, PARALLEL, draaiBericht ) ), ...( await inPartijen( gGevallen, PARALLEL, draaiGesprek ) ) ];
console.log( '' );

// Vaste controle en beoordeling op elk antwoord.
const tekstFouten = [];
await inPartijen( resultaten, PARALLEL, async ( res ) => {
	for ( const a of res.antwoorden ) {
		const vast = controleer( a.tekst, { klant: res.klant, tools: a.test?.tools ?? [] } );
		res.checks++;
		if ( vast.length ) { res.fouten.push( `controle: ${ vast.map( ( f ) => `${ f.id } ("${ f.stuk }")` ).join( ', ' ) }` ); tekstFouten.push( res.id ); }
		if ( a.test?.controle?.length ) res.herkansingen = ( res.herkansingen ?? 0 ) + a.test.controle.length;
		// De beoordelaar krijgt het hele gesprek tot dit antwoord, anders lijkt een keuze van de klant een keuze van de bot.
		const tot = res.antwoorden.slice( 0, res.antwoorden.indexOf( a ) + 1 );
		const b = await beoordeel( tot.map( ( x, i ) => `Klant: ${ x.klant || '(tikte op een kaart)' }${ i < tot.length - 1 ? `\nBot: ${ x.tekst }` : '' }` ).join( '\n' ), a.tekst );
		if ( b && b.ok !== null && b.ok !== undefined ) {
			res.checks++;
			a.beoordeling = b;
			if ( ! b.ok ) res.fouten.push( `beoordeling: regel ${ ( b.regels ?? [] ).join( ', ' ) }: ${ b.waarom }` );
		}
	}
} );
console.log( '' );

const kritiekMis = resultaten.filter( ( r ) => r.kritiek && r.fouten.length );
const totaalChecks = resultaten.reduce( ( t, r ) => t + r.checks, 0 );
const totaalFout = resultaten.reduce( ( t, r ) => t + r.fouten.length, 0 );
const score = totaalChecks ? ( totaalChecks - totaalFout ) / totaalChecks : 0;
const kleuradvies = resultaten.filter( ( r ) => r.antwoorden.some( ( a ) => ( a.beoordeling?.regels ?? [] ).includes( 1 ) ) || r.fouten.some( ( f ) => /controle:.*kleuradvies/.test( f ) ) );
const geslaagd = ! kritiekMis.length && score >= 0.95 && ! tekstFouten.length && ! kleuradvies.length;
const herkansingen = resultaten.reduce( ( t, r ) => t + ( r.herkansingen ?? 0 ), 0 );

const regels = [
	`# Testset Jouw schilderplan, ${ new Date().toISOString().slice( 0, 16 ).replace( 'T', ' ' ) }`,
	'',
	`Tegen: ${ CHAT_URL }${ MODEL ? `, model ${ MODEL }` : '' }. Duur ${ Math.round( ( Date.now() - start ) / 1000 ) } s.`,
	'',
	`**${ geslaagd ? 'Geslaagd' : 'Niet geslaagd' }.** Score ${ ( score * 100 ).toFixed( 1 ) }% van ${ totaalChecks } controles (norm 95%). Kritiek mis: ${ kritiekMis.length } (norm 0). Fouten in de vaste controle na de herkansing: ${ tekstFouten.length } (norm 0). Eigen kleuradvies: ${ kleuradvies.length } (norm 0). Herkansingen door de controle: ${ herkansingen }.`,
	'',
	`Handmatig te beoordelen (niet automatisch getest): ${ [ ...HANDMATIG ].join( ', ' ) }.`,
	'',
	'| Geval | Kritiek | Uitkomst |',
	'| --- | --- | --- |',
	...resultaten.sort( ( a, b ) => a.id.localeCompare( b.id ) ).map( ( r ) => `| ${ r.id } | ${ r.kritiek ? 'ja' : '' } | ${ r.fouten.length ? r.fouten.join( '<br>' ).replace( /\|/g, '/' ) : 'goed' } |` ),
];
const map = join( HIER, '../testset-resultaten' );
mkdirSync( map, { recursive: true } );
writeFileSync( join( map, 'laatste.md' ), regels.join( '\n' ) + '\n' );
writeFileSync( join( map, 'laatste.json' ), JSON.stringify( { geslaagd, score, kritiekMis: kritiekMis.map( ( r ) => r.id ), resultaten }, null, 1 ) );
console.log( regels.slice( 0, 5 ).join( '\n' ) );
console.log( `Rapport: ${ join( map, 'laatste.md' ) }` );

await post( { sessie: 'testsetopruimenxxxxxxxxxxx', opruimen: true } );
process.exit( geslaagd ? 0 : 1 );
