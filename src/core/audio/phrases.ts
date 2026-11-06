import { lineText, SPRAAK, type LineId } from '../../content/spraak.nl';
import type { Seg } from './speech';

/**
 * Hele zinnen als één opname. Losse stukjes ("Kun je" + "vier" + "appels" + …) aan elkaar
 * geplakt klinken hakkelig; daarom kan een opname ook een reeks segmenten dekken.
 * De id van zo'n zin is de segment-id's met '+' ertussen: 'mandje.vraag.a+getal.4+obj.appels+mandje.vraag.b'.
 */

export const segId = (s: Seg): LineId => (typeof s === 'number' ? `getal.${s}` : s);
export const phraseId = (segs: readonly Seg[]): string => segs.map(segId).join('+');

export interface Chunk {
  id: string;
  /** Is hier een opname van? Anders spreekt de computerstem het uit. */
  clip: boolean;
}

/** Deelt een zin op in zo lang mogelijke stukken waar een opname van is. */
export function chunk(ids: readonly string[], hasClip: (id: string) => boolean): Chunk[] {
  const out: Chunk[] = [];
  let i = 0;
  while (i < ids.length) {
    let j = ids.length;
    while (j > i + 1 && !hasClip(ids.slice(i, j).join('+'))) j--;
    const id = ids.slice(i, j).join('+');
    out.push({ id, clip: hasClip(id) });
    i = j;
  }
  return out;
}

/** Stukjes tekst aan elkaar, zonder spatie voor leestekens. */
export function joinText(parts: readonly string[]): string {
  return parts.filter(Boolean).join(' ').replace(/\s+([,.?!])/g, '$1').trim();
}

export interface ClipJob {
  id: string;
  text: string;
  /** Tekst ervoor en erna, alleen voor de klank (bij tellen klinkt "drie" dan als tellen). */
  before?: string;
  after?: string;
}

/** Hoogste getal dat als losse opname gemaakt wordt. */
export const MAX_NUMBER = 20;

/**
 * Alles wat ingesproken moet worden: elke zin uit het script, de getallen, en de hele zinnen
 * die activiteiten opgeven. De naam van het kind hoort er bewust niet bij.
 */
export function clipJobs(phrases: readonly Seg[][]): ClipJob[] {
  const jobs = new Map<string, ClipJob>();
  for (const id of Object.keys(SPRAAK) as (keyof typeof SPRAAK)[]) {
    const text = lineText(id, '');
    if (text) jobs.set(id, { id, text });
  }
  for (let n = 1; n <= MAX_NUMBER; n++) {
    const word = (k: number) => lineText(`getal.${k}`, '');
    const around = (from: number, to: number) =>
      Array.from({ length: to - from + 1 }, (_, i) => from + i).filter((k) => k >= 1 && k <= MAX_NUMBER).map(word);
    jobs.set(`getal.${n}`, {
      id: `getal.${n}`,
      text: word(n),
      before: around(n - 2, n - 1).join(', ') || undefined,
      after: around(n + 1, n + 2).join(', ') || undefined,
    });
  }
  for (const segs of phrases) {
    if (segs.length < 2 || segs.includes('naam')) continue;
    const id = phraseId(segs);
    const raw = joinText(segs.map((s) => lineText(segId(s), '')));
    const text = raw.charAt(0).toUpperCase() + raw.slice(1);
    const end = /^(Welke?|Waar|Wat|Wie|Hoeveel|Kun|Zullen)\b/.test(text) ? '?' : '.';
    jobs.set(id, { id, text: /[.?!]$/.test(text) ? text : `${text}${end}` });
  }
  return [...jobs.values()];
}
