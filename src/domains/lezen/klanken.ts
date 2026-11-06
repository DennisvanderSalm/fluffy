import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, pick, shuffle, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import {
  letterOf, ONSET_WORDS, PICTURE, RHYMES, rhymes, sameOnset, stretchLine, wordLine, WORDS, type Word,
} from './plaatjes';

/**
 * KLANKEN HOREN — fonologisch bewustzijn, samen met letterkennis de sterkste voorspeller van
 * leren lezen die je bij vierjarigen al kunt oefenen (National Early Literacy Panel, 2008).
 * De beginklank is het belangrijkste: klanken los horen voorspelt lezen veel beter dan rijmen
 * (Hulme e.a., 2002; Muter e.a., 2004). Rijmen is een opwarmer. Alles is gesproken en met plaatjes.
 * Bij de beginklank rekt Fluffy de klank uit ("mmmaan") en laat ze daarna de letter zien: klanken
 * oefenen werkt beter samen met letters (Bus & van IJzendoorn, 1999).
 * Niveaus: twee plaatjes → drie plaatjes → drie met een lastige afleider (bij rijmen een woord
 * met dezelfde beginklank, bij beginklank een woord dat rijmt).
 */

export type KlankKind = 'rijm' | 'begin';

export interface KlankItem {
  kind: KlankKind;
  /** Het woord waar het om draait ("Wat rijmt op huis?"). */
  target: Word;
  answer: Word;
  options: Word[];
}

const fits = (kind: KlankKind, a: Word, b: Word) => (kind === 'rijm' ? rhymes(a, b) : sameOnset(a, b));
/** De lastige afleider: lijkt op een andere manier op het doelwoord. */
const tricky = (kind: KlankKind, a: Word, b: Word) => (kind === 'rijm' ? sameOnset(a, b) : rhymes(a, b));

let lastTarget: Word | null = null;

export function makeKlankItem(kind: KlankKind, level: number, rng: Rng): KlankItem {
  const pool = kind === 'rijm' ? RHYMES.flat() : ONSET_WORDS;
  let target = pick(rng, pool);
  for (let i = 0; i < 5 && target === lastTarget; i++) target = pick(rng, pool);
  lastTarget = target;
  const answer = pick(rng, WORDS.filter((w) => fits(kind, target, w)));
  // Afleiders passen niet bij het doelwoord, en ook niet bij het antwoord (geen twee goede).
  const wrong = WORDS.filter((w) => w !== target && !fits(kind, target, w) && !fits(kind, answer, w));
  const plain = wrong.filter((w) => !tricky(kind, target, w));
  const count = level <= 0 ? 1 : 2;
  let distractors = shuffle(rng, plain).slice(0, count);
  const hard = wrong.filter((w) => tricky(kind, target, w));
  if (level >= 2 && hard.length) distractors = [pick(rng, hard), distractors[0]];
  return { kind, target, answer, options: shuffle(rng, [answer, ...distractors]) };
}

class Round {
  private root: HTMLElement;
  private model: HTMLElement;
  /** De letter van de beginklank, die na het antwoord naast het plaatje verschijnt. */
  private letter: HTMLElement;
  private cards: HTMLElement[];
  private answer: ((i: number) => void) | null = null;

  constructor(private ctx: ActivityContext, private item: KlankItem) {
    this.root = el('div', 'klanken');
    this.root.dataset.answer = item.answer; // voor tests
    this.model = el('div', 'lz-doel');
    this.model.append(svgEl(PICTURE[item.target]));
    this.letter = el('div', 'lz-letter', letterOf(item.target) ?? '');
    this.root.append(this.model, this.letter);
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
    const m = Math.min(0.3 * H, 0.2 * W, 220);
    place(this.model, { x: 0.59 * W - m / 2, y: 0.05 * H, w: m, h: m });
    place(this.letter, { x: 0.59 * W + m / 2 + 0.03 * W, y: 0.05 * H + m * 0.1, w: m * 0.8, h: m * 0.8 });
    const c = Math.min(0.27 * H, 0.19 * W, 210);
    const gap = c * 1.3;
    this.cards.forEach((card, i) => {
      place(card, { x: 0.59 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2, y: 0.42 * H, w: c, h: c });
    });
  };

  private glow(node: HTMLElement | null): void {
    [this.model, ...this.cards].forEach((n) => n.classList.toggle('is-named', n === node));
  }

  /** Fluffy zegt het doelwoord en noemt de plaatjes één voor één. */
  private async present(stale: () => boolean = () => false): Promise<void> {
    const { ctx, item } = this;
    this.glow(this.model);
    await ctx.say([wordLine(item.target)]);
    for (let i = 0; i < this.cards.length && !stale(); i++) {
      await sleep(250);
      this.glow(this.cards[i]);
      await ctx.say([wordLine(item.options[i])]);
    }
    this.glow(null);
  }

  private question(): Seg[] {
    const { kind, target } = this.item;
    return [kind === 'rijm' ? 'rijm.vraag' : 'klank.vraag', wordLine(target)];
  }

  /** Vraag stellen en wachten op een tik op een plaatje. Een tik op Fluffy herhaalt alles. */
  private async ask(question: Seg[], highlight?: Word): Promise<Word> {
    const { ctx, item } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight) this.cards[item.options.indexOf(highlight)].classList.add('is-counted');
    this.root.classList.add('is-open');
    let run = 0;
    let done = false;
    const prompt = async (withNames: boolean) => {
      const me = ++run;
      const stale = () => done || me !== run;
      ctx.fluffy.set('rust');
      if (withNames) await this.present(stale);
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
    await ctx.say([wordLine(item.options[i])]);
    return item.options[i];
  }

