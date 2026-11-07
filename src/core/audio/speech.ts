import { lineText, type LineId } from '../../content/spraak.nl';
import { sleep } from '../util';
import { loadOwnClips, type OwnClip } from './own';
import { chunk, joinText, segId } from './phrases';

/** Een segment: een zin-id uit het script, of een getal (→ 'getal.<n>'). */
export type Seg = LineId | number;

type SpeakingListener = (speaking: boolean) => void;

/** manifest.json: id → bestandsnaam. Een lijst id's (oud formaat) betekent '<id>.m4a'. */
export function parseManifest(data: unknown): Map<string, string> {
  const clips = (data as { clips?: unknown } | null)?.clips;
  if (Array.isArray(clips)) return new Map(clips.map((id: string) => [id, `${id}.m4a`]));
  if (clips && typeof clips === 'object') return new Map(Object.entries(clips as Record<string, string>));
  return new Map();
}

/** Zoveel gedecodeerde opnames houden we in het geheugen (getallen komen vaak terug). */
const BUFFER_CACHE = 60;

/**
 * Spraak met twee bronnen: opnames (voorkeur) en de Nederlandse computerstem (terugval).
 * Opnames staan in public/audio/nl/ en worden aangemeld in manifest.json; dat kunnen losse
 * zinnetjes zijn of hele zinnen (zie phrases.ts). Ze spelen af via Web Audio: de app haalt
 * alle stukjes van een zin vooraf op, zodat ze zonder haperen achter elkaar klinken.
 */
export class Speech {
  volume = 0.8;
  childName = '';
  voiceURI: string | null = null;

  private clips = new Map<string, string>();
  /** Eigen opnames van de ouder; die gaan voor. */
  private own = new Map<string, OwnClip>();
  private listeners = new Set<SpeakingListener>();
  private token = 0;
  private audio: HTMLAudioElement | null = null;
  private ctx: AudioContext | null = null;
  private source: AudioBufferSourceNode | null = null;
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private synth: SpeechSynthesis | null = 'speechSynthesis' in window ? window.speechSynthesis : null;

  async init(): Promise<void> {
    try {
      const res = await fetch('audio/nl/manifest.json', { cache: 'no-cache' });
      if (res.ok) this.clips = parseManifest(await res.json());
    } catch {
      /* geen opnames: alleen computerstem */
    }
    this.own = await loadOwnClips();
  }

  /** Is er een eigen opname van dit zinnetje? */
  hasOwn(id: string): boolean {
    return this.own.has(id);
  }

  /** Eigen opname zetten of (met null) weghalen. */
  setOwn(id: string, clip: OwnClip | null): void {
    if (clip) this.own.set(id, clip);
    else this.own.delete(id);
    this.buffers.delete(id);
  }

  private hasClip(id: string): boolean {
    return this.own.has(id) || this.clips.has(id);
  }

  /** Alle zinnen met een opname (voor "opnames beluisteren" in het ouderdeel). */
  clipIds(): string[] {
    return [...this.clips.keys()];
  }

  /** Hoeveel zinnen als opname klaarstaan (voor het ouderdeel). */
  get clipCount(): number {
    return this.clips.size;
  }

  /**
   * Moet aangeroepen worden *binnen* een tik (iPadOS staat geluid pas toe na een aanraking).
   */
  unlock(): void {
    // Opnames ook laten klinken als de iPad op stil staat, net als de computerstem.
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'playback';
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx ??= new Ctor();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
    try {
      if (this.synth) {
        const u = new SpeechSynthesisUtterance(' ');
        u.volume = 0;
        this.synth.speak(u);
      }
    } catch {
      this.synth = null;
    }
    if (!this.audio) {
      this.audio = new Audio();
      this.audio.src = silentWavUrl();
      void this.audio.play().catch(() => undefined);
    }
  }

  onSpeaking(fn: SpeakingListener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Nederlandse stemmen op dit apparaat (voor het ouderdeel). */
  dutchVoices(): SpeechSynthesisVoice[] {
    if (!this.synth) return [];
    return this.synth.getVoices().filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith('nl'));
  }

  /** Zegt een reeks segmenten. Een nieuwe `say` breekt de vorige af. Lost op als het klaar is. */
  async say(segs: Seg[]): Promise<void> {
    const my = ++this.token;
    this.halt();
    this.emit(true);
    try {
      const parts = chunk(segs.map(segId), (id) => this.hasClip(id));
      // Alle opnames van deze zin alvast ophalen en decoderen.
      for (const p of parts) if (p.clip) void this.buffer(p.id);
      // Groepeer: opeenvolgende stukken zonder opname worden één vloeiende zin.
      let ttsRun: string[] = [];
      const flush = async () => {
        if (ttsRun.length && my === this.token) await this.speakTts(joinText(ttsRun), my);
        ttsRun = [];
      };
      for (const p of parts) {
        if (my !== this.token) return;
        if (p.clip) {
          await flush();
          if (my === this.token) await this.playClip(p.id, my);
        } else {
          const text = this.text(p.id);
          if (text) ttsRun.push(text);
        }
      }
      await flush();
    } finally {
      if (my === this.token) this.emit(false);
    }
  }

  stop(): void {
    this.token++;
    this.halt();
    this.emit(false);
  }

  private emit(speaking: boolean): void {
    this.listeners.forEach((fn) => fn(speaking));
  }

  private halt(): void {
    this.synth?.cancel();
    if (this.audio && !this.audio.paused) this.audio.pause();
    try {
      this.source?.stop();
    } catch {
      /* al gestopt */
    }
    this.source = null;
  }

