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
  /** De ouder heeft een nieuwe sessie toegestaan (tijdstip), of null. */
  parentAllowedAt: number | null;
  startLevelApplied: string | null;
}

const KEY = 'fluffy.v1';
const SESSION_CAP = 60;

export function emptyData(): SaveData {
  return {
    version: 1,
    settings: { ...DEFAULT_SETTINGS },
    skills: {},
    sessions: [],
    introduced: false,
    parentAllowedAt: null,
    startLevelApplied: null,
  };
}

export function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyData();
    const data = JSON.parse(raw) as Partial<SaveData>;
    if (data.version !== 1) return emptyData();
    const base = emptyData();
    return { ...base, ...data, settings: { ...base.settings, ...data.settings } };
  } catch {
    return emptyData();
  }
}

export function save(data: SaveData): void {
  if (data.sessions.length > SESSION_CAP) data.sessions.splice(0, data.sessions.length - SESSION_CAP);
  try {
    localStorage.setItem(KEY, JSON.stringify(data));
  } catch {
    // Opslag vol of geblokkeerd: de app blijft gewoon werken, alleen zonder geheugen.
  }
}

/** Vraag de browser de gegevens niet op te ruimen (vooral relevant op iPad). */
export function requestPersistence(): void {
  try {
    void navigator.storage?.persist?.();
  } catch {
    /* niet ondersteund */
  }
}
