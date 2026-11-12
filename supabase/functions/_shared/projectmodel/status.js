// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/**
 * Status per onderdeel: eerste inschatting, nog te controleren, of klaar om te bestellen.
 *
 * Een onderdeel is één vlak in één ruimte (bijvoorbeeld de muren van de woonkamer). Samples hebben geen status:
 * die zijn altijd te bestellen. Een open kleur houdt alleen de verf van dat vlak tegen.
 */
import { isLak, w } from './schema.js';

/** Telt een gegeven voor bestellen: gezegd, of aangenomen en door de klant geaccepteerd. */
export function telt( g ) {
	if ( ! g || null === g.waarde || undefined === g.waarde ) {
		return false;
	}
	if ( 'onbekend' === g.waarde ) {
		// "Weet ik niet" mag, maar dan rekenen we voorzichtig; de klant moet dat gezien hebben.
		return !! g.geaccepteerd;
	}
	return 'gezegd' === g.bron || !! g.geaccepteerd;
}

/** De belangrijke gegevens van een vlak: wat het pakket voor dit onderdeel wezenlijk verandert. */
export function belangrijk( ruimte, vlak ) {
	const lijst = [];
	const maat = ruimte.maat;
	const heeftMaat = w( maat.lengte ) && w( maat.breedte );
	if ( ! isLak( vlak.soort ) ) {
		if ( heeftMaat ) {
			lijst.push( [ 'maat.lengte', maat.lengte ], [ 'maat.breedte', maat.breedte ] );
		} else if ( w( maat.omtrek ) && 'plafond' !== vlak.soort ) {
			// De klant gaf de totale muurlengte: genoeg voor de muren, niet voor het plafond (dat vraagt de vloer).
			lijst.push( [ 'maat.omtrek', maat.omtrek ] );
		} else {
			lijst.push( [ 'maat.grootte', maat.grootte ] );
		}
		if ( 'plafond' !== vlak.soort ) {
			lijst.push( [ 'hoogte', ruimte.hoogte ] );
		}
		if ( 'accent' === vlak.soort ) {
			lijst.push( [ 'breedte', vlak.breedte ] );
		}
		const o = vlak.ondergrond;
		lijst.push( [ 'ondergrond.afwerking', o.afwerking ] );
		if ( 'muurverf' === w( o.afwerking ) ) {
			lijst.push( [ 'ondergrond.kleurNu', o.kleurNu ] );
		}
		if ( 'geen' === w( o.afwerking ) ) {
			lijst.push( [ 'ondergrond.materiaal', o.materiaal ] );
		}
		lijst.push( [ 'ondergrond.structuur', o.structuur ], [ 'ondergrond.conditie', o.conditie ] );
	} else {
		const o = vlak.ondergrond;
		lijst.push( [ 'ondergrond.afwerking', o.afwerking ], [ 'ondergrond.conditie', o.conditie ], [ 'glans', vlak.glans ] );
		if ( 'geen' === w( o.afwerking ) ) {
			lijst.push( [ 'ondergrond.materiaal', o.materiaal ] );
		}
		if ( [ 'deuren', 'kozijnen', 'radiatoren', 'kasten', 'trap' ].includes( vlak.soort ) ) {
			lijst.push( [ 'aantal', vlak.aantal ] );
		}
	}
	return lijst;
}

/**
 * Status van één vlak.
 * @return {{status: 'kleur-open'|'inschatting'|'te-controleren'|'klaar', ontbreekt: string[], controleren: string[]}}
 */
export function vlakStatus( ruimte, vlak ) {
	const ontbreekt = [];
	const controleren = [];
	for ( const [ pad, g ] of belangrijk( ruimte, vlak ) ) {
		if ( ! g || null === g.waarde || undefined === g.waarde ) {
			ontbreekt.push( pad );
		} else if ( ! telt( g ) ) {
			controleren.push( pad );
		}
	}
	let status = ontbreekt.length ? 'inschatting' : controleren.length ? 'te-controleren' : 'klaar';
	if ( 'gekozen' !== vlak.kleur.status ) {
		status = 'kleur-open';
	} else if ( ! telt( vlak.kleur.gekozen ) && 'klaar' === status ) {
		status = 'te-controleren';
		controleren.push( 'kleur' );
	}
	return { status, ontbreekt, controleren };
}

/** Status van alle onderdelen, plus wat er voor bestellen nog nagelopen moet worden. */
export function projectStatus( project ) {
	const onderdelen = [];
	for ( const r of project.ruimtes ) {
		for ( const v of r.vlakken ) {
			onderdelen.push( { ruimte: r.id, vlak: v.id, soort: v.soort, ...vlakStatus( r, v ) } );
		}
	}
	return {
		onderdelen,
		teBestellen: onderdelen.filter( ( o ) => 'klaar' === o.status ),
		samplesTeBestellen: ( project.samples || [] ).length + ( project.packs || [] ).length > 0,
	};
}
