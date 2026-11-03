import { lineText, type LineId } from '../../content/spraak.nl';
import { sleep } from '../util';

/** Een segment: een zin-id uit het script, of een getal (→ 'getal.<n>'). */
export type Seg = LineId | number;

type SpeakingListener = (speaking: boolean) => void;

const toId = (s: Seg): LineId => (typeof s === 'number' ? `getal.${s}` : s);

/**
 * Spraak met twee bronnen: eigen opnames (voorkeur) en de Nederlandse computerstem (terugval).
 * Opnames staan in public/audio/nl/<id>.m4a en worden aangemeld in manifest.json.
 */
export class Speech {
  volume = 0.8;
  childName = '';
  voiceURI: string | null = null;

  private clips = new Set<string>();
  private listeners = new Set<SpeakingListener>();
  private token = 0;
  private audio: HTMLAudioElement | null = null;
  private synth: SpeechSynthesis | null = 'speechSynthesis' in window ? window.speechSynthesis : null;

  async init(): Promise<void> {
    try {
      const res = await fetch('audio/nl/manifest.json', { cache: 'no-cache' });
      if (res.ok) {
        const data = (await res.json()) as { clips?: string[] };
        this.clips = new Set(data.clips ?? []);
      }
    } catch {
      /* geen opnames: alleen computerstem */
    }
  }

  /**
   * Moet aangeroepen worden *binnen* een tik (iPadOS staat geluid pas toe na een aanraking).
   */
  unlock(): void {
    if (this.synth) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      this.synth.speak(u);
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
      // Groepeer: opeenvolgende segmenten zonder opname worden één vloeiende zin.
      let ttsRun: string[] = [];
      const flush = async () => {
        if (ttsRun.length && my === this.token) await this.speakTts(ttsRun.join(' '), my);
        ttsRun = [];
      };
      for (const seg of segs) {
        if (my !== this.token) return;
        const id = toId(seg);
        if (this.clips.has(id)) {
          await flush();
          if (my === this.token) await this.playClip(id, my);
        } else {
          const text = lineText(id, this.childName);
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

  private playClip(id: string, my: number): Promise<void> {
    const audio = this.audio ?? (this.audio = new Audio());
    return new Promise<void>((resolve) => {
      const finish = () => {
        audio.onended = audio.onerror = null;
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.volume = this.volume;
      audio.src = `audio/nl/${id}.m4a`;
      audio.play().catch(finish);
      if (my !== this.token) finish();
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
