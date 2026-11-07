import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { onTap } from '../../core/ui/drag';
import { el, pick, shuffle, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { PICTURE, SOUND_WORDS, SOUNDS, soundLine, wordLine, type Word } from './plaatjes';

/**
 * HAKKEN EN PLAKKEN — losse klanken samenvoegen tot een woord (auditieve synthese). Na de
 * beginklank de volgende stap naar lezen; met letters erbij werkt het het sterkst
 * (National Reading Panel, 2000; Bus & van IJzendoorn, 1999).
 * Fluffy zegt "m… aa… n", de blokjes lichten mee op, en zij tikt het plaatje aan.
 * Niveaus: twee plaatjes → drie, met één die net zo begint (dan moet ze verder luisteren dan de
 * eerste klank) → drie met ook een woord dat net zo eindigt, en nu met de letters op de blokjes.
 *
 * EERSTE WOORDJES — hetzelfde andersom: de letters staan er, Fluffy zegt niets. Ze tikt zelf op
 * de letters om de klanken te horen en kiest het plaatje. Dat is echt lezen (decoderen).
 */

export type HakMode = 'plak' | 'lees';

export interface HakItem {
  mode: HakMode;
  word: Word;
  options: Word[];
  /** Letters op de blokjes? (bij lezen altijd) */
  letters: boolean;
}

const sounds = (w: Word) => SOUNDS[w]!;
const sameStart = (a: Word, b: Word) => a !== b && sounds(a)[0] === sounds(b)[0];
const sameRest = (a: Word, b: Word) => a !== b && sounds(a).slice(1).join() === sounds(b).slice(1).join();

let lastWord: Word | null = null;

export function makeHakItem(mode: HakMode, level: number, rng: Rng): HakItem {
  let word = pick(rng, SOUND_WORDS);
  for (let i = 0; i < 5 && word === lastWord; i++) word = pick(rng, SOUND_WORDS);
  lastWord = word;
  const others = SOUND_WORDS.filter((w) => w !== word);
  const plain = shuffle(rng, others.filter((w) => !sameStart(word, w) && !sameRest(word, w)));
  const start = shuffle(rng, others.filter((w) => sameStart(word, w)));
  const rest = shuffle(rng, others.filter((w) => sameRest(word, w)));
  let distractors: Word[];
  if (level <= 0) distractors = plain.slice(0, 1);
  else if (level === 1) distractors = mode === 'lees' ? plain.slice(0, 2) : [...start.slice(0, 1), ...plain].slice(0, 2);
  else if (mode === 'plak') distractors = [...start.slice(0, 1), ...rest.slice(0, 1), ...plain].slice(0, 2);
  else distractors = [...start.slice(0, 1), ...plain].slice(0, 2);
  return { mode, word, options: shuffle(rng, [word, ...distractors]), letters: mode === 'lees' || level >= 2 };
}

class Round {
  private root: HTMLElement;
  private blocks: HTMLElement[];
  private cards: HTMLElement[];
  private answer: ((i: number) => void) | null = null;
  /** Blokjes mogen aangetikt worden (zegt de klank). */
  private blocksOpen = false;

  constructor(private ctx: ActivityContext, private item: HakItem) {
    this.root = el('div', 'klanken hakken');
    this.root.dataset.answer = item.word; // voor tests
    this.blocks = sounds(item.word).map((s) => {
      const b = el('div', `hk-blok${item.letters ? ' has-letter' : ''}`, item.letters ? s : '');
      onTap(b, () => {
        if (!this.blocksOpen) return;
        this.light(b);
        void ctx.say([soundLine(s)]);
      });
      this.root.append(b);
      return b;
    });
    this.cards = item.options.map((w, i) => {
      const c = el('div', 'lz-kaart');
      c.dataset.word = w;
      c.append(svgEl(PICTURE[w]));
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
    const b = Math.min(0.22 * H, 0.14 * W, 160);
    const bgap = b * 1.18;
    this.blocks.forEach((blk, i) => {
      place(blk, { x: 0.59 * W + (i - (this.blocks.length - 1) / 2) * bgap - b / 2, y: 0.07 * H, w: b, h: b });
      blk.style.fontSize = `${b * 0.5}px`;
    });
    const c = Math.min(0.27 * H, 0.19 * W, 210);
    const gap = c * 1.3;
    this.cards.forEach((card, i) => {
      place(card, { x: 0.59 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2, y: 0.42 * H, w: c, h: c });
    });
  };

  private light(node: HTMLElement | null): void {
    this.blocks.forEach((b) => b.classList.toggle('is-named', b === node));
  }

  private glow(node: HTMLElement | null): void {
    this.cards.forEach((n) => n.classList.toggle('is-named', n === node));
  }

  /** Fluffy zegt de klanken los, met de blokjes erbij. `gap` = stilte tussen de klanken. */
  private async sayParts(gap: number, stale: () => boolean = () => false): Promise<void> {
    const parts = sounds(this.item.word);
    for (let i = 0; i < parts.length && !stale(); i++) {
      this.light(this.blocks[i]);
      await this.ctx.say([soundLine(parts[i])]);
      await sleep(gap);
    }
    this.light(null);
  }

  /** De plaatjes één voor één noemen, zodat ze weet hoe ze heten (boot, niet schip). */
  private async names(stale: () => boolean = () => false): Promise<void> {
    for (let i = 0; i < this.cards.length && !stale(); i++) {
      this.glow(this.cards[i]);
      await this.ctx.say([wordLine(this.item.options[i])]);
      await sleep(200);
    }
    this.glow(null);
  }

  private question(): Seg[] {
    return [this.item.mode === 'lees' ? 'hak.lees.vraag' : 'hak.vraag'];
  }

  private async ask(question: Seg[], highlight?: Word): Promise<Word> {
    const { ctx, item } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight) this.cards[item.options.indexOf(highlight)].classList.add('is-counted');
    this.root.classList.add('is-open');
    this.blocksOpen = true;
    let run = 0;
    let done = false;
    const prompt = async (again: boolean) => {
      const me = ++run;
      const stale = () => done || me !== run;
      ctx.fluffy.set('rust');
      if (again) {
        await this.names(stale);
        if (item.mode === 'plak' && !stale()) await this.sayParts(450, stale);
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
    this.blocksOpen = false;
    this.root.classList.remove('is-open');
    ctx.setRepeat(null);
    ctx.speechStop();
    this.glow(null);
    this.light(null);
    this.cards[i].classList.add('is-picked');
    await ctx.say([wordLine(item.options[i])]);
    return item.options[i];
  }

  /** "m-aa-n … maan": de klanken snel achter elkaar en dan het woord. */
  private async blend(): Promise<void> {
    await this.sayParts(120);
    this.blocks.forEach((b) => b.classList.add('is-counted'));
    await this.ctx.say([wordLine(this.item.word)]);
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say([item.mode === 'lees' ? 'hak.lees.uitleg' : 'hak.uitleg']);
    await this.names();
    if (item.mode === 'plak') await this.sayParts(450);
    let w = await this.ask(this.question());
    if (w === item.word) return this.celebrate(1);
    const note = sameStart(item.word, w) ? 'Luistert bij hakken en plakken nog vooral naar de eerste klank.' : undefined;

    // Ladder 1: de klanken nog eens, dichter op elkaar (bij lezen zegt Fluffy ze nu voor).
    ctx.fluffy.set('nadenken');
    await ctx.say([item.mode === 'lees' ? 'hak.lees.hint' : 'hak.hint']);
    await this.sayParts(item.mode === 'lees' ? 350 : 180);
    w = await this.ask(this.question());
    if (w === item.word) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy plakt ze zelf aan elkaar en wijst het plaatje aan.
    ctx.fluffy.set('nadenken');
    await ctx.say(['hak.voordoen']);
    await this.blend();
    this.glow(this.cards[item.options.indexOf(item.word)]);
    await sleep(300);
    this.glow(null);
    w = await this.ask(['cijfer.tikjij'], item.word);
    if (w === item.word) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen.kort']);
    } else {
      this.cards[item.options.indexOf(item.word)].classList.add('is-counted');
      await ctx.say([wordLine(item.word)]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards[item.options.indexOf(item.word)].classList.add('is-counted');
    await this.blend();
    await ctx.say([attempt === 2 ? 'lof.luisteren' : item.mode === 'lees' ? 'lof.lezen' : 'lof.plakken']);
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

const block = (x: number, text: string) => `<rect x="${x}" y="14" width="50" height="50" rx="10" fill="#fff" stroke="#e2d4bc" stroke-width="4"/>
  ${text ? `<text x="${x + 25}" y="49" text-anchor="middle" font-size="30" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">${text}</text>` : `<circle cx="${x + 25}" cy="39" r="7" fill="#ffe9a8"/>`}`;
const pictureAt = (w: Word, x: number, y: number, s: number) =>
  `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 100 100">${svgInner(PICTURE[w])}</svg>`;

const run = async (ctx: ActivityContext, item: HakItem, retry: boolean) => {
  const round = new Round(ctx, item);
  try {
    return await round.play(retry);
  } finally {
    await sleep(300);
    round.destroy();
  }
};

export const hakken: Activity<HakItem> = {
  id: 'hakken',
  name: 'Hakken en plakken',
  skills: ['hakken'],
  makeItem: (_skill, level, rng) => makeHakItem('plak', level, rng),
  run,
  summary: ['einde.hakken'],
  // Plaatje voor het keuzemoment: drie blokjes en een maan.
  icon: `<svg viewBox="0 0 200 160">${block(8, '')}${block(66, '')}${block(124, '')}${pictureAt('maan', 62, 74, 76)}</svg>`,
  choice: ['keuze.hakken'],
  phrases: () => [],
};

export const woordjes: Activity<HakItem> = {
  id: 'woordjes',
  name: 'Eerste woordjes',
  skills: ['woordjes'],
  makeItem: (_skill, level, rng) => makeHakItem('lees', level, rng),
  run,
  summary: ['einde.woordjes'],
  // Plaatje voor het keuzemoment: m-aa-n op blokjes en een maan.
  icon: `<svg viewBox="0 0 200 160">${block(8, 'm')}${block(66, 'aa')}${block(124, 'n')}${pictureAt('maan', 62, 74, 76)}</svg>`,
  choice: ['keuze.woordjes'],
  phrases: () => [],
};
