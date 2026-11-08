import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { el, randInt, sleep, type Rng } from '../../core/util';
import { beadBar } from './sommen';
import { numberOptions } from './tellen';
import { NumberCards } from './veld';

/**
 * TIEN EN NOG WAT — de getallen 11 t/m 20: het gouden tienstaafje en een gekleurd staafje erbij,
 * zoals bij het Montessori-materiaal (Seguinbord met kralen). Eind groep 2 kan een kind tellen tot
 * minstens 20 (SLO-tussendoelen); in groep 3 wordt gerekend tot 20.
 * Niveaus: kralen → cijfer tot 15 → kralen → cijfer tot 20 → het getal horen en het cijfer zoeken
 * (de kralen komen dan pas bij de hint).
 */

export type TienMode = 'kralen' | 'woord';

export interface TienItem {
  n: number;
  mode: TienMode;
  options: number[];
}

type Row = [min: number, max: number, mode: TienMode];
export const TIEN_LEVELS: Row[] = [
  [11, 15, 'kralen'],
  [11, 20, 'kralen'],
  [11, 20, 'woord'],
];

let last = 0;

export function makeTienItem(_skill: string, level: number, rng: Rng): TienItem {
  const [lo, hi, mode] = TIEN_LEVELS[Math.min(level, TIEN_LEVELS.length - 1)];
  let n = randInt(rng, lo, hi);
  for (let i = 0; i < 10 && n === last; i++) n = randInt(rng, lo, hi);
  last = n;
  return { n, mode, options: numberOptions(n, 20, rng, 10) };
}

class Round {
  private root: HTMLElement;
  private material: HTMLElement;
  private cards: NumberCards;

  constructor(private ctx: ActivityContext, private item: TienItem) {
    this.root = el('div', 'som tien');
    this.root.dataset.answer = String(item.n); // voor tests
    this.material = el('div', 'som-materiaal tien-materiaal');
    this.root.append(this.material);
    ctx.stage.append(this.root);
    this.cards = new NumberCards(this.root, ctx.stage, item.options);
  }

  destroy(): void {
    this.cards.destroy();
    this.root.remove();
  }

  /** Het gouden tienstaafje met het gekleurde staafje erachter. Geeft alle kralen terug. */
  private showBeads(): { ten: SVGCircleElement[]; rest: SVGCircleElement[] } {
    const ten = beadBar(10);
    ten.classList.add('is-tien');
    const rest = beadBar(this.item.n - 10);
    this.material.replaceChildren(ten, rest);
    return {
      ten: [...ten.querySelectorAll<SVGCircleElement>('.som-kraal')],
      rest: [...rest.querySelectorAll<SVGCircleElement>('.som-kraal')],
    };
  }

  private question(): Seg[] {
    return this.item.mode === 'kralen' ? ['tien.vraag'] : ['tellen.tik.a', this.item.n, 'tellen.tik.b'];
  }

  /** "Tien en zes is zestien." */
  private sentence(): Seg[] {
    return [10, 'tien.en', this.item.n - 10, 'tien.is', this.item.n];
  }

  /** Tellen vanaf tien: het gouden staafje in één keer, daarna kraal voor kraal verder. */
  private async countOn(): Promise<void> {
    const { ctx } = this;
    const { ten, rest } = this.showBeads();
    await sleep(500);
    const beat = ctx.countBeat();
    ten.forEach((k) => k.classList.add('is-counted'));
    await beat();
    await ctx.say([10]);
    for (const [i, bead] of rest.entries()) {
      bead.classList.add('is-counted');
      await beat();
      await ctx.say([11 + i]);
    }
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    if (item.mode === 'kralen') this.showBeads();
    if (ctx.beginner) await ctx.say([item.mode === 'kralen' ? 'tien.uitleg' : 'tien.uitleg.woord']);
    let v = await this.cards.ask(ctx, this.question());
    if (v === item.n) return this.celebrate(1);
    const note = v === item.n - 10 || v === item.n - 1 || v === item.n + 1
      ? 'Bij de getallen boven de tien kijkt ze soms alleen naar het staafje erbij: tien en nog wat is nog nieuw.'
      : undefined;

    // Ladder 1: het gouden staafje is tien, tel verder vanaf tien.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    this.showBeads();
    await ctx.say(['tien.hint']);
    v = await this.cards.ask(ctx, this.question());
    if (v === item.n) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy telt door vanaf tien.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await ctx.say(['voordoen.start']);
    await this.countOn();
    await ctx.say(this.sentence());
    v = await this.cards.ask(ctx, ['tellen.tik.a', item.n, 'tellen.tik.b'], item.n);
    if (v === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      this.cards.mark(item.n);
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', item.n]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards.mark(item.n);
    this.showBeads();
    await sleep(400);
    await ctx.say([...this.sentence(), attempt === 2 ? 'lof.doorzetten' : 'lof.tienstaaf']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: het gouden tienstaafje met drie kralen erachter, en "13". */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M8 62 H192" stroke="#9a8f7a" stroke-width="4"/>
  ${Array.from({ length: 10 }, (_, i) => `<circle cx="${16 + i * 13}" cy="62" r="6.5" fill="#c8901c" stroke="#8a5f0c" stroke-width="2.5"/>`).join('')}
  ${Array.from({ length: 3 }, (_, i) => `<circle cx="${152 + i * 15}" cy="62" r="6.5" fill="#f3a3bf" stroke="#d17797" stroke-width="2.5"/>`).join('')}
  <text x="100" y="134" text-anchor="middle" font-size="44" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">13</text>
</svg>`;

export const tientallen: Activity<TienItem> = {
  id: 'tientallen',
  name: 'Tien en nog wat',
  skills: ['getallen-20'],
  makeItem: makeTienItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.tien'],
  icon: ICON,
  choice: ['keuze.tien'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 11; n <= 20; n++) {
      out.push([10, 'tien.en', n - 10, 'tien.is', n], ['tellen.tik.a', n, 'tellen.tik.b'], ['tellen.dushet', n]);
    }
    return out;
  },
};
