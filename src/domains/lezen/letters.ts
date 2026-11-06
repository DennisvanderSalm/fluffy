import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { onTap } from '../../core/ui/drag';
import { el, pick, shuffle, sleep, svgEl, type Rng } from '../../core/util';
import { letterOf, ONSET_WORDS, PICTURE, stretchLine, wordLine, type Word } from './plaatjes';

/**
 * LETTERS ZOEKEN — de letter bij een beginklank kiezen. Klanken horen en letters kennen werken
 * samen het best (Bus & van IJzendoorn, 1999; National Reading Panel, 2000). Fluffy gebruikt
 * de klank, nooit de letternaam ("mmmaan", niet "em"); zo leert ze de klank die ze later bij
 * het lezen nodig heeft. Het plaatje is een sleutelwoord: maan hoort bij de m.
 * Niveaus: twee letters → drie letters → drie met een letter die erop lijkt (m/n, b/d).
 */

export interface LetterItem {
  word: Word;
  letter: string;
  options: string[];
}

/** Letters die als afleider mogen verschijnen. */
const POOL = ['m', 'v', 'h', 'b', 'p', 'k', 't', 's', 'r', 'n', 'd', 'z', 'l'];
/** Letters die op elkaar lijken: de lastige afleiders. */
const LOOKALIKE: Record<string, string> = { m: 'n', n: 'm', b: 'd', d: 'b', p: 'b', h: 'n', v: 'w', k: 'h', t: 'f' };

/** Woorden waarvan de beginklank één letter is. */
export const LETTER_WORDS = ONSET_WORDS.filter((w) => letterOf(w));

let lastWord: Word | null = null;

export function makeLetterItem(_skill: string, level: number, rng: Rng): LetterItem {
  let word = pick(rng, LETTER_WORDS);
  for (let i = 0; i < 5 && word === lastWord; i++) word = pick(rng, LETTER_WORDS);
  lastWord = word;
  const letter = letterOf(word)!;
  let others = shuffle(rng, POOL.filter((l) => l !== letter && l !== LOOKALIKE[letter])).slice(0, level <= 0 ? 1 : 2);
  if (level >= 2 && LOOKALIKE[letter]) others = [LOOKALIKE[letter], others[0]];
  return { word, letter, options: shuffle(rng, [letter, ...others]) };
}

class Round {
  private root: HTMLElement;
  private model: HTMLElement;
  private cards: HTMLElement[];
  private answer: ((i: number) => void) | null = null;

  constructor(private ctx: ActivityContext, private item: LetterItem) {
    this.root = el('div', 'klanken');
    this.root.dataset.answer = item.letter; // voor tests
    this.model = el('div', 'lz-doel');
    this.model.append(svgEl(PICTURE[item.word]));
    this.root.append(this.model);
    this.cards = item.options.map((l, i) => {
      const c = el('div', 'lz-kaart is-letter', l);
      c.dataset.letter = l;
      onTap(c, () => this.answer?.(i));
      this.root.append(c);
      return c;
    });
    ctx.stage.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }

  private layout = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const m = Math.min(0.3 * H, 0.2 * W, 220);
    place(this.model, { x: 0.59 * W - m / 2, y: 0.05 * H, w: m, h: m });
    const c = Math.min(0.27 * H, 0.19 * W, 210);
    const gap = c * 1.3;
    this.cards.forEach((card, i) => {
      place(card, { x: 0.59 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2, y: 0.42 * H, w: c, h: c });
      card.style.fontSize = `${c * 0.62}px`;
    });
  };

  private glow(node: HTMLElement | null): void {
    [this.model, ...this.cards].forEach((n) => n.classList.toggle('is-named', n === node));
  }

  private question(): Seg[] {
    return ['letter.vraag', wordLine(this.item.word)];
  }

  /** Vraag stellen en wachten op een letter. Een tik op Fluffy zegt het woord en de vraag opnieuw. */
  private async ask(question: Seg[], highlight?: string): Promise<string> {
    const { ctx, item } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight) this.cards[item.options.indexOf(highlight)].classList.add('is-counted');
    this.root.classList.add('is-open');
    let run = 0;
    let done = false;
    const prompt = async (withWord: boolean) => {
      const me = ++run;
      const stale = () => done || me !== run;
      ctx.fluffy.set('rust');
      if (withWord) {
        this.glow(this.model);
        await ctx.say([stretchLine(item.word)]);
        this.glow(null);
      }
      if (!stale()) await ctx.say(question);
      if (!stale()) ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt(true));
    const i = await new Promise<number>((resolve) => {
      this.answer = (v) => {
        this.answer = null;
        resolve(v);
      };
      void prompt(false);
    });
    done = true;
    this.root.classList.remove('is-open');
    ctx.setRepeat(null);
    ctx.speechStop();
    this.glow(null);
    this.cards[i].classList.add('is-picked');
    await sleep(300);
    return item.options[i];
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say(['letter.uitleg']);
    this.glow(this.model);
    await ctx.say([stretchLine(item.word)]);
    this.glow(null);
    let l = await this.ask(this.question());
    if (l === item.letter) return this.celebrate(1);

    // Ladder 1: nog eens goed naar het begin luisteren (uitgerekt, twee keer).
    ctx.fluffy.set('nadenken');
    await ctx.say(['letter.hint']);
    this.glow(this.model);
    await ctx.say([stretchLine(item.word)]);
    await sleep(400);
    await ctx.say([stretchLine(item.word)]);
    this.glow(null);
    l = await this.ask(this.question());
    if (l === item.letter) return this.celebrate(2);

    // Ladder 2: Fluffy wijst de letter aan, en dan tikt zij hem aan.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.luister']);
    this.glow(this.model);
    await ctx.say([stretchLine(item.word)]);
    this.glow(this.cards[item.options.indexOf(item.letter)]);
    await ctx.say(['klank.schrijf', wordLine(item.word)]);
    this.glow(null);
    l = await this.ask(['cijfer.tikjij'], item.letter);
    if (l === item.letter) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen.kort']);
    } else {
      this.cards[item.options.indexOf(item.letter)].classList.add('is-counted');
      await ctx.say(['klank.schrijf', wordLine(item.word)]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.model.classList.add('is-counted');
    this.cards[item.options.indexOf(item.letter)].classList.add('is-counted');
    await ctx.say(['klank.schrijf', wordLine(item.word), attempt === 2 ? 'lof.luisteren' : 'lof.letter']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

function place(node: HTMLElement, b: { x: number; y: number; w: number; h: number }): void {
  node.style.left = `${b.x}px`;
  node.style.top = `${b.y}px`;
  node.style.width = `${b.w}px`;
  node.style.height = `${b.h}px`;
}

/** Plaatje voor het keuzemoment: een maan met een m ernaast. */
const ICON = `<svg viewBox="0 0 200 160">
  <svg x="14" y="36" width="88" height="88" viewBox="0 0 100 100">${PICTURE.maan.replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>
  <rect x="112" y="36" width="78" height="88" rx="16" fill="#fff" stroke="#e2d4bc" stroke-width="5"/>
  <text x="151" y="104" text-anchor="middle" font-size="66" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">m</text>
</svg>`;

export const letters: Activity<LetterItem> = {
  id: 'letters',
  name: 'Letters zoeken',
  skills: ['letters'],
  makeItem: makeLetterItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.letters'],
  icon: ICON,
  choice: ['keuze.letters'],
  phrases: () => LETTER_WORDS.flatMap((w): Seg[][] => [['letter.vraag', wordLine(w)], ['klank.schrijf', wordLine(w)]]),
};
