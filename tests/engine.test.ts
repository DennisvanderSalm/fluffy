import { describe, expect, it } from 'vitest';
import { assumeMastered, initialState, isReviewDue, recordAttempt, RULES } from '../src/core/engine/mastery';
import type { Credit, SkillDef, SkillState } from '../src/core/engine/types';

const def: SkillDef = { id: 'hoeveel-10', domain: 'rekenen', requires: [], levels: 3 };
const today = '2026-11-01';

function run(credits: Credit[], start: SkillState = initialState(), session = 's1', date = today): SkillState {
  return credits.reduce((s, credit) => recordAttempt(def, s, { credit, session, today: date }), start);
}

describe('niveau-trap', () => {
  it('gaat een niveau omhoog na 4 keer op eigen kracht goed', () => {
    const s = run([1, 1, 1]);
    expect(s.level).toBe(0);
    expect(run([1, 1, 1, 1]).level).toBe(1);
  });

  it('gaat niet omhoog rond 80% (dat is precies het doelgebied)', () => {
    // 1, 1, 0, 1, 1 → 0,8
    expect(run([1, 1, 0, 1, 1]).level).toBe(0);
  });

  it('telt hulp mee: goed na een hint is een halve', () => {
    // 1, 1, 0.5, 1 → 0,875 ≥ 0,85
    expect(run([1, 1, 0.5, 1]).level).toBe(1);
    // 1, 0.5, 0.5, 1, 1 → 0,8
    expect(run([1, 0.5, 0.5, 1, 1]).level).toBe(0);
  });

  it('gaat een niveau omlaag als het drie keer niet zelf lukt', () => {
    const up = run([1, 1, 1, 1]);
    expect(up.level).toBe(1);
    expect(run([0, 0.5, 0], up).level).toBe(0);
  });

  it('zakt niet door één misser', () => {
    const up = run([1, 1, 1, 1]);
    expect(run([0, 1, 1], up).level).toBe(1);
  });

  it('zakt nooit onder niveau 0', () => {
    expect(run([0, 0, 0, 0, 0]).level).toBe(0);
  });

  it('begint de teller opnieuw na een niveauwissel', () => {
    const up = run([1, 1, 1, 1]);
    expect(up.atLevel).toHaveLength(0);
  });
});

describe('mastery = stabiel, over meerdere sessies', () => {
  const top = () => run([1, 1, 1, 1, 1, 1, 1, 1]); // twee keer omhoog → hoogste niveau

  it('is na veel succes in één sessie nog niet beheerst', () => {
    const s = run([1, 1, 1, 1, 1, 1, 1, 1], top());
    expect(s.level).toBe(def.levels - 1);
    expect(s.status).toBe('practicing');
  });

  it('is beheerst als het succes over twee sessies verdeeld is', () => {
    const s1 = run([1, 1, 1], top(), 's1');
    const s2 = run([1, 1, 1], s1, 's2', '2026-11-02');
    expect(s2.status).toBe('mastered');
    expect(s2.review).toEqual({ box: 0, due: '2026-11-03' });
  });

  it('vraagt ≥85% op het hoogste niveau', () => {
    const s1 = run([1, 0, 1], top(), 's1');
    const s2 = run([1, 0, 1], s1, 's2');
    expect(s2.status).toBe('practicing');
  });
});

describe('gespreide herhaling', () => {
  const mastered = (): SkillState => ({
    ...initialState(),
    status: 'mastered',
    level: 2,
    review: { box: 0, due: today },
  });

  it('schuift een vak op als de herhaling zelf lukt', () => {
    const s = run([1], mastered());
    expect(s.review).toEqual({ box: 1, due: '2026-11-04' }); // +3 dagen
    expect(run([1, 1], mastered()).review?.box).toBe(2);
  });

  it('blijft in het vak bij hulp, maar komt morgen terug', () => {
    expect(run([0.5], mastered()).review).toEqual({ box: 0, due: '2026-11-02' });
  });

  it('gaat na twee mislukte herhalingen terug naar oefenen, net onder het hoogste niveau', () => {
    const once = run([0], mastered());
    expect(once.status).toBe('mastered');
    expect(once.lapses).toBe(1);
    const twice = run([0], once);
    expect(twice.status).toBe('practicing');
    expect(twice.level).toBe(def.levels - 2);
  });

  it('een geslaagde herhaling wist eerdere missers', () => {
    expect(run([0, 1], mastered()).lapses).toBe(0);
  });

  it('intervallen lopen op tot maximaal 30 dagen', () => {
    const s = run([1, 1, 1, 1, 1, 1, 1], mastered());
    expect(s.review?.box).toBe(RULES.reviewIntervals.length - 1);
    expect(s.review?.due).toBe('2026-12-01');
  });

  it('is aan de beurt op of na de datum', () => {
    expect(isReviewDue(mastered(), today)).toBe(true);
    expect(isReviewDue(mastered(), '2026-10-31')).toBe(false);
    expect(isReviewDue(initialState(), today)).toBe(false);
  });
});

describe('startniveau (aangenomen beheerst)', () => {
  it('wordt vandaag al gecontroleerd', () => {
    const s = assumeMastered(def, today);
    expect(s.assumed).toBe(true);
    expect(isReviewDue(s, today)).toBe(true);
  });

  it('één keer niet gelukt is genoeg om weer te oefenen', () => {
    const s = run([0], assumeMastered(def, today));
    expect(s.status).toBe('practicing');
    expect(s.assumed).toBe(false);
  });

  it('wordt echt beheerst na een geslaagde controle', () => {
    const s = run([1], assumeMastered(def, today));
    expect(s.status).toBe('mastered');
    expect(s.assumed).toBe(false);
  });
});

describe('geen tijd als maat', () => {
  it('de invoer van een poging bevat geen tijd of snelheid', () => {
    const input: Parameters<typeof recordAttempt>[2] = { credit: 1, session: 's', today };
    expect(Object.keys(input).sort()).toEqual(['credit', 'session', 'today']);
  });
});
