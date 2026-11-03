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

  // ── Einde ──
  'einde.start': 'We hebben fijn gespeeld.',
  'einde.mandje': 'We hebben samen fruit in het mandje gelegd.',
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
