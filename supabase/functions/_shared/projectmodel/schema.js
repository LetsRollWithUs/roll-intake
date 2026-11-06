// GEGENEREERD door scripts/sync-projectmodel.mjs uit kleurplan-plugin/projectmodel. NIET HANDMATIG BEWERKEN.
/**
 * Projectmodel v2 van Jouw schilderplan: één model voor de chat en de stappen.
 *
 * Elk belangrijk veld is een "gegeven": een waarde met herkomst. Daarmee weten we per onderdeel of het
 * een eerste inschatting is, nog gecontroleerd moet worden, of klaar is om te bestellen.
 */

/** Waar een waarde vandaan komt. */
export const BRON = [ 'gezegd', 'aangenomen', 'afgeleid' ];

/** Wie een waarde het laatst wijzigde. */
export const DOOR = [ 'klant-chat', 'klant-kaart', 'klant-stappen', 'medewerker', 'roll', 'migratie' ];

export const RUIMTE_TYPES = [ 'woonkamer', 'slaapkamer', 'keuken', 'eetkamer', 'badkamer', 'toilet', 'hal', 'werkkamer', 'kinderkamer', 'anders' ];

/** Hoe een ruimte heet als de klant geen eigen naam geeft. */
export const RUIMTE_NAMEN = { woonkamer: 'Woonkamer', slaapkamer: 'Slaapkamer', keuken: 'Keuken', eetkamer: 'Eetkamer', badkamer: 'Badkamer', toilet: 'Toilet', hal: 'Hal en overloop', werkkamer: 'Werkkamer', kinderkamer: 'Kinderkamer', anders: 'Andere ruimte' };

export const VERF_SOORTEN = [ 'muren', 'accent', 'plafond' ];
export const LAK_SOORTEN = [ 'deuren', 'kozijnen', 'plinten', 'lambrisering', 'kasten', 'radiatoren', 'trap', 'meubel' ];
export const VLAK_SOORTEN = [ ...VERF_SOORTEN, ...LAK_SOORTEN ];

/** Ondergrond in vijf velden. De klant krijgt alleen de vragen die voor zijn vlak iets veranderen. */
export const ONDERGROND = {
	verf: {
		materiaal: [ 'stucwerk', 'gipsplaat', 'beton', 'onbekend' ],
		afwerking: [ 'geen', 'muurverf', 'renovlies', 'behang', 'onbekend' ],
		kleurNu: [ 'licht', 'midden', 'donker', 'onbekend' ],
		structuur: [ 'glad', 'structuur', 'onbekend' ],
		conditie: [ 'goed', 'scheurtjes', 'scheuren', 'bladdert', 'vocht', 'onbekend' ],
	},
	lak: {
		materiaal: [ 'hout', 'metaal', 'onbekend' ],
		afwerking: [ 'geen', 'lak', 'onbekend' ],
		kleurNu: [ 'licht', 'donker', 'onbekend' ],
		conditie: [ 'goed', 'bladdert', 'onbekend' ],
	},
};

export const GLANS = [ 'mat', 'zijdeglans', 'hoogglans' ];

/** Kleurstatus per vlak. Alleen "gekozen" komt als verf in het pakket. */
export const KLEUR_STATUS = [ 'open', 'richting', 'twijfelt', 'gekozen' ];

/** Soort kleur. Een kleurmatch-treffer is exact: Roll mengt de referentiekleur zelf. */
export const KLEUR_TYPE = [ 'roll', 'ral', 'merk-exact', 'merk-benaderd' ];

export const SPULLEN = [ 'niets', 'deel', 'alles', 'schilder', 'onbekend' ];

/** Zolang er kleuren open zijn: eerst alleen samples, of de verf voor de gekozen kleuren alvast erbij. */
export const VOLGORDE = [ 'samples-eerst', 'verf-erbij' ];

/** Grenzen voor getallen (zelfde als de stappen en de rekenkern). */
export const GRENZEN = {
	lengte: [ 1, 20 ],
	breedte: [ 1, 20 ],
	hoogte: [ 2, 5 ],
	extra: [ 0, 200 ],
	aantal: [ 0, 20 ],
	accentBreedte: [ 0.5, 20 ],
	// Een meubel in m² te schilderen oppervlak: een stoel ± 1, een commode ± 3, een kledingkast ± 6.
	meubelM2: [ 0.3, 20 ],
	accentHoogte: [ 0.5, 6 ],
	glasBreedte: [ 0.5, 12 ],
	glasHoogte: [ 0.5, 4 ],
};

