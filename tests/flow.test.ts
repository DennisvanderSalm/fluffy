import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { clipJobs } from '../src/core/audio/phrases';
import type { DomainModule } from '../src/core/domain';
import { initialState } from '../src/core/engine/mastery';
import type { PlannerInput } from '../src/core/engine/planner';
import { easyWin, pickRealTask, togetherDue, warmUpSkill } from '../src/core/session/flow';
import { backupDue, emptyData } from '../src/core/storage/store';
import { ALL_PHRASES } from '../src/domains';

const skill = (id: string) => ({ id, domain: 'x', requires: [], levels: 3 });
const mastered = (due: string, box = 1) => ({ ...initialState(), status: 'mastered' as const, review: { box, due } });
const input = (states: PlannerInput['states'], ids = ['a', 'b']): PlannerInput => ({
  skills: ids.map(skill), playable: new Set(ids), states, today: '2026-11-07', played: [], retries: [],
});

describe('samen-momenten', () => {
  it('bij "af en toe" twee keer, na het vierde en het tiende item', () => {
    const hits = Array.from({ length: 30 }, (_, i) => i + 1).filter((n) => togetherDue('echt', n));
    expect(hits).toEqual([4, 10]);
  });
  it('kiest een opdracht die ze het minst vaak gehad heeft', () => {
    const tasks = ['a', 'b', 'c'];
    expect(pickRealTask(tasks, { a: 2, b: 1, c: 2 }, () => 0.99)).toBe('b');
    expect(pickRealTask(tasks, { a: 1 }, () => 0)).toBe('b');
    expect(pickRealTask(tasks, { a: 1 }, () => 0.99)).toBe('c');
    // Alles even vaak: dan maakt het niet uit.
    expect(tasks).toContain(pickRealTask(tasks, {}, Math.random));
  });
  it('bij "samen" om de vier items, en nooit als het uit staat', () => {
    expect(Array.from({ length: 13 }, (_, i) => i).filter((n) => togetherDue('samen', n))).toEqual([4, 8, 12]);
    expect(Array.from({ length: 30 }, (_, i) => i).some((n) => togetherDue('uit', n))).toBe(false);
  });
});

describe('opwarmer uit het andere vak', () => {
  const rekenen = { id: 'rekenen', activities: [{}] } as unknown as DomainModule;
  const lezen = { id: 'lezen', activities: [{}] } as unknown as DomainModule;
  const due = input({ a: mastered('2026-11-01') });
  const inputFor = (d: DomainModule) => (d === lezen ? due : input({}));

  it('kiest een herhaling uit het vak waar ze nu níet mee bezig is', () => {
    expect(warmUpSkill('kiezen', [rekenen, lezen], rekenen, inputFor)).toBe('a');
    expect(warmUpSkill('kiezen', [rekenen, lezen], lezen, inputFor)).toBe(null);
  });
  it('niet als de ouder het vak heeft vastgezet, en niet als er niets aan de beurt is', () => {
    expect(warmUpSkill('rekenen', [rekenen, lezen], rekenen, inputFor)).toBe(null);
    expect(warmUpSkill('kiezen', [rekenen, lezen], rekenen, () => input({ a: mastered('2026-12-01') }))).toBe(null);
  });
});

describe('succesje na een lastig stukje', () => {
  it('liefst hetzelfde soort opdracht één stap makkelijker (dan blijft de reeks van één soort); telt niet mee', () => {
    const r = easyWin(input({ a: mastered('2026-12-01', 2), b: { ...initialState(), status: 'practicing', level: 2 } }), 'b');
    expect(r).toEqual({ skill: 'b', level: 1, record: false });
  });
  it('op de eerste stap: iets wat ze al stevig kan; dat telt gewoon mee', () => {
    const r = easyWin(input({ a: mastered('2026-12-01', 2), b: { ...initialState(), status: 'practicing', level: 0 } }), 'b');
    expect(r).toEqual({ skill: 'a', level: 0, record: true });
  });
  it('anders valt er niets makkelijkers te kiezen', () => {
    expect(easyWin(input({ b: { ...initialState(), status: 'practicing', level: 0 } }), 'b')).toBe(null);
    expect(easyWin(input({}), undefined)).toBe(null);
  });
});

describe('back-upherinnering', () => {
  const DAY = 86_400_000;
  const now = Date.parse('2026-11-07T12:00:00Z');
  const withSessions = (n: number, start = now - DAY) => {
    const d = emptyData();
    for (let i = 0; i < n; i++) d.sessions.push({ id: `s${i}`, date: '', start: start + i, activeMs: 0, items: 3, firstTry: 3, helped: 0, activities: [], skills: [] });
    return d;
  };
  it('pas na een paar keer spelen, en niet als de back-up recent is', () => {
    expect(backupDue(withSessions(2), now)).toBe(null);
    expect(backupDue(withSessions(3), now)).toBe('nooit');
    expect(backupDue({ ...withSessions(3), lastBackup: now - 5 * DAY }, now)).toBe(null);
  });
  it('na een maand, maar alleen als er sindsdien gespeeld is', () => {
    expect(backupDue({ ...withSessions(3), lastBackup: now - 40 * DAY }, now)).toBe('oud');
    expect(backupDue({ ...withSessions(3, now - 50 * DAY), lastBackup: now - 40 * DAY }, now)).toBe(null);
  });
});

describe('opnames', () => {
  // Vangt een vergeten "npm run stem": dan zou Fluffy die zinnen met de computerstem zeggen.
  it('elke zin die de app zegt heeft een opname, en elk bestand bestaat', () => {
    const clips = JSON.parse(readFileSync('public/audio/nl/manifest.json', 'utf8')).clips as Record<string, string>;
    const missing = clipJobs(ALL_PHRASES()).map((j) => j.id).filter((id) => !clips[id]);
    expect(missing).toEqual([]);
    for (const f of new Set(Object.values(clips))) expect(existsSync(`public/audio/nl/${f}`), f).toBe(true);
  });
});
