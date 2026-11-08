import { describe, expect, it } from 'vitest';
import { clipJobs, gluedJoins, segIds } from '../src/core/audio/phrases';
import type { Seg } from '../src/core/audio/speech';
import { ALL_PHRASES } from '../src/domains';
import { somCombos, somResult } from '../src/domains/rekenen/sommen';

/**
 * Elke zin met een getal erin moet als geheel ingesproken zijn. Anders plakt de app losse
 * opnames aan elkaar, midden in de zin, en dat klinkt hakkelig of zelfs fout.
 * Hieronder staan de zinnen zoals de activiteiten ze opbouwen (zie de ctx.say-aanroepen).
 */
const ids = new Set(clipJobs(ALL_PHRASES()).map((j) => j.id));
const has = (id: string) => ids.has(id);
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);
const N = range(1, 10);
const PRAISE = 'lof.doorzetten';

const SENTENCES: [where: string, make: () => (string | number)[][]][] = [
  ['tellen: goed, en na voordoen', () => N.flatMap((n) => [
    ['tellen.zijnhet', n, PRAISE], ['tellen.kijkdeze', 'tellen.dushet', n], ['voordoen.laatste.a', n, 'tellen.dushet', n],
  ])],
  ['cijfer: hint', () => N.flatMap((v) => N.map((n) => ['hier.zijn', v, 'cijfer.zoeken', n]))],
  // Fluffy telt tot hooguit negen dingen, en zegt er dan hooguit één naast.
  ['foutje: conclusie en uitleg', () => range(1, 9).flatMap((n) => [
    ['foutje.dus', n], ['foutje.kijk.eind.a', n, 'foutje.kijk.eind.b', n + 1, 'foutje.kijk.eind.c'],
    ['foutje.kijk.getal.a', n, 'foutje.kijk.getal.b', n + 1, 'foutje.kijk.getal.c'],
  ])],
  ['mandje: goed, hint en voordoen', () => N.flatMap((n) => [
    ['mandje.zijnhet', n, 'mandje.precies', PRAISE],
    ...N.flatMap((k): Seg[][] => [['hint.zijn', k, 'hint.cijferis', n], ['hint.zijn', k, 'hint.wilden', n]]),
    ['voordoen.laatste.a', n, 'voordoen.laatste.b', n, 'voordoen.laatste.c'], ['voordoen.kijk', n],
  ])],
  ['meer: tellen en evenveel', () => range(1, 6).flatMap((n) => [
    ['hier.zijn', n], ['meer.allemaatje', 'meer.nu', n, 'meer.en', n, 'meer.evenveelklaar'],
    ['meer.nu', n, 'meer.en', n, 'meer.evenveelklaar', PRAISE],
  ])],
  ['kiekeboe en rekenrek: structuur', () => range(1, 10).map((n) => (n > 5 ? ['kiekeboe.vijfen', n - 5, 'kiekeboe.isdat', n, PRAISE] : ['tellen.dushet', n]))],
  ['rekenrek: maken', () => range(3, 10).flatMap((n) => [
    ['rek.nujij', 'rek.schuif.a', n, 'rek.schuif.b'], ['voordoen.kijk', n],
    ...range(0, 10).filter((c) => c !== n && c > 0).map((c): Seg[] => ['hint.zijn', c, 'hint.wilden', n]),
  ])],
  ['rekenrek en splitshuis: splitsen', () => range(2, 10).flatMap((t) => range(1, t - 1).map((a): Seg[] => [t, 'splits.is', a, 'splits.en', t - a, PRAISE]))],
  ['splitshuis: tellen', () => range(1, 9).flatMap((n) => [['tellen.kijkdeze', 'tellen.dushet', n], ['tellen.tik.a', n, 'tellen.tik.b']])],
  ['pad: vraag en regel', () => range(1, 9).flatMap((k) => [['pad.welkna', k], ['pad.na', k, 'pad.komt', k + 1], ['tellen.kijkdeze', 'tellen.dushet', k]])],
  ['pad: terug', () => range(2, 10).flatMap((k) => [['pad.welkvoor', k], ['pad.voor', k, 'pad.komt', k - 1]])],
  ['woont', () => range(1, 10).flatMap((n) => [['woont.vraag', n], ['woont.hier', n, PRAISE]])],
  ['tien en nog wat', () => range(11, 20).flatMap((n) => [
    [10, 'tien.en', n - 10, 'tien.is', n, 'lof.tienstaaf'], [10, 'tien.en', n - 10, 'tien.is', n, PRAISE],
    ['tellen.tik.a', n, 'tellen.tik.b'], ['tellen.kijkdeze', 'tellen.dushet', n],
  ])],
  ['sommen: vraag en uitkomst', () => ['sommen-5', 'sommen-10', 'sommen-20'].flatMap((s) => somCombos(s).flatMap(({ a, b, op }) => {
    const w = op === '+' ? 'som.plus' : 'som.min';
    const r = somResult({ a, b, op });
    return [['som.hoeveel', a, w, b], [a, w, b, 'som.is', r, 'lof.som'], [a, w, b, 'som.is', r, PRAISE], ['tellen.tik.a', r, 'tellen.tik.b']];
  }))],
];

describe('geen geplakte zinnen', () => {
  for (const [where, make] of SENTENCES) {
    it(where, () => {
      const glued = make().flatMap((segs) => gluedJoins(segIds(segs as Seg[]), has));
      expect([...new Set(glued)]).toEqual([]);
    });
  }

  it('enkelvoud bij één', () => {
    const text = (segs: Seg[]) => clipJobs([segs]).find((j) => j.id === segIds(segs).join('+'))!.text;
    expect(text(['tellen.dushet', 1])).toBe('Dus het is er één.');
    expect(text(['tellen.dushet', 3])).toBe('Dus het zijn er drie.');
    expect(text(['voordoen.laatste.b', 1, 'voordoen.laatste.c'])).toBe('Dus er ligt er één in het mandje.');
    expect(text(['foutje.kijk.eind.b', 1, 'foutje.kijk.eind.c'])).toBe('Maar ik zei dat het er één was. Dat klopt niet.');
    expect(text(['meer.nu', 2, 'meer.en', 2, 'meer.evenveelklaar'])).toBe('Nu liggen er twee en twee. Dat is evenveel.');
  });
});
