import { describe, expect, it } from 'vitest';
import { gluedJoins, clipJobs, segIds } from '../src/core/audio/phrases';
import type { Seg } from '../src/core/audio/speech';
import { initialState } from '../src/core/engine/mastery';
import { byPractice, chooseMission, missionAtEnd, missionFollowUpDue } from '../src/core/session/flow';
import { emptyData, normalize, type DayMission } from '../src/core/storage/store';
import { dayCard, dayCardText } from '../src/core/ui/parent-extra';
import { MOMENTS } from '../src/core/ui/moments';
import { SPRAAK } from '../src/content/spraak.nl';
import { ALL_PHRASES, DOMAINS } from '../src/domains';

const SKILLS = DOMAINS.flatMap((d) => d.skills);
const mission = (date: string, asked = false): DayMission => ({ line: 'missie.tellen-10.a', skill: 'tellen-10', moment: 'trap', date, asked });

describe('opdracht voor de rest van de dag: inhoud', () => {
  it('elke vaardigheid heeft opdrachten, met een bestaand zinnetje en plaatje', () => {
    for (const s of SKILLS) {
      expect(s.missions?.length, s.id).toBeGreaterThan(0);
      for (const m of s.missions!) {
        expect(SPRAAK[m.line as keyof typeof SPRAAK], m.line).toMatch(/^Als .*[.?!]$/);
        expect(MOMENTS).toContain(m.moment);
      }
    }
  });

  it('wat Fluffy zegt, is nergens midden in een zin geplakt', () => {
    const ids = new Set(clipJobs(ALL_PHRASES()).map((j) => j.id));
    const lines = SKILLS.flatMap((s) => s.missions!.map((m) => m.line));
    const sentences: Seg[][] = lines.flatMap((l) => [
      ['missie.start', l, 'missie.plaatje'], ['missie.vergeet', l], ['missie.nogeens', l], ['missie.terug.a', l, 'missie.terug.b'],
    ]);
    expect(sentences.flatMap((s) => gluedJoins(segIds(s), (id) => ids.has(id)))).toEqual([]);
  });
});

describe('opdracht voor de rest van de dag: wanneer', () => {
  it('vraagt er een volgende dag één keer naar', () => {
    expect(missionFollowUpDue(null, '2026-11-09')).toBe(false);
    expect(missionFollowUpDue(mission('2026-11-08'), '2026-11-08')).toBe(false);
    expect(missionFollowUpDue(mission('2026-11-08'), '2026-11-09')).toBe(true);
    expect(missionFollowUpDue(mission('2026-11-08', true), '2026-11-09')).toBe(false);
  });

  it('geeft hooguit één nieuwe opdracht per dag; daarna noemt Fluffy die nog eens', () => {
    expect(missionAtEnd(null, '2026-11-08')).toBe('nieuw');
    expect(missionAtEnd(mission('2026-11-07'), '2026-11-08')).toBe('nieuw');
    expect(missionAtEnd(mission('2026-11-08'), '2026-11-08')).toBe('herinner');
  });

  it('kiest bij wat ze nog oefent, en de opdracht die ze het minst kreeg', () => {
    const states = { a: { ...initialState(), status: 'mastered' as const }, b: { ...initialState(), status: 'practicing' as const } };
    expect(byPractice(['a', 'c', 'b'], states)).toEqual(['b', 'c', 'a']);
    const missions: Record<string, { line: string }[]> = { a: [{ line: 'x' }], b: [{ line: 'y' }, { line: 'z' }] };
    expect(chooseMission(['b', 'a'], (id) => missions[id], { y: 1 }, () => 0)).toEqual({ skill: 'b', mission: { line: 'z' } });
    expect(chooseMission(['c', 'a'], (id) => missions[id], {}, () => 0)).toEqual({ skill: 'a', mission: { line: 'x' } });
    expect(chooseMission(['c'], (id) => missions[id], {}, () => 0)).toBe(null);
  });
});

describe('opdracht voor de rest van de dag: opslag', () => {
  it('bewaart een geldige opdracht en laat rare dingen weg', () => {
    const d = { ...emptyData(), mission: mission('2026-11-08') };
    expect(normalize(JSON.parse(JSON.stringify(d)))!.mission).toEqual(mission('2026-11-08'));
    expect(normalize({ ...d, mission: { ...mission('2026-11-08'), line: 'echt.x' } })!.mission).toBe(null);
    expect(normalize({ ...d, mission: { ...mission('2026-11-08'), moment: 'maan' } })!.mission).toBe(null);
    expect(normalize({ ...emptyData(), mission: undefined })!.mission).toBe(null);
    expect(normalize(emptyData())!.settings.mission).toBe(true);
  });
});

describe('dagkaart voor de ouder', () => {
  const today = '2026-11-08';
  const data = () => {
    const d = emptyData();
    d.sessions.push({ id: 's1', date: today, start: 1, end: 2, activeMs: 600_000, items: 8, firstTry: 6, helped: 2, activities: [], skills: ['vormen', 'tellen-10'] });
    d.skills['tellen-10'] = { ...initialState(), status: 'practicing' };
    d.mission = mission(today);
    return d;
  };

  it('noemt de opdracht van vandaag, en ideeën bij gewone momenten', () => {
    const card = dayCard(data(), DOMAINS, today)!;
    expect(card.when).toBe('vandaag');
    expect(card.mission).toBe(SPRAAK['missie.tellen-10.a']);
    expect(card.practiced[0]).toBe('tellen tot 10');
    // De opdracht zelf staat er niet nog eens bij; het moment vervangt "Als je …:".
    expect(card.moments.some((t) => t.includes('treden'))).toBe(false);
    expect(card.moments[0]).toMatch(/^Onderweg: doe tien stappen/);
    expect(card.games.length).toBe(2);
  });

  it('geen opdracht van een eerdere dag; niets als er nog niet gespeeld is', () => {
    expect(dayCard({ ...data(), mission: mission('2026-11-07') }, DOMAINS, today)!.mission).toBe(null);
    expect(dayCard(emptyData(), DOMAINS, today)).toBe(null);
  });

  it('als tekst om te delen', () => {
    const text = dayCardText(dayCard(data(), DOMAINS, today)!, '');
    expect(text.split('\n')[0]).toBe('Vandaag samen met haar');
    expect(text).toContain('Vraag er eens naar!');
    expect(text).toContain('- Onderweg:');
  });
});
