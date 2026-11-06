import { describe, expect, it } from 'vitest';
import { chunk, clipJobs, phraseId } from '../src/core/audio/phrases';
import { parseManifest } from '../src/core/audio/speech';
import { lineText, SPRAAK } from '../src/content/spraak.nl';
import { ALL_ACTIVITIES } from '../src/domains';

const jobs = clipJobs(ALL_ACTIVITIES.flatMap((a) => a.phrases()));
const ids = new Set(jobs.map((j) => j.id));
const has = (id: string) => ids.has(id);

describe('hele zinnen opzoeken', () => {
  it('neemt de langste opname die past', () => {
    const set = new Set(['a', 'b', 'c', 'a+b', 'a+b+c+d']);
    expect(chunk(['a', 'b', 'c'], (id) => set.has(id))).toEqual([
      { id: 'a+b', clip: true },
      { id: 'c', clip: true },
    ]);
    expect(chunk(['a', 'b', 'c', 'd'], (id) => set.has(id))).toEqual([{ id: 'a+b+c+d', clip: true }]);
  });

  it('laat stukken zonder opname los, voor de computerstem', () => {
    expect(chunk(['x', 'a', 'naam'], (id) => id === 'a')).toEqual([
      { id: 'x', clip: false },
      { id: 'a', clip: true },
      { id: 'naam', clip: false },
    ]);
  });

  it('vindt de vraag van Mandje vullen als één zin', () => {
    const segs = ['mandje.vraag.a', 'getal.4', 'obj.appels', 'mandje.vraag.b'];
    expect(chunk(segs, has)).toEqual([{ id: segs.join('+'), clip: true }]);
  });

  it('dekt de zinnen met getallen die de activiteiten zeggen', () => {
    for (let n = 1; n <= 10; n++) {
      // Hint in Mandje: "Dat zijn er 3. We wilden er 5." + "Er mogen er nog wat bij."
      expect(chunk(['hint.zijn', 'getal.3', 'hint.wilden', `getal.${n}`, 'hint.teweinig'], has).every((c) => c.clip)).toBe(true);
      // Voordoen bij Samen tellen
      expect(chunk(['voordoen.laatste.a', `getal.${n}`, 'tellen.dushet', `getal.${n}`], has)).toHaveLength(2);
    }
    expect(chunk(['foutje.kijk.getal.a', 'getal.3', 'foutje.kijk.getal.b', 'getal.4', 'foutje.kijk.getal.c'], has)).toHaveLength(2);
  });
});

describe('wat er ingesproken wordt', () => {
  it('bevat elke zin uit het script en de getallen, maar nooit de naam', () => {
    for (const id of Object.keys(SPRAAK)) if (id !== 'naam') expect(ids.has(id)).toBe(true);
    for (let n = 1; n <= 20; n++) expect(ids.has(`getal.${n}`)).toBe(true);
    expect([...ids].some((id) => id.split('+').includes('naam'))).toBe(false);
  });

  it('elke hele zin bestaat uit bekende stukjes en eindigt als een zin', () => {
    for (const j of jobs.filter((x) => x.id.includes('+'))) {
      for (const part of j.id.split('+')) expect(lineText(part as never, '')).not.toBe('');
      expect(j.text).toMatch(/[.?!]$/);
    }
  });

  it('vragen eindigen met een vraagteken, zinnen beginnen met een hoofdletter', () => {
    const text = (id: string) => jobs.find((j) => j.id === id)!.text;
    expect(text('woont.vraag+getal.7')).toBe('Waar woont zeven?');
    expect(text('pad.welkna+getal.6')).toBe('Welk getal komt na zes?');
    expect(text('getal.5+meer.ismeerdan+getal.3')).toBe('Vijf is meer dan drie.');
    expect(text('getal.5+splits.is+getal.2+splits.en+getal.3')).toBe('Vijf is twee en drie.');
    expect(text('rek.schuif.a+getal.7+rek.schuif.b')).toBe('Schuif zeven kralen naar mij toe.');
    expect(text('splits.wonen.a+getal.6+splits.wonen.b')).toBe('In dit huisje wonen zes vlinders.');
    expect(text('rijm.vraag+w.huis')).toBe('Wat rijmt op huis?');
    expect(text('w.maan+rijm.en+w.muis+klank.zelfde')).toBe('Maan en muis, die beginnen hetzelfde.');
  });

  it('getallen krijgen de buren mee, zodat ze als tellen klinken', () => {
    const drie = jobs.find((j) => j.id === 'getal.3')!;
    expect(drie).toMatchObject({ text: 'drie', before: 'één, twee', after: 'vier, vijf' });
  });

  it('phraseId maakt van getallen getal-id\'s', () => {
    expect(phraseId(['tellen.zijnhet', 5])).toBe('tellen.zijnhet+getal.5');
  });
});

describe('manifest', () => {
  it('leest het oude formaat (lijst met .m4a) en het nieuwe (id → bestand)', () => {
    expect([...parseManifest({ clips: ['getal.1'] })]).toEqual([['getal.1', 'getal.1.m4a']]);
    expect([...parseManifest({ clips: { 'getal.1': 'getal.1.abc.mp3' } })]).toEqual([['getal.1', 'getal.1.abc.mp3']]);
    expect(parseManifest(null).size).toBe(0);
  });
});
