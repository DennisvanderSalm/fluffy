import { addDays, mean } from '../util';
import type { Attempt, Credit, SkillDef, SkillState } from './types';

/**
 * Regels van het mastery-model. Bewust eenvoudig en uitlegbaar:
 * - niveau omhoog bij ≥85% succes, omlaag bij hooguit één op de drie zelf gelukt
 *   → het kind oefent rond de 80–85%;
 * - "beheerst" vraagt succes op het hoogste niveau, verdeeld over ≥2 sessies;
 * - beheerste vaardigheden komen gespreid terug (Leitner).
 * Reactietijd speelt nergens een rol: de engine krijgt geen tijd binnen.
 */
export const RULES = {
  upWindow: 5,
  upMinAttempts: 4,
  upThreshold: 0.85,
  downWindow: 3,
  downThreshold: 0.34,
  masteryWindow: 6,
  masteryThreshold: 0.85,
  masterySessions: 2,
  reviewIntervals: [1, 3, 7, 14, 30],
  lapsesToRelearn: 2,
  historyCap: 60,
} as const;

export function initialState(): SkillState {
  return { status: 'new', level: 0, atLevel: [], history: [], assumed: false, lapses: 0 };
}

/** Zet een vaardigheid op "aangenomen beheerst" (startniveau); wordt vandaag al gecontroleerd. */
export function assumeMastered(def: SkillDef, today: string): SkillState {
  return {
    ...initialState(),
    status: 'mastered',
    level: def.levels - 1,
    assumed: true,
    review: { box: 0, due: today },
  };
}

/** Wat de ouder handmatig kan kiezen: nog niet, oefenen op een niveau, of beheerst. */
export type ManualLevel = 'new' | 'mastered' | number;

/** De ouder zet een vaardigheid zelf op een niveau. De geschiedenis blijft bewaard. */
export function manualState(def: SkillDef, prev: SkillState, choice: ManualLevel, today: string): SkillState {
  const keep = { history: prev.history, lastPracticed: prev.lastPracticed };
  if (choice === 'new') return { ...initialState(), ...keep };
  if (choice === 'mastered') return { ...assumeMastered(def, today), ...keep };
  const level = Math.max(0, Math.min(def.levels - 1, choice));
  return { ...initialState(), ...keep, status: 'practicing', level };
}

/** Het huidige niveau als handmatige keuze (voor het keuzelijstje van de ouder). */
export function manualLevelOf(s: SkillState): ManualLevel {
  return s.status === 'practicing' ? s.level : s.status;
}

export interface AttemptInput {
  credit: Credit;
  session: string;
  today: string;
}

/** Verwerkt één poging en geeft een nieuwe toestand terug (puur). */
export function recordAttempt(def: SkillDef, prev: SkillState, input: AttemptInput): SkillState {
  const { credit, session, today } = input;
  const s: SkillState = {
    ...prev,
    atLevel: [...prev.atLevel],
    history: [...prev.history],
    lastPracticed: today,
  };
  const attempt: Attempt = { credit, session, level: s.level, review: s.status === 'mastered', date: today };
  s.history.push(attempt);
  if (s.history.length > RULES.historyCap) s.history.splice(0, s.history.length - RULES.historyCap);

  if (s.status === 'mastered') return applyReview(def, s, credit, today);

  s.status = 'practicing';
  s.atLevel.push({ credit, session });
  const top = def.levels - 1;

  const recentDown = s.atLevel.slice(-RULES.downWindow);
  if (s.level > 0 && recentDown.length >= RULES.downWindow && mean(recentDown.map((a) => a.credit)) <= RULES.downThreshold) {
    return { ...s, level: s.level - 1, atLevel: [] };
  }

  if (s.level < top) {
    const recentUp = s.atLevel.slice(-RULES.upWindow);
    if (recentUp.length >= RULES.upMinAttempts && mean(recentUp.map((a) => a.credit)) >= RULES.upThreshold) {
      return { ...s, level: s.level + 1, atLevel: [] };
    }
    return s;
  }

  // Hoogste niveau: is het stabiel genoeg om "beheerst" te heten?
  const window = s.atLevel.slice(-RULES.masteryWindow);
  const sessions = new Set(window.filter((a) => a.credit === 1).map((a) => a.session));
  if (
    window.length >= RULES.masteryWindow &&
    mean(window.map((a) => a.credit)) >= RULES.masteryThreshold &&
    sessions.size >= RULES.masterySessions
  ) {
    return {
      ...s,
      status: 'mastered',
      assumed: false,
      lapses: 0,
      review: { box: 0, due: addDays(today, RULES.reviewIntervals[0]) },
    };
  }
  return s;
}

function applyReview(def: SkillDef, s: SkillState, credit: Credit, today: string): SkillState {
  const box = s.review?.box ?? 0;
  const maxBox = RULES.reviewIntervals.length - 1;

  if (credit === 1) {
    const next = Math.min(box + 1, maxBox);
    return { ...s, assumed: false, lapses: 0, review: { box: next, due: addDays(today, RULES.reviewIntervals[next]) } };
  }
  if (credit === 0.5) {
    return { ...s, review: { box, due: addDays(today, RULES.reviewIntervals[0]) } };
  }
  // Niet gelukt, ook niet met hint.
  const lapses = s.lapses + 1;
  if (s.assumed || lapses >= RULES.lapsesToRelearn) {
    // Terug naar oefenen, net onder het hoogste niveau. Geen drama: gewoon weer oefenen.
    return {
      ...s,
      status: 'practicing',
      assumed: false,
      lapses: 0,
      level: Math.max(0, def.levels - 2),
      atLevel: [],
      review: undefined,
    };
  }
  return { ...s, lapses, review: { box: 0, due: addDays(today, RULES.reviewIntervals[0]) } };
}

/** Is de herhaling van deze vaardigheid vandaag aan de beurt? */
export function isReviewDue(s: SkillState, today: string): boolean {
  return s.status === 'mastered' && !!s.review && s.review.due <= today;
}
