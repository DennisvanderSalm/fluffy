import { isoDate } from '../util';

/** Instellingen die de ouder bepaalt. */
export interface Settings {
  childName: string;
  sessionMinutes: number;
  /** 0 = geen maximum. */
  maxSessionsPerDay: number;
  /** Rustpauze na een sessie voordat er vanzelf een nieuwe kan beginnen. */
  restMinutes: number;
  /** 0..1 */
  volume: number;
  voiceURI: string | null;
  startLevel: string;
  /** 'kiezen' = het kind kiest aan het begin; anders altijd dit vak (domein-id). */
  subject: string;
}

export const DEFAULT_SETTINGS: Settings = {
  childName: '',
  sessionMinutes: 10,
  maxSessionsPerDay: 0,
  restMinutes: 60,
  volume: 0.8,
  voiceURI: null,
  startLevel: 'tellen10',
  subject: 'kiezen',
};

export interface SessionRecord {
  id: string;
  date: string;
  start: number;
  end?: number;
  /** Tijd dat de app echt in beeld was en niet in het ouderdeel stond. */
  activeMs: number;
  items: number;
  firstTry: number;
  helped: number;
  activities: string[];
  skills: string[];
  /** Welk vak (domein) er gespeeld is. */
  domain?: string;
}

/** Sessies korter dan dit tellen niet mee voor het dagmaximum (bv. per ongeluk geopend). */
export const MIN_COUNTED_MS = 2 * 60_000;

export type StartCheck =
  | { ok: true }
  | { ok: false; reason: 'rest'; until: number }
  | { ok: false; reason: 'daily-max' };

/**
 * Mag er nu vanzelf een nieuwe sessie beginnen? Na een sessie volgt een rustpauze en
 * eventueel een dagmaximum, zodat er geen "eindeloos spelen" ontstaat.
 * `parentAllowedAt`: de ouder heeft na het laatste einde expliciet een nieuwe sessie toegestaan.
 */
export function canStartSession(
  records: readonly SessionRecord[],
  settings: Settings,
  now: number,
  parentAllowedAt: number | null,
): StartCheck {
  const ended = records.filter((r) => r.end !== undefined);
  const last = ended[ended.length - 1];
  if (parentAllowedAt !== null && (!last || parentAllowedAt >= last.end!)) return { ok: true };

  if (settings.maxSessionsPerDay > 0) {
    const today = isoDate(now);
    const counted = ended.filter((r) => r.date === today && r.activeMs >= MIN_COUNTED_MS).length;
    if (counted >= settings.maxSessionsPerDay) return { ok: false, reason: 'daily-max' };
  }

  if (last && last.activeMs >= MIN_COUNTED_MS) {
    const until = last.end! + settings.restMinutes * 60_000;
    if (now < until) return { ok: false, reason: 'rest', until };
  }
  return { ok: true };
}

/** Meet speeltijd. Staat stil in het ouderdeel en als de app niet in beeld is. */
export class SessionClock {
  private accumulated = 0;
  private runningSince: number | null = null;

  constructor(
    private readonly limitMs: number,
    private readonly now: () => number,
  ) {}

  start(): void {
    if (this.runningSince === null) this.runningSince = this.now();
  }

  pause(): void {
    if (this.runningSince !== null) {
      this.accumulated += this.now() - this.runningSince;
      this.runningSince = null;
    }
  }

  get running(): boolean {
    return this.runningSince !== null;
  }

  elapsed(): number {
    return this.accumulated + (this.runningSince !== null ? this.now() - this.runningSince : 0);
  }

  isTimeUp(): boolean {
    return this.elapsed() >= this.limitMs;
  }
}

/**
 * Speelt items tot de tijd om is. De tijd wordt alleen *tussen* items gecontroleerd:
 * een lopende opdracht wordt altijd afgemaakt. `playOne` geeft false als er niets meer te spelen is.
 */
export async function playUntilTimeUp(
  clock: { isTimeUp(): boolean },
  playOne: () => Promise<boolean>,
): Promise<number> {
  let played = 0;
  do {
    if (!(await playOne())) break;
    played++;
  } while (!clock.isTimeUp());
  return played;
}

/** Sluit een sessie af die nooit netjes eindigde (app gesloten tijdens het spelen). */
export function closeDangling(records: SessionRecord[]): SessionRecord[] {
  return records.map((r) => (r.end === undefined ? { ...r, end: r.start + r.activeMs } : r));
}
