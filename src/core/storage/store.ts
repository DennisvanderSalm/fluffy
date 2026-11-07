import type { SkillState } from '../engine/types';
import { DEFAULT_SETTINGS, type SessionRecord, type Settings } from '../session/session';

/** Alles wat de app bewaart, lokaal op het apparaat. Er gaat niets naar buiten. */
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

/** Opgeslagen gegevens aanvullen met wat in een oudere versie nog niet bestond. */
export function normalize(raw: unknown): SaveData | null {
  const data = raw as Partial<SaveData> | null;
  if (!data || typeof data !== 'object' || data.version !== 1) return null;
  const base = emptyData();
  return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
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
