// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/**
 * Wijzigingen op het project: controleren op vorm en betekenis, vastleggen met herkomst, en een nieuwe versie.
 *
 * Volgorde (zoals in het plan): voorstel -> validatie -> vastleggen -> (daarna rekent de rekenkern).
 * - Elke aanvraag heeft een aanvraag-ID; dezelfde aanvraag nog een keer doet niets dubbel.
 * - Een aanvraag op een oudere projectversie wordt geweigerd (conflict); de browser haalt eerst de nieuwste op.
 * - Wat niet klopt of onduidelijk is, wordt een open vraag in plaats van een wijziging.
 */
import { GLANS, GRENZEN, KLEUR_TYPE, LAK_SOORTEN, ONDERGROND, RUIMTE_TYPES, SPULLEN, VLAK_SOORTEN, VOLGORDE, gegeven, inMeters, isLak, nieuweRuimte, nieuwVlak, w } from './schema.js';

const BEWAAR_STAPPEN = 20;
const MAX_RUIMTES_PER_TYPE = 6;
/** Boven deze vloer (m²) vragen we eerst of de maat klopt. */
const PLAUSIBEL = { toilet: 6, badkamer: 25, hal: 40, standaard: 150 };

const kopie = ( x ) => structuredClone( x );
const binnen = ( n, [ lo, hi ] ) => 'number' === typeof n && Number.isFinite( n ) && n >= lo && n <= hi;

function bronVan( zekerheid ) {
	return 'zeker' === zekerheid ? 'gezegd' : 'aangenomen';
}

/** Een geldige kleur: Roll-kleur uit de index, RAL-code, of een kleurmatch-treffer. */
export function geldigeKleur( k, kleurIndex ) {
	if ( ! k || ! KLEUR_TYPE.includes( k.type ) ) {
		return false;
	}
	if ( 'roll' === k.type ) {
		return !! k.naam && ( ! kleurIndex || kleurIndex.has( k.naam ) );
	}
	if ( 'ral' === k.type ) {
		// Type ral staat voor de standaarden met eigen naam: RAL en NCS.
		return /^(RAL \d{4}|NCS S \d{4}-[A-Z0-9]+)$/.test( k.naam || '' ) && !! ( k.km && k.km.id );
	}
	if ( 'merk-exact' === k.type ) {
		return !! ( k.km && k.km.id && k.km.rollNaam );
	}
	// Benaderd: het voorstel moet een bestaande Roll-kleur zijn.
	return !! k.rollKleur && ( ! kleurIndex || kleurIndex.has( k.rollKleur ) );
}

function zelfdeKleur( a, b ) {
	return a && b && a.type === b.type && ( a.naam || '' ) === ( b.naam || '' ) && ( ( a.km && a.km.id ) || '' ) === ( ( b.km && b.km.id ) || '' );
}

function vindRuimte( p, id ) {
	return p.ruimtes.find( ( r ) => r.id === id ) || null;
}

function vindVlak( r, id ) {
	return r ? r.vlakken.find( ( v ) => v.id === id ) || null : null;
}

/**
 * Pas een aanvraag toe.
 * @param {object} project
 * @param {{aanvraagId: string, versie: number, door: string, wijzigingen: object[]}} aanvraag
 * @param {{kleurIndex?: Set<string>, nu?: string}} opties
 */
