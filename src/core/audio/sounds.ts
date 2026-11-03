/**
 * Zachte geluidjes, gemaakt met Web Audio (geen bestanden nodig).
 * Bewust zacht en kort; er bestaat geen "fout"-geluid.
 */
export class Sounds {
  volume = 0.8;
  private ctx: AudioContext | null = null;

  /** Binnen een tik aanroepen (iPadOS). */
  unlock(): void {
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx ??= new Ctor();
      void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Iets zacht neerleggen. */
  plop(): void {
    this.tone(520, 340, 0.09, 0.05);
  }

  /** Rustig, kort "ding" als iets gelukt is. */
  chime(): void {
    this.tone(660, 660, 0.5, 0.045);
    this.tone(990, 990, 0.6, 0.03, 0.09);
  }

  private tone(from: number, to: number, dur: number, gain: number, delay = 0): void {
    const ctx = this.ctx;
    if (!ctx || this.volume <= 0) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(from, t);
    osc.frequency.exponentialRampToValueAtTime(to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain * this.volume, t + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}
