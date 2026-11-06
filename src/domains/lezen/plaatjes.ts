import type { LineId } from '../../content/spraak.nl';

/**
 * Plaatjes van eenvoudige, bekende woorden. Ze is vier en leest nog niet: alles wat ze moet
 * horen, zegt Fluffy, en elk woord heeft een plaatje dat ze herkent.
 * Rijmparen en beginklanken komen uit dezelfde woordenlijst.
 */

export type Word =
  | 'huis' | 'muis' | 'beer' | 'veer' | 'hoed' | 'voet' | 'roos' | 'doos' | 'zon' | 'ton' | 'kip' | 'schip'
  | 'taart' | 'paard' | 'pet' | 'bed' | 'pop' | 'kop' | 'jas' | 'tas' | 'maan' | 'kraan' | 'vis';

/** Woorden die op elkaar rijmen. */
export const RHYMES: [Word, Word][] = [
  ['huis', 'muis'], ['beer', 'veer'], ['hoed', 'voet'], ['roos', 'doos'], ['zon', 'ton'], ['kip', 'schip'],
  ['taart', 'paard'], ['pet', 'bed'], ['pop', 'kop'], ['jas', 'tas'], ['maan', 'kraan'],
];

/** De eerste klank. Kraan en schip beginnen met twee klanken; die tellen niet als "hetzelfde begin". */
export const ONSET: Record<Word, string> = {
  huis: 'h', muis: 'm', beer: 'b', veer: 'v', hoed: 'h', voet: 'v', roos: 'r', doos: 'd', zon: 'z', ton: 't',
  kip: 'k', schip: 'sch', taart: 't', paard: 'p', pet: 'p', bed: 'b', pop: 'p', kop: 'k', jas: 'j', tas: 't',
  maan: 'm', kraan: 'kr', vis: 'v',
};

export const WORDS = Object.keys(ONSET) as Word[];

export const rhymes = (a: Word, b: Word) => a !== b && RHYMES.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
export const sameOnset = (a: Word, b: Word) => a !== b && ONSET[a] === ONSET[b];
export const wordLine = (w: Word) => `w.${w}` as LineId;

/** Woorden met een beginklank die ook nog bij een ander woord hoort. */
export const ONSET_WORDS = WORDS.filter((w) => WORDS.some((v) => sameOnset(w, v)));

/**
 * Woorden waarvan je de eerste klank kunt aanhouden (m, v, h, z, r). Die zegt Fluffy eerst los en
 * dan in het woord ("mmm… maan"), zoals een juf het voordoet. Zo hoort ze de klank zelf
 * (Byrne & Fielding-Barnsley, 1991). Bij b, p, k en t kan dat niet: daar zegt ze het gewone woord.
 */
export const STRETCHED: Partial<Record<Word, string>> = {
  maan: 'Mmmm… maan', muis: 'Mmmm… muis', vis: 'Vvvv… vis', voet: 'Vvvv… voet', veer: 'Vvvv… veer',
  huis: 'Hhhh… huis', hoed: 'Hhhh… hoed', zon: 'Zzzz… zon', roos: 'Rrrr… roos',
};

/** Uitgerekt als dat kan, anders gewoon het woord. */
export const stretchLine = (w: Word) => (STRETCHED[w] ? (`rekt.${w}` as LineId) : wordLine(w));

/** De letter waarmee een woord begint, als de beginklank één letter is (kraan en schip niet). */
export const letterOf = (w: Word): string | null => (ONSET[w].length === 1 ? ONSET[w] : null);

const S = (inner: string) => `<svg viewBox="0 0 100 100">${inner}</svg>`;
const INK = '#3b4a6b';

