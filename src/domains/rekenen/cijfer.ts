import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, pick, randInt, shuffle, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { patternPoints, patternSvg, VIEW, type Point } from './stippen';
import { answerOptions } from './tellen';
import { NumberCards, place, POINTER_SVG, type Box } from './veld';

/**
 * CIJFERS ZOEKEN — drie vormen van hetzelfde getal aan elkaar koppelen: het gesproken woord,
 * het cijfer en de hoeveelheid (triple-code-model, Dehaene; Number Worlds, Griffin & Case).
 * - cijfer → stippen: "Zoek het kaartje dat bij dit cijfer hoort."
 * - stippen → cijfer: "Welk getal hoort bij dit plaatje?"
 * - woord → stippen: "Zoek het kaartje met zeven." (alleen gesproken)
 * De stippen staan in een tienveld, zodat ze de vijfstructuur kan gebruiken.
 */

export type CijferMode = 'cijfer-stippen' | 'stippen-cijfer' | 'woord-stippen';

export interface CijferItem {
  n: number;
  mode: CijferMode;
  /** Keuzes, oplopend; bij stippen-kaartjes in deze volgorde naast elkaar. */
  options: number[];
}

type Row = [min: number, max: number, modes: CijferMode[], near: boolean];
export const CIJFER_LEVELS: Row[] = [
  [1, 6, ['cijfer-stippen', 'stippen-cijfer'], false],
  [1, 10, ['cijfer-stippen', 'stippen-cijfer', 'woord-stippen'], true],
];

/** Drie keuzes: dichtbij (±1, ±2) of duidelijk anders (2 tot 4 ernaast). */
export function cijferOptions(n: number, near: boolean, rng: Rng): number[] {
  if (near) return answerOptions(n, rng);
  const far = shuffle(rng, [n - 4, n - 3, n - 2, n + 2, n + 3, n + 4].filter((k) => k >= 1 && k <= 10));
  return [n, ...far.slice(0, 2)].sort((a, b) => a - b);
}

let lastN = 0;

export function makeCijferItem(_skill: string, level: number, rng: Rng): CijferItem {
  const [min, max, modes, near] = CIJFER_LEVELS[Math.min(level, CIJFER_LEVELS.length - 1)];
  let n = randInt(rng, min, max);
  for (let i = 0; i < 5 && n === lastN; i++) n = randInt(rng, min, max);
  lastN = n;
  return { n, mode: pick(rng, modes), options: cijferOptions(n, near, rng) };
}

class Round {
  private root: HTMLElement;
  private target: HTMLElement | null = null;
  private dotCards: HTMLElement[] = [];
  private numberCards: NumberCards | null = null;
  private pointer: HTMLElement;
  private answer: ((v: number) => void) | null = null;

  constructor(private ctx: ActivityContext, private item: CijferItem) {
    this.root = el('div', 'cijfer');
    this.root.dataset.n = String(item.n); // voor tests
    if (item.mode === 'cijfer-stippen') {
      this.target = el('div', 'cf-cijfer', String(item.n));
    } else if (item.mode === 'stippen-cijfer') {
      this.target = el('div', 'cf-plaatje');
      this.target.append(svgEl(patternSvg('tienveld', item.n)));
    }
    if (this.target) this.root.append(this.target);
    if (item.mode === 'stippen-cijfer') {
      this.numberCards = new NumberCards(this.root, ctx.stage, item.options);
    } else {
      this.dotCards = item.options.map((v) => {
        const c = el('div', 'cf-kaart');
        c.append(svgEl(patternSvg('tienveld', v)));
        onTap(c, () => this.answer?.(v));
        this.root.append(c);
        return c;
      });
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
    this.numberCards?.destroy();
    this.root.remove();
  }

  private layout = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    if (this.target) {
      const h = this.item.mode === 'cijfer-stippen' ? Math.min(0.3 * H, 220) : Math.min(0.42 * H, 0.27 * W);
      const w = this.item.mode === 'cijfer-stippen' ? h * 0.8 : h * (VIEW.w / VIEW.h);
      place(this.target, { x: 0.59 * W - w / 2, y: 0.07 * H, w, h });
    }
    if (this.dotCards.length) {
      const w = Math.min(0.23 * W, 0.42 * H);
      const h = w * (VIEW.h / VIEW.w);
      const gap = w * 1.08;
      const y = this.target ? 0.6 * H : 0.4 * H - h / 2;
      this.dotCards.forEach((c, i) => place(c, { x: 0.59 * W + (i - 1) * gap - w / 2, y, w, h }));
    }
  };

  private question(): Seg[] {
    const { mode, n } = this.item;
    if (mode === 'cijfer-stippen') return ['cijfer.bijcijfer'];
    if (mode === 'stippen-cijfer') return ['cijfer.welkgetal'];
    return ['cijfer.zoek', n];
  }

