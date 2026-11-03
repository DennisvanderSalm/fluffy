import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { LineId } from '../../content/spraak.nl';
import type { Seg } from '../../core/audio/speech';
import { onTap } from '../../core/ui/drag';
import { el, pick, randInt, shuffle, sleep, type Rng } from '../../core/util';
import {
  ANIMAL_PLURAL, ANIMALS, animalInner, Field, place, readingOrder, tapToCount, type Animal, type Layout,
} from './veld';

/**
 * SAMEN TELLEN — telprincipes (Gelman & Gallistel, 1978) en de leerlijn tellen (Clements & Sarama).
 * Het kind tikt elk beestje één keer aan (één-op-één), Fluffy zegt de telwoorden (vaste volgorde).
 * Daarna: "Hoeveel zijn het er?" (het laatste telwoord is de hoeveelheid).
 * Niveaus: op een rij → twee rijen → los; Fluffy telt mee → het kind telt zelf (bij "hoeveel").
 */

export interface TellenItem {
  n: number;
  layout: Layout;
  /** Zegt Fluffy de telwoorden bij elke tik? */
  along: boolean;
  animal: Animal;
  /** Antwoordkaartjes, oplopend. */
  options: number[];
}

type Row = [min: number, max: number, layout: Layout, along: boolean];
export const TELLEN_LEVELS: Record<string, Row[]> = {
  'tellen-5': [
    [2, 3, 'rij', true],
    [3, 5, 'rij', true],
    [3, 5, 'los', true],
  ],
  'tellen-10': [
    [5, 7, 'rijen', true],
    [6, 10, 'rijen', true],
    [6, 10, 'los', true],
  ],
  'hoeveel-5': [
    [2, 4, 'rij', true],
    [3, 5, 'rij', false],
    [3, 5, 'los', false],
  ],
  'hoeveel-10': [
    [5, 7, 'rijen', true],
    [6, 10, 'rijen', false],
    [6, 10, 'los', false],
  ],
};

/** Drie kaartjes: het goede getal, één ernaast, en nog één dichtbij. Tussen 1 en 10. */
export function answerOptions(n: number, rng: Rng): number[] {
  const valid = (k: number) => k >= 1 && k <= 10 && k !== n;
  const near = shuffle(rng, [n - 1, n + 1].filter(valid));
  const far = shuffle(rng, [n - 2, n + 2].filter(valid));
  const others = [...near.slice(0, 1), ...shuffle(rng, [...near.slice(1), ...far])].slice(0, 2);
  return [n, ...others].sort((a, b) => a - b);
}

let lastN = 0;

export function makeTellenItem(skill: string, level: number, rng: Rng): TellenItem {
  const rows = TELLEN_LEVELS[skill];
  const [min, max, layout, along] = rows[Math.min(level, rows.length - 1)];
  let n = randInt(rng, min, max);
  for (let i = 0; i < 5 && n === lastN && max > min; i++) n = randInt(rng, min, max);
  lastN = n;
  return { n, layout: layout === 'rij' && n > 5 ? 'rijen' : layout, along, animal: pick(rng, ANIMALS), options: answerOptions(n, rng) };
}

class Round {
  private field: Field;
  private cards: HTMLElement[] = [];
  private answer: ((v: number) => void) | null = null;

