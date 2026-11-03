import type { LineId } from '../../content/spraak.nl';
import type { Seg } from '../../core/audio/speech';
import type { ActivityContext } from '../../core/domain';
import { onTap } from '../../core/ui/drag';
import { el, randInt, shuffle, sleep, svgEl, svgInner, type Rng } from '../../core/util';

/**
 * Een veldje met beestjes om te tellen. Gedeeld door "Samen tellen" en "Fluffy telt fout".
 * Opstellingen van makkelijk naar moeilijk (Clements & Sarama): op een rij → twee rijen
 * (5 en de rest, zoals een tienveld) → los door elkaar.
 */

export type Animal = 'eendje' | 'lieveheersbeestje' | 'visje';
export const ANIMALS: Animal[] = ['eendje', 'lieveheersbeestje', 'visje'];
export const ANIMAL_PLURAL: Record<Animal, LineId> = {
  eendje: 'obj.eendjes',
  lieveheersbeestje: 'obj.lieveheersbeestjes',
  visje: 'obj.visjes',
};

export type Layout = 'rij' | 'rijen' | 'los';

export const THUMB_SVG = `<svg viewBox="0 0 100 100"><path d="M24 48 h12 v40 h-12 z M42 48 L54 20 C57 12 69 15 67 26 L63 42 H80 C87 42 90 49 88 56 L82 80 C80 87 75 89 69 89 H42 Z"
  fill="#fff" stroke="#3b4a6b" stroke-width="5" stroke-linejoin="round"/></svg>`;

/** Inhoud van een beestje, om in een groter plaatje (keuzekaart) te zetten. */
export function animalInner(animal: Animal): string {
  return svgInner(ANIMAL_SVG[animal]);
}