  /** "Huis en muis, die rijmen." / "Maan en muis, die beginnen hetzelfde." */
  private statement(): Seg[] {
    const { kind, target, answer } = this.item;
    return [wordLine(target), 'rijm.en', wordLine(answer), kind === 'rijm' ? 'rijm.rijmen' : 'klank.zelfde'];
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say([item.kind === 'rijm' ? 'rijm.uitleg' : 'klank.uitleg']);
    await this.present();
    let w = await this.ask(this.question());
    if (w === item.answer) return this.celebrate(1);

    // Ladder 1: het doelwoord naast elk plaatje zetten, zodat ze het verschil hoort.
    ctx.fluffy.set('nadenken');
    await ctx.say([item.kind === 'rijm' ? 'rijm.hint' : 'klank.hint']);
    const say = item.kind === 'begin' ? stretchLine : wordLine;
    for (let i = 0; i < this.cards.length; i++) {
      this.glow(this.model);
      await ctx.say([say(item.target)]);
      await sleep(150);
      this.glow(this.cards[i]);
      await ctx.say([say(item.options[i])]);
      await sleep(350);
    }
    this.glow(null);
    w = await this.ask(this.question());
    if (w === item.answer) return this.celebrate(2);

    // Ladder 2: Fluffy zegt welke het is en waarom, en dan tikt zij het aan.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.luister']);
    this.glow(this.model);
    await ctx.say([item.kind === 'begin' ? stretchLine(item.target) : wordLine(item.target)]);
    await sleep(300);
    this.glow(this.cards[item.options.indexOf(item.answer)]);
    await ctx.say([item.kind === 'begin' ? stretchLine(item.answer) : wordLine(item.answer)]);
    await sleep(300);
    await ctx.say(this.statement());
    await this.showLetter();
    this.glow(null);
    w = await this.ask(['cijfer.tikjij'], item.answer);
    if (w === item.answer) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen.kort']);
    } else {
      this.cards[item.options.indexOf(item.answer)].classList.add('is-counted');
      await ctx.say(this.statement());
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** Bij de beginklank: "Kijk, zo schrijf je het begin van maan." met de letter erbij. */
  private async showLetter(): Promise<void> {
    if (this.item.kind !== 'begin' || !letterOf(this.item.target)) return;
    this.letter.classList.add('is-on');
    await sleep(300);
    await this.ctx.say(['klank.schrijf', wordLine(this.item.target)]);
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.model.classList.add('is-counted');
    this.cards[item.options.indexOf(item.answer)].classList.add('is-counted');
    const praise: LineId = attempt === 2 ? 'lof.luisteren' : item.kind === 'rijm' ? 'lof.rijm' : 'lof.begin';
    await ctx.say(this.statement());
    await this.showLetter();
    await ctx.say([praise]);
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

const pictureAt = (w: Word, x: number, y: number, s: number) =>
  `<svg x="${x}" y="${y}" width="${s}" height="${s}" viewBox="0 0 100 100">${svgInner(PICTURE[w])}</svg>`;

/** Alle zinnen met een woord erin, als hele opname. */
function phrasesFor(kind: KlankKind): Seg[][] {
  const out: Seg[][] = [];
  const targets = kind === 'rijm' ? RHYMES.flat() : ONSET_WORDS;
  for (const t of targets) {
    out.push([kind === 'rijm' ? 'rijm.vraag' : 'klank.vraag', wordLine(t)]);
    if (kind === 'begin') out.push(['klank.schrijf', wordLine(t)]);
    for (const a of WORDS) {
      if (fits(kind, t, a)) out.push([wordLine(t), 'rijm.en', wordLine(a), kind === 'rijm' ? 'rijm.rijmen' : 'klank.zelfde']);
    }
  }
  return out;
}

const run = async (ctx: ActivityContext, item: KlankItem, retry: boolean) => {
  const round = new Round(ctx, item);
  try {
    return await round.play(retry);
  } finally {
    await sleep(300);
    round.destroy();
  }
};

export const rijmen: Activity<KlankItem> = {
  id: 'rijmen',
  name: 'Rijmen',
  skills: ['rijmen'],
  makeItem: (_skill, level, rng) => makeKlankItem('rijm', level, rng),
  run,
  summary: ['einde.rijmen'],
  // Plaatje voor het keuzemoment: huis en muis.
  icon: `<svg viewBox="0 0 200 160">${pictureAt('huis', 14, 34, 86)}${pictureAt('muis', 104, 44, 80)}</svg>`,
  choice: ['keuze.rijmen'],
  phrases: () => phrasesFor('rijm'),
};

export const beginklank: Activity<KlankItem> = {
  id: 'beginklank',
  name: 'Beginklank',
  skills: ['beginklank'],
  makeItem: (_skill, level, rng) => makeKlankItem('begin', level, rng),
  run,
  summary: ['einde.beginklank'],
  // Plaatje voor het keuzemoment: maan en muis.
  icon: `<svg viewBox="0 0 200 160">${pictureAt('maan', 16, 36, 80)}${pictureAt('muis', 104, 44, 80)}</svg>`,
  choice: ['keuze.beginklank'],
  phrases: () => phrasesFor('begin'),
};