/** Standaardwaarden die Roll mag aannemen voor een indicatie (bron "aangenomen", nooit geaccepteerd vooraf). */
export const STANDAARD = {
	hoogte: 2.6,
	grootte: 'middel',
	structuur: 'glad',
	conditie: 'goed',
	glansBinnen: 'mat',
	glansBuiten: 'zijdeglans',
};

/** Vloer in m² per grootte en ruimtetype (zelfde tabel als de rekenkern). */
export const VLOER = {
	standaard: { klein: 10, middel: 18, groot: 30 },
	toilet: { klein: 1.5, middel: 2.5, groot: 4 },
	badkamer: { klein: 4, middel: 6, groot: 9 },
	hal: { klein: 5, middel: 8, groot: 12 },
};

/** Een gegeven met herkomst. */
export function gegeven( waarde, bron = 'gezegd', door = 'klant-chat', { geaccepteerd = null, op = null } = {} ) {
	return {
		waarde,
		bron,
		door,
		op: op || new Date().toISOString(),
		// Gezegd telt meteen; een aanname pas als de klant hem gezien en goedgevonden heeft. "Weet ik niet" is
		// gezegd, maar dan rekenen we voorzichtig: dat moet de klant eerst zien.
		geaccepteerd: null !== geaccepteerd ? geaccepteerd : 'gezegd' === bron && 'onbekend' !== waarde,
	};
}

/** Een leeg project. */
export function nieuwProject( id ) {
	return {
		id,
		versie: 0,
		doel: null,
		ruimtes: [],
		spullen: null,
		wanneer: null,
		volgorde: null,
		land: gegeven( 'NL', 'aangenomen', 'roll' ),
		openVragen: [],
		log: [],
	};
}

/** Een nieuwe ruimte met aannames voor een indicatie. */
export function nieuweRuimte( id, type, naam ) {
	return {
		id,
		type,
		naam: naam || RUIMTE_NAMEN[ type ] || type,
		maat: { grootte: gegeven( STANDAARD.grootte, 'aangenomen', 'roll' ), lengte: null, breedte: null },
		hoogte: gegeven( STANDAARD.hoogte, 'aangenomen', 'roll' ),
		extra: null,
		glas: [],
		buiten: false,
		vlakken: [],
	};
}

/** Een nieuw vlak; de ondergrond start als onbekend. */
export function nieuwVlak( id, soort ) {
	const lak = LAK_SOORTEN.includes( soort );
	const ond = {};
	for ( const veld of Object.keys( lak ? ONDERGROND.lak : ONDERGROND.verf ) ) {
		ond[ veld ] = null;
	}
	return {
		id,
		soort,
		ondergrond: ond,
		kleur: { status: 'open', gekozen: null, kandidaten: [], favorieten: [], samples: [], afgewezen: [] },
		glans: lak ? gegeven( STANDAARD.glansBinnen, 'aangenomen', 'roll' ) : null,
		aantal: null,
		breedte: null,
		hoogte: null,
	};
}

export function isLak( soort ) {
	return LAK_SOORTEN.includes( soort );
}

/** De waarde van een gegeven, of de terugval. */
export function w( g, terugval = null ) {
	return g && undefined !== g.waarde && null !== g.waarde ? g.waarde : terugval;
}

/**
 * Wat we voor het plafond aannemen als de klant alleen vertelt hoe de muren eruitzien. Een plafond is bijna altijd
 * wit geschilderd en glad, ook als de muren behang, structuur, scheuren of een donkere kleur hebben. Alleen bij kaal
 * stucwerk (nieuwbouw) is het plafond vaak ook kaal: dan krijgt het voorstrijk, maar geen structuur.
 */
export function plafondBijMuren( afwerkingMuren, materiaalMuren ) {
	if ( 'geen' === afwerkingMuren ) {
		return { afwerking: 'geen', materiaal: materiaalMuren && 'onbekend' !== materiaalMuren ? materiaalMuren : 'stucwerk', structuur: 'glad', conditie: 'goed' };
	}
	return { afwerking: 'muurverf', kleurNu: 'licht', structuur: 'glad', conditie: 'goed' };
}
