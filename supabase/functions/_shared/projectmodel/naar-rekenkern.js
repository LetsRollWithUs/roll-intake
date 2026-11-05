// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/**
 * Vertaallaag: projectmodel v2 naar het plan dat de rekenkern (verfcalculator, wat=bereken) nu begrijpt.
 *
 * De rekenkern kent per vlak één ondergrondveld (verf: licht, donker, nieuw, onbekend; lak: gelakt, kaal,
 * metaal, bladdert, onbekend) plus staat, structuur en behang. Wat hij niet kan verwerken, wordt geen gok
 * maar een doorverwijzing naar een mens.
 */
import { isLak, w } from './schema.js';

/** Muren en plafond: vijf velden naar ondergrond, staat, structuur en behang. */
export function verfOndergrond( ond ) {
	const materiaal = w( ond.materiaal );
	const afwerking = w( ond.afwerking );
	const kleurNu = w( ond.kleurNu );
	const conditie = w( ond.conditie );
	const uit = { ondergrond: 'onbekend', staat: 'glad', structuur: 'structuur' === w( ond.structuur ), behang: '', mens: null };

	if ( 'vocht' === conditie ) {
		return { ...uit, mens: 'vocht of schimmel' };
	}
	if ( 'bladdert' === conditie ) {
		return { ...uit, mens: 'afbladderende muurverf' };
	}
	if ( 'beton' === materiaal ) {
		return { ...uit, mens: 'beton' };
	}
	if ( 'scheuren' === conditie || 'scheurtjes' === conditie ) {
		uit.staat = conditie;
	}
	if ( 'behang' === afwerking ) {
		// Behang gaat er altijd af; daarna is de muur kaal en krijgt hij voorstrijk.
		return { ...uit, ondergrond: 'nieuw', behang: 'eraf' };
	}
	if ( 'geen' === afwerking ) {
		return { ...uit, ondergrond: 'nieuw' };
	}
	if ( 'renovlies' === afwerking ) {
		// Renovlies of glasvezel op de muur: gewoon overschilderen. Voorgeschilderd telt als een lichte muur.
		return { ...uit, ondergrond: { midden: 'donker', donker: 'donker', onbekend: 'onbekend' }[ kleurNu ] || 'licht' };
	}
	if ( 'muurverf' === afwerking ) {
		// De rekenkern kent nog geen middentint per vlak: die rekenen we als donker (een laag extra eerder dan te weinig).
		const nu = { licht: 'licht', midden: 'donker', donker: 'donker' }[ kleurNu ];
		return { ...uit, ondergrond: nu || 'onbekend' };
	}
	return uit;
}

/** Lakwerk: vijf velden naar de lak-ondergrond van de rekenkern. */
export function lakOndergrond( ond ) {
	const materiaal = w( ond.materiaal );
	const afwerking = w( ond.afwerking );
	const conditie = w( ond.conditie );
	if ( 'bladdert' === conditie ) {
		return 'bladdert';
	}
	if ( 'geen' === afwerking ) {
		return 'metaal' === materiaal ? 'metaal' : 'kaal';
	}
	if ( 'lak' === afwerking ) {
		return 'gelakt';
	}
	return 'onbekend';
}

/** Een gekozen kleur naar het kleurobject van de rekenkern. Alleen status "gekozen" levert verf op. */
export function kleurNaarKern( kleur ) {
	if ( ! kleur || 'gekozen' !== kleur.status ) {
		return null;
	}
	const k = w( kleur.gekozen );
	if ( ! k ) {
		return null;
	}
	if ( 'roll' === k.type ) {
		return { naam: k.naam };
	}
	if ( 'merk-benaderd' === k.type ) {
		// Een benaderde kleur is alleen "gekozen" als de klant de Roll-kleur zelf koos; dan is het een Roll-kleur.
		return k.rollKleur ? { naam: k.rollKleur } : null;
	}
	if ( k.km && k.km.id ) {
		return { km: { id: k.km.id, rollNaam: k.km.rollNaam || '', rollCode: k.km.rollCode || '', hex: k.km.hex || '', ral: 'ral' === k.type, naam: 'ral' === k.type ? k.naam : '' } };
	}
	return null;
}

const SPULLEN = { niets: 'niets', deel: 'deel', alles: 'alles', schilder: 'alles', onbekend: 'deel' };

/**
 * Het hele project naar een plan voor wat=bereken.
 * @return {{plan: object, mens: Array<{ruimte: string, vlak: string, reden: string}>}}
 */
export function naarRekenkern( project ) {
	const mens = [];
	const ruimtes = project.ruimtes.map( ( r ) => {
		const l = w( r.maat.lengte );
		const b = w( r.maat.breedte );
		const muren = r.vlakken.find( ( v ) => 'muren' === v.soort );
		// Een schuifpui of raampartij gaat alleen af met een bruikbare maat; de rekenkern rekent 4 m² per stuk,
		// dus we ronden naar beneden af (liever iets te veel verf).
		const glasM2 = r.glas.reduce( ( t, g ) => t + ( w( g.breedte, 0 ) * w( g.hoogte, 0 ) ), 0 );
		const vlakken = r.vlakken.map( ( v ) => {
			const uit = { id: v.id, soort: v.soort, kleur: 'muren' === v.soort ? null : kleurNaarKern( v.kleur ), aantal: w( v.aantal, '' ), m2: 'meubel' === v.soort ? w( v.m2, '' ) : '' };
			if ( isLak( v.soort ) ) {
				uit.ondergrond = lakOndergrond( v.ondergrond );
				uit.glans = r.buiten && 'mat' === w( v.glans ) ? 'zijdeglans' : w( v.glans, 'mat' );
			} else {
				const o = verfOndergrond( v.ondergrond );
				if ( o.mens ) {
					mens.push( { ruimte: r.id, vlak: v.id, reden: o.mens } );
				}
				Object.assign( uit, { ondergrond: o.ondergrond, staat: o.staat, structuur: o.structuur, behang: o.behang, renovlies: !! w( v.renovlies ), lagen: w( v.lagen, '' ) } );
				if ( 'accent' === v.soort ) {
					uit.breedte = w( v.breedte, '' );
					uit.hoogte = w( v.hoogte, '' );
				}
			}
			return uit;
		} );
		return {
			id: r.id,
			type: r.type,
			naam: r.naam,
			grootte: w( r.maat.grootte, 'middel' ),
			vloer: l && b ? { l, b } : null,
			hoogte: w( r.hoogte, '' ),
			extra: w( r.extra, '' ),
			glas: Math.floor( glasM2 / 4 ),
			buiten: !! r.buiten,
			kleur: muren ? kleurNaarKern( muren.kleur ) : null,
			vlakken,
		};
	} );
	const spullen = w( project.spullen, 'onbekend' );
	return {
		plan: {
			ruimtes,
			spullen: SPULLEN[ spullen ] || 'niets',
			// Weten we het niet, dan bieden we de spullen aan zonder vinkje.
			tools: 'onbekend' === spullen ? [] : null,
			uit: [],
			zonder: project.zonder || [],
			samples: ( project.samples || [] ).map( ( s ) => ( { naam: s.naam, type: s.type || 'sticker' } ) ),
			packs: project.packs || [],
			land: w( project.land, 'NL' ),
		},
		mens,
	};
}