export function toepassen( project, aanvraag, opties = {} ) {
	const uit = { project, toegepast: [], openVragen: [], geweigerd: [], herhaald: false, conflict: false };
	if ( project.log.some( ( l ) => l.aanvraagId === aanvraag.aanvraagId ) ) {
		return { ...uit, herhaald: true };
	}
	if ( aanvraag.versie !== project.versie ) {
		return { ...uit, conflict: true };
	}
	const p = kopie( project );
	const voor = kopie( { ...project, log: [] } );
	const op = opties.nu || new Date().toISOString();
	const door = aanvraag.door || 'klant-chat';
	const vraag = ( w_, tekst, voorstel = null ) => uit.openVragen.push( { wijziging: w_, vraag: tekst, voorstel } );
	const weiger = ( w_, reden ) => uit.geweigerd.push( { wijziging: w_, reden } );

	for ( const ruw of aanvraag.wijzigingen || [] ) {
		const wz = normaliseer( p, ruw );
		if ( 'ongedaan' === wz.actie ) {
			const vorige = [ ...p.log ].reverse().find( ( l ) => l.voor );
			if ( ! vorige ) {
				weiger( wz, 'Er is niets om ongedaan te maken.' );
				continue;
			}
			const terug = kopie( vorige.voor );
			Object.assign( p, { ...terug, id: p.id, versie: p.versie, log: p.log } );
			uit.toegepast.push( wz );
			continue;
		}
		if ( 'onduidelijk' === wz.zekerheid ) {
			vraag( wz, wz.vraag || 'Dat weet ik nog niet zeker. Kun je het iets anders zeggen?' );
			continue;
		}
		const r = wz.ruimte ? vindRuimte( p, wz.ruimte ) : null;
		const v = wz.vlak ? vindVlak( r, wz.vlak ) : null;
		switch ( wz.actie ) {
			case 'ruimte-erbij': {
				if ( ! RUIMTE_TYPES.includes( wz.type ) ) {
					weiger( wz, 'Onbekend ruimtetype.' );
					break;
				}
				if ( vindRuimte( p, wz.ruimte ) ) {
					weiger( wz, 'Die ruimte bestaat al.' );
					break;
				}
				if ( p.ruimtes.filter( ( x ) => x.type === wz.type ).length >= MAX_RUIMTES_PER_TYPE ) {
					vraag( wz, 'Dat zijn veel ruimtes van hetzelfde type. Zullen we even kijken of een medewerker kan helpen?' );
					break;
				}
				const nr = nieuweRuimte( wz.ruimte, wz.type, wz.naam );
				nr.vlakken.push( nieuwVlak( 'muren', 'muren' ) );
				p.ruimtes.push( nr );
				uit.toegepast.push( wz );
				break;
			}
			case 'ruimte-weg':
				if ( ! r ) {
					weiger( wz, 'Die ruimte bestaat niet.' );
					break;
				}
				p.ruimtes = p.ruimtes.filter( ( x ) => x !== r );
				uit.toegepast.push( wz );
				break;
			case 'vlak-erbij':
				if ( ! r || ! VLAK_SOORTEN.includes( wz.soort ) ) {
					weiger( wz, 'Onbekende ruimte of soort vlak.' );
					break;
				}
				if ( vindVlak( r, wz.vlak ) ) {
					weiger( wz, 'Dat vlak bestaat al.' );
					break;
				}
				r.vlakken.push( nieuwVlak( wz.vlak, wz.soort ) );
				uit.toegepast.push( wz );
				break;
			case 'vlak-weg':
				if ( ! v ) {
					weiger( wz, 'Dat vlak bestaat niet.' );
					break;
				}
				r.vlakken = r.vlakken.filter( ( x ) => x !== v );
				uit.toegepast.push( wz );
				break;
			case 'zet':
				zet( p, r, v, wz, { door, op, vraag, weiger, toegepast: uit.toegepast } );
				break;
			case 'accepteer': {
				const g = pakGegeven( p, r, v, wz.veld );
				if ( ! g ) {
					weiger( wz, 'Daar staat nog niets om te accepteren.' );
					break;
				}
				g.geaccepteerd = true;
				g.door = door;
				g.op = op;
				uit.toegepast.push( wz );
				break;
			}
			case 'kleur':
				kleur( p, r, v, wz, { door, op, vraag, weiger, toegepast: uit.toegepast, kleurIndex: opties.kleurIndex } );
				break;
			case 'sample': {
				p.samples = p.samples || [];
				if ( ! geldigeKleur( wz.kleur, opties.kleurIndex ) || 'roll' !== wz.kleur.type ) {
					weiger( wz, 'Samples zijn er alleen van Roll-kleuren.' );
					break;
				}
				const al = p.samples.some( ( s ) => s.naam === wz.kleur.naam );
				if ( 'weg' === wz.wat ) {
					p.samples = p.samples.filter( ( s ) => s.naam !== wz.kleur.naam );
				} else if ( ! al ) {
					p.samples.push( { naam: wz.kleur.naam, type: wz.type || 'sticker' } );
				}
				uit.toegepast.push( wz );
				break;
			}
			case 'pack': {
				// Een sample pack (WooCommerce-product met SKU SMP-PCK-*): vijf kleuren om naast elkaar te vergelijken.
				p.packs = p.packs || [];
				const id = Number( wz.productId );
				if ( ! Number.isInteger( id ) || id <= 0 ) {
					weiger( wz, 'Onbekend sample pack.' );
					break;
				}
				if ( 'weg' === wz.wat ) {
					p.packs = p.packs.filter( ( x ) => x.productId !== id );
				} else if ( ! p.packs.some( ( x ) => x.productId === id ) ) {
					p.packs.push( { productId: id, naam: String( wz.naam || '' ).slice( 0, 60 ) } );
				}
				uit.toegepast.push( wz );
				break;
			}
			case 'zonder': {
				// Gereedschap dat de klant niet wil: weg uit het pakket en de winkelwagen, met 'terug' zet je het weer aan.
				const naam = String( wz.naam || '' ).trim().slice( 0, 60 );
				if ( naam.length < 4 ) {
					weiger( wz, 'Welk product moet eruit?' );
					break;
				}
				const klein = naam.toLowerCase();
				p.zonder = ( p.zonder || [] ).filter( ( x ) => x.toLowerCase() !== klein );
				if ( 'terug' !== wz.wat ) {
					p.zonder.push( naam );
				}
				uit.toegepast.push( wz );
				break;
			}
			default:
				weiger( wz, 'Onbekende actie.' );
		}
	}

	if ( uit.toegepast.length ) {
		p.versie = project.versie + 1;
		p.log.push( { versie: p.versie, aanvraagId: aanvraag.aanvraagId, door, op, wijzigingen: uit.toegepast, voor } );
		// Oude stappen: wijzigingen blijven in het log, de kopie om terug te gaan alleen voor de laatste stappen.
		const metVoor = p.log.filter( ( l ) => l.voor );
		metVoor.slice( 0, Math.max( 0, metVoor.length - BEWAAR_STAPPEN ) ).forEach( ( l ) => delete l.voor );
	} else {
		// Niets toegepast: wel het aanvraag-ID onthouden, zodat opnieuw proberen niets dubbel doet.
		p.log.push( { versie: p.versie, aanvraagId: aanvraag.aanvraagId, door, op, wijzigingen: [] } );
	}
	p.openVragen = [ ...( p.openVragen || [] ), ...uit.openVragen.map( ( q ) => ( { vraag: q.vraag, voorstel: q.voorstel, versie: p.versie } ) ) ];
	return { ...uit, project: p };
}

