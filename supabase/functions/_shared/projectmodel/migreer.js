// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/**
 * Migratie: een project uit de huidige Projecthulp (de staat in de browser of het bewaarde plan) naar model v2.
 *
 * Regel uit het plan: alles krijgt bron "aangenomen" en is niet geaccepteerd, tenzij het aantoonbaar door de
 * klant is ingevuld: een getypte maat, een gekozen grootte, een gekozen muurkleur of een gekozen accentmuur.
 * Oude standaardwaarden (zoals de ondergrond "licht" of wit voor plafond en lakwerk) worden nooit bevestigde feiten.
 */
import { gegeven, isLak, nieuwProject, nieuweRuimte, nieuwVlak } from './schema.js';

const NAAR_TYPE = ( id ) => String( id ).replace( /\d+$/, '' );

/** Een kleur uit de oude staat naar het kleurobject van v2. */
function oudeKleur( k ) {
	if ( ! k ) {
		return null;
	}
	if ( k.km && k.km.id ) {
		return k.km.ral
			? { type: 'ral', naam: k.km.naam, km: { ...k.km } }
			// Een kleurmatch-treffer mengt Roll exact na.
			: { type: 'merk-exact', naam: k.km.rollNaam + ( k.km.rollCode ? ' - ' + k.km.rollCode : '' ), km: { ...k.km } };
	}
	return k.naam ? { type: 'roll', naam: k.naam } : null;
}

function verfOndergrondOud( v, aan ) {
	const o = {};
	const ond = v.ondergrond || '';
	if ( 'eraf' === v.behang ) {
		o.afwerking = aan( 'behang' );
	} else if ( 'nieuw' === ond ) {
		o.afwerking = aan( 'geen' );
		o.materiaal = aan( 'onbekend' );
	} else if ( 'licht' === ond || 'donker' === ond ) {
		o.afwerking = aan( 'muurverf' );
		o.kleurNu = aan( ond );
	} else if ( 'onbekend' === ond ) {
		o.afwerking = aan( 'onbekend' );
	}
	o.structuur = aan( v.structuur ? 'structuur' : 'glad' );
	o.conditie = aan( { scheurtjes: 'scheurtjes', scheuren: 'scheuren' }[ v.staat ] || 'goed' );
	return o;
}

function lakOndergrondOud( v, aan ) {
	const o = {};
	switch ( v.ondergrond ) {
		case 'gelakt':
			Object.assign( o, { afwerking: aan( 'lak' ), conditie: aan( 'goed' ) } );
			break;
		case 'bladdert':
			Object.assign( o, { afwerking: aan( 'lak' ), conditie: aan( 'bladdert' ) } );
			break;
		case 'kaal':
			Object.assign( o, { afwerking: aan( 'geen' ), materiaal: aan( 'hout' ) } );
			break;
		case 'metaal':
			Object.assign( o, { afwerking: aan( 'geen' ), materiaal: aan( 'metaal' ) } );
			break;
		case 'onbekend':
			o.afwerking = aan( 'onbekend' );
			break;
	}
	return o;
}

/**
 * @param {object} s   De staat van de huidige Projecthulp (s.ruimtes, s.per, s.maten, s.spullen, s.samples, s.packs).
 * @param {string} id  Project-id.
 * @param {string} op  Tijdstip van de migratie.
 */
export function migreer( s, id, op = new Date().toISOString() ) {
	const p = nieuwProject( id );
	const aan = ( waarde ) => gegeven( waarde, 'aangenomen', 'migratie', { op, geaccepteerd: false } );
	const klant = ( waarde ) => gegeven( waarde, 'gezegd', 'migratie', { op, geaccepteerd: true } );

	for ( const k of s.ruimtes || [] ) {
		const per = ( s.per || {} )[ k ] || {};
		const m = ( s.maten || {} )[ k ] || {};
		const r = nieuweRuimte( k, NAAR_TYPE( k ), per.naam );
		r.vlakken = [];
		const l = parseFloat( String( m.vloer && m.vloer.l || '' ).replace( ',', '.' ) );
		const b = parseFloat( String( m.vloer && m.vloer.b || '' ).replace( ',', '.' ) );
		if ( l > 0 && b > 0 ) {
			r.maat.lengte = klant( l );
			r.maat.breedte = klant( b );
		}
		if ( [ 'klein', 'middel', 'groot' ].includes( m.grootte ) ) {
			r.maat.grootte = klant( m.grootte );
		} else {
			r.maat.grootte = aan( 'middel' );
		}
		r.hoogte = per.hoogte ? klant( parseFloat( per.hoogte ) ) : aan( 2.6 );
		if ( per.extra ) {
			r.extra = klant( parseFloat( per.extra ) );
		}
		r.buiten = !! per.buiten;
		for ( const v of per.vlakken || [] ) {
			const nv = nieuwVlak( v.id, v.soort );
			const lak = isLak( v.soort );
			Object.assign( nv.ondergrond, lak ? lakOndergrondOud( v, aan ) : verfOndergrondOud( v, aan ) );
			if ( lak ) {
				nv.glans = aan( v.glans || 'mat' );
				if ( null !== v.aantal && undefined !== v.aantal && '' !== v.aantal ) {
					nv.aantal = aan( parseInt( v.aantal, 10 ) );
				}
			}
			if ( 'accent' === v.soort ) {
				nv.breedte = v.breedte ? klant( parseFloat( v.breedte ) ) : null;
				nv.hoogte = v.hoogte ? klant( parseFloat( v.hoogte ) ) : null;
			}
			// De muurkleur is altijd een keuze van de klant; plafond en lakwerk kregen vroeger automatisch wit.
			const kleur = oudeKleur( 'muren' === v.soort ? per.kleur : v.kleur );
			if ( kleur ) {
				// Wit op plafond of lakwerk kan een oude standaard zijn; "zelfde als de muren" en andere kleuren koos de klant.
				const gekozenDoorKlant = 'muren' === v.soort || 'accent' === v.soort || !! v.volgt || 'Blank Page' !== kleur.naam;
				nv.kleur.status = 'gekozen';
				nv.kleur.gekozen = gekozenDoorKlant ? klant( kleur ) : aan( kleur );
			} else if ( v.volgt ) {
				nv.kleur.status = 'open';
			}
			r.vlakken.push( nv );
		}
		p.ruimtes.push( r );
	}
	if ( s.spullen ) {
		p.spullen = aan( { niets: 'niets', deel: 'deel', alles: 'alles' }[ s.spullen ] || 'onbekend' );
	}
	p.samples = ( s.samples || [] ).map( ( x ) => ( { naam: x.naam, type: x.type || 'sticker' } ) );
	p.packs = ( s.packs || [] ).map( ( x ) => ( x && x.productId ) || x ).filter( Boolean );
	p.log.push( { versie: 0, aanvraagId: 'migratie', door: 'migratie', op, wijzigingen: [ { actie: 'migratie' } ] } );
	return p;
}
