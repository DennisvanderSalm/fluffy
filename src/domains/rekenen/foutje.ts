import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, pick, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import {
  ANIMALS, animalInner, Field, place, POINTER_SVG, readingOrder, tapToCount, THUMB_SVG, type Animal, type Layout,
} from './veld';

/**
 * FLUFFY TELT FOUT — het kind helpt Fluffy (protégé-effect).
 * Vierjarigen herkennen telfouten van een pop: overslaan, dubbel tellen (Gelman & Meck, 1983).
 * Pas later begrijpen ze dat een ongewone volgorde wél mag (Briars & Siegler, 1984); dat komt
 * daarom pas op het hoogste niveau. Zo worden de telprincipes zichtbaar en bespreekbaar.
 */

export type CountError = 'geen' | 'volgorde' | 'overslaan' | 'dubbel' | 'getal' | 'eind';

export interface FoutjeItem {
  n: number;
  layout: Layout;
  animal: Animal;
  error: CountError;
  /** Welk beestje (overslaan/dubbel) of welk telwoord (getal) het gaat; anders 0. */
  at: number;
  /** Het getal dat Fluffy aan het eind noemt. */
  claim: number;
}

type Row = [min: number, max: number, errors: CountError[]];
export const FOUTJE_LEVELS: Row[] = [
  [3, 5, ['overslaan', 'dubbel']],
  [4, 7, ['overslaan', 'dubbel', 'getal']],
  [5, 9, ['overslaan', 'dubbel', 'getal', 'eind']],
];
/** Kans dat Fluffy goed telt. Op het hoogste niveau soms "goed, maar in een andere volgorde". */
const CORRECT_SHARE = 0.4;

export const isCorrectCount = (e: CountError) => e === 'geen' || e === 'volgorde';

let recent: boolean[] = [];

export function makeFoutjeItem(_skill: string, level: number, rng: Rng): FoutjeItem {
  const [min, max, errors] = FOUTJE_LEVELS[Math.min(level, FOUTJE_LEVELS.length - 1)];
  const n = randInt(rng, min, max);
  // Niet te vaak hetzelfde antwoord achter elkaar: dan gaat ze gokken op een patroon.
  let correct = rng() < CORRECT_SHARE;
  if (recent.length >= 2 && recent.every((r) => r === correct)) correct = !correct;
  recent = [...recent, correct].slice(-2);

  const error: CountError = correct
    ? (level >= 2 && rng() < 0.5 ? 'volgorde' : 'geen')
    : pick(rng, errors);
  let at = 0;
  let claim = n;
  if (error === 'overslaan') {
    at = randInt(rng, 1, n - 2);
    claim = n - 1;
  } else if (error === 'dubbel') {
    at = randInt(rng, 1, n - 2);
    claim = n + 1;
  } else if (error === 'getal') {
    at = randInt(rng, 2, n - 1); // dit telwoord slaat Fluffy over
    claim = n + 1;
  } else if (error === 'eind') {
    claim = rng() < 0.5 ? n - 1 : n + 1;
  }
  return { n, layout: n > 5 ? 'rijen' : 'rij', animal: pick(rng, ANIMALS), error, at, claim };
}

/** Hoe Fluffy telt: welk beestje (positie in de telvolgorde) bij welk telwoord. */
export function countScript(item: FoutjeItem): { obj: number; word: number }[] {
  const steps: { obj: number; word: number }[] = [];
  let word = 1;
  const order = Array.from({ length: item.n }, (_, i) => (item.error === 'volgorde' ? item.n - 1 - i : i));
  for (const obj of order) {
    if (item.error === 'overslaan' && obj === item.at) continue;
    if (item.error === 'getal' && word === item.at) word++;
    steps.push({ obj, word: word++ });
    if (item.error === 'dubbel' && obj === item.at) steps.push({ obj, word: word++ });
  }
  return steps;
}

class Round {
  private field: Field;
  private yes: HTMLElement;
  private no: HTMLElement;
  private answer: ((klopt: boolean) => void) | null = null;
  /** Telvolgorde op het scherm (links → rechts, rij voor rij). */
  private order: number[];

