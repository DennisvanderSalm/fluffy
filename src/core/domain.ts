import type { LineId } from '../content/spraak.nl';
import type { Credit, SkillDef, SkillId } from './engine/types';
import type { Fluffy } from './fluffy/fluffy';
import type { Seg } from './audio/speech';
import type { Sounds } from './audio/sounds';
import type { Rng } from './util';

/**
 * Contract tussen de kern en een domeinmodule (rekenen, lezen).
 * De kern weet niets van getallen of letters; een domein levert vaardigheden en activiteiten.
 */

export interface SkillInfo extends SkillDef {
  /** Naam voor de ouder. */
  name: string;
  /** Wat het is, in gewone taal. */
  about: string;
  /** Spelletje zonder scherm dat erop aansluit. */
  offScreen: string;
  /** Volgorde/groep in het ouderoverzicht. */
  stage: number;
  /** Korte opdrachten in het echt die Fluffy kan geven ("Pak eens drie knuffels."). */
  realTasks?: LineId[];
}

export interface StartLevel {
  id: string;
  label: string;
  /** Vaardigheden die bij dit startniveau als beheerst worden aangenomen. */
  assumed: SkillId[];
}

export interface DomainModule {
  id: string;
  name: string;
  skills: SkillInfo[];
  activities: Activity<any>[];
  startLevels: StartLevel[];
  /** Plaatje (SVG) en gesproken naam voor de keuze aan het begin. */
  icon: string;
  choice: Seg[];
  /** Lof aan het einde van een sessie zonder hulp ("Je hebt heel precies geteld"). */
  endPraise: Seg[];
}

export interface ItemResult {
  credit: Credit;
  /** Heeft Fluffy het moeten voordoen? Dan komt het item later terug. */
  modeled: boolean;
  /** Wat de ouder kan weten, in gewone taal ("Verwisselt b en d"). Alleen bij een fout. */
  note?: string;
}

/** Wat een activiteit van de kern krijgt. */
export interface ActivityContext {
  stage: HTMLElement;
  fluffy: Fluffy;
  say(segs: Seg[]): Promise<void>;
  /** Fluffy direct laten zwijgen (bv. als het kind op het duimpje tikt). */
  speechStop(): void;
  sounds: Sounds;
  /** Wat Fluffy zegt als het kind op Fluffy tikt (null = niets). */
  setRepeat(fn: (() => void) | null): void;
  /** De eerste keren met deze activiteit: iets meer uitleg. */
  beginner: boolean;
  /**
   * Telritme voor Fluffy's tellen: `const tel = ctx.countBeat(); … await tel(); await ctx.say([k]);`.
   * Zo klinken de getallen rustig en even ver uit elkaar (zie makeBeat).
   */
  countBeat(slow?: boolean): () => Promise<void>;
  rng: Rng;
}

export interface Activity<P> {
  id: string;
  /** Naam voor de ouder. */
  name: string;
  skills: SkillId[];
  makeItem(skill: SkillId, level: number, rng: Rng): P;
  run(ctx: ActivityContext, item: P, retry: boolean): Promise<ItemResult>;
  /** Zinnetje voor de samenvatting aan het einde ("We hebben ... gedaan"). */
  summary: Seg[];
  /** Plaatje (SVG) en gesproken naam voor het keuzemoment. */
  icon: string;
  choice: Seg[];
  /** Zinnen die als geheel ingesproken worden (zie core/audio/phrases.ts). */
  phrases(): Seg[][];
}
