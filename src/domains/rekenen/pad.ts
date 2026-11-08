import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { el, pick, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { Lijn } from './lijn';
import { answerOptions } from './tellen';
import { NumberCards, place } from './veld';

/**
 * GETALLENPAD — een lineair bordspel van 1 tot 10 (Siegler & Ramani, 2008, 2009).
 * Samen brengen ze het konijntje naar huis, zonder winnaar. Het werkzame bestanddeel is het
 * hardop noemen van het getal van elk vakje: "Na vier komt vijf."
 * Niveaus: één vakje verder (nummers zichtbaar) → ook twee verder of één terug → zonder
 * nummers op het pad: "Welk getal komt na zes?" met getalkaartjes.
 */

export interface PadItem {
  /** Vakje waar het konijntje staat. */
  k: number;
  step: 1 | 2 | -1;
  /** Tikken op het vakje (nummers zichtbaar), of een getalkaartje kiezen (pad zonder nummers). */
  mode: 'tik' | 'kaart';
  options: number[];
}

export const target = (item: PadItem) => item.k + item.step;

let lastK = 0;

export function makePadItem(_skill: string, level: number, rng: Rng): PadItem {
  const step: PadItem['step'] = level <= 0 ? 1 : level === 1 ? pick(rng, [1, 1, 2, -1] as const) : pick(rng, [1, -1] as const);
  const [min, max] = step === 2 ? [1, 8] : step === -1 ? [2, 10] : [1, 9];
  let k = randInt(rng, min, max);
  for (let i = 0; i < 5 && k === lastK; i++) k = randInt(rng, min, max);
  lastK = k;
  const mode = level >= 2 ? 'kaart' : 'tik';
  return { k, step, mode, options: mode === 'kaart' ? answerOptions(k + step, rng) : [] };
}

const BUNNY_SVG = `<svg viewBox="0 0 100 110"><ellipse cx="36" cy="24" rx="9" ry="22" fill="#fff" stroke="#b7b2c9" stroke-width="4"/>
  <ellipse cx="62" cy="24" rx="9" ry="22" fill="#fff" stroke="#b7b2c9" stroke-width="4"/>
  <ellipse cx="36" cy="26" rx="4" ry="14" fill="#f5c3cf"/><ellipse cx="62" cy="26" rx="4" ry="14" fill="#f5c3cf"/>
  <ellipse cx="50" cy="84" rx="30" ry="22" fill="#fff" stroke="#b7b2c9" stroke-width="4"/>
  <circle cx="50" cy="56" r="22" fill="#fff" stroke="#b7b2c9" stroke-width="4"/>
  <circle cx="42" cy="54" r="3.5" fill="#3b4a6b"/><circle cx="58" cy="54" r="3.5" fill="#3b4a6b"/>
  <ellipse cx="50" cy="62" rx="4" ry="3" fill="#f19a8c"/></svg>`;

const HOME_SVG = `<svg viewBox="0 0 100 90"><path d="M10 44 L50 8 L90 44 Z" fill="#a5cf93" stroke="#7fae6c" stroke-width="5" stroke-linejoin="round"/>
  <rect x="20" y="42" width="60" height="44" rx="6" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5"/>
  <rect x="42" y="58" width="16" height="28" rx="3" fill="#f4a690"/></svg>`;

class Round {
  private root: HTMLElement;
  private lijn: Lijn;
  private bunny: HTMLElement;
  private home: HTMLElement;
  private cards: NumberCards | null = null;
  private at: number;

  constructor(private ctx: ActivityContext, private item: PadItem) {
    this.root = el('div', 'pad');
    this.root.dataset.target = String(target(item)); // voor tests
    ctx.stage.append(this.root);
    // Zonder nummers (hoogste niveau) blijven alleen het konijntje-vakje en 1 en 10 zichtbaar.
    const visible = (n: number) => item.mode === 'tik' || n === item.k || n === 1 || n === 10;
    this.lijn = new Lijn(this.root, ctx.stage, 'vakjes', visible, (H) => 0.44 * H);
    this.home = el('div', 'pd-thuis');
    this.home.append(svgEl(HOME_SVG));
    this.bunny = el('div', 'pd-konijn');
    this.bunny.append(svgEl(BUNNY_SVG));
    this.root.append(this.home, this.bunny);
    if (item.mode === 'kaart') this.cards = new NumberCards(this.root, ctx.stage, item.options);
    this.at = item.k;
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.lijn.destroy();
    this.cards?.destroy();
    this.root.remove();
  }

  private layout = (): void => {
    const b10 = this.lijn.box(10);
    place(this.home, { x: b10.x, y: b10.y - b10.w * 1.05, w: b10.w, h: b10.w * 0.9 });
    this.placeBunny();
  };

  private placeBunny(): void {
    const b = this.lijn.box(this.at);
    const w = b.w * 0.9;
    place(this.bunny, { x: b.x + (b.w - w) / 2, y: b.y - w * 0.95, w, h: w * 1.1 });
  }

  private async hop(to: number, count: boolean): Promise<void> {
    const dir = Math.sign(to - this.at);
    const beat = count ? this.ctx.countBeat() : () => sleep(350);
    while (this.at !== to) {
      this.at += dir;
      this.placeBunny();
      this.ctx.sounds.plop();
      this.lijn.showNumber(this.at);
      await beat();
      if (count) await this.ctx.say([this.at]);
    }
  }

  private question(): Seg[] {
    const { item, ctx } = this;
    if (item.mode === 'kaart') return item.step === 1 ? ['pad.welkna', item.k] : ['pad.welkvoor', item.k];
    const jump: LineId = item.step === 2 ? 'pad.sprong.twee' : item.step === -1 ? 'pad.sprong.terug' : 'pad.sprong.verder';
    return ctx.beginner ? ['pad.intro', jump, 'pad.waar'] : [jump, 'pad.waar'];
  }

  /** Vraag stellen en wachten op een vakje (of kaartje). */
  private async ask(segs: Seg[], highlight?: number): Promise<number> {
    const { ctx, lijn } = this;
    if (this.cards) return this.cards.ask(ctx, segs, highlight);
    lijn.clearMarks();
    if (highlight !== undefined) lijn.mark(highlight);
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(segs);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt());
    const n = await new Promise<number>((resolve) => {
      lijn.onTap = (v) => {
        if (v === this.at) return; // op het konijntje zelf tikken telt niet
        lijn.onTap = null;
        resolve(v);
      };
      lijn.lock(false);
      void prompt();
    });
    lijn.lock(true);
    ctx.setRepeat(null);
    ctx.speechStop();
    lijn.picked(n);
    await ctx.say([n]);
    return n;
  }

  /** "Na vier komt vijf." / "Vóór vier komt drie." */
  private rule(): Seg[] {
    const { k, step } = this.item;
    if (step === 2) return [k, k + 1, k + 2];
    return step === 1 ? ['pad.na', k, 'pad.komt', k + 1] : ['pad.voor', k, 'pad.komt', k - 1];
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    const goal = target(item);
    let v = await this.ask(this.question());
    if (v === goal) return this.celebrate(1);

    // Ladder 1: vanaf het konijntje samen tellen (vooruit of terug), zonder het antwoord te zeggen.
    ctx.fluffy.set('nadenken');
    this.cards?.show(false);
    await ctx.say([item.step === -1 ? 'pad.hint.terug' : 'pad.hint']);
    this.lijn.pointAt(item.k);
    await ctx.say([item.k]);
    await sleep(500);
    this.lijn.hidePointer();
    v = await this.ask(item.mode === 'kaart' ? this.question() : ['pad.waar']);
    if (v === goal) return this.celebrate(2);

    // Ladder 2: Fluffy laat het konijntje springen en zegt de regel; daarna tikt zij het aan.
    ctx.fluffy.set('nadenken');
    this.cards?.show(false);
    await ctx.say(['voordoen.start']);
    const beat = ctx.countBeat();
    for (let n = item.k; n !== goal + Math.sign(item.step); n += Math.sign(item.step)) {
      this.lijn.pointAt(n);
      this.lijn.showNumber(n);
      await beat();
      await ctx.say([n]);
    }
    await sleep(250);
    this.lijn.hidePointer();
    await ctx.say(this.rule());
    v = await this.ask(item.mode === 'kaart' ? ['tellen.tik.a', goal, 'tellen.tik.b'] : ['cijfer.tikjij'], goal);
    if (v === goal) {
      await this.hop(goal, false);
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', goal]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    const goal = target(item);
    ctx.fluffy.set('blij');
    this.cards?.mark(goal);
    await this.hop(goal, item.step === 2);
    ctx.sounds.chime();
    ctx.fluffy.hop();
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : item.step === -1 ? 'lof.voor' : 'lof.getallen';
    await ctx.say(item.step === 2 ? [praise] : [...this.rule(), praise]);
    if (goal === 10) {
      this.home.classList.add('is-counted');
      await ctx.say(['pad.thuis']);
    }
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een pad met een konijntje en een huisje. */
const ICON = `<svg viewBox="0 0 200 160">
  ${[0, 1, 2, 3, 4].map((i) => `<rect x="${8 + i * 37}" y="104" width="32" height="32" rx="7" fill="${i % 2 ? '#d6ecfa' : '#f3ebdd'}" stroke="#d6ba8c" stroke-width="3"/>`).join('')}
  <svg x="12" y="52" width="48" height="54" viewBox="0 0 100 110">${svgInner(BUNNY_SVG)}</svg>
  <svg x="152" y="58" width="44" height="40" viewBox="0 0 100 90">${svgInner(HOME_SVG)}</svg>
</svg>`;

export const pad: Activity<PadItem> = {
  id: 'pad',
  name: 'Getallenpad',
  skills: ['buren-10'],
  makeItem: makePadItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.pad'],
  icon: ICON,
  choice: ['keuze.pad'],
  phrases() {
    const out: Seg[][] = [];
    for (let k = 1; k <= 10; k++) {
      if (k < 10) out.push(['pad.na', k, 'pad.komt', k + 1], ['pad.welkna', k]);
      if (k > 1) out.push(['pad.voor', k, 'pad.komt', k - 1], ['pad.welkvoor', k]);
    }
    return out;
  },
};
