import type { SkillState } from '../engine/types';
import { DEFAULT_SETTINGS, type SessionRecord, type Settings } from '../session/session';
import { MOMENTS, type Moment } from '../ui/moments';

/** Alles wat de app bewaart, lokaal op het apparaat. Er gaat niets naar buiten, en er staat geen naam in. */
export interface SaveData {
  version: 1;
  settings: Settings;
  skills: Record<string, SkillState>;
  sessions: SessionRecord[];
  /** Heeft Fluffy zich al eens voorgesteld? */
  introduced: boolean;
  /** Hoe vaak elke activiteit gespeeld is (voor extra uitleg de eerste keren). */
  seen: Record<string, number>;
  /** De ouder heeft een nieuwe sessie toegestaan (tijdstip), of null. */
  parentAllowedAt: number | null;
  startLevelApplied: string | null;
  /** Wat opviel bij fouten, voor "waar ze tegenaan loopt" in het ouderdeel. */
  notes: Note[];
  /** Wanneer de laatste back-up gemaakt is (tijdstip), of null. */
  lastBackup: number | null;
  /** De laatste opdracht voor de rest van de dag, of null. */
  mission: DayMission | null;
}

export interface DayMission {
  /** Zinnetje-id ('missie.…'). */
  line: string;
  skill: string;
  moment: Moment;
  /** Dag waarop Fluffy de opdracht gaf. */
  date: string;
  /** Heeft Fluffy er een volgende keer al naar gevraagd? */
  asked: boolean;
}

export interface Note {
  skill: string;
  text: string;
  date: string;
}

const KEY = 'fluffy.v1';
const SESSION_CAP = 60;
const NOTE_CAP = 120;

export function emptyData(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    skills: {},
    sessions: [],
    introduced: false,
    seen: {},
    parentAllowedAt: null,
    startLevelApplied: null,
    notes: [],
    lastBackup: null,
    mission: null,
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? normalize(JSON.parse(raw)) ?? emptyData() : emptyData();
  } catch {
    return emptyData();
  }
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const numOrNull = (v: unknown) => (isNum(v) ? v : null);

const GROWN_UP = ['wie.papaofmama', 'wie.papa', 'wie.mama', 'wie.oma', 'wie.opa'];
const TOGETHER = ['uit', 'echt', 'samen'];
const STATUS = ['new', 'practicing', 'mastered'];

/** Instellingen: alleen velden van het goede soort, binnen redelijke grenzen. */
function cleanSettings(raw: unknown): Settings {
  const s: Settings = { ...DEFAULT_SETTINGS };
  if (!isObj(raw)) return s;
  for (const k of ['sessionMinutes', 'maxSessionsPerDay', 'restMinutes'] as const) {
    const v = raw[k];
    if (isNum(v) && v >= 0 && v <= 24 * 60) s[k] = v;
  }
  if (isNum(raw.volume)) s.volume = Math.min(1, Math.max(0, raw.volume));
  if (isStr(raw.voiceURI) || raw.voiceURI === null) s.voiceURI = raw.voiceURI;
  if (isStr(raw.startLevel)) s.startLevel = raw.startLevel;
  if (isStr(raw.subject)) s.subject = raw.subject;
  if (TOGETHER.includes(raw.together as string)) s.together = raw.together as Settings['together'];
  if (GROWN_UP.includes(raw.grownUp as string)) s.grownUp = raw.grownUp as string;
  if (typeof raw.probe === 'boolean') s.probe = raw.probe;
  if (typeof raw.mission === 'boolean') s.mission = raw.mission;
  return s;
}

function cleanSkill(raw: unknown): SkillState | null {
  if (!isObj(raw) || !STATUS.includes(raw.status as string) || !isNum(raw.level) || raw.level < 0) return null;
  if (!Array.isArray(raw.atLevel) || !Array.isArray(raw.history)) return null;
  const okAttempt = (a: unknown) => isObj(a) && isNum(a.credit);
  const review = isObj(raw.review) && isNum(raw.review.box) && isStr(raw.review.due) ? { box: raw.review.box, due: raw.review.due } : undefined;
  if (raw.status === 'mastered' && !review) return null;
  const probe = raw.status === 'practicing' && isNum(raw.probe) && raw.probe >= 0 ? Math.floor(raw.probe) : undefined;
  return {
    status: raw.status as SkillState['status'],
    level: Math.floor(raw.level),
    atLevel: raw.atLevel.filter(okAttempt) as SkillState['atLevel'],
    history: raw.history.filter((a) => okAttempt(a) && isStr((a as Record<string, unknown>).date)) as SkillState['history'],
    assumed: raw.assumed === true,
    ...(review ? { review } : {}),
    lapses: isNum(raw.lapses) ? raw.lapses : 0,
    ...(isStr(raw.lastPracticed) ? { lastPracticed: raw.lastPracticed } : {}),
    ...(probe !== undefined ? { probe } : {}),
    ...(raw.probed === true ? { probed: true } : {}),
  };
}

function cleanMission(raw: unknown): DayMission | null {
  if (!isObj(raw) || !isStr(raw.line) || !/^missie\.[\w.-]{1,60}$/.test(raw.line) || !isStr(raw.skill) || !isStr(raw.date)) return null;
  if (!MOMENTS.includes(raw.moment as Moment)) return null;
  return { line: raw.line, skill: raw.skill.slice(0, 60), moment: raw.moment as Moment, date: raw.date.slice(0, 10), asked: raw.asked === true };
}

