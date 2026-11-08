import type { DomainModule } from '../domain';
import { initialState } from '../engine/mastery';
import { dueReviews, easyPick, type PlannerInput } from '../engine/planner';
import type { SkillState } from '../engine/types';
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
  const solid = easyPick(input);
  if (solid) return { skill: solid, level: stateOf(solid).level, record: true };
  if (!lastSkill) return null;
  const level = stateOf(lastSkill).level - 1;
  return level >= 0 ? { skill: lastSkill, level, record: false } : null;
}
