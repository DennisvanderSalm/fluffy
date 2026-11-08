/**
 * Domein-onafhankelijke types van de adaptieve engine.
 * Een domein (rekenen, later lezen) levert vaardigheden als knopen in een graaf.
 */

export type SkillId = string;

/** Hoeveel een poging "telt": op eigen kracht, na een hint, of voorgedaan. Nooit tijd. */
export type Credit = 0 | 0.5 | 1;

export interface SkillDef {
  id: SkillId;
  domain: string;
  /** Vaardigheden die eerst stabiel beheerst moeten zijn. */
  requires: SkillId[];
  /** Aantal moeilijkheidsniveaus binnen de vaardigheid (concreet → symbool, veel → weinig hulp). */
  levels: number;
}

export interface LevelAttempt {
  credit: Credit;
  session: string;
}

export interface Attempt extends LevelAttempt {
  level: number;
  review: boolean;
  date: string;
}

export type SkillStatus = 'new' | 'practicing' | 'mastered';

export interface SkillState {
  status: SkillStatus;
  level: number;
  /** Pogingen op het huidige niveau sinds de laatste niveauwissel. */
  atLevel: LevelAttempt[];
  /** Recente geschiedenis (voor het ouderdeel), begrensd. */
  history: Attempt[];
  /** Door het startniveau aangenomen, nog niet zelf laten zien. */
  assumed: boolean;
  /** Herhaalschema voor beheerste vaardigheden (Leitner-vak + datum). */
  review?: { box: number; due: string };
  /** Opeenvolgende mislukte herhalingen. */
  lapses: number;
  /** Proefje bezig: zoveel opdrachten op het hoogste niveau al meteen zelf goed. */
  probe?: number;
  /** Overgeslagen omdat het proefje meteen lukte (voor het ouderdeel). */
  probed?: boolean;
  lastPracticed?: string;
}
