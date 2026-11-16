/**
 * Klopt een opname? Vergelijkt wat spraakherkenning hoorde met de bedoelde tekst.
 * Streng waar het telt (getallen, losse woordjes), wat ruimer bij lange zinnen: daar maakt
 * spraakherkenning zelf ook weleens een foutje ("Fluffy" → "Flappie").
 */
import { numberWord } from '../src/content/spraak.nl';

/**
 * Wat controleert spraakherkenning?
 * - 'check':  hele zinnen, en losse woordjes die de app ook los zegt (woordjes, kleuren, getallen).
 * - 'klank':  losse klanken ("mmm", "b"): die kan spraakherkenning niet beoordelen.
 * - 'stukje': een stukje zin ("Kun jij de", "en"). De app zegt die alleen in een hele zin, die
 *             apart is ingesproken en gecontroleerd. Los verstaat spraakherkenning ze slecht.
 */
export function sttMode(id: string, text: string): 'check' | 'klank' | 'stukje' {
  if (id.split('+').some((p) => p.startsWith('kl.'))) return 'klank';
  if (id.includes('+') || /[.?!]$/.test(text) || /^(w|kleur|rekt|getal|begroeting)\./.test(id)) return 'check';
  return 'stukje';
}

/** Kleine letters, zonder accenten en leestekens, cijfers als woord ("4" → "vier"). */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/\d+/g, (d) => ` ${numberWord(Number(d))} `)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

const NUMBERS = new Set(Array.from({ length: 20 }, (_, i) => words(numberWord(i + 1))[0]));
/** "een" is ook een lidwoord; als getal schrijven we "één", en dat wordt ook "een". */
const numbersIn = (ws: string[]) => ws.filter((w) => NUMBERS.has(w) && w !== 'een');

function levenshtein(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** Hoe gelijk twee teksten zijn, van 0 tot 1. */
export function similarity(a: string, b: string): number {
  const max = Math.max(a.length, b.length);
  return max ? 1 - levenshtein(a, b) / max : 1;
}

/**
 * Hoe een woord klinkt, ruwweg. Spraakherkenning schrijft een los woordje vaak anders op dan het
 * bedoeld is, terwijl het hetzelfde klinkt: "mess" (mes), "cam" (kam), "nood" (noot), "Fear" (veer),
 * "Rock en sock" (rok en sok). Klinkers blijven staan: "kom" is geen "kam", "vas" geen "vaas".
 */
export function soundKey(word: string): string {
  return word
    .replace(/sch/g, 'sg').replace(/ch/g, 'g')
    .replace(/ck/g, 'k').replace(/c(?=[eiy])/g, 's').replace(/c/g, 'k').replace(/q/g, 'k').replace(/x/g, 'ks')
    .replace(/ph/g, 'f').replace(/th/g, 't')
    .replace(/ea(?=r)/g, 'ee').replace(/ij/g, 'ei').replace(/y/g, 'i').replace(/au/g, 'ou')
    .replace(/v/g, 'f').replace(/z/g, 's')
    // Dubbele medeklinker klinkt als één ("mess"); aan het eind klinkt d als t en b als p ("nood").
    .replace(/([^aeiou])\1+/g, '$1')
    .replace(/d$/, 't').replace(/b$/, 'p');
}
const sameSound = (a: string[], b: string[]) => a.length === b.length && a.every((w, i) => soundKey(w) === soundKey(b[i]));

/**
 * Tweede mening voor een los woordje: hetzelfde woord, maar achter een zinnetje geplakt
 * ("Wat rijmt op" + opname). In een zin verstaat spraakherkenning een woord veel beter.
 * null als het woord er aan het eind staat.
 */
export function compareInContext(intended: string, heard: string): string | null {
  const want = words(intended);
  const got = words(heard);
  if (!got.length) return 'niets verstaan';
  return sameSound(want, got.slice(-want.length)) ? null : 'ander woord';
}

/**
 * null als de opname klopt, anders een korte uitleg.
 * - Uitgerekte woordjes ("Mmmm… maan"): het woord aan het eind moet er zijn.
 * - Korte zinnen en losse woorden: precies gelijk.
 * - Lange zinnen: bijna gelijk, en de getallen precies.
 */
export function compareHeard(id: string, intended: string, heard: string): string | null {
  const want = words(intended);
  const got = words(heard);
  if (!got.length) return 'niets verstaan';
  if (id.startsWith('rekt.')) return got.at(-1) === want.at(-1) ? null : 'ander woord';
  const a = want.join(' ');
  const b = got.join(' ');
  // "lieve heersbeestjes" of "hetzijner": spaties tellen niet.
  if (a.replace(/ /g, '') === b.replace(/ /g, '')) return null;
  // Getallen blijven streng (letterlijk): "five" is geen "vijf".
  const numbers = numbersIn(want).length > 0 || NUMBERS.has(want[0]);
  if (!numbers && sameSound(want, got)) return null;
  if (want.length === 1) return 'ander woord';
  if (numbersIn(want).join(' ') !== numbersIn(got).join(' ')) return 'ander getal';
  if (a.length >= 25 && similarity(a, b) >= 0.9) return null;
  return 'andere woorden';
}
