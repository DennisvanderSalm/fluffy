import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { answerOptions } from './tellen';
import { NumberCards, place, POINTER_SVG, THUMB_SVG, type Box } from './veld';

/**
 * REKENREK — tien kralen op een stang: vijf blauwe en vijf witte (Treffers, Freudenthal Instituut).
 * De kleurwissel bij vijf maakt de vijfstructuur zichtbaar, zodat ze zeven in één keer kan zetten:
 * alle blauwe en nog twee. Een tik op een kraal schuift die kraal en alle kralen ervoor naar Fluffy.
 * Twee soorten vragen:
 * - maak (zien-10): "Schuif zeven kralen naar mij toe." Eerst 5–7, dan tot 10, dan vanaf een
 *   rekenrek waar al kralen opzij liggen ("Maak er zeven van").
 * - splits (splitsen-10): Fluffy schuift er zes opzij; hoeveel zijn er aan de andere kant?
 *   Eerst met zes of meer opzij (de rest is wit), dan alles, dan onder een dekentje.
 */

export interface RekenrekItem {
  kind: 'maak' | 'splits';
  /** maak: het aantal dat ze moet zetten; splits: hoeveel kralen Fluffy opzij schuift. */
  n: number;
  /** maak: hoeveel kralen er al opzij liggen bij het begin. */
  start: number;
  /** splits: ligt er een dekentje over de andere kant? */
  covered: boolean;
  /** splits: getalkaartjes. */
  options: number[];
}

/** Het antwoord: het aantal kralen opzij (maak) of aan de andere kant (splits). */
export const rekAnswer = (item: RekenrekItem) => (item.kind === 'maak' ? item.n : 10 - item.n);

let lastN = 0;

export function makeRekenrekItem(skill: string, level: number, rng: Rng): RekenrekItem {
  const L = Math.min(level, 2);
  const roll = (min: number, max: number) => {
    let n = randInt(rng, min, max);
    for (let i = 0; i < 5 && n === lastN; i++) n = randInt(rng, min, max);
    return (lastN = n);
  };
  if (skill === 'splitsen-10') {
    const n = L === 0 ? roll(5, 9) : roll(1, 9);
    return { kind: 'splits', n, start: 0, covered: L >= 2, options: answerOptions(10 - n, rng) };
  }
  const n = L === 0 ? roll(5, 7) : L === 1 ? roll(6, 10) : roll(3, 10);
  let start = 0;
  if (L >= 2) while (start === 0 || start === n) start = randInt(rng, 1, 10);
  return { kind: 'maak', n, start, covered: false, options: [] };
}

/** Een tik op kraal i: ligt hij nog aan de andere kant, dan schuift hij (met alles ervoor) opzij; anders terug. */
export function tapBead(count: number, i: number): number {
  return i > count ? i : i - 1;
}

const BEAD_SVG = (fill: string, edge: string) => `<svg viewBox="0 0 100 130"><ellipse cx="50" cy="65" rx="46" ry="60" fill="${fill}" stroke="${edge}" stroke-width="6"/>
  <ellipse cx="34" cy="38" rx="11" ry="16" fill="#fff" opacity="0.5"/></svg>`;
const BLUE = BEAD_SVG('#8dbbe6', '#5a8fc4');
const WHITE = BEAD_SVG('#fbf4e6', '#d6ba8c');

class Round {
  private root: HTMLElement;
  private beads: HTMLElement[] = [];
  private rod: HTMLElement;
  private posts: HTMLElement[];
  private pointer: HTMLElement;
  private duim: HTMLElement | null = null;
  private cards: NumberCards | null = null;
  private cover: HTMLElement | null = null;
  private blanket: HTMLElement | null = null;
  private count: number;
  private taps = 0;
  private locked = true;
  private onDuim: (() => void) | null = null;

