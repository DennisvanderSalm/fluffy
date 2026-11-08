/**
 * "Klinkt niet goed": opnames die de ouder heeft gemarkeerd in het ouderdeel. De lijst blijft op
 * dit apparaat; de ouder kopieert hem en laat ze opnieuw inspreken met
 * `npm run stem -- --afgekeurd <lijst>`. Per opname onthouden we het bestand: komt er een nieuwe
 * versie van die opname, dan valt de markering vanzelf weg.
 */

const KEY = 'fluffy.afgekeurd';

/** id → bestandsnaam van de opname die niet goed klonk. */
export type Flagged = Map<string, string>;

/** Leest een opgeslagen lijst; alles wat er vreemd uitziet, valt weg. */
export function parseFlagged(json: string | null): Flagged {
  try {
    const data = JSON.parse(json ?? '{}') as unknown;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return new Map();
    const ok = (s: unknown): s is string => typeof s === 'string' && s.length <= 200 && /^[\w.+-]+$/.test(s);
    return new Map(Object.entries(data).filter(([id, file]) => ok(id) && ok(file)).slice(0, 500));
  } catch {
    return new Map();
  }
}

export function loadFlagged(): Flagged {
  try {
    return parseFlagged(localStorage.getItem(KEY));
  } catch {
    return new Map();
  }
}

export function saveFlagged(flagged: Flagged): void {
  try {
    if (flagged.size) localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(flagged)));
    else localStorage.removeItem(KEY);
  } catch {
    /* opslag vol of geblokkeerd: dan alleen voor nu */
  }
}

/** Alleen markeringen van opnames die nog precies zo in de app zitten. */
export function stillFlagged(flagged: Flagged, fileOf: (id: string) => string | undefined): Flagged {
  return new Map([...flagged].filter(([id, file]) => fileOf(id) === file));
}

/** Wat de ouder doorgeeft (of zelf draait) om ze opnieuw te laten inspreken. */
export const flaggedCommand = (flagged: Flagged) => `npm run stem -- --afgekeurd ${[...flagged.keys()].sort().join(',')}`;
