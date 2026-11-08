import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { attachDrag, onTap } from '../../core/ui/drag';
import { el, pick, randInt, shuffle, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { place, THUMB_SVG, type Box } from './veld';

/**
 * MANDJE VULLEN — Geef-me-N (Wynn, 1990; Sarnecka & Carey, 2008).
 * "Kun je vier appels in het mandje leggen?" Het kind moet stoppen bij het getalwoord:
 * dat laat zien (en oefent) dat het laatste telwoord de hoeveelheid is.
 * Niveaus: weinig → veel, Fluffy telt mee → kind telt zelf, gesproken → cijferkaart,
 * tienveld (vijfstructuur) → los in het mandje.
 */

type Fruit = 'appel' | 'peer' | 'citroen';
const FRUITS: Fruit[] = ['appel', 'peer', 'citroen'];
const SINGULAR: Record<Fruit, LineId> = { appel: 'obj.appel', peer: 'obj.peer', citroen: 'obj.citroen' };
const PLURAL: Record<Fruit, LineId> = { appel: 'obj.appels', peer: 'obj.peren', citroen: 'obj.citroenen' };

export interface MandjeItem {
  n: number;
  mode: 'spoken' | 'numeral';
  countAlong: boolean;
  frame: 'ten' | 'loose';
  supply: number;
  fruit: Fruit;
}

type Row = [min: number, max: number, mode: MandjeItem['mode'], countAlong: boolean, frame: MandjeItem['frame']];
export const MANDJE_LEVELS: Record<string, Row[]> = {
  'hoeveel-5': [
    [1, 3, 'spoken', true, 'loose'],
    [2, 5, 'spoken', true, 'loose'],
    [2, 5, 'spoken', false, 'loose'],
  ],
  'hoeveel-10': [
    [4, 7, 'spoken', true, 'ten'],
    [5, 10, 'spoken', false, 'ten'],
    [5, 10, 'spoken', false, 'loose'],
  ],
  'cijfers-10': [
    [1, 6, 'numeral', true, 'ten'],
    [1, 10, 'numeral', false, 'ten'],
  ],
};

let lastN = 0;

export function makeMandjeItem(skill: string, level: number, rng: Rng): MandjeItem {
  const rows = MANDJE_LEVELS[skill];
  const [min, max, mode, countAlong, frame] = rows[Math.min(level, rows.length - 1)];
  let n = randInt(rng, min, max);
  for (let i = 0; i < 5 && n === lastN && max > min; i++) n = randInt(rng, min, max);
  lastN = n;
  return { n, mode, countAlong, frame, supply: Math.min(10, Math.max(n + 3, 5)), fruit: pick(rng, FRUITS) };
}

const FRUIT_SVG: Record<Fruit, string> = {
  appel: `<svg viewBox="0 0 100 100"><path d="M50 26 C52 16 56 12 60 10" stroke="#8a6a4f" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="66" cy="18" rx="12" ry="6" fill="#a5cf93" transform="rotate(-25 66 18)"/>
    <circle cx="50" cy="58" r="36" fill="#f4a690" stroke="#d98670" stroke-width="4"/>
    <ellipse cx="36" cy="46" rx="9" ry="6" fill="#fff" opacity=".45"/></svg>`,
  peer: `<svg viewBox="0 0 100 100"><path d="M50 20 C52 12 55 8 58 6" stroke="#8a6a4f" stroke-width="5" fill="none" stroke-linecap="round"/>
    <path d="M50 18 C40 18 38 34 38 42 C24 52 22 70 30 82 C38 95 62 95 70 82 C78 70 76 52 62 42 C62 34 60 18 50 18 Z" fill="#d3e3a0" stroke="#a9c26f" stroke-width="4"/>
    <ellipse cx="40" cy="60" rx="6" ry="9" fill="#fff" opacity=".45"/></svg>`,
  citroen: `<svg viewBox="0 0 100 100"><ellipse cx="50" cy="54" rx="38" ry="28" fill="#f7e08a" stroke="#dcbf5e" stroke-width="4"/>
    <ellipse cx="12" cy="54" rx="5" ry="4" fill="#f7e08a" stroke="#dcbf5e" stroke-width="3"/>
    <ellipse cx="88" cy="54" rx="5" ry="4" fill="#f7e08a" stroke="#dcbf5e" stroke-width="3"/>
    <ellipse cx="38" cy="44" rx="10" ry="5" fill="#fff" opacity=".5"/></svg>`,
};


interface Obj {
  el: HTMLElement;
  home: number;
  inBasket: boolean;
}

class Round {
  private root: HTMLElement;
  private objs: Obj[] = [];
  private basket: Obj[] = [];
  private card: HTMLElement | null = null;
  private basketEl: HTMLElement;
  private supplyEl: HTMLElement;
  private cells: HTMLElement[] = [];
  private duim: HTMLElement;
  private locked = true;
  private countAlong: boolean;
  private duimResolve: (() => void) | null = null;
  private idleTimer = 0;
  private idleRepeated = false;
  private looseOrder: number[];
  private jitter: [number, number][];
  private boxes!: { supply: Box; basket: Box; s: number; c: number };

  constructor(private ctx: ActivityContext, private item: MandjeItem) {
    this.countAlong = item.countAlong;
    this.looseOrder = shuffle(ctx.rng, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    this.jitter = Array.from({ length: 10 }, () => [ctx.rng() - 0.5, ctx.rng() - 0.5]);

    this.root = el('div', 'mandje is-locked');
    this.root.dataset.n = String(item.n); // voor tests
    this.supplyEl = el('div', 'm-panel');
    this.basketEl = el('div', 'm-basket');
    this.root.append(this.supplyEl, this.basketEl);
    if (item.frame === 'ten') {
      this.cells = Array.from({ length: 10 }, () => el('div', 'm-cell'));
      this.root.append(...this.cells);
    }
    if (item.mode === 'numeral') {
      this.card = el('div', 'm-card', String(item.n));
      this.root.append(this.card);
    }
    this.duim = el('div', 'm-duim');
    this.duim.append(svgEl(THUMB_SVG));
    onTap(this.duim, () => this.pressDuim());
    this.root.append(this.duim);

    for (let i = 0; i < item.supply; i++) {
      const o: Obj = { el: el('div', 'm-obj'), home: i, inBasket: false };
      o.el.append(svgEl(FRUIT_SVG[item.fruit]));
      this.attach(o);
      this.objs.push(o);
      this.root.append(o.el);
    }
    this.root.addEventListener('pointerdown', () => this.bumpIdle());
    ctx.stage.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    clearTimeout(this.idleTimer);
    this.root.remove();
  }

  // ── Opbouw en plaatsing ──

  private layout = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const supply: Box = { x: 0.2 * W, y: 0.08 * H, w: 0.29 * W, h: 0.84 * H };
    const basket: Box = { x: 0.52 * W, y: 0.31 * H, w: 0.45 * W, h: 0.42 * H };
    const pad = 14;
    const c = Math.min((basket.w - 2 * pad) / 5, (basket.h - 2 * pad) / 2);
    basket.h = c * 2 + 2 * pad;
    const s = Math.min((supply.w / 2) * 0.82, (supply.h / 5) * 0.86, 130);
    this.boxes = { supply, basket, s, c };

    place(this.supplyEl, supply);
    place(this.basketEl, basket);
    this.cells.forEach((cell, i) => {
      const [cx, cy] = this.basketCenter(i, false);
      place(cell, { x: cx - c / 2 + 4, y: cy - c / 2 + 4, w: c - 8, h: c - 8 });
    });
    if (this.card) {
      const w = Math.min(0.15 * W, 0.22 * H);
      place(this.card, { x: basket.x + basket.w / 2 - w / 2, y: 0.05 * H, w, h: w });
    }
    const d = Math.min(124, 0.16 * H);
    place(this.duim, { x: W - d - 0.03 * W, y: H - d - 0.04 * H, w: d, h: d });
    this.objs.forEach((o) => this.position(o));
  };

  private basketCenter(slot: number, loose: boolean): [number, number] {
    const { basket, c } = this.boxes;
    const i = loose ? this.looseOrder[slot] : slot;
    const col = i % 5;
    const row = Math.floor(i / 5);
    let x = basket.x + (basket.w - 5 * c) / 2 + c * (col + 0.5);
    let y = basket.y + (basket.h - 2 * c) / 2 + c * (row + 0.5);
    if (loose) {
      x += this.jitter[i][0] * c * 0.3;
      y += this.jitter[i][1] * c * 0.25;
    }
    return [x, y];
  }

  private supplyCenter(home: number): [number, number] {
    const { supply } = this.boxes;
    const col = home % 2;
    const row = Math.floor(home / 2);
    return [supply.x + (supply.w / 2) * (col + 0.5), supply.y + (supply.h / 5) * (row + 0.5)];
  }

  private position(o: Obj): void {
    const { s, c } = this.boxes;
    const idx = this.basket.indexOf(o);
    const [x, y] = idx >= 0 ? this.basketCenter(idx, this.item.frame === 'loose') : this.supplyCenter(o.home);
    const size = idx >= 0 ? c * 0.84 : s;
    place(o.el, { x: x - size / 2, y: y - size / 2, w: size, h: size });
  }

  private relayout(): void {
    this.objs.forEach((o) => this.position(o));
  }

  // ── Interactie ──

  private attach(o: Obj): void {
    const stageRect = () => this.ctx.stage.getBoundingClientRect();
    attachDrag(o.el, {
      enabled: () => !this.locked,
      onTap: () => (o.inBasket ? this.toSupply(o) : this.toBasket(o)),
      onDragStart: () => o.el.classList.add('is-dragging'),
      onDragMove: (x, y) => {
        const r = stageRect();
        const size = o.el.offsetWidth;
        o.el.style.left = `${x - r.left - size / 2}px`;
        o.el.style.top = `${y - r.top - size / 2}px`;
      },
      onDrop: (x) => {
        o.el.classList.remove('is-dragging');
        const r = stageRect();
        const { supply, basket } = this.boxes;
        // Ruime vangzone: alles rechts van het midden tussen voorraad en mandje telt als "in het mandje".
        const border = (supply.x + supply.w + basket.x) / 2;
        if (x - r.left > border) {
          if (!o.inBasket) this.toBasket(o);
          else this.position(o);
        } else if (o.inBasket) this.toSupply(o);
        else this.position(o);
      },
    });
  }

  private toBasket(o: Obj, silent = false): void {
    if (o.inBasket || this.basket.length >= 10) return this.position(o);
    o.inBasket = true;
    this.basket.push(o);
    this.position(o);
    if (!silent) {
      this.ctx.sounds.plop();
      if (this.countAlong) void this.ctx.say([this.basket.length]);
    }
  }

  private toSupply(o: Obj): void {
    if (!o.inBasket) return;
    o.inBasket = false;
    this.basket.splice(this.basket.indexOf(o), 1);
    this.relayout();
  }

  private lock(on: boolean): void {
    this.locked = on;
    this.root.classList.toggle('is-locked', on);
    this.ctx.setRepeat(on ? null : () => void this.prompt());
  }

  private pressDuim(): void {
    if (this.locked || !this.duimResolve) return;
    const r = this.duimResolve;
    this.duimResolve = null;
    clearTimeout(this.idleTimer);
    r();
  }

  private waitDuim(): Promise<void> {
    this.idleRepeated = false;
    this.bumpIdle();
    return new Promise((r) => (this.duimResolve = r));
  }

  /** Eén keer de vraag herhalen als er lang niets gebeurt. Geen aandringen, geen tijdsdruk. */
  private bumpIdle(): void {
    clearTimeout(this.idleTimer);
    if (this.idleRepeated) return;
    this.idleTimer = window.setTimeout(() => {
      if (!this.locked && this.duimResolve) {
        this.idleRepeated = true;
        void this.prompt();
      }
    }, 25_000);
  }

  // ── Wat Fluffy zegt en doet ──

  private promptSegs(): Seg[] {
    const { n, fruit, mode } = this.item;
    if (mode === 'numeral') return ['mandje.cijfer.a', PLURAL[fruit], 'mandje.cijfer.b'];
    return ['mandje.vraag.a', n, n === 1 ? SINGULAR[fruit] : PLURAL[fruit], 'mandje.vraag.b'];
  }

  private async prompt(extra: Seg[] = []): Promise<void> {
    this.ctx.fluffy.set('rust');
    await this.ctx.say([...this.promptSegs(), ...extra]);
    if (!this.locked) this.ctx.fluffy.set('luisteren');
  }

  /** Fluffy telt wat er in het mandje ligt, en wijst elk ding één keer aan. */
  private async countBasket(): Promise<void> {
    const beat = this.ctx.countBeat();
    for (let i = 0; i < this.basket.length; i++) {
      await beat();
      this.basket[i].el.classList.add('is-counted');
      await this.ctx.say([i + 1]);
    }
  }

  private clearCounted(): void {
    this.objs.forEach((o) => o.el.classList.remove('is-counted'));
    this.card?.classList.remove('is-counted');
  }

  private async emptyBasket(): Promise<void> {
    this.clearCounted();
    [...this.basket].forEach((o) => this.toSupply(o));
    await sleep(500);
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    // Ze mag al beginnen terwijl Fluffy de vraag nog stelt.
    this.lock(false);
    void this.prompt(ctx.beginner ? ['mandje.uitleg.slepen', 'mandje.duim'] : []);

    let attempt = 1;
    for (;;) {
      await this.waitDuim();
      this.lock(true);
      ctx.speechStop();
      const k = this.basket.length;

      if (k === 0) {
        // Per ongeluk getikt: geen poging, gewoon de vraag nog eens.
        await ctx.say(['mandje.leeg']);
        this.lock(false);
        void this.prompt();
        continue;
      }

      if (k === item.n) {
        await this.celebrate(attempt);
        return attempt === 1 ? { credit: 1, modeled: false } : attempt === 2 ? { credit: 0.5, modeled: false } : { credit: 0, modeled: true };
      }

      if (attempt === 1) {
        await this.hint(k);
        this.countAlong = true; // extra steun bij de tweede poging
        attempt = 2;
      } else if (attempt === 2) {
        await this.model();
        attempt = 3;
      } else {
        await this.fixTogether();
        if (!retry) await ctx.say(['later.nog']);
        return { credit: 0, modeled: true };
      }
      this.lock(false);
      ctx.fluffy.set('luisteren');
    }
  }

  private async celebrate(attempt: number): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    if (!this.countAlong) {
      await ctx.say(['mandje.kijken']);
      await this.countBasket();
    } else {
      this.basket.forEach((o) => o.el.classList.add('is-counted'));
    }
    const praise: LineId =
      attempt === 3 ? 'lof.samen'
      : attempt === 2 ? 'lof.doorzetten'
      : item.mode === 'numeral' ? pick(ctx.rng, ['lof.cijfer', 'lof.precies'] as const)
      : pick(ctx.rng, ['lof.precies', 'lof.eenvooreen', 'lof.stoppen'] as const);
    await ctx.say(['mandje.zijnhet', item.n, 'mandje.precies', praise]);
    await sleep(400);
  }

  /** Ladder stap 1: samen natellen en een richting geven. */
  private async hint(k: number): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('nadenken');
    await ctx.say(['hint.samen']);
    await this.countBasket();
    if (item.mode === 'numeral') {
      this.card?.classList.add('is-counted');
      await ctx.say(['hint.zijn', k, 'hint.cijferis', item.n]);
    } else {
      await ctx.say(['hint.zijn', k, 'hint.wilden', item.n]);
    }
    await ctx.say([k > item.n ? 'hint.teveel' : 'hint.teweinig']);
    this.clearCounted();
  }

  /** Ladder stap 2: Fluffy doet het hardop denkend voor, daarna doen ze het samen. */
  private async model(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.start']);
    await this.emptyBasket();
    await ctx.say(['voordoen.denk']);
    const free = this.objs.filter((o) => !o.inBasket);
    const beat = ctx.countBeat();
    for (let i = 0; i < item.n; i++) {
      this.toBasket(free[i], true);
      ctx.sounds.plop();
      await beat();
      free[i].el.classList.add('is-counted');
      await ctx.say([i + 1]);
    }
    if (this.card) this.card.classList.add('is-counted');
    await ctx.say(['voordoen.laatste.a', item.n, 'voordoen.laatste.b', item.n, 'voordoen.laatste.c']);
    await sleep(700);
    ctx.fluffy.set('rust');
    await ctx.say(['voordoen.samen']);
    await this.emptyBasket();
    this.countAlong = true;
    await this.prompt();
  }

  /** Als het ook samen niet lukt: Fluffy maakt het af, zonder oordeel, en het spel gaat door. */
  private async fixTogether(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('rust');
    while (this.basket.length > item.n) this.toSupply(this.basket[this.basket.length - 1]);
    const free = this.objs.filter((o) => !o.inBasket);
    while (this.basket.length < item.n) this.toBasket(free.shift()!, true);
    await sleep(500);
    this.basket.forEach((o) => o.el.classList.add('is-counted'));
    await ctx.say(['voordoen.kijk', item.n]);
  }
}