  constructor(private ctx: ActivityContext, private item: RekenrekItem) {
    this.root = el('div', 'rekenrek is-locked');
    this.root.dataset.answer = String(rekAnswer(item)); // voor tests
    this.rod = el('div', 'rk-stang');
    this.posts = [el('div', 'rk-paal'), el('div', 'rk-paal')];
    this.root.append(this.rod, ...this.posts);
    for (let i = 1; i <= 10; i++) {
      const b = el('div', `rk-kraal ${i <= 5 ? 'is-blauw' : 'is-wit'}`);
      b.append(svgEl(i <= 5 ? BLUE : WHITE));
      if (item.kind === 'maak') {
        onTap(b, () => {
          if (this.locked) return;
          this.taps++;
          this.setCount(tapBead(this.count, i));
          ctx.sounds.plop();
        });
      }
      this.beads.push(b);
      this.root.append(b);
    }
    this.count = item.start;
    if (item.kind === 'maak') {
      this.duim = el('div', 'm-duim');
      this.duim.append(svgEl(THUMB_SVG));
      onTap(this.duim, () => !this.locked && this.onDuim?.());
      this.root.append(this.duim);
    } else {
      this.cards = new NumberCards(this.root, ctx.stage, item.options);
      if (item.covered) {
        this.cover = el('div', 'rk-dek');
        this.blanket = el('div', 'kb-deken');
        this.cover.append(this.blanket);
        this.root.append(this.cover);
      }
    }
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.pointer);
    ctx.stage.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.cards?.destroy();
    this.root.remove();
  }

  private geom() {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const left = 0.03 * W;
    const right = 0.97 * W;
    const s = Math.min((right - left) / 13, 0.15 * H, 120);
    return { W, H, left, right, s, y: 0.34 * H };
  }

  private beadBox(i: number): Box {
    const { left, right, s, y } = this.geom();
    const x = i <= this.count ? left + 0.25 * s + (i - 1) * s : right - 0.25 * s - (11 - i) * s;
    return { x, y: y - 0.65 * s, w: s, h: 1.3 * s };
  }

  private layout = (): void => {
    const { H, W, left, right, s, y } = this.geom();
    place(this.rod, { x: left - 0.1 * s, y: y - 0.06 * s, w: right - left + 0.2 * s, h: 0.12 * s });
    place(this.posts[0], { x: left - 0.2 * s, y: y - 0.95 * s, w: 0.2 * s, h: 1.9 * s });
    place(this.posts[1], { x: right, y: y - 0.95 * s, w: 0.2 * s, h: 1.9 * s });
    this.beads.forEach((b, i) => place(b, this.beadBox(i + 1)));
    if (this.cover) {
      // Over de kralen aan de andere kant, met een beetje rand.
      const first = this.beadBox(this.item.n + 1);
      place(this.cover, { x: first.x - 0.3 * s, y: y - 0.9 * s, w: right - first.x + 0.45 * s, h: 1.8 * s });
    }
    if (this.duim) {
      const d = Math.min(124, 0.16 * H);
      place(this.duim, { x: W - d - 0.03 * W, y: H - d - 0.04 * H, w: d, h: d });
    }
  };

  private setCount(c: number): void {
    this.count = c;
    this.layout();
  }

  private lock(on: boolean): void {
    this.locked = on;
    this.root.classList.toggle('is-locked', on);
  }

  private pointAt(i: number): void {
    const b = this.beadBox(i);
    const p = Math.min(b.w * 0.95, 90);
    place(this.pointer, { x: b.x + b.w / 2 - p * 0.43, y: b.y + b.h * 0.7, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  private hidePointer(): void {
    this.pointer.classList.remove('is-on');
  }

  private glow(from: number, to: number, on = true): void {
    for (let i = from; i <= to; i++) this.beads[i - 1].classList.toggle('is-counted', on);
  }

  private async setCovered(on: boolean): Promise<void> {
    if (!this.blanket) return;
    this.blanket.classList.toggle('is-closed', on);
    await sleep(700);
  }

  async play(retry: boolean): Promise<ItemResult> {
    this.ctx.fluffy.still(true);
    await sleep(300);
    return this.item.kind === 'maak' ? this.playMaak(retry) : this.playSplits(retry);
  }

  // ── Maak zeven ──

  private question(): Seg[] {
    const { n, start } = this.item;
    return start ? ['rek.maakervan.a', n, 'rek.maakervan.b'] : ['rek.schuif.a', n, 'rek.schuif.b'];
  }

  /** Wachten tot ze op het duimpje tikt (met minstens één kraal opzij). */
  private async waitDuim(segs: Seg[], quiet = false): Promise<void> {
    const { ctx } = this;
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(segs);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt());
    this.lock(false);
    await new Promise<void>((resolve) => {
      this.onDuim = () => {
        if (this.count === 0) return; // per ongeluk: nog niets gedaan
        this.onDuim = null;
        resolve();
      };
      if (quiet) ctx.fluffy.set('luisteren');
      else void prompt();
    });
    this.lock(true);
    ctx.setRepeat(null);
    ctx.speechStop();
    ctx.sounds.plop();
    await sleep(300);
  }

  private async playMaak(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    if (ctx.beginner) {
      ctx.fluffy.set('rust');
      await ctx.say(['rek.uitleg']);
    }
    await this.waitDuim(this.question());
    if (this.count === item.n) return this.celebrateMaak(1);

    // Ladder 1: zeggen hoeveel het er nu zijn, en de volle vijf laten zien.
    ctx.fluffy.set('nadenken');
    await ctx.say(['hint.zijn', this.count, 'hint.wilden', item.n]);
    if (item.n >= 5) {
      this.glow(1, 5);
      await ctx.say(['rek.blauw']);
      await sleep(400);
      this.glow(1, 5, false);
    }
    await this.waitDuim(this.question());
    if (this.count === item.n) return this.celebrateMaak(2);

    // Ladder 2: Fluffy schuift ze zelf: de vijf blauwe in één keer, en dan verder tellen.
    ctx.fluffy.set('nadenken');
    this.setCount(0);
    await sleep(500);
    await ctx.say(['voordoen.start']);
    await this.slideTo(item.n);
    await ctx.say(this.structure());
    await sleep(400);
    this.setCount(0);
    await sleep(500);
    this.glow(item.n, item.n);
    await this.waitDuim(['rek.nujij', 'rek.schuif.a', item.n, 'rek.schuif.b']);
    this.glow(item.n, item.n, false);
    if (this.count === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      this.setCount(item.n);
      await ctx.say(['voordoen.kijk', item.n]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** Fluffy schuift er n opzij: vanaf vijf eerst alle blauwe in één keer. */
  private async slideTo(n: number): Promise<void> {
    let from = 0;
    if (n >= 5) {
      this.setCount(5);
      this.ctx.sounds.plop();
      await sleep(450);
      this.pointAt(3);
      await this.ctx.say(['rek.vijf']);
      from = 5;
    }
    const beat = this.ctx.countBeat();
    for (let i = from + 1; i <= n; i++) {
      this.setCount(i);
      this.ctx.sounds.plop();
      this.pointAt(i);
      await beat();
      await this.ctx.say([i]);
    }
    this.hidePointer();
  }

  /** "Vijf en twee, dat is zeven." of "Dus het zijn er drie." */
  private structure(): Seg[] {
    const { n } = this.item;
    return n > 5 ? ['kiekeboe.vijfen', n - 5, 'kiekeboe.isdat', n] : ['tellen.dushet', n];
  }

  private async celebrateMaak(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.glow(1, item.n);
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : this.taps === 1 && item.n >= 5 ? 'lof.eenkeerschuiven' : item.n > 5 ? 'lof.vijf' : 'lof.precies';
    await ctx.say(item.n > 5 ? [...this.structure(), praise] : ['tellen.zijnhet', item.n, praise]);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }

  // ── Tien splitsen ──

  private async playSplits(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    const cards = this.cards!;
    const other = 10 - item.n;
    ctx.fluffy.set('rust');
    await ctx.say(['rek.tien']);
    await this.setCovered(true);
    this.setCount(item.n);
    ctx.sounds.plop();
    await sleep(500);
    this.pointAt(Math.ceil(item.n / 2));
    await ctx.say(item.n === 1 ? ['rek.hiereen'] : ['hier.zijn', item.n]);
    this.pointAt(item.n + Math.ceil(other / 2));
    await sleep(300);
    this.hidePointer();
    const question: Seg[] = [item.covered ? 'rek.vraag.deken' : 'rek.vraag.kant'];
    let v = await cards.ask(ctx, question);
    if (v === other) return this.celebrateSplits(1);

    // Ladder 1: zichtbaar? dan oplichten wat je moet tellen. Onder het dekentje: even spieken.
    ctx.fluffy.set('nadenken');
    cards.show(false);
    if (item.covered) {
      await ctx.say(['rek.spieken']);
      await this.setCovered(false);
      await sleep(600 + 250 * other);
      await this.setCovered(true);
    } else {
      this.glow(item.n + 1, 10);
      await ctx.say(['rek.kijkhier']);
    }
    v = await cards.ask(ctx, question);
    this.glow(1, 10, false);
    if (v === other) return this.celebrateSplits(2);

    // Ladder 2: dekentje eraf, Fluffy telt de andere kant (de witte vijf in één keer) en splitst.
    ctx.fluffy.set('nadenken');
    cards.show(false);
    await this.setCovered(false);
    await ctx.say(['voordoen.start']);
    let from = 0;
    if (other > 5) {
      this.glow(6, 10);
      this.pointAt(8);
      await ctx.say(['rek.wit']);
      from = 5;
    }
    // Van de witte vijf naar links verder tellen, of gewoon van links naar rechts.
    const order = other > 5 ? Array.from({ length: other - 5 }, (_, k) => 5 - k) : Array.from({ length: other }, (_, k) => item.n + 1 + k);
    const beat = ctx.countBeat();
    for (const [k, i] of order.entries()) {
      this.glow(i, i);
      this.pointAt(i);
      await beat();
      await ctx.say([from + k + 1]);
    }
    this.hidePointer();
    await ctx.say(this.split());
    v = await cards.ask(ctx, ['tellen.tik.a', other, 'tellen.tik.b'], other);
    if (v === other) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      cards.mark(other);
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', other]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** "Tien is zes en vier." */
  private split(): Seg[] {
    return [10, 'splits.is', this.item.n, 'splits.en', 10 - this.item.n];
  }

  private async celebrateSplits(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    await this.setCovered(false);
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards!.mark(10 - item.n);
    this.glow(item.n + 1, 10);
    await ctx.say([...this.split(), attempt === 2 ? 'lof.doorzetten' : 'lof.tien']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een rekenrek met zeven kralen opzij. */
const ICON = `<svg viewBox="0 0 200 160">
  <rect x="10" y="40" width="8" height="80" rx="4" fill="#d6ba8c"/><rect x="182" y="40" width="8" height="80" rx="4" fill="#d6ba8c"/>
  <rect x="12" y="77" width="176" height="6" rx="3" fill="#b9a68a"/>
  ${Array.from({ length: 10 }, (_, k) => {
    const x = k < 7 ? 20 + k * 16 : 126 + (k - 7) * 16 + 8;
    return `<svg x="${x}" y="58" width="16" height="44" viewBox="0 0 100 130">${svgInner(k < 5 ? BLUE : WHITE)}</svg>`;
  }).join('')}
</svg>`;

export const rekenrek: Activity<RekenrekItem> = {
  id: 'rekenrek',
  name: 'Rekenrek',
  skills: ['zien-10', 'splitsen-10'],
  makeItem: makeRekenrekItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.rekenrek'],
  icon: ICON,
  choice: ['keuze.rekenrek'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 2; n <= 10; n++) out.push(['rek.schuif.a', n, 'rek.schuif.b'], ['rek.maakervan.a', n, 'rek.maakervan.b']);
    for (let n = 2; n <= 10; n++) out.push(['rek.nujij', 'rek.schuif.a', n, 'rek.schuif.b']);
    return out;
  },
};
