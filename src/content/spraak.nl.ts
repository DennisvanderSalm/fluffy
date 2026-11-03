/**
 * ALLE gesproken zinnen van de app, met een vaste id.
 *
 * Eigen opnames: zet een bestand `public/audio/nl/<id>.m4a` neer (bijvoorbeeld
 * `begroeting.terug.m4a`) en zet de id in `public/audio/nl/manifest.json` onder "clips".
 * Dan speelt de app de opname af in plaats van de computerstem. Ontbreekt een opname,
 * dan valt de app per zinnetje terug op de computerstem.
 *
 * Zinnen worden opgebouwd uit segmenten, zodat getallen en namen los opgenomen kunnen
 * worden: ['mandje.vraag.a', 4, 'obj.appels', 'mandje.vraag.b']
 * = "Kun je" + "vier" + "appels" + "in het mandje leggen?"
 *
 * Toon: rustig, warm, niet overdreven enthousiast. Proces-lof, nooit "slim".
 */
export const SPRAAK = {
  // Getallen (getal.1 … getal.20) worden hieronder automatisch toegevoegd.

  // Naam van het kind: tekst komt uit de instellingen; opname als 'naam.m4a'.
  naam: '',

  // ── Begroeting ──
  'begroeting.eerste.a': 'Hoi',
  'begroeting.eerste.b': 'Ik ben Fluffy. Ik ben een wolkje, en ik tel heel graag. Wij gaan samen spelen.',
  'begroeting.uitleg.fluffy': 'Als je mij aantikt, zeg ik het nog een keer.',
  'begroeting.terug.a': 'Hoi',
  'begroeting.terug.b': 'Daar ben je. Kom, we gaan samen spelen.',

  // ── Mandje vullen (Geef-me-N) ──
  'mandje.vraag.a': 'Kun je',
  'mandje.vraag.b': 'in het mandje leggen?',
  'mandje.cijfer.a': 'Kijk naar het cijfer. Kun je er zoveel',
  'mandje.cijfer.b': 'in het mandje leggen?',
  'mandje.duim': 'Ben je klaar? Tik dan op het duimpje.',
  'mandje.uitleg.slepen': 'Je kunt ze naar het mandje schuiven, of er gewoon op tikken.',
  'mandje.leeg': 'Het mandje is nog leeg.',
  'mandje.kijken': 'Eens kijken.',
  'mandje.zijnhet': 'Het zijn er',
  'mandje.precies': 'Precies goed.',

  // Objecten (enkelvoud en meervoud)
  'obj.appel': 'appel',
  'obj.appels': 'appels',
  'obj.peer': 'peer',
  'obj.peren': 'peren',
  'obj.citroen': 'citroen',
  'obj.citroenen': 'citroenen',
  'obj.eendjes': 'eendjes',
  'obj.lieveheersbeestjes': 'lieveheersbeestjes',
  'obj.visjes': 'visjes',

  // ── Samen tellen ──
  'tellen.vraag.a': 'Zullen we de',
  'tellen.vraag.b': 'tellen?',
  'tellen.uitleg.mee': 'Tik ze één voor één aan. Ik tel mee.',
  'tellen.uitleg.zelf': 'Tik ze één voor één aan, en tel maar zelf.',
  'tellen.algeteld': 'Die hebben we al geteld.',
  'tellen.hoeveel': 'Hoeveel zijn het er?',
  'tellen.hoeveel.tik': 'Tik op het goede getal.',
  'tellen.zijnhet': 'Ja, het zijn er',
  'tellen.hint': 'Hmm. Laten we nog een keer samen tellen.',
  'tellen.dushet': 'Dus het zijn er',
  'tellen.tik.a': 'Kun jij de',
  'tellen.tik.b': 'aantikken?',
  'tellen.kijkdeze': 'Kijk, deze is het.',

  // ── Fluffy telt fout ──
  'foutje.intro': 'Ik ga tellen. Let jij goed op of ik het goed doe?',
  'foutje.dus': 'Dus het zijn er',
  'foutje.vraag': 'Heb ik het goed geteld?',
  'foutje.uitleg': 'Klopt het? Tik dan op duim omhoog. Klopt het niet? Tik dan op duim omlaag.',
  'foutje.hint': 'Hmm. Kijk nog eens goed. Ik tel het nog een keer, langzaam.',
  'foutje.goed.ja': 'Ja, ik heb ze allemaal precies één keer geteld.',
  'foutje.goed.volgorde': 'Ja! Ik begon aan de andere kant. Dat mag, want ik heb ze allemaal één keer geteld.',
  'foutje.oeps.overslaan': 'Oei, je hebt gelijk! Ik heb er eentje overgeslagen.',
  'foutje.oeps.dubbel': 'Oei, je hebt gelijk! Ik heb er eentje twee keer geteld.',
  'foutje.oeps.getal': 'Oei, je hebt gelijk! Ik heb een getal overgeslagen.',
  'foutje.oeps.eind': 'Oei, je hebt gelijk! Ik zei aan het eind het verkeerde getal.',
  'foutje.kijk.overslaan': 'Kijk. Deze heb ik niet aangewezen. Ik heb er eentje overgeslagen.',
  'foutje.kijk.dubbel': 'Kijk. Deze heb ik twee keer aangewezen.',
  'foutje.kijk.getal.a': 'Na',
  'foutje.kijk.getal.b': 'komt',
  'foutje.kijk.getal.c': 'En dat heb ik niet gezegd.',
  'foutje.kijk.eind.a': 'Het laatste getal dat ik zei was',
  'foutje.kijk.eind.b': 'Maar ik zei dat het er',
  'foutje.kijk.eind.c': 'waren. Dat klopt niet.',
  'foutje.kijk.klopt': 'Ik heb ze allemaal één keer aangewezen, en de getallen goed gezegd. Dus het klopte.',
  'foutje.kijk.volgorde': 'Ik begon aan de andere kant. Dat mag! Ik heb ze allemaal één keer geteld, dus het klopte.',
  'foutje.samen': 'Wil jij ze aantikken? Dan tellen we samen goed.',

  // ── Kiekeboe-stippen ──
  'kiekeboe.uitleg': 'Ik laat heel even iets zien. Daarna gaat het dekentje erover.',
  'kiekeboe.kijk': 'Kiekeboe! Kijk goed.',
  'kiekeboe.vraag': 'Hoeveel waren het er?',
  'kiekeboe.nogeens': 'Zullen we nog een keer kijken? Kijk goed.',
  'kiekeboe.rij': 'Een volle rij, dat is vijf.',
  'kiekeboe.hand': 'Een hele hand, dat is vijf.',
  'kiekeboe.dobbelvijf': 'Op deze dobbelsteen zijn het er vijf.',
  'kiekeboe.dobbel': 'Zo ziet het er altijd uit op een dobbelsteen.',
  'kiekeboe.vijfen': 'Vijf en',
  'kiekeboe.isdat': ', dat is',

  // ── Koekjes vergelijken ──
  'meer.vraag.meer': 'Op welk bordje liggen er meer koekjes?',
  'meer.vraag.minder': 'Op welk bordje liggen er minder koekjes?',
  'meer.uitleg': 'Tik op het bordje.',
  'meer.evenveel': 'Kun je op het onderste bordje evenveel koekjes leggen als op het bovenste?',
  'meer.evenveel.uitleg': 'Tik op de pot voor een koekje. Tik op een koekje om het terug te leggen. Ben je klaar? Tik dan op het duimpje.',
  'meer.maatjes': 'Laten we maatjes maken. Elk koekje krijgt een maatje.',
  'meer.geenmaatje': 'Kijk, deze hebben geen maatje.',
  'meer.allemaatje': 'Kijk, ze hebben allemaal een maatje.',
  'meer.goed.meer': 'Ja, daar liggen er meer.',
  'meer.goed.minder': 'Ja, daar liggen er minder.',
  'meer.ismeerdan': 'is meer dan',
  'meer.isminderdan': 'is minder dan',
  'meer.nu': 'Nu liggen er',
  'meer.en': 'en',
  'meer.evenveelklaar': 'Dat is evenveel.',
  'meer.tikjij': 'Tik jij maar op dat bordje.',
  'hier.zijn': 'Hier zijn er',

  // ── Cijfers zoeken ──
  'cijfer.zoek': 'Zoek het kaartje met',
  'cijfer.bijcijfer': 'Zoek het kaartje dat bij dit cijfer hoort.',
  'cijfer.welkgetal': 'Welk getal hoort bij dit plaatje?',
  'cijfer.zoeken': 'We zoeken',
  'cijfer.netals': 'Net als het cijfer',
  'cijfer.tikjij': 'Tik jij er maar op.',

  // ── Keuzemoment ──
  'keuze.vraag': 'Wat wil je doen?',
  'keuze.of': 'Of',
  'keuze.tik': 'Tik maar op wat je wilt.',
  'keuze.mandje': 'Fruit in het mandje leggen.',
  'keuze.tellen': 'Beestjes tellen.',
  'keuze.foutje': 'Kijken of ik goed tel.',
  'keuze.kiekeboe': 'Kiekeboe spelen met stippen.',
  'keuze.meer': 'Koekjes vergelijken.',
  'keuze.cijfer': 'Cijfers zoeken.',
  'keuze.goed': 'Goed, dat gaan we doen.',

  // ── Feedbackladder ──
  // Stap 1: hint (samen natellen)
  'hint.samen': 'Hmm. Laten we samen tellen wat er in het mandje ligt.',
  'hint.zijn': 'Dat zijn er',
  'hint.wilden': 'We wilden er',
  'hint.cijferis': 'Dit cijfer is',
  'hint.teveel': 'Dat zijn er een paar te veel. Kun je er een paar terugleggen?',
  'hint.teweinig': 'Er mogen er nog wat bij. Kun je er nog wat bij leggen?',
  // Stap 2: voordoen, hardop denkend, en dan samen
  'voordoen.start': 'Ik doe het even voor. Kijk maar.',
  'voordoen.denk': 'Ik leg ze er één voor één in, en ik tel mee.',
  'voordoen.laatste.a': 'Het laatste getal dat ik zei was',
  'voordoen.laatste.b': 'Dus er liggen er',
  'voordoen.laatste.c': 'in het mandje.',
  'voordoen.samen': 'Nu doen we het samen. Jij legt ze erin, en ik tel mee.',
  'voordoen.kijk': 'Kijk, zo zijn het er',
  // Stap 3: later terug
  'later.nog': 'Die doen we straks nog een keer.',

  // ── Proces-lof (kort, over wat ze deed) ──
  'lof.precies': 'Je telde heel precies.',
  'lof.eenvooreen': 'Je legde ze er één voor één in. Goed gedaan.',
  'lof.stoppen': 'Je stopte precies bij het goede getal.',
  'lof.cijfer': 'Je keek goed naar het cijfer.',
  'lof.doorzetten': 'Je bleef goed tellen, ook toen het lastig was.',
  'lof.samen': 'Samen is het gelukt. Je telde goed mee.',
  'lof.eenkeer': 'Je tikte ze allemaal precies één keer aan.',
  'lof.laatste': 'Je wist het: het laatste getal zegt hoeveel het er zijn.',
  'lof.opletten': 'Je lette heel goed op.',
  'lof.helpen': 'Je keek goed of ik elk beestje één keer telde. Dank je wel.',
  'lof.zien': 'Je keek goed naar hoe ze lagen.',
  'lof.vijf': 'Je zag de volle vijf, en wat erbij kwam.',
  'lof.vergelijk': 'Je keek heel goed naar allebei de bordjes.',
  'lof.maatjes': 'Je zorgde dat elk koekje een maatje had.',

  // ── Einde ──
  'einde.start': 'We hebben fijn gespeeld.',
  'einde.mandje': 'We hebben samen fruit in het mandje gelegd.',
  'einde.tellen': 'We hebben samen beestjes geteld.',
  'einde.foutje': 'En jij hebt mij geholpen met tellen.',
  'einde.kiekeboe': 'We hebben kiekeboe gespeeld met stippen.',
  'einde.meer': 'We hebben koekjes vergeleken.',
  'einde.cijfer': 'We hebben cijfers gezocht.',
  'einde.lof.precies': 'Je hebt heel precies geteld.',
  'einde.lof.doorzetten': 'Je bleef goed proberen, ook als het lastig was.',
  'einde.slapen': 'Ik word een beetje moe. Ik ga lekker slapen.',
  'einde.dag': 'Dag',
  'slaap.tik': 'Sst. Fluffy slaapt. Een andere keer spelen we weer.',

  // ── Ouderdeel ──
  'ouder.test': 'Hoi! Zo klink ik.',
} as const;

const GETALLEN = [
  '', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen', 'tien',
  'elf', 'twaalf', 'dertien', 'veertien', 'vijftien', 'zestien', 'zeventien', 'achttien', 'negentien', 'twintig',
];

export type LineId = keyof typeof SPRAAK | `getal.${number}`;

/** Tekst van een zinnetje voor de computerstem. */
export function lineText(id: LineId, childName: string): string {
  if (id === 'naam') return childName;
  if (id.startsWith('getal.')) return GETALLEN[Number(id.slice(6))] ?? id.slice(6);
  return SPRAAK[id as keyof typeof SPRAAK] ?? '';
}

export function numberWord(n: number): string {
  return GETALLEN[n] ?? String(n);
}