  private async ask(segs: Seg[], highlight?: number): Promise<number> {
    const { ctx } = this;
    if (this.numberCards) return this.numberCards.ask(ctx, segs, highlight);
    this.dotCards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight !== undefined) this.mark(highlight);
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(segs);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt());
    const v = await new Promise<number>((resolve) => {
      this.answer = (val) => {
        this.answer = null;
        resolve(val);
      };
      void prompt();
    });
    ctx.setRepeat(null);
    ctx.speechStop();
    this.dotCards[this.item.options.indexOf(v)].classList.add('is-picked');
    await sleep(300);
    return v;
  }

  private cardBox(v: number): Box {
    const node = v < 0 || !this.dotCards.length ? this.target! : this.dotCards[this.item.options.indexOf(v)];
    const r = node.getBoundingClientRect();
    const st = this.ctx.stage.getBoundingClientRect();
    return { x: r.left - st.left, y: r.top - st.top, w: r.width, h: r.height };
  }

  private pointAt(b: Box, p: Point): void {
    const size = Math.max(56, b.w * 0.2);
    const x = b.x + (p.x / VIEW.w) * b.w;
    const y = b.y + (p.y / VIEW.h) * b.h;
    place(this.pointer, { x: x - size * 0.43, y: y + size * 0.05, w: size, h: size });
    this.pointer.classList.add('is-on');
  }

  /** Fluffy telt de stippen op een kaartje; boven de vijf via "een volle rij is vijf". */
  private async countDots(b: Box, n: number): Promise<void> {
    const points = patternPoints('tienveld', n);
    let from = 0;
    if (n > 5) {
      this.pointAt(b, points[2]);
      await this.ctx.say(['kiekeboe.rij']);
      from = 5;
    }
    for (let i = from; i < n; i++) {
      this.pointAt(b, points[i]);
      await sleep(250);
      await this.ctx.say([i + 1]);
    }
    this.pointer.classList.remove('is-on');
  }

  private mark(v: number): void {
    if (this.numberCards) this.numberCards.mark(v);
    else this.dotCards[this.item.options.indexOf(v)].classList.add('is-counted');
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    let v = await this.ask(this.question());
    if (v === item.n) return this.celebrate(1);

    // Ladder 1: samen kijken naar wat ze koos (of naar het plaatje), en weer proberen.
    ctx.fluffy.set('nadenken');
    if (item.mode === 'stippen-cijfer') {
      this.numberCards!.show(false);
      await ctx.say(['hint.samen']);
      await this.countDots(this.cardBox(-1), item.n);
    } else {
      await this.countDots(this.cardBox(v), v);
      await ctx.say(['hier.zijn', v, 'cijfer.zoeken', item.n]);
    }
    v = await this.ask(item.mode === 'stippen-cijfer' ? ['cijfer.welkgetal'] : ['cijfer.zoek', item.n]);
    if (v === item.n) return this.celebrate(2);

    // Ladder 2: Fluffy wijst het goede aan en telt het, dan tikt zij het aan.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.start']);
    this.mark(item.n);
    await this.countDots(this.cardBox(item.mode === 'stippen-cijfer' ? -1 : item.n), item.n);
    await ctx.say(item.mode === 'woord-stippen' ? ['tellen.dushet', item.n] : ['tellen.dushet', item.n, 'cijfer.netals', item.n]);
    v = await this.ask(['cijfer.tikjij'], item.n);
    this.mark(item.n);
    if (v === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['tellen.zijnhet', item.n, 'lof.samen']);
    } else {
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', item.n]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.mark(item.n);
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : item.mode === 'stippen-cijfer' ? 'lof.zien' : 'lof.cijfer';
    await ctx.say(['tellen.zijnhet', item.n, praise]);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een cijfer en een tienveld. */
const ICON = `<svg viewBox="0 0 200 160">
  <rect x="12" y="34" width="62" height="80" rx="14" fill="#fff" stroke="#e2d4bc" stroke-width="5"/>
  <text x="43" y="96" text-anchor="middle" font-size="62" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">7</text>
  <svg x="82" y="40" width="112" height="70" viewBox="0 0 400 250">${svgInner(patternSvg('tienveld', 7))}</svg>
</svg>`;

export const cijfer: Activity<CijferItem> = {
  id: 'cijfer',
  name: 'Cijfers zoeken',
  skills: ['cijfers-10'],
  makeItem: makeCijferItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.cijfer'],
  icon: ICON,
  choice: ['keuze.cijfer'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 1; n <= 10; n++) {
      out.push(['cijfer.zoek', n], ['cijfer.zoeken', n], ['cijfer.netals', n], ['hier.zijn', n]);
    }
    return out;
  },
};