/** Getallen die als tekst binnenkomen ("5", "2,6") worden getallen. */
const GETAL_VELDEN = [ 'maat.lengte', 'maat.breedte', 'hoogte', 'extra', 'aantal', 'breedte', 'm2' ];

/**
 * Maakt een voorstel robuust: een ontbrekende ruimte-ID wordt het type (met een cijfer bij een tweede),
 * een ontbrekende vlak-ID de soort, en getallen als tekst worden getallen.
 */
export function normaliseer( p, ruw ) {
	const wz = { ...ruw };
	if ( 'ruimte-erbij' === wz.actie && ! wz.ruimte && wz.type ) {
		let id = wz.type, i = 1;
		while ( p.ruimtes.some( ( r ) => r.id === id ) ) {
			i++;
			id = wz.type + i;
		}
		wz.ruimte = id;
	}
	// Eén ruimte en geen ruimte genoemd: dan bedoelt de klant die ruimte.
	if ( ! wz.ruimte && 1 === p.ruimtes.length && ( wz.vlak || [ 'vlak-erbij', 'kleur' ].includes( wz.actie ) || ( 'zet' === wz.actie && ! [ 'doel', 'spullen', 'wanneer', 'volgorde', 'land', 'spuiten' ].includes( wz.veld ) ) ) ) {
		wz.ruimte = p.ruimtes[ 0 ].id;
	}
	if ( 'vlak-erbij' === wz.actie && ! wz.vlak && wz.soort ) {
		wz.vlak = wz.soort;
	}
	if ( GETAL_VELDEN.includes( wz.veld ) && 'string' === typeof wz.waarde && /^\s*\d+([.,]\d+)?\s*$/.test( wz.waarde ) ) {
		wz.waarde = parseFloat( wz.waarde.replace( ',', '.' ) );
	}
	if ( 'aantal' === wz.veld && 'number' === typeof wz.waarde ) {
		wz.waarde = Math.round( wz.waarde );
	}
	// Maten in centimeters ("270 bij 280", "hoogte 260") worden meters.
	const MAX = { 'maat.lengte': GRENZEN.lengte[ 1 ], 'maat.breedte': GRENZEN.breedte[ 1 ], hoogte: wz.vlak ? GRENZEN.accentHoogte[ 1 ] : GRENZEN.hoogte[ 1 ], breedte: GRENZEN.accentBreedte[ 1 ] };
	if ( MAX[ wz.veld ] ) {
		wz.waarde = inMeters( wz.waarde, MAX[ wz.veld ] );
	}
	if ( 'glas' === wz.veld && Array.isArray( wz.waarde ) ) {
		wz.waarde = wz.waarde.map( ( x ) => ( { ...x, breedte: inMeters( x.breedte, GRENZEN.glasBreedte[ 1 ] ), hoogte: inMeters( x.hoogte, GRENZEN.glasHoogte[ 1 ] ) } ) );
	}
	return wz;
}