export const PICTURE: Record<Word, string> = {
  huis: S(`<path d="M10 46 L50 12 L90 46 Z" fill="#f4a690" stroke="#d98670" stroke-width="5" stroke-linejoin="round"/>
    <rect x="18" y="44" width="64" height="46" rx="4" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5"/>
    <rect x="44" y="62" width="16" height="28" rx="3" fill="#a3cdea" stroke="#73a9cf" stroke-width="3"/>
    <rect x="25" y="53" width="13" height="13" rx="2" fill="#a3cdea" stroke="#73a9cf" stroke-width="3"/>`),
  muis: S(`<path d="M80 66 C96 60 98 80 86 86" stroke="#9e97b3" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="54" cy="66" rx="30" ry="20" fill="#c9c3d6" stroke="#9e97b3" stroke-width="4"/>
    <circle cx="27" cy="40" r="10" fill="#f5c3cf" stroke="#9e97b3" stroke-width="4"/>
    <circle cx="28" cy="58" r="15" fill="#c9c3d6" stroke="#9e97b3" stroke-width="4"/>
    <circle cx="24" cy="55" r="2.8" fill="${INK}"/><circle cx="14" cy="62" r="3.5" fill="#f19a8c"/>`),
  beer: S(`<circle cx="26" cy="28" r="11" fill="#c8996a" stroke="#a2764c" stroke-width="4"/>
    <circle cx="74" cy="28" r="11" fill="#c8996a" stroke="#a2764c" stroke-width="4"/>
    <circle cx="50" cy="55" r="31" fill="#c8996a" stroke="#a2764c" stroke-width="4"/>
    <ellipse cx="50" cy="66" rx="14" ry="11" fill="#ead1b0"/><ellipse cx="50" cy="61" rx="5" ry="4" fill="${INK}"/>
    <circle cx="38" cy="47" r="3.5" fill="${INK}"/><circle cx="62" cy="47" r="3.5" fill="${INK}"/>`),
  veer: S(`<path d="M26 86 C28 52 48 22 80 10 C82 40 62 72 26 86 Z" fill="#a9d4ef" stroke="#73a9cf" stroke-width="4" stroke-linejoin="round"/>
    <path d="M18 94 L74 20" stroke="#73a9cf" stroke-width="4" stroke-linecap="round"/>`),
  hoed: S(`<ellipse cx="50" cy="72" rx="44" ry="11" fill="#8a7bb8" stroke="#6c5e99" stroke-width="4"/>
    <path d="M26 72 V40 C26 26 74 26 74 40 V72 Z" fill="#8a7bb8" stroke="#6c5e99" stroke-width="4" stroke-linejoin="round"/>
    <rect x="27" y="56" width="46" height="9" fill="#f19a8c"/>`),
  voet: S(`<path d="M32 92 C18 92 16 72 22 58 C27 46 26 38 34 33 C46 28 64 32 66 46 C68 60 60 68 60 78 C60 90 48 94 32 92 Z" fill="#f6d2b8" stroke="#d9a98a" stroke-width="4"/>
    <circle cx="33" cy="20" r="7.5" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/><circle cx="47" cy="16" r="6" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/>
    <circle cx="59" cy="19" r="5.5" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/><circle cx="68" cy="25" r="5" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/>
    <circle cx="74" cy="34" r="4.5" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/>`),
  roos: S(`<path d="M50 54 V94" stroke="#7fae6c" stroke-width="5" stroke-linecap="round"/>
    <path d="M50 78 C60 66 76 68 76 68 C68 82 58 82 50 78 Z" fill="#a5cf93" stroke="#7fae6c" stroke-width="3"/>
    <circle cx="50" cy="34" r="23" fill="#f19a8c" stroke="#d27769" stroke-width="4"/>
    <path d="M50 35 C57 30 60 41 51 43 C41 45 39 30 50 26 C62 22 70 36 63 47" stroke="#d27769" stroke-width="3.5" fill="none" stroke-linecap="round"/>`),
  doos: S(`<path d="M16 40 L28 24 H72 L84 40 Z" fill="#f0cf9f" stroke="#c18e55" stroke-width="4" stroke-linejoin="round"/>
    <rect x="16" y="40" width="68" height="48" rx="3" fill="#e6b980" stroke="#c18e55" stroke-width="4"/>
    <path d="M50 40 V88" stroke="#c18e55" stroke-width="4"/>`),
  zon: S(`${Array.from({ length: 8 }, (_, i) => {
    const a = (i * Math.PI) / 4;
    const [c, s] = [Math.cos(a), Math.sin(a)];
    return `<path d="M${50 + 30 * c} ${50 + 30 * s} L${50 + 44 * c} ${50 + 44 * s}" stroke="#ddbb52" stroke-width="6" stroke-linecap="round"/>`;
  }).join('')}
    <circle cx="50" cy="50" r="23" fill="#f8de7e" stroke="#ddbb52" stroke-width="4"/>`),
  ton: S(`<path d="M28 12 C18 38 18 62 28 88 H72 C82 62 82 38 72 12 Z" fill="#c8996a" stroke="#a2764c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M43 12 C39 38 39 62 43 88 M57 12 C61 38 61 62 57 88" stroke="#a2764c" stroke-width="2.5" fill="none"/>
    <path d="M22 30 H78 M21 70 H79" stroke="#7a6a5a" stroke-width="5"/>`),
  kip: S(`<path d="M64 20 C63 11 71 11 72 17 C74 9 83 13 79 22 Z" fill="#f19a8c"/>
    <ellipse cx="48" cy="62" rx="31" ry="24" fill="#fff" stroke="#c9c3d6" stroke-width="4"/>
    <circle cx="70" cy="36" r="14" fill="#fff" stroke="#c9c3d6" stroke-width="4"/>
    <path d="M83 34 L95 38 L83 43 Z" fill="#f2a65a"/><ellipse cx="80" cy="48" rx="3" ry="5" fill="#f19a8c"/>
    <circle cx="73" cy="32" r="2.6" fill="${INK}"/>
    <path d="M30 58 C40 50 54 54 56 64 C48 71 38 69 30 58 Z" fill="#fff" stroke="#c9c3d6" stroke-width="3"/>
    <path d="M42 85 V95 M56 85 V95" stroke="#f2a65a" stroke-width="4" stroke-linecap="round"/>`),
  schip: S(`<path d="M50 10 V64" stroke="#7a6a5a" stroke-width="4"/>
    <path d="M54 14 L82 58 H54 Z" fill="#fff" stroke="#c9c3d6" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M46 22 L24 58 H46 Z" fill="#fff" stroke="#c9c3d6" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M8 64 H92 L78 86 H22 Z" fill="#f4a690" stroke="#d98670" stroke-width="4" stroke-linejoin="round"/>
    <path d="M6 93 C16 87 26 99 36 93 C46 87 56 99 66 93 C76 87 86 99 94 93" stroke="#73a9cf" stroke-width="4" fill="none" stroke-linecap="round"/>`),
  taart: S(`<path d="M50 6 C56 12 55 19 50 19 C45 19 44 12 50 6 Z" fill="#f8de7e" stroke="#ddbb52" stroke-width="2"/>
    <rect x="47" y="19" width="6" height="17" rx="2" fill="#8dbbe6"/>
    <rect x="26" y="36" width="48" height="22" rx="6" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="4"/>
    <rect x="14" y="56" width="72" height="32" rx="7" fill="#f5c3cf" stroke="#d98aa0" stroke-width="4"/>
    <path d="M14 66 C24 74 30 62 40 70 C50 76 56 62 66 70 C74 76 80 64 86 68" stroke="#fff" stroke-width="4" fill="none"/>`),
  paard: S(`<path d="M30 92 C25 70 27 50 36 38 L33 16 L45 29 C58 22 73 27 81 45 C85 53 86 62 80 66 C74 70 66 64 60 59 C57 71 58 82 63 92 Z" fill="#c8996a" stroke="#a2764c" stroke-width="4" stroke-linejoin="round"/>
    <path d="M33 18 C25 40 23 64 27 90 L33 90 C31 66 33 44 41 30 Z" fill="#7a5236"/>
    <circle cx="58" cy="41" r="3.2" fill="${INK}"/><circle cx="78" cy="58" r="2.5" fill="#7a5236"/>`),
  pet: S(`<path d="M14 66 C14 32 72 28 76 62 Z" fill="#8dbbe6" stroke="#5a8fc4" stroke-width="4" stroke-linejoin="round"/>
    <path d="M70 60 C82 58 94 62 96 69 C84 73 70 70 60 66 Z" fill="#5a8fc4" stroke="#5a8fc4" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="44" cy="35" r="4" fill="#5a8fc4"/>`),
  bed: S(`<rect x="8" y="30" width="11" height="60" rx="4" fill="#c8996a" stroke="#a2764c" stroke-width="3"/>
    <rect x="82" y="50" width="10" height="40" rx="4" fill="#c8996a" stroke="#a2764c" stroke-width="3"/>
    <rect x="17" y="56" width="68" height="16" rx="4" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="3"/>
    <ellipse cx="31" cy="51" rx="12" ry="7" fill="#fff" stroke="#c9c3d6" stroke-width="3"/>
    <rect x="42" y="46" width="44" height="26" rx="5" fill="#8dbbe6" stroke="#5a8fc4" stroke-width="3"/>`),
  pop: S(`<path d="M35 47 H65 L77 89 H23 Z" fill="#f5b7c8" stroke="#d98aa0" stroke-width="4" stroke-linejoin="round"/>
    <path d="M36 52 L20 66 M64 52 L80 66" stroke="#f6d2b8" stroke-width="6" stroke-linecap="round"/>
    <circle cx="27" cy="26" r="7" fill="#e0a458"/><circle cx="73" cy="26" r="7" fill="#e0a458"/>
    <circle cx="50" cy="30" r="17" fill="#f6d2b8" stroke="#d9a98a" stroke-width="3"/>
    <path d="M33 28 C33 8 67 8 67 28 C60 19 40 19 33 28 Z" fill="#e0a458"/>
    <circle cx="44" cy="31" r="2.4" fill="${INK}"/><circle cx="56" cy="31" r="2.4" fill="${INK}"/>
    <path d="M45 38 C48 41 52 41 55 38" stroke="${INK}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`),
  kop: S(`<path d="M68 42 C88 42 88 72 68 72" stroke="#73a9cf" stroke-width="7" fill="none"/>
    <rect x="20" y="30" width="50" height="56" rx="9" fill="#a9d4ef" stroke="#73a9cf" stroke-width="4"/>
    <path d="M36 22 C31 15 40 11 35 4 M52 22 C47 15 56 11 51 4" stroke="#c9c3d6" stroke-width="3.5" fill="none" stroke-linecap="round"/>`),
  jas: S(`<path d="M31 14 L18 23 L9 62 L22 66 L27 44 V90 H73 V44 L78 66 L91 62 L82 23 L69 14 C63 24 37 24 31 14 Z" fill="#f4a690" stroke="#d98670" stroke-width="4" stroke-linejoin="round"/>
    <path d="M50 24 V90" stroke="#d98670" stroke-width="3"/>
    <circle cx="57" cy="44" r="3.5" fill="#fff"/><circle cx="57" cy="58" r="3.5" fill="#fff"/><circle cx="57" cy="72" r="3.5" fill="#fff"/>`),
  tas: S(`<path d="M34 42 C34 14 66 14 66 42" stroke="#7fae6c" stroke-width="6" fill="none"/>
    <path d="M16 40 H84 L77 90 H23 Z" fill="#a5cf93" stroke="#7fae6c" stroke-width="4" stroke-linejoin="round"/>
    <rect x="45" y="50" width="10" height="10" rx="2" fill="#f8de7e" stroke="#ddbb52" stroke-width="2"/>`),
  maan: S(`<path d="M60 10 A40 40 0 1 0 60 90 A50 50 0 0 1 60 10 Z" fill="#f8de7e" stroke="#ddbb52" stroke-width="4" stroke-linejoin="round"/>`),
  kraan: S(`<rect x="6" y="24" width="14" height="34" rx="4" fill="#c9c3d6" stroke="#9e97b3" stroke-width="3"/>
    <path d="M20 41 H58 C70 41 74 47 74 57 V62" stroke="#9e97b3" stroke-width="13" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
    <rect x="47" y="25" width="7" height="12" fill="#9e97b3"/><rect x="38" y="18" width="25" height="9" rx="4" fill="#f19a8c"/>
    <path d="M74 72 C80 80 80 89 74 89 C68 89 68 80 74 72 Z" fill="#a3cdea" stroke="#73a9cf" stroke-width="2"/>`),
  vis: S(`<path d="M78 50 L96 34 L96 66 Z" fill="#9fcbe8" stroke="#73a9cf" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="46" cy="50" rx="36" ry="24" fill="#9fcbe8" stroke="#73a9cf" stroke-width="4"/>
    <circle cx="26" cy="44" r="4" fill="${INK}"/>
    <path d="M48 36 C54 44 54 56 48 64" stroke="#73a9cf" stroke-width="4" fill="none" stroke-linecap="round"/>`),
};
