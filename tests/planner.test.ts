import { describe, expect, it } from 'vitest';
import { assumeMastered, initialState } from '../src/core/engine/mastery';
import {
  atRunBoundary, choiceOptions, frontier, isChoiceMoment, pickNext, PLAN_RULES, scheduleRetry, type PlannerInput,
} from '../src/core/engine/planner';
import type { SkillDef, SkillState } from '../src/core/engine/types';

const today = '2026-11-01';
const skills: SkillDef[] = [
  { id: 'a', domain: 'x', requires: [], levels: 2 },
  { id: 'b', domain: 'x', requires: ['a'], levels: 2 },
  { id: 'c', domain: 'x', requires: ['b'], levels: 2 },
  { id: 'los', domain: 'x', requires: ['nog-niet-gebouwd'], levels: 2 },
  { id: 'nog-niet-gebouwd', domain: 'x', requires: [], levels: 2 },
];

function input(states: Record<string, SkillState>, extra: Partial<PlannerInput> = {}): PlannerInput {
  return {
    skills,
    playable: new Set(['a', 'b', 'c', 'los']),
    states,
    today,
    played: [],
    retries: [],
    ...extra,
  };
}

const practicing = (): SkillState => ({ ...initialState(), status: 'practicing' });
const mastered = (due = '2026-12-01'): SkillState => ({ ...initialState(), status: 'mastered', level: 1, review: { box: 1, due } });

describe('voorwaarden', () => {
  it('begint met vaardigheden zonder (gebouwde) voorwaarden', () => {
    expect(frontier(input({}))).toEqual(['a', 'los']);
  });

  it('opent een vaardigheid pas als de voorwaarde beheerst is', () => {
    expect(frontier(input({ a: practicing() }))).not.toContain('b');
    expect(frontier(input({ a: mastered() }))).toContain('b');
  });

  it('laat een voorwaarde zonder activiteit niet blokkeren', () => {
    expect(frontier(input({}))).toContain('los');
  });

  it('houdt hooguit twee vaardigheden tegelijk aan de grens', () => {
    const f = frontier(input({ a: mastered(), b: practicing(), c: practicing() }));
    expect(f).toHaveLength(2);
  });
});

