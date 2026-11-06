import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/util';
import { makeKlankItem, type KlankKind } from '../src/domains/lezen/klanken';
import { LETTER_WORDS, makeLetterItem } from '../src/domains/lezen/letters';
import { letterOf, ONSET, PICTURE, rhymes, RHYMES, sameOnset, STRETCHED, WORDS } from '../src/domains/lezen/plaatjes';
import { DOMAINS } from '../src/domains';
import { initialState, manualLevelOf, manualState } from '../src/core/engine/mastery';

const fits = (kind: KlankKind, a: string, b: string) =>
  kind === 'rijm' ? rhymes(a as never, b as never) : sameOnset(a as never, b as never);

describe('Rijmen en beginklank', () => {
  for (const kind of ['rijm', 'begin'] as const) {
    it(`${kind}: precies één plaatje past, en er komt per niveau een plaatje of een lastige afleider bij`, () => {
      const rng = seededRng(kind === 'rijm' ? 3 : 4);
      let tricky = 0;
      for (const level of [0, 1, 2]) {
        for (let i = 0; i < 200; i++) {
          const it = makeKlankItem(kind, level, rng);
          expect(it.options).toHaveLength(level === 0 ? 2 : 3);
          expect(new Set(it.options).size).toBe(it.options.length);
          expect(it.options).toContain(it.answer);
          expect(it.options).not.toContain(it.target);
          expect(it.options.filter((w) => fits(kind, it.target, w))).toEqual([it.answer]);
          const other = kind === 'rijm' ? 'begin' : 'rijm';
          if (it.options.some((w) => fits(other, it.target, w))) {
            expect(level).toBe(2);
            tricky++;
          }
        }
      }
      expect(tricky).toBeGreaterThan(50);
    });
  }

  it('woorden met twee beginklanken (kraan, schip) tellen niet als hetzelfde begin', () => {
    expect(sameOnset('kraan', 'kip')).toBe(false);
    expect(sameOnset('schip', 'zon')).toBe(false);
    expect(sameOnset('maan', 'muis')).toBe(true);
  });

  it('elk woord heeft een plaatje, en rijmparen rijmen echt niet met andere paren', () => {
    for (const w of WORDS) expect(PICTURE[w]).toMatch(/^<svg/);
    expect(Object.keys(ONSET)).toHaveLength(WORDS.length);
    const inPairs = RHYMES.flat();
    expect(new Set(inPairs).size).toBe(inPairs.length);
  });
});

describe('Letters zoeken', () => {
  it('één goede letter; op het hoogste niveau soms een letter die erop lijkt', () => {
    const rng = seededRng(5);
    let lookalike = 0;
    for (const level of [0, 1, 2]) {
      for (let i = 0; i < 200; i++) {
        const it = makeLetterItem('letters', level, rng);
        expect(it.letter).toBe(letterOf(it.word));
        expect(it.options).toHaveLength(level === 0 ? 2 : 3);
        expect(it.options.filter((l) => l === it.letter)).toHaveLength(1);
        expect(new Set(it.options).size).toBe(it.options.length);
        if (it.options.some((l) => ['m:n', 'n:m', 'b:d', 'd:b', 'p:b', 'h:n', 'v:w', 'k:h', 't:f'].includes(`${it.letter}:${l}`))) {
          expect(level).toBe(2);
          lookalike++;
        }
      }
    }
    expect(lookalike).toBeGreaterThan(100);
  });

  it('alleen woorden met één beginletter, en uitgerekt alleen klanken die je kunt aanhouden', () => {
    expect(LETTER_WORDS).not.toContain('kraan');
    expect(LETTER_WORDS).not.toContain('schip');
    for (const w of Object.keys(STRETCHED)) expect(['m', 'v', 'h', 'z', 'r']).toContain(ONSET[w as keyof typeof ONSET]);
  });
});

describe('leerlijn lezen', () => {
  it('beginklank komt eerst, rijmen is geen voorwaarde, letters na beginklank', () => {
    const lezen = DOMAINS.find((d) => d.id === 'lezen')!;
    expect(lezen.skills[0].id).toBe('beginklank');
    for (const s of lezen.skills) expect(s.requires).not.toContain('rijmen');
    expect(lezen.skills.find((s) => s.id === 'letters')!.requires).toEqual(['beginklank']);
  });
});

describe('vakken', () => {
  it('elke vaardigheid hoort bij één vak, en voorwaarden blijven binnen het vak', () => {
    const all = DOMAINS.flatMap((d) => d.skills.map((s) => s.id));
    expect(new Set(all).size).toBe(all.length);
    for (const d of DOMAINS) {
      const ids = new Set(d.skills.map((s) => s.id));
      for (const s of d.skills) for (const r of s.requires) expect(ids.has(r)).toBe(true);
      for (const a of d.activities) for (const sk of a.skills) expect(ids.has(sk)).toBe(true);
      expect(d.icon).toMatch(/^<svg/);
    }
  });

  it('activiteit-id\'s zijn uniek over alle vakken heen', () => {
    const ids = DOMAINS.flatMap((d) => d.activities.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('niveau handmatig zetten', () => {
  const def = { id: 'rijmen', domain: 'lezen', requires: [], levels: 3 };
  const prev = { ...initialState(), status: 'practicing' as const, level: 2, history: [{ credit: 1 as const, session: 's', level: 2, review: false, date: '2026-11-06' }] };

  it('zet oefenen op een stap, terug naar "nog niet", of op "kan ze al" (wordt gecontroleerd)', () => {
    const easier = manualState(def, prev, 0, '2026-11-06');
    expect(easier).toMatchObject({ status: 'practicing', level: 0, atLevel: [] });
    expect(easier.history).toHaveLength(1);
    expect(manualState(def, prev, 'new', '2026-11-06').status).toBe('new');
    const done = manualState(def, prev, 'mastered', '2026-11-06');
    expect(done).toMatchObject({ status: 'mastered', assumed: true, review: { due: '2026-11-06' } });
    expect(manualState(def, prev, 9, '2026-11-06').level).toBe(2);
  });

  it('leest de huidige stand terug voor het keuzelijstje', () => {
    expect(manualLevelOf(prev)).toBe(2);
    expect(manualLevelOf(initialState())).toBe('new');
  });
});