  constructor(private ctx: ActivityContext, private item: TellenItem) {
    this.field = new Field(ctx.stage, item, ctx.rng, (W, H) => ({ x: 0.22 * W, y: 0.05 * H, w: 0.74 * W, h: 0.64 * H }));
    this.cards = item.options.map((v) => {
      const c = el('div', 'v-card', String(v));
      onTap(c, () => this.answer?.(v));
      this.field.root.append(c);
      return c;
    });
    this.layoutCards();
    window.addEventListener('resize', this.layoutCards);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layoutCards);
    this.field.destroy();
  }

  private layoutCards = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const c = Math.min(0.2 * H, 0.13 * W, 150);
    const mid = 0.59 * W;
    const gap = c * 1.35;
    this.cards.forEach((card, i) => {
      const x = mid + (i - (this.cards.length - 1) / 2) * gap - c / 2;
      place(card, { x, y: 0.73 * H, w: c, h: c });
    });
  };

  private countPrompt(): LineId[] {
    return ['tellen.vraag.a', ANIMAL_PLURAL[this.item.animal], 'tellen.vraag.b'];
  }

  /** Het kind telt; Fluffy telt wel of niet mee. */
  private async count(along: boolean, intro: LineId[]): Promise<void> {
    const { ctx } = this;
    const explain: LineId = along ? 'tellen.uitleg.mee' : 'tellen.uitleg.zelf';
    const prompt = async (first: LineId[]) => {
      ctx.fluffy.set('rust');
      await ctx.say([...first, explain]);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt(this.countPrompt()));
    const counting = tapToCount(this.field, ctx, along);
    void prompt(intro);
    await counting;
    ctx.setRepeat(null);
  }

  /** "Hoeveel zijn het er?" → het getal dat ze aantikt. */
  private async ask(question: Seg[]): Promise<number> {
    const { ctx } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    this.field.root.classList.add('show-cards');
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
    this.cards[this.item.options.indexOf(v)].classList.add('is-picked');
    await ctx.say([v]);
    return v;
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    await this.count(item.along, this.countPrompt());
    await sleep(400);

    let v = await this.ask(ctx.beginner ? ['tellen.hoeveel', 'tellen.hoeveel.tik'] : ['tellen.hoeveel']);
    if (v === item.n) return this.celebrate(1, item.along);

    // Ladder 1: nog een keer samen tellen, nu telt Fluffy mee.
    ctx.fluffy.set('nadenken');
    this.field.root.classList.remove('show-cards');
    await ctx.say(['tellen.hint']);
    await this.count(true, []);
    await sleep(400);
    v = await this.ask(['tellen.hoeveel']);
    if (v === item.n) return this.celebrate(2, true);

    // Ladder 2: Fluffy telt hardop voor, en ze tikken samen het getal aan.
    await this.model();
    v = await this.ask(['tellen.tik.a', item.n, 'tellen.tik.b']);
    const card = this.cards[item.options.indexOf(item.n)];
    if (v === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['tellen.zijnhet', item.n, 'lof.samen']);
    } else {
      card.classList.add('is-counted');
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', item.n]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async model(): Promise<void> {
    const { ctx, item, field } = this;
    ctx.fluffy.set('nadenken');
    this.field.root.classList.remove('show-cards');
    await ctx.say(['voordoen.start']);
    field.clearMarks();
    const order = readingOrder(field);
    for (let k = 0; k < order.length; k++) {
      field.pointAt(order[k]);
      await sleep(350);
      field.mark(order[k]);
      await ctx.say([k + 1]);
    }
    field.hidePointer();
    this.cards[item.options.indexOf(item.n)].classList.add('is-counted');
    this.field.root.classList.add('show-cards');
    await ctx.say(['voordoen.laatste.a', item.n, 'tellen.dushet', item.n]);
    await sleep(600);
    ctx.fluffy.set('rust');
  }

  private async celebrate(attempt: 1 | 2, along: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards[item.options.indexOf(item.n)].classList.add('is-counted');
    const praise: LineId =
      attempt === 2 ? 'lof.doorzetten'
      : along ? pick(ctx.rng, ['lof.laatste', 'lof.eenkeer'] as const)
      : pick(ctx.rng, ['lof.precies', 'lof.eenkeer'] as const);
    await ctx.say(['tellen.zijnhet', item.n, praise]);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: drie eendjes op een rij. */
const ICON = `<svg viewBox="0 0 200 160">${[0, 1, 2]
  .map((i) => `<svg x="${8 + i * 62}" y="${i === 1 ? 30 : 56}" width="62" height="62" viewBox="0 0 100 100">${animalInner('eendje')}</svg>`)
  .join('')}
  <path d="M20 140 Q100 122 180 140" fill="none" stroke="#9fcbe8" stroke-width="7" stroke-linecap="round"/></svg>`;

export const tellen: Activity<TellenItem> = {
  id: 'tellen',
  name: 'Samen tellen',
  skills: ['tellen-5', 'tellen-10', 'hoeveel-5', 'hoeveel-10'],
  makeItem: makeTellenItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.tellen'],
  icon: ICON,
  choice: ['keuze.tellen'],
  phrases() {
    const out: Seg[][] = ANIMALS.map((a) => ['tellen.vraag.a', ANIMAL_PLURAL[a], 'tellen.vraag.b']);
    for (let n = 1; n <= 10; n++) {
      out.push(['tellen.zijnhet', n], ['tellen.dushet', n], ['tellen.tik.a', n, 'tellen.tik.b'], ['voordoen.laatste.a', n]);
    }
    return out;
  },
};
