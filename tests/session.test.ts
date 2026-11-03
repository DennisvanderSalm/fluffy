import { describe, expect, it } from 'vitest';
import {
  canStartSession, closeDangling, DEFAULT_SETTINGS, MIN_COUNTED_MS, playUntilTimeUp, SessionClock, type SessionRecord,
} from '../src/core/session/session';

const MIN = 60_000;
const t0 = new Date(2026, 10, 1, 9, 0).getTime();

function rec(start: number, activeMs: number): SessionRecord {
  return {
    id: `s${start}`, date: '2026-11-01', start, end: start + activeMs, activeMs,
    items: 5, firstTry: 4, helped: 1, activities: ['mandje'], skills: ['hoeveel-10'],
  };
}

describe('SessionClock', () => {
  it('telt alleen de tijd dat er gespeeld wordt', () => {
    let now = t0;
    const clock = new SessionClock(10 * MIN, () => now);
    clock.start();
    now += 4 * MIN;
    clock.pause(); // ouderdeel open
    now += 30 * MIN;
    clock.start();
    now += 5 * MIN;
    expect(clock.elapsed()).toBe(9 * MIN);
    expect(clock.isTimeUp()).toBe(false);
    now += MIN;
    expect(clock.isTimeUp()).toBe(true);
  });

  it('dubbel starten of pauzeren verandert niets', () => {
    let now = t0;
    const clock = new SessionClock(MIN, () => now);
    clock.start();
    now += 1000;
    clock.start();
    now += 1000;
    clock.pause();
    clock.pause();
    expect(clock.elapsed()).toBe(2000);
  });
});

describe('playUntilTimeUp', () => {
  it('maakt de lopende opdracht af en begint daarna geen nieuwe', async () => {
    let now = 0;
    const clock = new SessionClock(10, () => now);
    clock.start();
    const finished: number[] = [];
    let started = 0;
    const n = await playUntilTimeUp(clock, async () => {
      const me = ++started;
      // Tijdens item 2 loopt de tijd af…
      now += me === 2 ? 20 : 3;
      await Promise.resolve();
      finished.push(me); // …maar item 2 wordt nog wel afgemaakt.
      return true;
    });
    expect(n).toBe(2);
    expect(finished).toEqual([1, 2]);
    expect(started).toBe(2);
  });

  it('speelt altijd minstens één item', async () => {
    const n = await playUntilTimeUp({ isTimeUp: () => true }, async () => true);
    expect(n).toBe(1);
  });

  it('stopt als er niets meer te spelen is', async () => {
    const n = await playUntilTimeUp({ isTimeUp: () => false }, async () => false);
    expect(n).toBe(0);
  });
});

describe('canStartSession', () => {
  const settings = { ...DEFAULT_SETTINGS, restMinutes: 60, maxSessionsPerDay: 0 };

  it('mag starten als er nog niets gespeeld is', () => {
    expect(canStartSession([], settings, t0, null)).toEqual({ ok: true });
  });

  it('houdt een rustpauze na een sessie', () => {
    const r = rec(t0, 10 * MIN);
    const end = r.end!;
    expect(canStartSession([r], settings, end + 30 * MIN, null)).toEqual({ ok: false, reason: 'rest', until: end + 60 * MIN });
    expect(canStartSession([r], settings, end + 61 * MIN, null)).toEqual({ ok: true });
  });

  it('negeert een sessie die per ongeluk kort was', () => {
    const r = rec(t0, MIN_COUNTED_MS - 1);
    expect(canStartSession([r], settings, r.end! + 1000, null)).toEqual({ ok: true });
  });

  it('respecteert het dagmaximum', () => {
    const s = { ...settings, maxSessionsPerDay: 2 };
    const records = [rec(t0, 10 * MIN), rec(t0 + 3 * 60 * MIN, 10 * MIN)];
    expect(canStartSession(records, s, t0 + 8 * 60 * MIN, null)).toEqual({ ok: false, reason: 'daily-max' });
    const nextDay = new Date(2026, 10, 2, 9, 0).getTime();
    expect(canStartSession(records, s, nextDay, null)).toEqual({ ok: true });
  });

  it('de ouder kan één keer een nieuwe sessie toestaan', () => {
    const r = rec(t0, 10 * MIN);
    expect(canStartSession([r], settings, r.end! + MIN, r.end! + 1000)).toEqual({ ok: true });
    // Een toestemming van vóór het laatste einde telt niet meer.
    expect(canStartSession([r], settings, r.end! + MIN, r.end! - 1000).ok).toBe(false);
  });
});

describe('closeDangling', () => {
  it('sluit een sessie af die nooit netjes eindigde', () => {
    const open: SessionRecord = { ...rec(t0, 5 * MIN), end: undefined };
    expect(closeDangling([open])[0].end).toBe(t0 + 5 * MIN);
  });
});