  constructor(private ctx: ActivityContext, private item: FoutjeItem) {
    this.field = new Field(ctx.stage, item, ctx.rng, (W, H) => ({ x: 0.22 * W, y: 0.05 * H, w: 0.74 * W, h: 0.64 * H }));
    this.order = readingOrder(this.field);
    this.yes = el('div', 'v-thumb is-yes');
    this.no = el('div', 'v-thumb is-no');
    this.yes.append(svgEl(THUMB_SVG));
    this.no.append(svgEl(THUMB_SVG));
    onTap(this.yes, () => this.answer?.(true));
    onTap(this.no, () => this.answer?.(false));
    this.field.root.append(this.yes, this.no);
    this.layoutButtons();
    window.addEventListener('resize', this.layoutButtons);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layoutButtons);
    this.field.destroy();
  }

  private layoutButtons = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const d = Math.min(0.2 * H, 0.14 * W, 140);
    place(this.yes, { x: 0.59 * W - d * 1.25, y: 0.74 * H, w: d, h: d });
    place(this.no, { x: 0.59 * W + d * 0.25, y: 0.74 * H, w: d, h: d });
  };

  private obj(pos: number): number {
    return this.order[pos];
  }

  /** Fluffy telt hardop en wijst aan. */
  private async demo(slow: boolean): Promise<void> {
    const { ctx, field, item } = this;
    field.clearMarks();
    ctx.fluffy.set('rust');
    const beat = ctx.countBeat(slow);
    for (const step of countScript(item)) {
      const i = this.obj(step.obj);
      field.pointAt(i);
      await beat();
      if (field.isMarked(i)) field.bounce(i);
      field.mark(i);
      await ctx.say([step.word]);
    }
    await sleep(300);
    field.hidePointer();
    await ctx.say(['foutje.dus', item.claim]);
  }

  /** "Heb ik het goed geteld?" → duim omhoog (klopt) of omlaag (klopt niet). */
  private async ask(explain: boolean): Promise<boolean> {
    const { ctx } = this;
    const question: Seg[] = explain ? ['foutje.vraag', 'foutje.uitleg'] : ['foutje.vraag'];
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(question);
      ctx.fluffy.set('luisteren');
    };
    this.field.root.classList.add('show-thumbs');
    ctx.setRepeat(() => void prompt());
    const klopt = await new Promise<boolean>((resolve) => {
      this.answer = (k) => {
        this.answer = null;
        resolve(k);
      };
      void prompt();
    });
    ctx.setRepeat(null);
    ctx.speechStop();
    this.field.root.classList.remove('show-thumbs');
    (klopt ? this.yes : this.no).classList.add('is-picked');
    await sleep(300);
    this.yes.classList.remove('is-picked');
    this.no.classList.remove('is-picked');
    return klopt;
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    const correct = isCorrectCount(item.error);
    ctx.fluffy.still(true);
    await sleep(300);
    await ctx.say(['foutje.intro']);
    await this.demo(false);
    if ((await this.ask(ctx.beginner)) === correct) return this.right(1);

    // Ladder 1: nog een keer, langzaam.
    ctx.fluffy.set('nadenken');
    await ctx.say(['foutje.hint']);
    await this.demo(true);
    if ((await this.ask(false)) === correct) return this.right(2);

    // Ladder 2: Fluffy laat zien wat er gebeurde, en ze tellen samen goed.
    ctx.fluffy.set('nadenken');
    await this.show(this.explanation());
    if (!correct) await this.together('lof.samen');
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** Ze had gelijk: Fluffy geeft het toe (of bevestigt), en bij een fout tellen ze samen opnieuw. */
  private async right(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set(isCorrectCount(item.error) ? 'blij' : 'oeps');
    ctx.sounds.chime();
    if (item.error === 'geen') {
      await ctx.say(['foutje.goed.ja', 'lof.opletten']);
    } else if (item.error === 'volgorde') {
      await ctx.say(['foutje.goed.volgorde', 'lof.opletten']);
    } else {
      const oeps: Record<string, LineId> = {
        overslaan: 'foutje.oeps.overslaan', dubbel: 'foutje.oeps.dubbel', getal: 'foutje.oeps.getal', eind: 'foutje.oeps.eind',
      };
      await this.show([oeps[item.error]]);
      await this.together(attempt === 1 ? 'lof.helpen' : 'lof.doorzetten');
    }
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }

  private explanation(): Seg[] {
    const { item } = this;
    switch (item.error) {
      case 'overslaan': return ['foutje.kijk.overslaan'];
      case 'dubbel': return ['foutje.kijk.dubbel'];
      case 'getal': return ['foutje.kijk.getal.a', item.at - 1, 'foutje.kijk.getal.b', item.at, 'foutje.kijk.getal.c'];
      case 'eind': return ['foutje.kijk.eind.a', item.n, 'foutje.kijk.eind.b', item.claim, 'foutje.kijk.eind.c'];
      case 'volgorde': return ['foutje.kijk.volgorde'];
      default: return ['foutje.kijk.klopt'];
    }
  }

  /** Zeggen wat er gebeurde; bij overslaan/dubbel wijst Fluffy het beestje aan. */
  private async show(segs: Seg[]): Promise<void> {
    const { field, item } = this;
    if (item.error === 'overslaan' || item.error === 'dubbel') {
      const i = this.obj(item.at);
      field.pointAt(i);
      if (item.error === 'dubbel') field.bounce(i);
    }
    await this.ctx.say(segs);
    field.hidePointer();
  }

  /** Samen goed tellen: zij tikt, Fluffy telt mee. */
  private async together(praise: LineId): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('rust');
    await ctx.say(['foutje.samen']);
    ctx.fluffy.set('luisteren');
    ctx.setRepeat(() => void ctx.say(['foutje.samen']));
    await tapToCount(this.field, ctx, true);
    ctx.setRepeat(null);
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    await ctx.say(['tellen.zijnhet', item.n, praise]);
  }
}

/** Plaatje voor het keuzemoment: Fluffy's wijsvinger bij twee lieveheersbeestjes, en een vraagteken. */
const ICON = `<svg viewBox="0 0 200 160">
  <svg x="14" y="40" width="64" height="64" viewBox="0 0 100 100">${animalInner('lieveheersbeestje')}</svg>
  <svg x="82" y="40" width="64" height="64" viewBox="0 0 100 100">${animalInner('lieveheersbeestje')}</svg>
  <text x="172" y="88" text-anchor="middle" font-size="64" font-weight="800" fill="#7a86a3" font-family="ui-rounded, system-ui, sans-serif">?</text>
  <svg x="26" y="96" width="60" height="60" viewBox="0 0 100 100">${svgInner(POINTER_SVG)}</svg>
</svg>`;

export const foutje: Activity<FoutjeItem> = {
  id: 'foutje',
  name: 'Fluffy telt fout',
  skills: ['telbegrip'],
  makeItem: makeFoutjeItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.foutje'],
  icon: ICON,
  choice: ['keuze.foutje'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 1; n <= 10; n++) {
      out.push(['foutje.dus', n], ['foutje.kijk.eind.a', n], ['foutje.kijk.eind.b', n, 'foutje.kijk.eind.c'], ['tellen.zijnhet', n]);
      if (n < 10) out.push(['foutje.kijk.getal.a', n, 'foutje.kijk.getal.b', n + 1]);
    }
    return out;
  },
};