/** Het gegeven achter een veldpad, om te accepteren. */
function pakGegeven( p, r, v, veld ) {
	const [ a, b ] = String( veld || '' ).split( '.' );
	if ( v ) {
		if ( 'ondergrond' === a ) {
			return v.ondergrond[ b ] || null;
		}
		if ( 'kleur' === a ) {
			return v.kleur.gekozen || null;
		}
		return v[ a ] || null;
	}
	if ( r ) {
		return 'maat' === a ? r.maat[ b ] || null : r[ a ] || null;
	}
	return p[ a ] || null;
}

function zet( p, r, v, wz, ctx ) {
	const { door, op, vraag, weiger, toegepast } = ctx;
	const bron = bronVan( wz.zekerheid );
	// Een aanname zet een gelijke waarde die de klant al zei of accepteerde niet terug naar "nog te controleren".
	const g = ( waarde, oud ) => ( oud && 'aangenomen' === bron && oud.waarde === waarde && ( oud.geaccepteerd || 'gezegd' === oud.bron ) ? oud : gegeven( waarde, bron, door, { op } ) );
	const [ a, b ] = String( wz.veld || '' ).split( '.' );
	const waarde = wz.waarde;

	// Projectniveau.
	if ( ! wz.ruimte ) {
		if ( 'doel' === a && 'string' === typeof waarde && waarde.length <= 120 ) {
			p.doel = g( waarde.trim() );
		} else if ( 'spullen' === a && SPULLEN.includes( waarde ) ) {
			p.spullen = g( waarde );
		} else if ( 'wanneer' === a && [ 'week', 'weken', 'later', 'onbekend' ].includes( waarde ) ) {
			p.wanneer = g( waarde );
		} else if ( 'volgorde' === a && VOLGORDE.includes( waarde ) ) {
			p.volgorde = g( waarde );
		} else if ( 'land' === a && [ 'NL', 'BE' ].includes( waarde ) ) {
			p.land = g( waarde );
		} else if ( 'spuiten' === a && 'boolean' === typeof waarde ) {
			p.spuiten = g( waarde, p.spuiten );
		} else {
			return weiger( wz, 'Onbekend veld of ongeldige waarde.' );
		}
		return toegepast.push( wz );
	}
	if ( ! r ) {
		return weiger( wz, 'Die ruimte bestaat niet.' );
	}

	// Ruimteniveau.
	if ( ! wz.vlak ) {
		if ( 'maat' === a && 'wis' === b ) {
			// De klant past zijn maat aan naar een schatting: de oude lengte en breedte gaan weg, anders tellen die nog.
			r.maat.lengte = null;
			r.maat.breedte = null;
		} else if ( 'maat' === a && ( 'lengte' === b || 'breedte' === b ) ) {
			if ( ! binnen( waarde, GRENZEN[ b ] ) ) {
				return vraag( wz, 'Klopt die maat? We rekenen met lengtes tussen 1 en 20 meter.' );
			}
			const ander = 'lengte' === b ? w( r.maat.breedte ) : w( r.maat.lengte );
			const grens = PLAUSIBEL[ r.type ] || PLAUSIBEL.standaard;
			if ( ander && waarde * ander > grens ) {
				return vraag( wz, `Is je ${ r.naam.toLowerCase() } echt ${ waarde } bij ${ ander } meter?`, { veld: wz.veld, waarde } );
			}
			r.maat[ b ] = g( waarde, r.maat[ b ] );
		} else if ( 'maat' === a && 'grootte' === b && [ 'klein', 'middel', 'groot' ].includes( waarde ) ) {
			r.maat.grootte = g( waarde, r.maat.grootte );
		} else if ( 'hoogte' === a && binnen( waarde, GRENZEN.hoogte ) ) {
			r.hoogte = g( waarde, r.hoogte );
		} else if ( 'extra' === a && binnen( waarde, GRENZEN.extra ) ) {
			r.extra = g( waarde );
		} else if ( 'glas' === a && Array.isArray( waarde ) && waarde.every( ( x ) => binnen( x.breedte, GRENZEN.glasBreedte ) && binnen( x.hoogte, GRENZEN.glasHoogte ) ) ) {
			// Alleen met een bruikbare maat; "er is een schuifpui" zonder maat trekt niets af.
			r.glas = waarde.map( ( x ) => ( { breedte: g( x.breedte ), hoogte: g( x.hoogte ) } ) );
		} else if ( 'buiten' === a && 'boolean' === typeof waarde ) {
			r.buiten = waarde;
		} else if ( 'naam' === a && 'string' === typeof waarde && waarde.trim().length && waarde.length <= 40 ) {
			r.naam = waarde.trim();
		} else {
			return weiger( wz, 'Onbekend veld of ongeldige waarde voor deze ruimte.' );
		}
		return toegepast.push( wz );
	}
	if ( ! v ) {
		return weiger( wz, 'Dat vlak bestaat niet.' );
	}

	// Vlakniveau.
	const lak = isLak( v.soort );
	if ( 'ondergrond' === a ) {
		const velden = lak ? ONDERGROND.lak : ONDERGROND.verf;
		if ( ! velden[ b ] || ! velden[ b ].includes( waarde ) ) {
			return weiger( wz, 'Die ondergrond past niet bij dit vlak.' );
		}
		v.ondergrond[ b ] = g( waarde, v.ondergrond[ b ] );
		// Behang gaat er altijd af: daarna is de muur kaal; de conditie vragen we opnieuw.
		if ( 'afwerking' === b && 'behang' === waarde ) {
			v.ondergrond.kleurNu = null;
		}
	} else if ( 'm2' === a ) {
		if ( 'meubel' !== v.soort || ! binnen( waarde, GRENZEN.meubelM2 ) ) {
			return weiger( wz, 'Een eigen oppervlak hoort bij een meubel, tussen 0,3 en 20 m².' );
		}
		v.m2 = g( waarde );
	} else if ( 'renovlies' === a ) {
		// Renovlies erbij: op muren met scheuren, of op nieuw stucwerk zodat er later geen scheurtjes komen.
		if ( ! [ 'muren', 'accent' ].includes( v.soort ) || 'boolean' !== typeof waarde ) {
			return weiger( wz, 'Renovlies hoort bij de muren.' );
		}
		v.renovlies = g( waarde );
	} else if ( 'lagen' === a ) {
		// De klant kiest zelf 1 of 2 lagen; "standaard" laat ons weer rekenen. Alleen muren en plafond: lak heeft eigen regels.
		if ( lak || 'meubel' === v.soort ) {
			return weiger( wz, 'Het aantal lagen kies je alleen voor muren en plafond.' );
		}
		const n = Number( waarde );
		if ( 1 === n || 2 === n ) {
			v.lagen = g( n );
		} else if ( 'standaard' === waarde ) {
			v.lagen = null;
		} else {
			return weiger( wz, 'Kies 1 of 2 lagen.' );
		}
	} else if ( 'glans' === a ) {
		if ( ! lak || ! GLANS.includes( waarde ) ) {
			return weiger( wz, 'Glans hoort alleen bij lakwerk.' );
		}
		if ( r.buiten && 'mat' === waarde ) {
			return vraag( wz, 'Matte lak is alleen voor binnen. Buiten wordt het zijdeglans of hoogglans.' );
		}
		v.glans = g( waarde );
	} else if ( 'aantal' === a ) {
		if ( ! LAK_SOORTEN.includes( v.soort ) || ! Number.isInteger( waarde ) || ! binnen( waarde, GRENZEN.aantal ) ) {
			return weiger( wz, 'Een aantal hoort bij deuren, kozijnen en ander lakwerk.' );
		}
		v.aantal = g( waarde );
	} else if ( 'breedte' === a || 'hoogte' === a ) {
		if ( 'accent' !== v.soort || ! binnen( waarde, 'breedte' === a ? GRENZEN.accentBreedte : GRENZEN.accentHoogte ) ) {
			return weiger( wz, 'Breedte en hoogte horen bij een accentmuur.' );
		}
		v[ a ] = g( waarde );
	} else {
		return weiger( wz, 'Onbekend veld voor dit vlak.' );
	}
	return toegepast.push( wz );
}

