import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { el, pick, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { patternPoints, patternSvg, loosePoints, VIEW, type Pattern, type Point } from './stippen';
import { answerOptions } from './tellen';
import { NumberCards, place, POINTER_SVG, type Box } from './veld';

/**
 * KIEKEBOE-STIPPEN — subitizing: een kleine hoeveelheid in één keer zien, zonder tellen
 * (Clements, 1999; Starkey & Cooper, 1995). Het plaatje is even te zien en dan gaat er een
 * dekentje over. Zo kijkt ze naar het geheel in plaats van te tellen. Antwoorden mag zo lang
 * als ze wil; het dekentje is een spelletje, geen klok.
 * Tot 10 via de vijfstructuur: tienveld, twee handen, dobbelsteen met vijf en nog wat.
 */

export interface KiekeboeItem {
  n: number;
  pattern: Pattern;
  /** Hoe lang het plaatje te zien is voordat het dekentje erover gaat. */
  showMs: number;
  /** Plaatsen van de stippen bij 'los' (vast, zodat een herhaling er hetzelfde uitziet). */
  loose: Point[];
  options: number[];
}

type Row = [min: number, max: number, patterns: Pattern[], showMs: number];
export const KIEKEBOE_LEVELS: Record<string, Row[]> = {
  'zien-5': [
    [1, 3, ['dobbel'], 3000],
    [2, 5, ['dobbel', 'vingers'], 2500],
    [2, 5, ['los', 'vingers', 'dobbel'], 2000],
  ],
  'zien-10': [
    [5, 7, ['tienveld'], 3000],
    [5, 10, ['tienveld', 'vingers'], 2500],
    [6, 10, ['tienveld', 'vingers', 'dobbels'], 2500],
  ],
};

let lastN = 0;

export function makeKiekeboeItem(skill: string, level: number, rng: Rng): KiekeboeItem {
  const rows = KIEKEBOE_LEVELS[skill];
  const [min, max, patterns, showMs] = rows[Math.min(level, rows.length - 1)];
  let n = randInt(rng, min, max);
  for (let i = 0; i < 5 && n === lastN && max > min; i++) n = randInt(rng, min, max);
  lastN = n;
  let pattern = pick(rng, patterns);
  if (pattern === 'dobbels' && n < 6) pattern = 'tienveld';
  return { n, pattern, showMs, loose: pattern === 'los' ? loosePoints(n, rng) : [], options: answerOptions(n, rng) };
}

/** Patronen met een volle vijf erin: daar hoort de uitleg "vijf en nog …" bij. */
const hasFive = (item: KiekeboeItem) => item.n > 5 && item.pattern !== 'dobbel' && item.pattern !== 'los';

class Round {
  private root: HTMLElement;
  private card: HTMLElement;
  private blanket: HTMLElement;
  private pointer: HTMLElement;
  private cards: NumberCards;
  private points: Point[];

  constructor(private ctx: ActivityContext, private item: KiekeboeItem) {
    this.root = el('div', 'kiekeboe');
    this.root.dataset.n = String(item.n); // voor tests
    this.card = el('div', 'kb-kaart');
    this.card.append(svgEl(patternSvg(item.pattern, item.n, item.loose)));
    this.blanket = el('div', 'kb-deken is-closed');
    this.card.append(this.blanket);
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.card, this.pointer);
    ctx.stage.append(this.root);
    this.points = patternPoints(item.pattern, item.n, item.loose);
    this.cards = new NumberCards(this.root, ctx.stage, item.options);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.cards.destroy();
    this.root.remove();
  }

  private box(): Box {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const w = Math.min(0.62 * W, 0.6 * H * (VIEW.w / VIEW.h));
    const h = w * (VIEW.h / VIEW.w);
    return { x: 0.59 * W - w / 2, y: 0.06 * H + (0.62 * H - h) / 2, w, h };
  }

  private layout = (): void => place(this.card, this.box());

  private async peek(ms: number): Promise<void> {
    this.blanket.classList.remove('is-closed');
    await sleep(600 + ms);
    this.blanket.classList.add('is-closed');
    await sleep(700);
  }

  private reveal(): void {
    this.blanket.classList.remove('is-closed');
  }

  private pointAt(p: Point): void {
    const b = this.box();
    const size = b.w * 0.13;
    const x = b.x + (p.x / VIEW.w) * b.w;
    const y = b.y + (p.y / VIEW.h) * b.h;
    place(this.pointer, { x: x - size * 0.43, y: y + size * 0.1, w: size, h: size });
    this.pointer.classList.add('is-on');
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    await ctx.say(ctx.beginner ? ['kiekeboe.uitleg', 'kiekeboe.kijk'] : ['kiekeboe.kijk']);
    ctx.fluffy.set('luisteren');
    await this.peek(item.showMs);

    let v = await this.cards.ask(ctx, ctx.beginner ? ['kiekeboe.vraag', 'tellen.hoeveel.tik'] : ['kiekeboe.vraag']);
    if (v === item.n) return this.celebrate(1);

    // Ladder 1: nog een keer kijken, iets langer.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await ctx.say(['kiekeboe.nogeens']);
    await this.peek(item.showMs + 1000);
    v = await this.cards.ask(ctx, ['kiekeboe.vraag']);
    if (v === item.n) return this.celebrate(2);

    // Ladder 2: dekentje eraf, Fluffy laat zien hoe je het kunt zien, en dan samen.
    await this.model();
    v = await this.cards.ask(ctx, ['tellen.tik.a', item.n, 'tellen.tik.b'], item.n);
    if (v === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['tellen.zijnhet', item.n, 'lof.samen']);
    } else {
      this.cards.mark(item.n);
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', item.n]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** Fluffy wijst aan. Met een volle vijf: "een volle rij/hand is vijf", en dan verder tellen. */
  private async model(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    this.reveal();
    await sleep(700);
    await ctx.say(['voordoen.start']);
    let from = 0;
    if (hasFive(item)) {
      const line: LineId = item.pattern === 'vingers' ? 'kiekeboe.hand' : item.pattern === 'dobbels' ? 'kiekeboe.dobbelvijf' : 'kiekeboe.rij';
      this.pointAt(this.points[2]);
      await ctx.say([line]);
      from = 5;
    }
    for (let i = from; i < item.n; i++) {
      this.pointAt(this.points[i]);
      await sleep(300);
      await ctx.say([i + 1]);
    }
    this.pointer.classList.remove('is-on');
    this.cards.show(true);
    this.cards.mark(item.n);
    await ctx.say(this.structure());
    if (item.pattern === 'dobbel') await ctx.say(['kiekeboe.dobbel']);
    await sleep(500);
    ctx.fluffy.set('rust');
  }

  /** "Vijf en twee, dat is zeven." of "Dus het zijn er drie." */
  private structure(): Seg[] {
    const { n } = this.item;
    return hasFive(this.item) ? ['kiekeboe.vijfen', n - 5, 'kiekeboe.isdat', n] : ['tellen.dushet', n];
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    this.reveal();
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards.mark(item.n);
    await sleep(600);
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : hasFive(item) ? 'lof.vijf' : 'lof.zien';
    await ctx.say(hasFive(item) ? [...this.structure(), praise] : ['tellen.zijnhet', item.n, praise]);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een dobbelsteen met een dekentje dat half open is. */
const ICON = `<svg viewBox="0 0 200 160">
  <svg x="30" y="20" width="140" height="120" viewBox="0 0 400 250">${svgInner(patternSvg('dobbel', 5))}</svg>
  <path d="M28 18 H172 V62 C150 74 130 58 100 70 C70 82 50 66 28 74 Z" fill="#d9cdee" stroke="#b3a8d6" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

export const kiekeboe: Activity<KiekeboeItem> = {
  id: 'kiekeboe',
  name: 'Kiekeboe-stippen',
  skills: ['zien-5', 'zien-10'],
  makeItem: makeKiekeboeItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.kiekeboe'],
  icon: ICON,
  choice: ['keuze.kiekeboe'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 6; n <= 10; n++) out.push(['kiekeboe.vijfen', n - 5, 'kiekeboe.isdat', n]);
    return out;
  },
};
