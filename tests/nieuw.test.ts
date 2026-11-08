import { describe, expect, it } from 'vitest';
import { lineText } from '../src/content/spraak.nl';
import { seededRng } from '../src/core/util';
import { easyPick, isStruggling, type PlannerInput } from '../src/core/engine/planner';
import { initialState } from '../src/core/engine/mastery';
import { emptyData, makeBackup, normalize, readBackup } from '../src/core/storage/store';
import { DOMAINS } from '../src/domains';
import { makeHakItem } from '../src/domains/lezen/hakken';
import { ALL_SOUNDS, PICTURE, SOUND_WORDS, SOUNDS, rhymes, WORDS } from '../src/domains/lezen/plaatjes';
import { makePatroonItem } from '../src/domains/rekenen/patroon';
import { makeRuimteItem } from '../src/domains/rekenen/ruimte';
import { makeVerhaalItem, verhaalResult } from '../src/domains/rekenen/verhaal';
import { makeVormItem } from '../src/domains/rekenen/vormen';

describe('Hakken en plakken, eerste woordjes', () => {
  it('elk woord is precies zijn klanken achter elkaar (wat je hoort, zie je ook)', () => {
    for (const w of SOUND_WORDS) {
      expect(SOUNDS[w]!.join('')).toBe(w);
      expect(PICTURE[w]).toMatch(/^<svg/);
    }
    for (const s of ALL_SOUNDS) expect(lineText(`kl.${s}` as never, '')).not.toBe('');
  });

  it('nieuwe woorden rijmen niet stiekem op oude (anders zijn er bij Rijmen twee goede)', () => {
    const ends = (w: string) => w.slice(-3);
    for (const a of ['boom', 'poes', 'boot', 'kaas', 'boek', 'deur', 'vuur'] as const) {
      for (const b of WORDS) if (a !== b && !rhymes(a, b)) expect(ends(a) === ends(b) && a.length === b.length && a[0] !== b[0]).toBe(false);
    }
  });

  it('plakken: één goed plaatje; op niveau 2 en 3 een woord dat net zo begint; letters vanaf niveau 3', () => {
    const rng = seededRng(7);
    let sameStart = 0;
    for (const level of [0, 1, 2]) {
      for (let i = 0; i < 150; i++) {
        const it = makeHakItem('plak', level, rng);
        expect(it.options).toHaveLength(level === 0 ? 2 : 3);
        expect(new Set(it.options).size).toBe(it.options.length);
        expect(it.options.filter((w) => w === it.word)).toHaveLength(1);
        expect(it.letters).toBe(level >= 2);
        if (it.options.some((w) => w !== it.word && SOUNDS[w]![0] === SOUNDS[it.word]![0])) {
          expect(level).toBeGreaterThan(0);
          sameStart++;
        }
      }
    }
    expect(sameStart).toBeGreaterThan(100);
  });

  it('lezen: altijd met letters', () => {
    const rng = seededRng(8);
    for (const level of [0, 1, 2]) expect(makeHakItem('lees', level, rng).letters).toBe(true);
  });
});

describe('Eendjes in de vijver', () => {
  it('de uitkomst blijft binnen bereik en staat tussen de kaartjes; verstopt alleen op het hoogste niveau', () => {
    const rng = seededRng(9);
    for (const [skill, max] of [['verhaal-5', 5], ['verhaal-10', 10]] as const) {
      for (const level of [0, 1, 2]) {
        for (let i = 0; i < 150; i++) {
          const it = makeVerhaalItem(skill, level, rng);
          const r = verhaalResult(it);
          expect(r).toBeGreaterThanOrEqual(1);
          expect(r).toBeLessThanOrEqual(max);
          expect(it.change).not.toBe(0);
          expect(it.options).toContain(r);
          expect(it.hidden).toBe(level === 2);
        }
      }
    }
  });
});

