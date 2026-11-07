/**
 * Eigen opnames van de ouder (de naam van het kind, een welterusten-boodschap). Ze blijven op dit
 * apparaat, in IndexedDB; ze gaan nergens heen en zitten niet in de back-up.
 */

export interface OwnClip {
  data: ArrayBuffer;
  type: string;
}

const DB = 'fluffy-eigen';
const STORE = 'clips';

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = fn(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function loadOwnClips(): Promise<Map<string, OwnClip>> {
  const out = new Map<string, OwnClip>();
  try {
    const db = await open();
    await new Promise<void>((resolve) => {
      const req = db.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
      req.onsuccess = () => {
        const c = req.result;
        if (!c) return resolve();
        out.set(String(c.key), c.value as OwnClip);
        c.continue();
      };
      req.onerror = () => resolve();
    });
    db.close();
  } catch {
    /* geen IndexedDB (privévenster): dan zonder eigen opnames */
  }
  return out;
}

export const saveOwnClip = (id: string, clip: OwnClip) => tx('readwrite', (s) => s.put(clip, id));
export const deleteOwnClip = (id: string) => tx('readwrite', (s) => s.delete(id));

/** Opnemen met de microfoon. Stopt vanzelf na `maxMs`. */
export class Recorder {
  private rec: MediaRecorder | null = null;
  private stream: MediaStream | null = null;
  private chunks: Blob[] = [];
  private done: ((clip: OwnClip | null) => void) | null = null;
  private timer = 0;

  static supported(): boolean {
    return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Start. `done` lost op met de opname als hij stopt (of null als er niets is opgenomen). */
  async start(maxMs = 8000): Promise<{ done: Promise<OwnClip | null> }> {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const type = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported?.(t));
    this.rec = new MediaRecorder(this.stream, type ? { mimeType: type } : undefined);
    this.chunks = [];
    const result = new Promise<OwnClip | null>((resolve) => (this.done = resolve));
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.onstop = async () => {
      this.stream?.getTracks().forEach((t) => t.stop());
      clearTimeout(this.timer);
      const blob = new Blob(this.chunks, { type: this.rec?.mimeType || type || 'audio/mp4' });
      this.done?.(blob.size ? { data: await blob.arrayBuffer(), type: blob.type } : null);
    };
    this.rec.start();
    this.timer = window.setTimeout(() => this.stop(), maxMs);
    return { done: result };
  }

  stop(): void {
    if (this.rec?.state === 'recording') this.rec.stop();
  }
}
