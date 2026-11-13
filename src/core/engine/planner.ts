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
  /**
   * Opdrachten komen in reeksen van hetzelfde soort, niet door elkaar. Jonge kinderen vinden
   * wisselen tussen regels ("hoe begint het?" en "wat rijmt?") moeilijk: ze blijven de vorige regel
   * gebruiken (Zelazo, 2006). Afwisselen (interleaving) helpt vooral oudere leerlingen. Herhalingen
   * en keuzemomenten komen daarom alleen tussen twee reeksen.
   */
  runLength: 4,
  /** Minimaal zoveel andere items tussen voordoen en terugkomen. */
  retryGap: 2,
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

/** De reeks waar ze nu in zit: de vaardigheid van het laatste item, en hoe vaak die achter elkaar kwam. */
export function currentRun(played: readonly PlayedRef[]): { skill: SkillId; length: number; review: boolean } | null {
  const last = played[played.length - 1];
  if (!last) return null;
  let length = 0;
  for (let i = played.length - 1; i >= 0 && played[i].skill === last.skill; i--) length++;
  return { skill: last.skill, length, review: last.review };
}

/**
 * Mag er nu iets anders komen? Pas als de reeks vol is, of als de vaardigheid van de reeks niet
 * meer aan de grens staat (beheerst, of het was een herhaling).
 */
export function atRunBoundary(input: PlannerInput): boolean {
  const run = currentRun(input.played);
  if (!run) return true;
  return run.review || run.length % PLAN_RULES.runLength === 0 || !frontier(input).includes(run.skill);
}

/** Kiest het volgende item. Geeft null als er niets te spelen valt. */
export function pickNext(input: PlannerInput): Pick | null {
  const index = input.played.length;
  const run = currentRun(input.played);
  const boundary = atRunBoundary(input);

  // Een voorgedaan item komt terug; midden in een reeks alleen als het van hetzelfde soort is.
  const retry = input.retries.find((r) => r.after <= index && (boundary || r.skill === run?.skill));
  if (retry) return { kind: 'retry', entry: retry };

  // Midden in een reeks: gewoon verder met hetzelfde.
  if (!boundary && run) return { kind: 'learn', skill: run.skill };

  const front = frontier(input);
  const due = dueReviews(input);
  // Tussen twee reeksen hooguit één herhaling (niet de ene herhaling na de andere).
  if (due.length && (!run?.review || front.length === 0)) {
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

/**
 * Loopt het even niet? Twee keer achter elkaar voorgedaan, of drie van de laatste vier niet in
 * één keer goed. Dan volgt eerst iets wat ze al kan: zo eindigt een lastig stukje met een succesje
 * in plaats van met gedoe. Kijkt naar hulp, nooit naar tijd.
 */
export function isStruggling(recent: readonly { credit: number; modeled: boolean }[]): boolean {
  const last = recent.slice(-4);
  if (last.length >= 2 && last.slice(-2).every((r) => r.modeled)) return true;
  return last.length === 4 && last.filter((r) => r.credit < 1).length >= 3;
}

/** Iets wat ze al stevig kan: de beheerste vaardigheid in het hoogste herhaalvak. */
export function easyPick(input: PlannerInput): SkillId | null {
  const solid = input.skills
    .filter((d) => input.playable.has(d.id) && stateOf(input, d.id).status === 'mastered')
    .sort((a, b) => (stateOf(input, b.id).review?.box ?? 0) - (stateOf(input, a.id).review?.box ?? 0));
  return solid.length ? solid[0].id : null;
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

/** Is dit item een keuzemoment? Niet het eerste item; daarna aan het begin van elke nieuwe reeks. */
export function isChoiceMoment(input: PlannerInput): boolean {
  return input.played.length > 0 && atRunBoundary(input);
}

/**
 * Keuzemoment (autonomie), tussen twee reeksen: twee opties met verschillende activiteiten, allebei
 * uit het plan. De eerste komt van wat de planner nu zou kiezen, de tweede van een andere activiteit
 * voor dezelfde vaardigheid, of anders van een andere vaardigheid aan de grens.
 * Geeft een lege lijst als er niets te kiezen valt (bv. een item dat terugkomt).
 */
export function choiceOptions(input: PlannerInput, activitiesFor: (skill: SkillId) => string[]): ChoiceOption[] {
  const first = pickNext(input);
  if (!first || first.kind === 'retry') return [];
  const candidates: ChoiceOption[] = activitiesFor(first.skill).map((activity) => ({ ...first, activity }));
  for (const skill of frontier(input)) {
    if (skill !== first.skill) candidates.push(...activitiesFor(skill).map((activity): ChoiceOption => ({ kind: 'learn', skill, activity })));
  }
  const out: ChoiceOption[] = [];
  for (const c of candidates) if (!out.some((o) => o.activity === c.activity)) out.push(c);
  return out.length >= 2 ? out.slice(0, 2) : [];
}
