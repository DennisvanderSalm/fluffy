import { isReviewDue, initialState } from './mastery';
import type { SkillDef, SkillId, SkillState } from './types';

/** Een item dat Fluffy voordeed en later in de sessie terugkomt. */
export interface RetryEntry<P = unknown> {
  skill: SkillId;
  activity: string;
  level: number;
  params: P;
  /** Vanaf dit itemnummer mag het terugkomen. */
  after: number;
}

export interface PlayedRef {
  skill: SkillId;
  review: boolean;
}

export interface PlannerInput {
  skills: readonly SkillDef[];
  /** Vaardigheden waarvoor een activiteit bestaat. */
  playable: ReadonlySet<SkillId>;
  states: Readonly<Record<SkillId, SkillState | undefined>>;
  today: string;
  /** Wat er deze sessie al gespeeld is, in volgorde. */
  played: readonly PlayedRef[];
  retries: readonly RetryEntry[];
}

export type Pick =
  | { kind: 'retry'; entry: RetryEntry }
  | { kind: 'review'; skill: SkillId }
  | { kind: 'learn'; skill: SkillId };

export const PLAN_RULES = {
  /** Maximaal zoveel vaardigheden tegelijk "aan de grens". */
  frontierSize: 2,
  /** Elk zoveelste item is een herhaling (interleaving), als er iets aan de beurt is. */
  reviewEvery: 3,
  /** Minimaal zoveel andere items tussen voordoen en terugkomen. */
  retryGap: 2,
  /** Elk zoveelste item mag ze kiezen uit twee activiteiten. */
  choiceEvery: 3,
} as const;

const stateOf = (input: PlannerInput, id: SkillId) => input.states[id] ?? initialState();

/**
 * Een voorwaarde is vervuld als die vaardigheid beheerst is, of als er (nog) geen activiteit
 * voor bestaat: dan kan de app haar niet toetsen en mag ze de rest niet blokkeren.
 */
export function prerequisitesMet(input: PlannerInput, def: SkillDef): boolean {
  return def.requires.every((r) => !input.playable.has(r) || stateOf(input, r).status === 'mastered');
}

/** Vaardigheden aan de grens van wat ze kan: eerst wat al geoefend wordt, dan nieuwe. */
export function frontier(input: PlannerInput): SkillId[] {
  const playable = input.skills.filter((d) => input.playable.has(d.id));
  const practicing = playable.filter((d) => stateOf(input, d.id).status === 'practicing');
  const fresh = playable.filter((d) => stateOf(input, d.id).status === 'new' && prerequisitesMet(input, d));
  return [...practicing, ...fresh].slice(0, PLAN_RULES.frontierSize).map((d) => d.id);
}

export function dueReviews(input: PlannerInput): SkillId[] {
  const reviewedNow = new Set(input.played.filter((p) => p.review).map((p) => p.skill));
  return input.skills
    .filter((d) => input.playable.has(d.id) && !reviewedNow.has(d.id) && isReviewDue(stateOf(input, d.id), input.today))
    .sort((a, b) => (stateOf(input, a.id).review!.due < stateOf(input, b.id).review!.due ? -1 : 1))
    .map((d) => d.id);
}

/** Kiest het volgende item. Geeft null als er niets te spelen valt. */
export function pickNext(input: PlannerInput): Pick | null {
  const index = input.played.length;

  const retry = input.retries.find((r) => r.after <= index);
  if (retry) return { kind: 'retry', entry: retry };

  const front = frontier(input);
  const due = dueReviews(input);
  if (due.length && (index % PLAN_RULES.reviewEvery === 1 || front.length === 0)) {
    return { kind: 'review', skill: due[0] };
  }

  if (front.length) {
    // Wissel af tussen de vaardigheden aan de grens: neem degene die het langst geleden was.
    const lastSeen = (id: SkillId) => {
      for (let i = input.played.length - 1; i >= 0; i--) if (input.played[i].skill === id) return i;
      return -1;
    };
    const skill = [...front].sort((a, b) => lastSeen(a) - lastSeen(b))[0];
    return { kind: 'learn', skill };
  }

  // Alles beheerst: onderhoud, de vaardigheid die het langst niet geoefend is.
  const mastered = input.skills
    .filter((d) => input.playable.has(d.id) && stateOf(input, d.id).status === 'mastered')
    .sort((a, b) => (stateOf(input, a.id).lastPracticed ?? '') < (stateOf(input, b.id).lastPracticed ?? '') ? -1 : 1);
  return mastered.length ? { kind: 'review', skill: mastered[0].id } : null;
}

/** Plant een voorgedaan item terug, met een paar andere items ertussen. */
export function scheduleRetry<P>(
  entry: Omit<RetryEntry<P>, 'after'>,
  playedCount: number,
): RetryEntry<P> {
  return { ...entry, after: playedCount + PLAN_RULES.retryGap };
}

export type LearnOrReview = Exclude<Pick, { kind: 'retry' }>;
export type ChoiceOption = LearnOrReview & { activity: string };

/** Is dit item een keuzemoment? Niet het eerste item, daarna om de paar items. */
export function isChoiceMoment(played: readonly PlayedRef[]): boolean {
  return played.length > 0 && played.length % PLAN_RULES.choiceEvery === 0;
}

/**
 * Keuzemoment (autonomie): twee opties met verschillende activiteiten, allebei uit het plan.
 * De eerste komt van het item dat de planner nu zou kiezen, de tweede van een andere activiteit
 * voor dezelfde vaardigheid, of anders van het item dat erna aan de beurt zou zijn.
 * Geeft een lege lijst als er niets te kiezen valt (bv. een item dat terugkomt).
 */
export function choiceOptions(input: PlannerInput, activitiesFor: (skill: SkillId) => string[]): ChoiceOption[] {
  const first = pickNext(input);
  if (!first || first.kind === 'retry') return [];
  const candidates: ChoiceOption[] = activitiesFor(first.skill).map((activity) => ({ ...first, activity }));
  const next = pickNext({ ...input, played: [...input.played, { skill: first.skill, review: first.kind === 'review' }] });
  if (next && next.kind !== 'retry' && next.skill !== first.skill) {
    candidates.push(...activitiesFor(next.skill).map((activity) => ({ ...next, activity })));
  }
  const out: ChoiceOption[] = [];
  for (const c of candidates) if (!out.some((o) => o.activity === c.activity)) out.push(c);
  return out.length >= 2 ? out.slice(0, 2) : [];
}