const ANIMAL_SVG: Record<Animal, string> = {
  eendje: `<svg viewBox="0 0 100 100"><ellipse cx="46" cy="66" rx="34" ry="22" fill="#f8de7e" stroke="#ddbb52" stroke-width="4"/>
    <circle cx="68" cy="38" r="17" fill="#f8de7e" stroke="#ddbb52" stroke-width="4"/>
    <path d="M83 38 L97 42 L83 46 Z" fill="#f2a65a" stroke="#d98a3e" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="71" cy="34" r="3.5" fill="#3b4a6b"/>
    <path d="M30 62 C38 54 50 56 54 64" stroke="#ddbb52" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
  lieveheersbeestje: `<svg viewBox="0 0 100 100"><circle cx="50" cy="22" r="12" fill="#3b4a6b"/>
    <ellipse cx="50" cy="58" rx="34" ry="32" fill="#f19a8c" stroke="#d27769" stroke-width="4"/>
    <path d="M50 28 V90" stroke="#d27769" stroke-width="4"/>
    <circle cx="35" cy="48" r="6" fill="#3b4a6b"/><circle cx="65" cy="48" r="6" fill="#3b4a6b"/>
    <circle cx="33" cy="70" r="5" fill="#3b4a6b"/><circle cx="67" cy="70" r="5" fill="#3b4a6b"/></svg>`,
  visje: `<svg viewBox="0 0 100 100"><path d="M78 50 L96 34 L96 66 Z" fill="#9fcbe8" stroke="#73a9cf" stroke-width="4" stroke-linejoin="round"/>
    <ellipse cx="46" cy="50" rx="36" ry="24" fill="#9fcbe8" stroke="#73a9cf" stroke-width="4"/>
    <circle cx="26" cy="44" r="4" fill="#3b4a6b"/>
    <path d="M48 36 C54 44 54 56 48 64" stroke="#73a9cf" stroke-width="4" fill="none" stroke-linecap="round"/></svg>`,
};

// Wijsvinger omhoog; de vingertop zit op (43%, 6%) van het vakje.
export const POINTER_SVG = `<svg viewBox="0 0 100 100"><path d="M38 12 C38 6 48 6 48 12 V46 L52 30 C53 24 62 25 61 31 L60 48 L64 36 C66 30 74 32 72 38 L70 52 L73 44 C75 39 82 41 80 47 L74 74 C71 86 62 94 50 94 C38 94 28 86 26 74 L22 58 C20 52 28 48 31 54 L38 64 Z"
  fill="#fff" stroke="#3b4a6b" stroke-width="4" stroke-linejoin="round"/></svg>`;

/** Plaatsen als fracties (0–1) van het veld. Puur, zodat het te testen is. */
export function layoutPositions(layout: Layout, n: number, rng: Rng): [number, number][] {
  const step = 1 / 6;
  if (layout === 'rij') {
    return Array.from({ length: n }, (_, i) => [0.5 + (i - (n - 1) / 2) * step, 0.5]);
  }
  if (layout === 'rijen') {
    // Bovenste rij vol tot 5, de rest eronder links uitgelijnd (zoals een tienveld).
    const first = Math.min(n, 5);
    const left = 0.5 - ((first - 1) / 2) * step;
    return Array.from({ length: n }, (_, i) => [left + (i % 5) * step, i < 5 ? 0.3 : 0.72]);
  }
  // Los: willekeurige vakjes in een raster van 6 × 3, met een beetje speling.
  const cells = shuffle(rng, Array.from({ length: 18 }, (_, i) => i)).slice(0, n);
  return cells.map((c) => {
    const col = c % 6;
    const row = Math.floor(c / 6);
    const jx = (randInt(rng, 0, 20) - 10) / 100;
    const jy = (randInt(rng, 0, 20) - 10) / 100;
    return [(col + 0.5 + jx) / 6, (row + 0.5 + jy) / 3];
  });
}

export interface Box { x: number; y: number; w: number; h: number }

export function place(node: HTMLElement, b: Box): void {
  node.style.left = `${b.x}px`;
  node.style.top = `${b.y}px`;
  node.style.width = `${b.w}px`;
  node.style.height = `${b.h}px`;
}

/** Het veldje zelf: beestjes, gloed voor "geteld", en een wijsvinger voor Fluffy. */
export class Field {
  readonly root: HTMLElement;
  readonly objs: HTMLElement[] = [];
  private pointer: HTMLElement;
  private pos: [number, number][];
  private size = 0;
  private boxNow: Box = { x: 0, y: 0, w: 0, h: 0 };
  private pointing = -1;
  locked = true;
  onTap: ((i: number) => void) | null = null;

  constructor(
    private stage: HTMLElement,
    private item: { n: number; layout: Layout; animal: Animal },
    rng: Rng,
    private box: (W: number, H: number) => Box,
  ) {
    this.root = el('div', 'veld is-locked');
    this.root.dataset.n = String(item.n); // voor tests
    this.pos = layoutPositions(item.layout, item.n, rng);
    for (let i = 0; i < item.n; i++) {
      const o = el('div', 'v-obj');
      o.append(svgEl(ANIMAL_SVG[item.animal]));
      onTap(o, () => {
        if (!this.locked) this.onTap?.(i);
      });
      this.objs.push(o);
      this.root.append(o);
    }
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.pointer);
    stage.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }

  layout = (): void => {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const b = this.box(W, H);
    this.boxNow = b;
    const rows = this.item.layout === 'los' ? 3 : 2;
    this.size = Math.min((b.w / 6) * 0.88, (b.h / rows) * 0.8, 130);
    this.objs.forEach((o, i) => {
      const [cx, cy] = this.center(i);
      place(o, { x: cx - this.size / 2, y: cy - this.size / 2, w: this.size, h: this.size });
    });
    if (this.pointing >= 0) this.pointAt(this.pointing);
  };

  center(i: number): [number, number] {
    const b = this.boxNow;
    const [fx, fy] = this.pos[i];
    return [b.x + fx * b.w, b.y + fy * b.h];
  }

  lock(on: boolean): void {
    this.locked = on;
    this.root.classList.toggle('is-locked', on);
  }

  mark(i: number, on = true): void {
    this.objs[i].classList.toggle('is-counted', on);
  }

  isMarked(i: number): boolean {
    return this.objs[i].classList.contains('is-counted');
  }

  clearMarks(): void {
    this.objs.forEach((o) => o.classList.remove('is-counted', 'is-again'));
  }

  /** Zachtjes opveren (bij nog een keer aanwijzen). Geen knipperen. */
  bounce(i: number): void {
    const o = this.objs[i];
    o.classList.remove('is-again');
    void o.offsetWidth;
    o.classList.add('is-again');
  }

  /** Fluffy's wijsvinger boven een beestje. */
  pointAt(i: number): void {
    this.pointing = i;
    const [cx, cy] = this.center(i);
    const p = this.size * 0.75;
    place(this.pointer, { x: cx - p * 0.43, y: cy + this.size * 0.22 - p * 0.06, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  hidePointer(): void {
    this.pointing = -1;
    this.pointer.classList.remove('is-on');
  }
}

/** Volgorde waarin Fluffy telt: van links naar rechts, rij voor rij. */
export function readingOrder(field: Field): number[] {
  return field.objs
    .map((_, i) => i)
    .sort((a, b) => {
      const [ax, ay] = field.center(a);
      const [bx, by] = field.center(b);
      const rowH = field.objs[0].offsetHeight || 1;
      return Math.abs(ay - by) > rowH * 0.6 ? ay - by : ax - bx;
    });
}

/**
 * Het kind tikt elk beestje één keer aan. Met `along` zegt Fluffy bij elke tik het volgende
 * telwoord; zonder telt ze zelf. Al getelde beestjes tellen niet nog eens mee.
 * Klaar als alles geteld is (en het laatste telwoord is uitgesproken).
 */
export function tapToCount(field: Field, ctx: ActivityContext, along: boolean): Promise<void> {
  field.clearMarks();
  let count = 0;
  let lastRemark = 0;
  return new Promise((resolve) => {
    field.onTap = (i) => {
      if (field.isMarked(i)) {
        field.bounce(i);
        if (Date.now() - lastRemark > 5000) {
          lastRemark = Date.now();
          void ctx.say(['tellen.algeteld']);
        }
        return;
      }
      field.mark(i);
      count++;
      ctx.sounds.plop();
      const spoken = along ? ctx.say([count]) : sleep(250);
      if (count === field.objs.length) {
        field.onTap = null;
        field.lock(true);
        resolve(spoken);
      }
    };
    field.lock(false);
  });
}

/**
 * Drie getalkaartjes onderin: "Hoeveel?" → het getal dat ze aantikt.
 * Gedeeld door "Samen tellen" en "Kiekeboe". `root` krijgt de klasse show-cards als ze zichtbaar zijn.
 */
export class NumberCards {
  private cards: HTMLElement[];
  private answer: ((v: number) => void) | null = null;

  constructor(private root: HTMLElement, private stage: HTMLElement, private options: number[]) {
    this.cards = options.map((v) => {
      const c = el('div', 'v-card', String(v));
      onTap(c, () => this.answer?.(v));
      root.append(c);
      return c;
    });
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
  }

  private layout = (): void => {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const c = Math.min(0.2 * H, 0.13 * W, 150);
    const gap = c * 1.35;
    this.cards.forEach((card, i) => {
      const x = 0.59 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2;
      place(card, { x, y: 0.73 * H, w: c, h: c });
    });
  };

  show(on: boolean): void {
    this.root.classList.toggle('show-cards', on);
  }

  /** Het goede kaartje laten oplichten. */
  mark(v: number): void {
    this.cards[this.options.indexOf(v)].classList.add('is-counted');
  }

  /**
   * Stelt de vraag (opnieuw bij een tik op Fluffy) en wacht op een tik op een kaartje.
   * `highlight`: dit kaartje blijft oplichten (als Fluffy het net heeft voorgedaan).
   */
  async ask(ctx: ActivityContext, question: Seg[], highlight?: number): Promise<number> {
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight !== undefined) this.mark(highlight);
    this.show(true);
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(question);
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
    this.cards[this.options.indexOf(v)].classList.add('is-picked');
    await ctx.say([v]);
    return v;
  }
}
