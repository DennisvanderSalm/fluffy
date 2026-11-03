import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { el, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { answerOptions } from './tellen';
import { NumberCards, place, POINTER_SVG, type Box } from './veld';

/**
 * SPLITSHUISJE — deel en geheel (Resnick, 1983; NL kleuterdidactiek). Een paar vlinders gaan in
 * het huisje slapen en de deur gaat dicht. Buiten zie je er twee; hoeveel zitten er binnen?
 * Dat is splitsen: vijf is twee en drie. Buiten en binnen liggen ze in rijtjes van vijf.
 * Niveaus: ze ziet de vlinders naar binnen vliegen (kleine aantallen) → grotere aantallen →
 * alleen het getal op het dak ("In dit huisje wonen vijf vlinders"), zonder dat ze ze ziet gaan.
 */

export type SplitsMode = 'kijk' | 'dak';

export interface SplitsItem {
  total: number;
  /** Hoeveel vlinders er binnen zitten (het antwoord). */
  inside: number;
  mode: SplitsMode;
  color: number;
  options: number[];
}

type Row = [min: number, max: number, mode: SplitsMode];
export const SPLITS_LEVELS: Record<string, Row[]> = {
  'splitsen-5': [
    [2, 4, 'kijk'],
    [3, 5, 'kijk'],
    [3, 5, 'dak'],
  ],
  'splitsen-10': [
    [6, 7, 'kijk'],
    [6, 10, 'kijk'],
    [6, 10, 'dak'],
  ],
};

let last = '';

export function makeSplitsItem(skill: string, level: number, rng: Rng): SplitsItem {
  const rows = SPLITS_LEVELS[skill];
  const [min, max, mode] = rows[Math.min(level, rows.length - 1)];
  let total = randInt(rng, min, max);
  let inside = randInt(rng, 1, total - 1);
  for (let i = 0; i < 5 && `${total}/${inside}` === last; i++) {
    total = randInt(rng, min, max);
    inside = randInt(rng, 1, total - 1);
  }
  last = `${total}/${inside}`;
  return { total, inside, mode, color: randInt(rng, 0, COLORS.length - 1), options: answerOptions(inside, rng) };
}

const COLORS: [wing: string, edge: string][] = [
  ['#f5b7c8', '#d98aa0'],
  ['#f8de7e', '#ddbb52'],
  ['#a9d4ef', '#73a9cf'],
];

const butterflySvg = ([wing, edge]: [string, string]) => `<svg viewBox="0 0 100 100">
  <ellipse cx="30" cy="34" rx="24" ry="22" fill="${wing}" stroke="${edge}" stroke-width="4"/>
  <ellipse cx="70" cy="34" rx="24" ry="22" fill="${wing}" stroke="${edge}" stroke-width="4"/>
  <ellipse cx="34" cy="68" rx="17" ry="16" fill="${wing}" stroke="${edge}" stroke-width="4"/>
  <ellipse cx="66" cy="68" rx="17" ry="16" fill="${wing}" stroke="${edge}" stroke-width="4"/>
  <circle cx="30" cy="34" r="7" fill="#fff" opacity="0.7"/><circle cx="70" cy="34" r="7" fill="#fff" opacity="0.7"/>
  <rect x="45" y="22" width="10" height="64" rx="5" fill="#3b4a6b"/>
  <path d="M48 24 C44 14 40 10 34 8 M52 24 C56 14 60 10 66 8" stroke="#3b4a6b" stroke-width="3" fill="none" stroke-linecap="round"/></svg>`;

const ROOF_SVG = `<svg viewBox="0 0 100 40" preserveAspectRatio="none"><path d="M3 38 L50 3 L97 38 Z" fill="#f4a690" stroke="#d98670" stroke-width="3" stroke-linejoin="round"/></svg>`;

class Round {
  private root: HTMLElement;
  private roof: HTMLElement;
  private plate: HTMLElement;
  private wall: HTMLElement;
  private shutterWrap: HTMLElement;
  private shutter: HTMLElement;
  private flies: HTMLElement[] = [];
  /** Per vlinder: zit hij binnen? */
  private isIn: boolean[] = [];
  private pointer: HTMLElement;
  private cards: NumberCards;

  constructor(private ctx: ActivityContext, private item: SplitsItem) {
    this.root = el('div', 'splitshuis');
    this.root.dataset.answer = String(item.inside); // voor tests
    this.roof = el('div', 'sh-dak');
    this.roof.append(svgEl(ROOF_SVG));
    this.plate = el('div', 'sh-bord', String(item.total));
    this.wall = el('div', 'sh-muur');
    this.shutterWrap = el('div', 'sh-deurvak');
    this.shutter = el('div', 'sh-deur');
    this.shutterWrap.append(this.shutter);
    this.root.append(this.roof, this.wall, this.shutterWrap);
    if (item.mode === 'dak') this.root.append(this.plate);
    const svg = butterflySvg(COLORS[item.color]);
    for (let i = 0; i < item.total; i++) {
      const f = el('div', 'sh-vlinder');
      f.append(svgEl(svg));
      this.flies.push(f);
      // Bij 'dak' zitten ze er al in; bij 'kijk' vliegen de laatste straks naar binnen.
      this.isIn.push(item.mode === 'dak' && i >= item.total - item.inside);
      this.root.append(f);
    }
    if (item.mode === 'dak') this.shutter.classList.add('is-closed');
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.pointer);
    ctx.stage.append(this.root);
    this.cards = new NumberCards(this.root, ctx.stage, item.options);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.cards.destroy();
    this.root.remove();
  }

  private geom() {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const hw = Math.min(0.32 * W, 0.5 * H);
    const house = { x: 0.24 * W, y: 0.06 * H, w: hw };
    const roof: Box = { x: house.x - 0.04 * hw, y: house.y, w: hw * 1.08, h: 0.4 * hw };
    const wall: Box = { x: house.x, y: house.y + 0.4 * hw - 2, w: hw, h: 0.66 * hw };
    const garden: Box = { x: 0.6 * W, y: wall.y, w: 0.37 * W, h: wall.h };
    const b = Math.min(hw / 5.4, garden.w / 5.6, 90);
    return { roof, wall, garden, b };
  }

  /** Plek k in een rijtje van vijf (links uitgelijnd, zoals een tienveld), in vak `box`. */
  private slot(box: Box, k: number, n: number): Box {
    const { b } = this.geom();
    const rows = Math.ceil(n / 5);
    const step = b * 1.05;
    const x0 = box.x + (box.w - 5 * step) / 2 + (step - b) / 2;
    const y0 = box.y + box.h / 2 - (rows * b * 1.25) / 2;
    return { x: x0 + (k % 5) * step, y: y0 + Math.floor(k / 5) * b * 1.25 + b * 0.1, w: b, h: b };
  }

  private flyBox(i: number): Box {
    const { wall, garden } = this.geom();
    const inside = this.isIn[i];
    const group = this.flies.map((_, j) => j).filter((j) => this.isIn[j] === inside);
    // Zolang er nog niemand binnen is, staan ze buiten allemaal in de rijtjes.
    return this.slot(inside ? wall : garden, group.indexOf(i), group.length);
  }

  private layout = (): void => {
    const { roof, wall } = this.geom();
    place(this.roof, roof);
    place(this.wall, wall);
    place(this.shutterWrap, wall);
    const p = roof.h * 0.42;
    place(this.plate, { x: roof.x + roof.w / 2 - p * 0.6, y: roof.y + roof.h * 0.48, w: p * 1.2, h: p });
    this.flies.forEach((f, i) => place(f, this.flyBox(i)));
  };

  private pointAt(node: HTMLElement): void {
    const r = node.getBoundingClientRect();
    const st = this.ctx.stage.getBoundingClientRect();
    const p = Math.min(r.width * 0.95, 80);
    place(this.pointer, { x: r.left - st.left + r.width / 2 - p * 0.43, y: r.top - st.top + r.height * 0.7, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  private async door(open: boolean): Promise<void> {
    this.shutter.classList.toggle('is-closed', !open);
    await sleep(700);
  }

  private question(): Seg[] {
    const { total, mode } = this.item;
    const whole: Seg[] = mode === 'dak' ? ['splits.wonen.a', total, 'splits.wonen.b'] : ['splits.waren.a', total, 'splits.waren.b'];
    const out = total - this.item.inside;
    return [...whole, ...(out === 1 ? ['splits.buiten.een' as const] : ['splits.buiten' as const, out]), 'splits.vraag'];
  }

  /** De vlinders vliegen één voor één naar binnen, en dan gaat de deur dicht. */
  private async flyIn(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('rust');
    await ctx.say(['splits.kijk', item.total, 'obj.vlinders']);
    if (ctx.beginner) await ctx.say(['splits.uitleg']);
    else await ctx.say(['splits.slapen']);
    ctx.fluffy.set('luisteren');
    for (let i = item.total - 1; i >= item.total - item.inside; i--) {
      this.isIn[i] = true;
      this.layout();
      await sleep(item.total > 5 ? 550 : 750);
    }
    await sleep(500);
    await this.door(false);
    await ctx.say(['splits.welterusten']);
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    if (item.mode === 'kijk') await this.flyIn();
    else if (ctx.beginner) await ctx.say(['splits.uitleg.dak']);

    let v = await this.cards.ask(ctx, this.question());
    if (v === item.inside) return this.celebrate(1);

    // Ladder 1: even door de deur gluren.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await ctx.say(['splits.spieken']);
    await this.door(true);
    await sleep(600 + 250 * item.inside);
    await this.door(false);
    v = await this.cards.ask(ctx, ['splits.vraag']);
    if (v === item.inside) return this.celebrate(2);

    // Ladder 2: deur open, Fluffy telt wie er binnen zit en zegt de splitsing.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await this.door(true);
    await ctx.say(['voordoen.start']);
    const inside = this.flies.filter((_, i) => this.isIn[i]);
    for (const [k, f] of inside.entries()) {
      f.classList.add('is-counted');
      this.pointAt(f);
      await sleep(300);
      await ctx.say([k + 1]);
    }
    this.pointer.classList.remove('is-on');
    await ctx.say(this.split());
    v = await this.cards.ask(ctx, ['tellen.tik.a', item.inside, 'tellen.tik.b'], item.inside);
    if (v === item.inside) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      this.cards.mark(item.inside);
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', item.inside]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  /** "Vijf is twee en drie." (geheel, buiten, binnen) */
  private split(): Seg[] {
    const { total, inside } = this.item;
    return [total, 'splits.is', total - inside, 'splits.en', inside];
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    await this.door(true);
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards.mark(item.inside);
    this.flies.forEach((f, i) => f.classList.toggle('is-counted', this.isIn[i]));
    await ctx.say([...this.split(), attempt === 2 ? 'lof.doorzetten' : 'lof.verstopt']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een huisje met een dichte deur en twee vlinders ernaast. */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M14 66 L64 26 L114 66 Z" fill="#f4a690" stroke="#d98670" stroke-width="5" stroke-linejoin="round"/>
  <rect x="22" y="64" width="84" height="74" rx="6" fill="#e9c79a" stroke="#c9a26e" stroke-width="5"/>
  <path d="M43 68 V134 M64 68 V134 M85 68 V134" stroke="#c9a26e" stroke-width="3"/>
  <svg x="124" y="48" width="44" height="44" viewBox="0 0 100 100">${svgInner(butterflySvg(COLORS[0]))}</svg>
  <svg x="146" y="94" width="40" height="40" viewBox="0 0 100 100">${svgInner(butterflySvg(COLORS[1]))}</svg>
</svg>`;

export const splitshuis: Activity<SplitsItem> = {
  id: 'splitshuis',
  name: 'Splitshuisje',
  skills: ['splitsen-5', 'splitsen-10'],
  makeItem: makeSplitsItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.splitshuis'],
  icon: ICON,
  choice: ['keuze.splitshuis'],
  phrases() {
    const out: Seg[][] = [];
    for (let t = 2; t <= 10; t++) {
      out.push(['splits.kijk', t, 'obj.vlinders'], ['splits.waren.a', t, 'splits.waren.b'], ['splits.wonen.a', t, 'splits.wonen.b']);
      for (let a = 1; a < t; a++) out.push([t, 'splits.is', a, 'splits.en', t - a]);
    }
    for (let n = 2; n <= 9; n++) out.push(['splits.buiten', n]);
    return out;
  },
};