describe('volgorde van items', () => {
  const times = (skill: string, n: number) => Array.from({ length: n }, () => ({ skill, review: false }));

  it('blijft een reeks van vier bij hetzelfde soort opdracht, en wisselt pas daarna', () => {
    expect(PLAN_RULES.runLength).toBe(4);
    expect(pickNext(input({}))).toEqual({ kind: 'learn', skill: 'a' });
    for (let n = 1; n < 4; n++) expect(pickNext(input({}, { played: times('a', n) }))).toEqual({ kind: 'learn', skill: 'a' });
    expect(pickNext(input({}, { played: times('a', 4) }))).toEqual({ kind: 'learn', skill: 'los' });
    expect(pickNext(input({}, { played: [...times('a', 4), ...times('los', 2)] }))).toEqual({ kind: 'learn', skill: 'los' });
  });

  it('een herhaling komt alleen tussen twee reeksen, nooit midden in een reeks', () => {
    const states = { a: mastered(today), b: practicing() };
    expect(pickNext(input(states))).toEqual({ kind: 'review', skill: 'a' });
    const afterReview = [{ skill: 'a', review: true }];
    expect(pickNext(input(states, { played: afterReview }))).toEqual({ kind: 'learn', skill: 'b' });
    for (let n = 1; n < 4; n++) {
      expect(pickNext(input({ a: mastered(today), b: practicing() }, { played: times('b', n) }))).toEqual({ kind: 'learn', skill: 'b' });
    }
    expect(pickNext(input({ a: mastered(today), b: practicing() }, { played: times('b', 4) }))).toEqual({ kind: 'review', skill: 'a' });
  });

  it('weet waar een reeks ophoudt', () => {
    expect(atRunBoundary(input({}))).toBe(true);
    expect(atRunBoundary(input({}, { played: times('a', 2) }))).toBe(false);
    expect(atRunBoundary(input({}, { played: times('a', 4) }))).toBe(true);
    expect(atRunBoundary(input({}, { played: times('a', 5) }))).toBe(false);
    expect(atRunBoundary(input({}, { played: [{ skill: 'a', review: true }] }))).toBe(true);
  });

  it('herhaalt een vaardigheid niet twee keer in één sessie', () => {
    const states = { a: mastered(today), b: practicing() };
    const played = [{ skill: 'b', review: false }, { skill: 'a', review: true }, { skill: 'b', review: false }, { skill: 'b', review: false }];
    expect(pickNext(input(states, { played }))?.kind).toBe('learn');
  });

  it('een voorgedaan item van een ander soort wacht tot de reeks klaar is', () => {
    const entry = scheduleRetry({ skill: 'los', activity: 'tellen', level: 0, params: {} }, 1);
    expect(pickNext(input({}, { played: times('a', 3), retries: [entry] }))).toEqual({ kind: 'learn', skill: 'a' });
    expect(pickNext(input({}, { played: times('a', 4), retries: [entry] }))).toEqual({ kind: 'retry', entry });
  });

  it('laat een voorgedaan item terugkomen, met minstens twee andere items ertussen', () => {
    const entry = scheduleRetry({ skill: 'a', activity: 'mandje', level: 0, params: { n: 4 } }, 1);
    const played = [{ skill: 'a', review: false }];
    expect(pickNext(input({}, { played, retries: [entry] }))?.kind).toBe('learn');
    const twoMore = [...played, { skill: 'los', review: false }, { skill: 'a', review: false }];
    expect(pickNext(input({}, { played: twoMore, retries: [entry] }))).toEqual({ kind: 'retry', entry });
  });

  it('kiest onderhoud als alles beheerst is', () => {
    const states = { a: mastered(), b: mastered(), c: mastered(), los: mastered() };
    states.a.lastPracticed = '2026-10-30';
    states.b.lastPracticed = '2026-10-20';
    states.c.lastPracticed = '2026-10-31';
    states.los.lastPracticed = '2026-10-29';
    expect(pickNext(input(states))).toEqual({ kind: 'review', skill: 'b' });
  });

  it('controleert aangenomen vaardigheden in de eerste sessie', () => {
    const states = { a: assumeMastered(skills[0], today) };
    expect(pickNext(input(states))).toEqual({ kind: 'review', skill: 'a' });
  });
});

describe('keuzemomenten', () => {
  const acts: Record<string, string[]> = { a: ['mandje', 'tellen'], b: ['foutje'], c: ['foutje'], los: ['tellen'] };
  const activitiesFor = (s: string) => acts[s] ?? [];
  const played = (n: number) => Array.from({ length: n }, () => ({ skill: 'a', review: false }));

  it('komt aan het begin van een nieuwe reeks, niet bij het eerste item', () => {
    const at = [0, 1, 2, 3, 4, 5, 6, 7, 8].map((n) => isChoiceMoment(input({}, { played: played(n) })));
    expect(at).toEqual([false, false, false, false, true, false, false, false, true]);
  });

  it('biedt twee verschillende activiteiten, ook van de andere vaardigheid aan de grens', () => {
    const o = choiceOptions(input({}, { played: played(4) }), activitiesFor);
    // De planner kiest 'los' (langst geleden); daarna zou 'a' komen.
    expect(o.map((x) => x.activity)).toEqual(['tellen', 'mandje']);
    expect(o.map((x) => x.skill)).toEqual(['los', 'a']);
  });

  it('valt terug op het volgende item als er maar één activiteit is', () => {
    const states = { a: mastered(), b: practicing() };
    const o = choiceOptions(input(states, { played: [{ skill: 'b', review: false }] }), activitiesFor);
    expect(o).toHaveLength(2);
    expect(new Set(o.map((x) => x.activity)).size).toBe(2);
  });

  it('geen keuze als een voorgedaan item terug moet komen', () => {
    const entry = scheduleRetry({ skill: 'a', activity: 'mandje', level: 0, params: {} }, 0);
    expect(choiceOptions(input({}, { played: played(3), retries: [entry] }), activitiesFor)).toEqual([]);
  });

  it('geen keuze als er maar één activiteit in het plan past', () => {
    const only = (s: string) => (s === 'a' || s === 'los' ? ['mandje'] : []);
    expect(choiceOptions(input({}, { played: played(3) }), only)).toEqual([]);
  });
});
