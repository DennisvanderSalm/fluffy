import type { DomainModule } from '../domain';
import { initialState } from '../engine/mastery';
import { dueReviews, easyPick, type PlannerInput } from '../engine/planner';
import type { SkillState } from '../engine/types';
import type { DayMission } from '../storage/store';
import type { Settings } from './session';

/**
 * Beslisregels voor het verloop van een sessie, los van het scherm (zodat ze te testen zijn).
 * De app (core/ui/app.ts) voert ze uit.
 */

/**
 * Is het nu tijd voor een opdracht in het echt? `count` = aantal gespeelde items.
 * Bij 'echt' twee keer per sessie (na het vierde en het tiende item), bij 'samen' om de vier items.
 */
export function togetherDue(mode: Settings['together'], count: number): boolean {
  if (mode === 'samen') return count > 0 && count % 4 === 0;
  return mode === 'echt' && (count === 4 || count === 10);
}

/** Wat ze oefende, op volgorde van aandacht: eerst wat ze nog oefent, dan nieuw, dan beheerst. */
export function byPractice(ids: readonly string[], states: Readonly<Record<string, SkillState | undefined>>): string[] {
  const rank = (id: string) => {
    const st = states[id]?.status;
    return st === 'practicing' ? 0 : st === 'mastered' ? 2 : 1;
  };
  return [...ids].sort((a, b) => rank(a) - rank(b));
}

/** Vraagt Fluffy deze keer naar de opdracht van een eerdere dag? */
export function missionFollowUpDue(m: DayMission | null, today: string): boolean {
  return !!m && !m.asked && m.date < today;
}

/** Aan het eind: een nieuwe opdracht, of (als ze vandaag al een opdracht kreeg) die nog eens noemen. */
export function missionAtEnd(m: DayMission | null, today: string): 'nieuw' | 'herinner' {
  return m && m.date === today ? 'herinner' : 'nieuw';
}

/**
 * Kiest de opdracht voor de rest van de dag: bij de eerste vaardigheid (in volgorde van aandacht)
 * die opdrachten heeft, de opdracht die ze het minst vaak kreeg.
 */
export function chooseMission<M extends { line: string }>(
  skills: readonly string[], missionsOf: (id: string) => readonly M[] | undefined,
  seen: Readonly<Record<string, number>>, rng: () => number,
): { skill: string; mission: M } | null {
  for (const skill of skills) {
    const list = missionsOf(skill);
    if (!list?.length) continue;
    const line = pickRealTask(list.map((m) => m.line), seen, rng);
    return { skill, mission: list.find((m) => m.line === line)! };
  }
  return null;
}

/** Welke opdracht in het echt: een die ze het minst vaak gehad heeft, zodat het afwisselt. */
export function pickRealTask<T extends string>(tasks: readonly T[], seen: Readonly<Record<string, number>>, rng: () => number): T {
  const least = Math.min(...tasks.map((t) => seen[t] ?? 0));
  const fresh = tasks.filter((t) => (seen[t] ?? 0) === least);
  return fresh[Math.floor(rng() * fresh.length)];
}

/**
 * Opwarmer: één herhaling uit een ander vak, als daar iets aan de beurt is. Alleen als ze zelf
 * kiest; heeft de ouder het vak vastgezet, dan niet.
 */
export function warmUpSkill(
  subject: string, domains: DomainModule[], current: DomainModule, inputFor: (d: DomainModule) => PlannerInput,
): string | null {
  if (subject !== 'kiezen') return null;
  for (const d of domains) {
    if (d === current || !d.activities.length) continue;
    const skill = dueReviews(inputFor(d))[0];
    if (skill) return skill;
  }
  return null;
}

export interface EasyWin {
  skill: string;
  level: number;
  /** Telt het mee voor de voortgang? */
  record: boolean;
}

/**
 * Een succesje na een lastig stukje: een beheerste vaardigheid (telt gewoon mee als herhaling),
 * of anders hetzelfde als net, één stap makkelijker (telt dan niet mee).
 */
export function easyWin(input: PlannerInput, lastSkill: string | undefined): EasyWin | null {
  const stateOf = (id: string): SkillState => input.states[id] ?? initialState();
  // Liefst hetzelfde soort opdracht, één stap makkelijker: zo blijft de reeks van één soort.
  const level = lastSkill ? stateOf(lastSkill).level - 1 : -1;
  if (lastSkill && level >= 0) return { skill: lastSkill, level, record: false };
  const solid = easyPick(input);
  return solid ? { skill: solid, level: stateOf(solid).level, record: true } : null;
}