function kleur( p, r, v, wz, ctx ) {
	const { door, op, vraag, weiger, toegepast, kleurIndex } = ctx;
	if ( ! v ) {
		return weiger( wz, 'Dat vlak bestaat niet.' );
	}
	const k = v.kleur;
	const wat = wz.wat;
	if ( 'open' === wat ) {
		Object.assign( k, { status: 'open', gekozen: null } );
		return toegepast.push( wz );
	}
	if ( 'richting' === wat ) {
		if ( 'string' !== typeof wz.richting || ! wz.richting.trim() ) {
			return weiger( wz, 'Geen richting opgegeven.' );
		}
		k.richting = wz.richting.trim();
		// Een richting erbij maakt een twijfel tussen kandidaten niet ongedaan.
		if ( 'gekozen' !== k.status && 'twijfelt' !== k.status ) {
			k.status = 'richting';
		}
		return toegepast.push( wz );
	}
	if ( ! geldigeKleur( wz.kleur, kleurIndex ) ) {
		return vraag( wz, 'Die kleur ken ik niet. Bedoel je een kleur van Roll, een RAL-code of een kleur van een ander merk?' );
	}
	const kl = wz.kleur;
	const zonder = ( lijst ) => lijst.filter( ( x ) => ! zelfdeKleur( x, kl ) );
	switch ( wat ) {
		case 'kies': {
			// Kiezen is altijd een bewuste keuze van de klant. Twijfel wordt een kandidaat, en een benaderde
			// merkkleur kiest de klant zelf op de kaart, nooit via een aanname.
			const bewust = 'zeker' === wz.zekerheid && ( 'merk-benaderd' !== kl.type || 'klant-kaart' === door );
			if ( ! bewust ) {
				k.kandidaten = [ ...zonder( k.kandidaten ), kl ];
				if ( 'gekozen' !== k.status ) {
					k.status = 'twijfelt';
				}
				toegepast.push( { ...wz, wat: 'kandidaat' } );
				if ( 'merk-benaderd' === kl.type ) {
					vraag( wz, `Wil je ${ kl.rollKleur } kiezen? Die komt het dichtst bij, maar is niet precies dezelfde kleur.` );
				}
				return;
			}
			Object.assign( k, { status: 'gekozen', gekozen: gegeven( kl, 'gezegd', door, { op } ) } );
			k.kandidaten = zonder( k.kandidaten );
			k.afgewezen = zonder( k.afgewezen );
			return toegepast.push( wz );
		}
		case 'kandidaat':
			k.kandidaten = [ ...zonder( k.kandidaten ), kl ];
			if ( 'gekozen' !== k.status ) {
				k.status = 'twijfelt';
			}
			return toegepast.push( wz );
		case 'favoriet':
			k.favorieten = [ ...zonder( k.favorieten ), kl ];
			return toegepast.push( wz );
		case 'afwijzen':
			k.afgewezen = [ ...zonder( k.afgewezen ), kl ];
			k.kandidaten = zonder( k.kandidaten );
			k.favorieten = zonder( k.favorieten );
			if ( k.gekozen && zelfdeKleur( w( k.gekozen ), kl ) ) {
				Object.assign( k, { status: 'open', gekozen: null } );
			}
			return toegepast.push( wz );
		default:
			return weiger( wz, 'Onbekende kleuractie.' );
	}
}