/** Plaatje voor het keuzemoment: een mandje met appels. */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M60 70 C60 20 140 20 140 70" fill="none" stroke="#d6ba8c" stroke-width="9" stroke-linecap="round"/>
  <svg x="46" y="30" width="56" height="56" viewBox="0 0 100 100">${svgInner(FRUIT_SVG.appel)}</svg>
  <svg x="98" y="30" width="56" height="56" viewBox="0 0 100 100">${svgInner(FRUIT_SVG.appel)}</svg>
  <path d="M28 70 H172 L156 140 C154 148 148 150 140 150 H60 C52 150 46 148 44 140 Z" fill="#f0dfc2" stroke="#d6ba8c" stroke-width="6" stroke-linejoin="round"/>
</svg>`;

export const mandje: Activity<MandjeItem> = {
  id: 'mandje',
  name: 'Mandje vullen',
  skills: ['hoeveel-5', 'hoeveel-10', 'cijfers-10'],
  makeItem: makeMandjeItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.mandje'],
  icon: ICON,
  choice: ['keuze.mandje'],
  phrases() {
    const out: Seg[][] = FRUITS.map((f) => ['mandje.cijfer.a', PLURAL[f], 'mandje.cijfer.b']);
    for (let n = 1; n <= 10; n++) {
      for (const f of FRUITS) out.push(['mandje.vraag.a', n, n === 1 ? SINGULAR[f] : PLURAL[f], 'mandje.vraag.b']);
      out.push(
        ['mandje.zijnhet', n], ['hint.zijn', n], ['hint.wilden', n], ['hint.cijferis', n],
        ['voordoen.laatste.a', n], ['voordoen.laatste.b', n, 'voordoen.laatste.c'], ['voordoen.kijk', n],
      );
    }
    return out;
  },
};
