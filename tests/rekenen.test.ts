import { describe, expect, it } from 'vitest';
import { seededRng } from '../src/core/util';
import { countScript, FOUTJE_LEVELS, isCorrectCount, makeFoutjeItem, type FoutjeItem } from '../src/domains/rekenen/foutje';
import { answerOptions, makeTellenItem, TELLEN_LEVELS } from '../src/domains/rekenen/tellen';
import { layoutPositions } from '../src/domains/rekenen/veld';
import { KIEKEBOE_LEVELS, makeKiekeboeItem } from '../src/domains/rekenen/kiekeboe';
import { loosePoints, patternPoints, patternSvg, VIEW, type Pattern } from '../src/domains/rekenen/stippen';
import { rekenen } from '../src/domains/rekenen';

const item = (over: Partial<FoutjeItem>): FoutjeItem => ({
  n: 5, layout: 'rij', animal: 'eendje', error: 'geen', at: 0, claim: 5, ...over,
});

describe('Fluffy telt fout: hoe Fluffy telt', () => {
  it('telt goed: elk beestje één keer, getallen op volgorde', () => {
    expect(countScript(item({}))).toEqual([1, 2, 3, 4, 5].map((w, i) => ({ obj: i, word: w })));
  });

  it('slaat een beestje over', () => {
    const s = countScript(item({ error: 'overslaan', at: 2, claim: 4 }));
    expect(s.map((x) => x.obj)).toEqual([0, 1, 3, 4]);
    expect(s.at(-1)!.word).toBe(4);
  });

  it('telt een beestje dubbel', () => {
    const s = countScript(item({ error: 'dubbel', at: 1, claim: 6 }));
    expect(s.map((x) => x.obj)).toEqual([0, 1, 1, 2, 3, 4]);
    expect(s.map((x) => x.word)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('slaat een telwoord over', () => {
    const s = countScript(item({ error: 'getal', at: 3, claim: 6 }));
    expect(s.map((x) => x.word)).toEqual([1, 2, 4, 5, 6]);
    expect(s.map((x) => x.obj)).toEqual([0, 1, 2, 3, 4]);
  });

  it('telt in een andere volgorde, en dat is goed', () => {
    const s = countScript(item({ error: 'volgorde' }));
    expect(s.map((x) => x.obj)).toEqual([4, 3, 2, 1, 0]);
    expect(isCorrectCount('volgorde')).toBe(true);
  });

  it('het eindgetal klopt alleen als Fluffy goed telt', () => {
    const rng = seededRng(7);
    for (let i = 0; i < 300; i++) {
      const it = makeFoutjeItem('telbegrip', i % 3, rng);
      const last = countScript(it).at(-1)!.word;
      if (it.error === 'eind') expect(it.claim).not.toBe(last);
      else expect(it.claim).toBe(last);
      expect(it.claim === it.n).toBe(isCorrectCount(it.error));
    }
  });

  it('gebruikt per niveau alleen de fouten van dat niveau', () => {
    const rng = seededRng(3);
    for (let level = 0; level < FOUTJE_LEVELS.length; level++) {
      for (let i = 0; i < 100; i++) {
        const it = makeFoutjeItem('telbegrip', level, rng);
        if (!isCorrectCount(it.error)) expect(FOUTJE_LEVELS[level][2]).toContain(it.error);
        if (it.error === 'volgorde') expect(level).toBe(2);
      }
    }
  });

  it('geeft niet drie keer achter elkaar hetzelfde antwoord', () => {
    const rng = seededRng(11);
    const answers = Array.from({ length: 200 }, () => isCorrectCount(makeFoutjeItem('telbegrip', 1, rng).error));
    for (let i = 2; i < answers.length; i++) {
      expect(answers[i] === answers[i - 1] && answers[i] === answers[i - 2]).toBe(false);
    }
  });
});

describe('Samen tellen', () => {
  it('geeft drie verschillende kaartjes tussen 1 en 10, met het goede antwoord erbij', () => {
    const rng = seededRng(5);
    for (let n = 1; n <= 10; n++) {
      const o = answerOptions(n, rng);
      expect(o).toHaveLength(3);
      expect(o).toContain(n);
      expect(new Set(o).size).toBe(3);
      expect(o.every((k) => k >= 1 && k <= 10)).toBe(true);
      expect(o).toEqual([...o].sort((a, b) => a - b));
    }
  });

  it('blijft binnen het bereik van elk niveau', () => {
    const rng = seededRng(9);
    for (const [skill, rows] of Object.entries(TELLEN_LEVELS)) {
      rows.forEach(([min, max], level) => {
        for (let i = 0; i < 50; i++) {
          const it = makeTellenItem(skill, level, rng);
          expect(it.n).toBeGreaterThanOrEqual(min);
          expect(it.n).toBeLessThanOrEqual(max);
        }
      });
    }
  });

  it('bij "hoeveel" telt Fluffy op de hogere niveaus niet meer mee', () => {
    expect(TELLEN_LEVELS['hoeveel-10'].map((r) => r[3])).toEqual([true, false, false]);
    expect(TELLEN_LEVELS['tellen-10'].every((r) => r[3])).toBe(true);
  });
});

describe('opstelling van de beestjes', () => {
  it('blijft binnen het veld en zonder overlap', () => {
    const rng = seededRng(1);
    for (const layout of ['rij', 'rijen', 'los'] as const) {
      const n = layout === 'rij' ? 5 : 10;
      const pos = layoutPositions(layout, n, rng);
      expect(pos).toHaveLength(n);
      for (const [x, y] of pos) {
        expect(x).toBeGreaterThan(0);
        expect(x).toBeLessThan(1);
        expect(y).toBeGreaterThan(0);
        expect(y).toBeLessThan(1);
      }
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          // Minstens ongeveer een halve vakbreedte (1/6) uit elkaar.
          expect(Math.hypot(pos[i][0] - pos[j][0], (pos[i][1] - pos[j][1]) / 2)).toBeGreaterThan(0.08);
        }
      }
    }
  });
});

describe('domein rekenen', () => {
  it('elke vaardigheid van een activiteit bestaat en heeft niveaus voor die activiteit', () => {
    const ids = new Set(rekenen.skills.map((s) => s.id));
    const rng = seededRng(2);
    for (const a of rekenen.activities) {
      for (const skill of a.skills) {
        expect(ids.has(skill)).toBe(true);
        const levels = rekenen.skills.find((s) => s.id === skill)!.levels;
        for (let level = 0; level < levels; level++) expect(a.makeItem(skill, level, rng)).toBeTruthy();
      }
    }
  });

  it('elke voorwaarde verwijst naar een bestaande vaardigheid', () => {
    const ids = new Set(rekenen.skills.map((s) => s.id));
    for (const s of rekenen.skills) for (const r of s.requires) expect(ids.has(r)).toBe(true);
  });
});

describe('Kiekeboe-stippen', () => {
  it('heeft voor elk plaatje precies n punten om aan te wijzen, binnen het plaatje', () => {
    const rng = seededRng(4);
    const cases: [Pattern, number, number][] = [['dobbel', 1, 6], ['los', 1, 5], ['vingers', 1, 10], ['tienveld', 1, 10], ['dobbels', 6, 10]];
    for (const [pattern, min, max] of cases) {
      for (let n = min; n <= max; n++) {
        const loose = pattern === 'los' ? loosePoints(n, rng) : [];
        const pts = patternPoints(pattern, n, loose);
        expect(pts).toHaveLength(n);
        for (const p of pts) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(VIEW.w);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(VIEW.h);
        }
        expect(patternSvg(pattern, n, loose)).toMatch(/^<svg/);
      }
    }
  });

  it('losse stippen liggen nooit op elkaar', () => {
    const rng = seededRng(8);
    for (let i = 0; i < 50; i++) {
      const pts = loosePoints(5, rng);
      for (let a = 0; a < pts.length; a++) {
        for (let b = a + 1; b < pts.length; b++) expect(Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y)).toBeGreaterThan(70);
      }
    }
  });

  it('blijft binnen het bereik van elk niveau, en "vijf en nog wat" alleen boven de vijf', () => {
    const rng = seededRng(12);
    for (const [skill, rows] of Object.entries(KIEKEBOE_LEVELS)) {
      rows.forEach(([min, max, patterns], level) => {
        for (let i = 0; i < 60; i++) {
          const it = makeKiekeboeItem(skill, level, rng);
          expect(it.n).toBeGreaterThanOrEqual(min);
          expect(it.n).toBeLessThanOrEqual(max);
          expect([...patterns, 'tienveld']).toContain(it.pattern);
          if (it.pattern === 'dobbels') expect(it.n).toBeGreaterThan(5);
          expect(it.options).toContain(it.n);
        }
      });
    }
  });

  it('laat het plaatje langer zien op de makkelijke niveaus, en nooit korter dan 2 seconden', () => {
    for (const rows of Object.values(KIEKEBOE_LEVELS)) {
      const ms = rows.map((r) => r[3]);
      expect(ms[0]).toBeGreaterThanOrEqual(ms[ms.length - 1]);
      expect(Math.min(...ms)).toBeGreaterThanOrEqual(2000);
    }
  });
});