  /** Tekst voor de computerstem; een hele zin ('a+getal.4+b') wordt weer losse stukjes. */
  private text(id: string): string {
    return joinText(id.split('+').map((part) => lineText(part as LineId, this.childName)));
  }

  private pickVoice(): SpeechSynthesisVoice | null {
    const voices = this.dutchVoices();
    if (!voices.length) return null;
    const chosen = voices.find((v) => v.voiceURI === this.voiceURI);
    if (chosen) return chosen;
    const score = (v: SpeechSynthesisVoice) =>
      (v.lang.toLowerCase().includes('nl-nl') ? 4 : 0) +
      (/enhanced|premium|verbeterd|natural/i.test(v.name) ? 2 : 0) +
      (/claire|xander/i.test(v.name) ? 1 : 0);
    return [...voices].sort((a, b) => score(b) - score(a))[0];
  }

  private async speakTts(text: string, my: number): Promise<void> {
    const synth = this.synth;
    if (!synth) return sleep(estimateMs(text));
    // iPadOS slikt soms een uitspraak die direct na cancel() komt.
    if (synth.speaking || synth.pending) {
      synth.cancel();
      await sleep(60);
      if (my !== this.token) return;
    }
    await new Promise<void>((resolve) => {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'nl-NL';
      const voice = this.pickVoice();
      if (voice) u.voice = voice;
      u.rate = 0.92;
      u.pitch = 1.15;
      u.volume = this.volume;
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(fallback);
        resolve();
      };
      // Vangnet: niet elke browser stuurt betrouwbaar 'end'.
      const fallback = setTimeout(finish, estimateMs(text) + 2500);
      u.onend = finish;
      u.onerror = finish;
      synth.speak(u);
    });
  }

  private url(id: string): string {
    const own = this.own.get(id);
    if (own) return URL.createObjectURL(new Blob([own.data], { type: own.type }));
    return `audio/nl/${this.clips.get(id)}`;
  }

  private buffer(id: string): Promise<AudioBuffer | null> {
    const ctx = this.ctx;
    if (!ctx) return Promise.resolve(null);
    let p = this.buffers.get(id);
    if (p) {
      // Opnieuw achteraan zetten: wat vaak terugkomt, blijft bewaard.
      this.buffers.delete(id);
    } else {
      const own = this.own.get(id);
      // decodeAudioData neemt de buffer over; daarom een kopie van de eigen opname.
      const data = own
        ? Promise.resolve(own.data.slice(0))
        : fetch(this.url(id)).then((res) => (res.ok ? res.arrayBuffer() : Promise.reject(new Error(res.statusText))));
      p = data.then((d) => ctx.decodeAudioData(d)).catch(() => null);
    }
    this.buffers.set(id, p);
    while (this.buffers.size > BUFFER_CACHE) this.buffers.delete(this.buffers.keys().next().value!);
    return p;
  }

  private async playClip(id: string, my: number): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return this.playElement(id, my);
    const buf = await this.buffer(id);
    if (my !== this.token) return;
    // Opname kapot of onvindbaar: dan toch de computerstem.
    if (!buf) return this.speakTts(this.text(id), my);
    if (ctx.state !== 'running') await ctx.resume().catch(() => undefined);
    await new Promise<void>((resolve) => {
      const src = ctx.createBufferSource();
      const gain = ctx.createGain();
      gain.gain.value = this.volume;
      src.buffer = buf;
      src.connect(gain).connect(ctx.destination);
      let done = false;
      const finish = () => {
        if (done) return;
        done = true;
        clearTimeout(fallback);
        if (this.source === src) this.source = null;
        resolve();
      };
      // Vangnet als 'ended' uitblijft (bv. als de context even stilstaat).
      const fallback = setTimeout(finish, buf.duration * 1000 + 1500);
      src.onended = finish;
      this.source = src;
      src.start();
    });
  }

  /**
   * Terugval zonder Web Audio: één audio-element, dat binnen een tik ontgrendeld is.
   * Met vangnetten: start de opname niet, dan de computerstem; komt er geen 'ended' (bv. na
   * stop()), dan gaat het na de duur van de opname toch verder. Anders kan Fluffy blijven hangen.
   */
  private playElement(id: string, my: number): Promise<void> {
    const audio = this.audio ?? (this.audio = new Audio());
    return new Promise<void>((resolve) => {
      let started = false;
      let done = false;
      let timer = 0;
      const finish = (failed: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        audio.onended = audio.onerror = audio.onloadedmetadata = null;
        if (failed && !started && my === this.token) resolve(this.speakTts(this.text(id), my));
        else resolve();
      };
      timer = window.setTimeout(() => finish(true), 4000);
      audio.onloadedmetadata = () => {
        started = true;
        clearTimeout(timer);
        const ms = Number.isFinite(audio.duration) ? audio.duration * 1000 : 10_000;
        timer = window.setTimeout(() => finish(false), ms + 1500);
      };
      audio.onended = () => finish(false);
      audio.onerror = () => finish(true);
      audio.volume = this.volume;
      audio.src = this.url(id);
      audio.play().catch(() => finish(true));
      if (my !== this.token) finish(false);
    });
  }
}

function estimateMs(text: string): number {
  return 400 + text.length * 75;
}

let silentUrl: string | null = null;
/** Een heel kort stil geluidje, om het audio-element binnen een tik te ontgrendelen. */
function silentWavUrl(): string {
  if (silentUrl) return silentUrl;
  const samples = 800;
  const buf = new ArrayBuffer(44 + samples * 2);
  const v = new DataView(buf);
  const w = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples * 2, true);
  silentUrl = URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  return silentUrl;
}