describe('Kralenketting', () => {
  it('wat ontbreekt zet het patroon voort, en staat tussen de keuzes', () => {
    const rng = seededRng(10);
    for (const skill of ['patroon-ab', 'patroon-abc']) {
      for (const level of [0, 1, 2]) {
        for (let i = 0; i < 100; i++) {
          const it = makePatroonItem(skill, level, rng);
          const seq = [...it.shown, ...it.missing];
          const k = it.unit.length;
          for (let j = k; j < seq.length; j++) expect(seq[j]).toBe(seq[j - k]);
          expect(it.shown.length).toBeGreaterThanOrEqual(2 * k);
          for (const m of it.missing) expect(it.options).toContain(m);
          expect(it.missing).toHaveLength(level === 2 ? 2 : 1);
          if (skill === 'patroon-ab') expect(k).toBe(2);
          else expect(k).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });
});

describe('Waar zit het muisje? en Vormen', () => {
  it('het goede plaatje zit erbij; voor en achter pas op het hoogste niveau', () => {
    const rng = seededRng(11);
    for (const level of [0, 1, 2]) {
      for (let i = 0; i < 100; i++) {
        const it = makeRuimteItem('ruimte', level, rng);
        expect(it.options).toContain(it.spot);
        expect(new Set(it.options).size).toBe(it.options.length);
        expect(['voor', 'achter'].includes(it.spot)).toBe(level === 2);
      }
    }
  });

  it('precies één echte vorm van de gevraagde soort; op het hoogste niveau een bijna-vorm erbij', () => {
    const rng = seededRng(12);
    const near = ['ovaal', 'blok', 'bolle-driehoek', 'scheef'];
    for (const level of [0, 1, 2]) {
      for (let i = 0; i < 100; i++) {
        const it = makeVormItem('vormen', level, rng);
        expect(it.figures.filter((f) => f.kind === it.target)).toHaveLength(1);
        expect(it.figures.some((f) => near.includes(f.kind))).toBe(level === 2);
        if (it.target === 'vierkant') expect(it.figures.some((f) => f.kind === 'rechthoek')).toBe(false);
      }
    }
  });
});

describe('moeilijk moment opvangen', () => {
  const r = (credit: number, modeled = false) => ({ credit, modeled });
  it('na twee keer voordoen, of drie van de vier niet in één keer', () => {
    expect(isStruggling([r(1), r(0, true), r(0, true)])).toBe(true);
    expect(isStruggling([r(0.5), r(1), r(0.5), r(0, true)])).toBe(true);
    expect(isStruggling([r(1), r(0.5), r(1), r(0.5)])).toBe(false);
    expect(isStruggling([r(0, true)])).toBe(false);
  });

  it('kiest de beheerste vaardigheid die het stevigst zit', () => {
    const skills = [
      { id: 'a', domain: 'x', requires: [], levels: 3 },
      { id: 'b', domain: 'x', requires: [], levels: 3 },
      { id: 'c', domain: 'x', requires: [], levels: 3 },
    ];
    const mastered = (box: number) => ({ ...initialState(), status: 'mastered' as const, review: { box, due: '2026-12-01' } });
    const input: PlannerInput = {
      skills, playable: new Set(['a', 'b', 'c']), today: '2026-11-07', played: [], retries: [],
      states: { a: mastered(1), b: mastered(3), c: { ...initialState(), status: 'practicing' } },
    };
    expect(easyPick(input)).toBe('b');
    expect(easyPick({ ...input, states: {} })).toBe(null);
  });
});

describe('samen en back-up', () => {
  it('elke vaardigheid heeft een activiteit en een opdracht in het echt', () => {
    const playable = new Set(DOMAINS.flatMap((d) => d.activities).flatMap((a) => a.skills));
    for (const d of DOMAINS) {
      for (const s of d.skills) {
        expect(playable.has(s.id)).toBe(true);
        expect(s.realTasks?.length).toBeGreaterThan(0);
        for (const t of s.realTasks!) expect(lineText(t, '')).not.toBe('');
      }
    }
  });

  it('back-up gaat heen en terug, en vreemde bestanden worden geweigerd', () => {
    const data = emptyData();
    data.settings.childName = 'Test';
    data.notes.push({ skill: 'letters', text: 'x', date: '2026-11-07' });
    const back = readBackup(JSON.stringify(makeBackup(data, Date.now())));
    expect(back).toEqual(data);
    expect(readBackup('{"app":"iets anders"}')).toBe(null);
    expect(readBackup('geen json')).toBe(null);
  });

  it('een kapot of vreemd back-upbestand kan de app niet laten vastlopen', () => {
    const good = emptyData();
    good.sessions.push({ id: 's1', date: '2026-11-07', start: 1, activeMs: 0, items: 2, firstTry: 2, helped: 0, activities: ['tellen'], skills: ['tellen-5'] });
    const evil = {
      ...good,
      settings: { childName: 'x'.repeat(500), volume: 9, together: 'altijd', grownUp: '<img src=x>', sessionMinutes: -5, voiceURI: 3 },
      skills: { a: { status: 'mastered', level: 0, atLevel: [], history: [] }, b: 'kapot', c: { ...initialState(), level: 2, status: 'practicing' } },
      sessions: [...good.sessions, null, { id: 5 }, 'tekst'],
      notes: [{ skill: 'x', text: 'ok', date: '2026-11-07' }, { text: 7 }],
      seen: { tellen: 3, rijmen: 'veel' },
      introduced: 'ja',
      lastBackup: 'gisteren',
    };
    const d = readBackup(JSON.stringify(makeBackup(evil as never, 0)))!;
    expect(d.settings.childName).toHaveLength(40);
    expect(d.settings.volume).toBe(1);
    expect(d.settings.together).toBe('echt');
    expect(d.settings.grownUp).toBe('wie.papaofmama');
    expect(d.settings.sessionMinutes).toBe(10);
    expect(d.settings.voiceURI).toBe(null);
    expect(Object.keys(d.skills)).toEqual(['c']);
    expect(d.sessions).toHaveLength(1);
    expect(d.notes).toHaveLength(1);
    expect(d.seen).toEqual({ tellen: 3 });
    expect(d.introduced).toBe(false);
    expect(d.lastBackup).toBe(null);
    expect(readBackup(JSON.stringify({ app: 'fluffy', format: 1, profiles: [{ id: 'p1', data: [] }] }))).toBe(null);
  });

  it('oude opslag zonder notities wordt aangevuld', () => {
    const old = { ...emptyData() } as Partial<ReturnType<typeof emptyData>>;
    delete old.notes;
    expect(normalize(old)!.notes).toEqual([]);
    expect(normalize({ ...old, settings: { childName: 'A' } })!.settings.together).toBe('echt');
    // Proefjes staan standaard aan, ook bij gegevens van vóór de proefjes.
    expect(normalize(old)!.settings.probe).toBe(true);
    expect(normalize({ ...old, settings: { probe: false } })!.settings.probe).toBe(false);
  });
});
