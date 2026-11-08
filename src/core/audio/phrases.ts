import { lineText, singular, SPRAAK, type LineId } from '../../content/spraak.nl';
import type { Seg } from './speech';

/**
 * Hele zinnen als één opname. Losse stukjes ("Kun je" + "vier" + "appels" + …) aan elkaar
 * geplakt klinken hakkelig; daarom kan een opname ook een reeks segmenten dekken.
 * De id van zo'n zin is de segment-id's met '+' ertussen: 'mandje.vraag.a+getal.4+obj.appels+mandje.vraag.b'.
 */

export const segId = (s: Seg): LineId => (typeof s === 'number' ? `getal.${s}` : s);
/** De id's van een zin, met het goede enkelvoud bij één ("Dus het is er één"). */
export const segIds = (segs: readonly Seg[]): string[] => singular(segs.map(segId));
export const phraseId = (segs: readonly Seg[]): string => segIds(segs).join('+');

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

/**
 * Waar wordt een zin uit losse opnames aan elkaar geplakt, midden in de zin? Dat klinkt
 * hakkelig ("Het laatste getal dat ik zei was" + "vier" op teltoon). Een grens na een
 * hele zin mag, net als een rij losse getallen of kleuren (tellen, patronen).
 */
export function gluedJoins(ids: readonly string[], hasClip: (id: string) => boolean): string[] {
  const parts = chunk(ids, hasClip);
  const list = (id: string) => id.startsWith('getal.') || id.startsWith('kleur.');
  const out: string[] = [];
  for (let k = 0; k + 1 < parts.length; k++) {
    const last = parts[k].id.split('+').at(-1)!;
    const first = parts[k + 1].id.split('+')[0];
    if (/[.?!]$/.test(lineText(last as LineId))) continue;
    if (list(last) && (list(first) || /^[A-Z]/.test(lineText(first as LineId)))) continue;
    out.push(`${parts[k].id} | ${parts[k + 1].id}`);
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
  /**
   * Tekst ervoor en erna, alleen voor de klank (bij tellen klinkt "drie" dan als tellen).
   * Getallen krijgen bewust geen tekst erna: dan kapt de stem het woord af, alsof het volgende
   * getal er meteen achteraan komt ("ach" in plaats van "acht").
   */
  before?: string;
  after?: string;
}

/** Losse woordjes die de app ook los zegt (lezen, kleuren). */
const SINGLE_WORD = /^(w|kleur|rekt)\./;
const WORD_CONTEXT = 'Luister maar goed, ik zeg een Nederlands woordje:';

/** Hoogste getal dat als losse opname gemaakt wordt. */
export const MAX_NUMBER = 20;

/**
 * Alles wat ingesproken moet worden: elke zin uit het script, de getallen, en de hele zinnen
 * die activiteiten opgeven. De app vraagt geen naam van het kind, dus die zit er nooit in.
 */
export function clipJobs(phrases: readonly Seg[][]): ClipJob[] {
  const jobs = new Map<string, ClipJob>();
  for (const id of Object.keys(SPRAAK) as (keyof typeof SPRAAK)[]) {
    const text = lineText(id);
    // Een los woordje zonder context spreekt de stem soms Engels uit ("jas" als "yes"). Met een
    // Nederlandse zin ervoor (die niet in de opname komt) klinkt het Nederlands.
    if (text) jobs.set(id, { id, text, ...(SINGLE_WORD.test(id) ? { before: WORD_CONTEXT } : {}) });
  }
  for (let n = 1; n <= MAX_NUMBER; n++) {
    const word = (k: number) => lineText(`getal.${k}`);
    const before = [n - 2, n - 1].filter((k) => k >= 1).map(word);
    jobs.set(`getal.${n}`, {
      id: `getal.${n}`,
      // Met een punt: rustig uitgesproken, helemaal af.
      text: `${word(n)}.`,
      before: before.length ? `${before.join(', ')},` : undefined,
    });
  }
  for (const segs of phrases) {
    if (segs.length < 2) continue;
    const ids = segIds(segs);
    const id = ids.join('+');
    // Begint er midden in een zin een nieuwe zin ("… één en één" + "Dat is evenveel."), dan een punt.
    const pieces = ids.map((p) => lineText(p as LineId));
    const raw = joinText(pieces.map((t, i) => (/^[A-Z]/.test(pieces[i + 1] ?? '') && !/[.?!,:]$/.test(t) ? `${t}.` : t)));
    const text = raw.charAt(0).toUpperCase() + raw.slice(1);
    const end = /^(Welke?|Waar|Wat|Wie|Hoeveel|Kun|Zullen)\b/.test(text) ? '?' : '.';
    jobs.set(id, { id, text: /[.?!]$/.test(text) ? text : `${text}${end}` });
  }
  return [...jobs.values()];
}