function cleanSession(raw: unknown): SessionRecord | null {
  if (!isObj(raw) || !isStr(raw.id) || !isStr(raw.date) || !isNum(raw.start)) return null;
  const strings = (v: unknown) => (Array.isArray(v) ? v.filter(isStr) : []);
  const n = (v: unknown) => (isNum(v) && v >= 0 ? v : 0);
  return {
    id: raw.id, date: raw.date, start: raw.start,
    ...(isNum(raw.end) ? { end: raw.end } : {}),
    activeMs: n(raw.activeMs), items: n(raw.items), firstTry: n(raw.firstTry), helped: n(raw.helped),
    activities: strings(raw.activities), skills: strings(raw.skills),
    ...(isStr(raw.domain) ? { domain: raw.domain } : {}),
  };
}

/**
 * Opgeslagen gegevens (of een back-upbestand) controleren en aanvullen met wat in een oudere
 * versie nog niet bestond. Alles van het verkeerde soort wordt weggelaten, zodat een kapot of
 * vreemd bestand de app nooit kan laten vastlopen. Geeft null als het helemaal niet klopt.
 */
export function normalize(raw: unknown): SaveData | null {
  if (!isObj(raw) || raw.version !== 1) return null;
  const base = emptyData();
  const skills: Record<string, SkillState> = {};
  if (isObj(raw.skills)) {
    for (const [id, st] of Object.entries(raw.skills)) {
      const clean = cleanSkill(st);
      if (clean) skills[id] = clean;
    }
  }
  const seen: Record<string, number> = {};
  if (isObj(raw.seen)) for (const [id, v] of Object.entries(raw.seen)) if (isNum(v)) seen[id] = v;
  return {
    ...base,
    settings: cleanSettings(raw.settings),
    skills,
    sessions: Array.isArray(raw.sessions) ? raw.sessions.map(cleanSession).filter((s): s is SessionRecord => !!s) : [],
    introduced: raw.introduced === true,
    seen,
    parentAllowedAt: numOrNull(raw.parentAllowedAt),
    startLevelApplied: isStr(raw.startLevelApplied) ? raw.startLevelApplied : null,
    notes: Array.isArray(raw.notes)
      ? raw.notes.filter((x): x is Note => isObj(x) && isStr(x.skill) && isStr(x.text) && isStr(x.date))
        .map((x) => ({ skill: x.skill, text: x.text.slice(0, 200), date: x.date }))
      : [],
    lastBackup: numOrNull(raw.lastBackup),
    mission: cleanMission(raw.mission),
  };
}

/**
 * Back-up als bestand. Het formaat heeft al een lijst profielen, zodat er later meer kinderen
 * op één apparaat kunnen; nu is er altijd precies één.
 */
export interface Backup {
  app: 'fluffy';
  format: 1;
  exported: string;
  profiles: { id: string; data: SaveData }[];
}

export function makeBackup(data: SaveData, now: number): Backup {
  return { app: 'fluffy', format: 1, exported: new Date(now).toISOString(), profiles: [{ id: 'p1', data }] };
}

/** Leest een back-upbestand. Geeft null als het geen (bruikbare) Fluffy-back-up is. */
export function readBackup(text: string): SaveData | null {
  try {
    const b = JSON.parse(text) as Partial<Backup>;
    if (b.app !== 'fluffy' || b.format !== 1 || !Array.isArray(b.profiles) || !b.profiles.length) return null;
    return normalize(b.profiles[0].data);
  } catch {
    return null;
  }
}

let saveFailed = false;

export function save(data: SaveData): void {
  if (data.sessions.length > SESSION_CAP) data.sessions.splice(0, data.sessions.length - SESSION_CAP);
  if (data.notes.length > NOTE_CAP) data.notes.splice(0, data.notes.length - NOTE_CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
    saveFailed = false;
  } catch {
    // Opslag vol of geblokkeerd: de app blijft gewoon werken, alleen zonder geheugen.
    // Het ouderdeel laat het zien.
    saveFailed = true;
  }
}

export interface StorageInfo {
  /** Lukte het laatste bewaren niet? */
  saveFailed: boolean;
  /** Heeft de browser beloofd de gegevens niet zelf op te ruimen? (null = onbekend) */
  persisted: boolean | null;
  /** Gestart vanaf het beginscherm (als app), niet als gewone website in Safari? */
  standalone: boolean;
}

/** Hoe veilig de voortgang staat, voor het ouderdeel. */
export async function storageInfo(): Promise<StorageInfo> {
  let persisted: boolean | null = null;
  try {
    persisted = (await navigator.storage?.persisted?.()) ?? null;
  } catch {
    /* onbekend */
  }
  const standalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    (typeof matchMedia === 'function' && matchMedia('(display-mode: standalone)').matches);
  return { saveFailed, persisted, standalone };
}

const DAY = 86_400_000;

/**
 * Herinnering voor het ouderdeel: na een paar keer spelen zonder back-up, of als de laatste
 * meer dan een maand oud is. Geeft null als er niets te herinneren valt.
 */
export function backupDue(data: SaveData, now: number): 'nooit' | 'oud' | null {
  const played = data.sessions.filter((r) => r.items > 0).length;
  if (data.lastBackup === null) return played >= 3 ? 'nooit' : null;
  const newer = data.sessions.some((r) => r.items > 0 && r.start > data.lastBackup!);
  return newer && now - data.lastBackup > 30 * DAY ? 'oud' : null;
}

/** Vraag de browser de gegevens niet op te ruimen (vooral relevant op iPad). */
export function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* niet ondersteund */
  }
}
