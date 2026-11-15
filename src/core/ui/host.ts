import type { LineId } from '../../content/spraak.nl';
import type { Seg, Speech } from '../audio/speech';
import type { ActivityContext, DomainModule } from '../domain';
import type { Fluffy } from '../fluffy/fluffy';
import type { Progress } from '../session/progress';
import type { SaveData } from '../storage/store';
import type { Rng } from '../util';

/** Wat de onderdelen van een sessie (items spelen, de opdracht voor de dag) van de app nodig hebben. */
export interface Host {
  readonly data: SaveData;
  readonly domains: DomainModule[];
  readonly progress: Progress;
  readonly stage: HTMLElement;
  readonly fluffy: Fluffy;
  readonly speech: Speech;
  readonly rng: Rng;
  /** Spreken wacht als het ouderdeel open is. */
  say(segs: Seg[]): Promise<void>;
  /** Wacht tot het ouderdeel weer dicht is. */
  whenResumed(): Promise<void>;
  /** Staat het ouderdeel open? */
  isPaused(): boolean;
  context(activityId: string | null, newRun?: boolean): ActivityContext;
  /** Hoe ze de ouder noemt ("papa of mama"). */
  grownUp(): LineId;
}
