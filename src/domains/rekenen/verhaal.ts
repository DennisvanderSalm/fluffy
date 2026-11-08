import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { el, randInt, sleep, svgEl, type Rng } from '../../core/util';
import { answerOptions } from './tellen';
import { animalInner, NumberCards, place, POINTER_SVG, type Box } from './veld';

/**
 * EENDJES IN DE VIJVER — verhaaltjes met erbij en eraf ("join/separate, result unknown";
 * Carpenter & Moser, 1984; Clements & Sarama, 2014). Kleuters lossen zulke verhaaltjes op door ze
 * na te spelen: daarom zie je de eendjes echt aankomen en wegzwemmen.
 * Niveaus: kleine veranderingen die je ziet → grotere veranderingen → de eendjes zitten achter
 * het riet, zodat ze het in haar hoofd moet bijhouden.
 */

export interface VerhaalItem {
  start: number;
  /** Positief: er komen er bij. Negatief: er zwemmen er weg. */
  change: number;
  hidden: boolean;
  options: number[];
}

export const verhaalResult = (it: VerhaalItem) => it.start + it.change;

type Row = [minStart: number, maxStart: number, maxChange: number, max: number, hidden: boolean];
export const VERHAAL_LEVELS: Record<string, Row[]> = {
  'verhaal-5': [
    [1, 4, 1, 5, false],
    [2, 4, 2, 5, false],
    [2, 4, 2, 5, true],
  ],
  'verhaal-10': [
    [4, 8, 2, 10, false],
    [5, 8, 3, 10, false],
    [5, 8, 3, 10, true],
  ],
};

let last = '';

export function makeVerhaalItem(skill: string, level: number, rng: Rng): VerhaalItem {
  const rows = VERHAAL_LEVELS[skill] ?? VERHAAL_LEVELS['verhaal-5'];
  const [lo, hi, maxChange, max, hidden] = rows[Math.min(level, rows.length - 1)];
  let start = 0;
  let change = 0;
  for (let i = 0; i < 20; i++) {
    start = randInt(rng, lo, hi);
    const size = randInt(rng, 1, maxChange);
    change = rng() < 0.5 ? size : -size;
    const r = start + change;
    if (r >= 1 && r <= max && `${start}/${change}` !== last) break;
  }
  if (start + change < 1 || start + change > max) change = start < max ? 1 : -1;
  last = `${start}/${change}`;
  return { start, change, hidden, options: answerOptions(start + change, rng) };
}

const DUCK = `<svg viewBox="0 0 100 100">${animalInner('eendje')}</svg>`;
/** Riet: een dichte bos (je ziet er echt niets doorheen), met stengels en sigaren erboven. */
const REED = `<svg viewBox="0 0 200 100" preserveAspectRatio="none">
  ${Array.from({ length: 14 }, (_, i) => {
    const x = 10 + i * 13.5;
    const h = 22 + ((i * 37) % 14);
    return `<path d="M${x} 40 C${x - 3} ${40 - h / 2} ${x + 4} ${40 - h * 0.8} ${x + 1} ${40 - h}" stroke="#7fae6c" stroke-width="5" fill="none" stroke-linecap="round"/>
    <ellipse cx="${x + 1}" cy="${44 - h}" rx="3.5" ry="7" fill="#a2764c"/>`;
  }).join('')}
  <path d="M0 100 V34 ${Array.from({ length: 10 }, (_, i) => `Q${i * 20 + 10} ${i % 2 ? 20 : 26} ${i * 20 + 20} 34`).join(' ')} V100 Z" fill="#a5cf93" stroke="#7fae6c" stroke-width="3"/>
  <path d="M20 60 C24 50 30 50 34 60 M70 72 C74 62 80 62 84 72 M130 58 C134 48 140 48 144 58 M170 76 C174 66 180 66 184 76" stroke="#7fae6c" stroke-width="3" fill="none" stroke-linecap="round"/>
</svg>`;

class Round {
  private root: HTMLElement;
  private pond: HTMLElement;
  private reed: HTMLElement;
  private ducks: HTMLElement[] = [];
  /** Per eendje: zwemt het in de vijver? */
  private inPond: boolean[] = [];
  /** Eendjes die net naast de vijver zwemmen (komen eraan of gaan weg), goed te zien. */
  private staged = new Set<number>();
  private pointer: HTMLElement;
  private cards: NumberCards;

  constructor(private ctx: ActivityContext, private item: VerhaalItem) {
    this.root = el('div', 'verhaal');
    this.root.dataset.answer = String(verhaalResult(item)); // voor tests
    this.pond = el('div', 'vh-vijver');
    this.reed = el('div', 'vh-riet');
    this.reed.append(svgEl(REED));
    this.root.append(this.pond);
    const total = item.start + Math.max(0, item.change);
    for (let i = 0; i < total; i++) {
      const d = el('div', 'vh-eend');
      d.append(svgEl(DUCK));
      this.ducks.push(d);
      this.inPond.push(false);
      this.root.append(d);
    }
    this.root.append(this.reed);
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
    const pond: Box = { x: 0.3 * W, y: 0.08 * H, w: 0.58 * W, h: 0.55 * H };
    const b = Math.min(pond.w / 6.2, pond.h / 2.9, 110);
    return { W, H, pond, b };
  }

  /** Plek k in rijtjes van vijf, midden in de vijver. */
  private slot(k: number, n: number): Box {
    const { pond, b } = this.geom();
    const rows = Math.ceil(n / 5);
    const step = b * 1.08;
    const x0 = pond.x + (pond.w - 5 * step) / 2;
    const y0 = pond.y + pond.h / 2 - (rows * b * 1.15) / 2;
    return { x: x0 + (k % 5) * step, y: y0 + Math.floor(k / 5) * b * 1.15, w: b, h: b };
  }

  private layout = (): void => {
    const { W, pond, b } = this.geom();
    place(this.pond, pond);
    // Het dichte deel van het riet begint op 34% van zijn hoogte: zo valt ook de bovenste rij eendjes erachter.
    place(this.reed, { x: pond.x - 0.02 * W, y: pond.y - 0.25 * pond.h, w: pond.w + 0.04 * W, h: pond.h * 1.25 });
    const swimming = this.ducks.map((_, i) => i).filter((i) => this.inPond[i]);
    const side = (i: number): Box => {
      const k = [...this.staged].indexOf(i);
      return { x: W - b * 1.1, y: pond.y + pond.h * 0.15 + k * b * 1.1, w: b, h: b };
    };
    this.ducks.forEach((d, i) => {
      const k = swimming.indexOf(i);
      const staged = this.staged.has(i);
      place(d, k >= 0 ? this.slot(k, swimming.length) : staged ? side(i) : { x: W + b, y: pond.y + pond.h / 2 - b / 2, w: b, h: b });
      d.classList.toggle('is-out', k < 0 && !staged);
      d.classList.toggle('is-side', staged);
    });
  };

  private pointAt(node: HTMLElement): void {
    const r = node.getBoundingClientRect();
    const st = this.ctx.stage.getBoundingClientRect();
    const p = Math.min(r.width * 0.95, 80);
    place(this.pointer, { x: r.left - st.left + r.width / 2 - p * 0.43, y: r.top - st.top + r.height * 0.7, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  private hideReed(on: boolean): void {
    this.reed.classList.toggle('is-on', on);
  }

  private startLine(): Seg[] {
    const { start } = this.item;
    return start === 1 ? ['verhaal.start.een'] : ['verhaal.start.a', start, 'verhaal.start.b'];
  }

  private changeLine(): Seg[] {
    const k = Math.abs(this.item.change);
    if (this.item.change > 0) return k === 1 ? ['verhaal.bij.een'] : ['verhaal.bij.a', k, 'verhaal.bij.b'];
    return k === 1 ? ['verhaal.af.een'] : ['verhaal.af.a', k, 'verhaal.af.b'];
  }

  private question(): Seg[] {
    return [this.item.hidden ? 'verhaal.vraag.riet' : 'verhaal.vraag'];
  }

  /** Het verhaaltje: eendjes zwemmen de vijver in, en dan komen er bij of gaan er weg. */
  private async story(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('rust');
    for (let i = 0; i < item.start; i++) this.inPond[i] = true;
    this.layout();
    await sleep(900);
    await ctx.say(this.startLine());
    if (item.hidden) {
      this.hideReed(true);
      await sleep(600);
      await ctx.say(['verhaal.riet']);
    }
    await sleep(400);
    await this.move();
    await ctx.say(this.changeLine());
    await sleep(300);
  }

  /**
   * De verandering zelf, één voor één. Elk eendje zwemt eerst naast de vijver, waar ze het goed
   * ziet (ook als de rest achter het riet zit), en dan de vijver in of weg.
   */
  private async move(): Promise<void> {
    const { item } = this;
    const k = Math.abs(item.change);
    for (let j = 0; j < k; j++) {
      // Erbij: de volgende komt van rechts. Eraf: de laatste zwemt weg.
      const i = item.change > 0 ? item.start + j : item.start - 1 - j;
      this.inPond[i] = false;
      this.staged.add(i);
      this.layout();
      this.ctx.sounds.plop();
      await sleep(1000);
      this.staged.delete(i);
      this.inPond[i] = item.change > 0;
      this.layout();
      await sleep(800);
    }
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    const result = verhaalResult(item);
    ctx.fluffy.still(true);
    await sleep(300);
    if (ctx.beginner) await ctx.say(['verhaal.uitleg']);
    await this.story();
    let v = await this.cards.ask(ctx, this.question());
    if (v === result) return this.celebrate(1);
    const note = v === item.start
      ? 'Bij erbij en eraf noemt ze soms het aantal van het begin: het verhaaltje bijhouden is nog lastig.'
      : v === item.start - item.change
        ? 'Haalt bij de verhaaltjes erbij en eraf soms door elkaar.'
        : undefined;

    // Ladder 1: het verhaaltje nog eens vertellen (en bij het riet even laten kijken).
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await ctx.say(['verhaal.hint']);
    await ctx.say(item.start === 1 ? ['verhaal.eerst.een'] : ['verhaal.eerst', item.start]);
    await ctx.say(this.changeLine());
    if (item.hidden) {
      await ctx.say(['verhaal.spiek']);
      this.hideReed(false);
      await sleep(900 + 200 * result);
      this.hideReed(true);
    }
    v = await this.cards.ask(ctx, this.question());
    if (v === result) return { ...(await this.celebrate(2)), note };

    // Ladder 2: riet weg, Fluffy telt de eendjes die er nu zijn en zegt de som.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    this.hideReed(false);
    await ctx.say(['voordoen.start']);
    const swimming = this.ducks.filter((_, i) => this.inPond[i]);
    const beat = ctx.countBeat();
    for (const [k, d] of swimming.entries()) {
      d.classList.add('is-counted');
      this.pointAt(d);
      await beat();
      await ctx.say([k + 1]);
    }
    this.pointer.classList.remove('is-on');
    await ctx.say(this.sum());
    v = await this.cards.ask(ctx, ['tellen.tik.a', result, 'tellen.tik.b'], result);
    if (v === result) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      this.cards.mark(result);
      await ctx.say(['tellen.kijkdeze', 'tellen.dushet', result]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  /** "Drie en één erbij is vier." / "Vier en twee eraf is twee." */
  private sum(): Seg[] {
    const { start, change } = this.item;
    return [start, 'verhaal.en', Math.abs(change), change > 0 ? 'verhaal.erbij' : 'verhaal.eraf', start + change];
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    this.hideReed(false);
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards.mark(verhaalResult(item));
    this.ducks.forEach((d, i) => d.classList.toggle('is-counted', this.inPond[i]));
    await sleep(400);
    await ctx.say([...this.sum(), attempt === 2 ? 'lof.doorzetten' : 'lof.verhaal']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een vijver met drie eendjes. */
const ICON = `<svg viewBox="0 0 200 160">
  <ellipse cx="100" cy="98" rx="90" ry="48" fill="#bfe0f2" stroke="#8fc1e0" stroke-width="5"/>
  <svg x="26" y="64" width="50" height="50" viewBox="0 0 100 100">${animalInner('eendje')}</svg>
  <svg x="76" y="72" width="50" height="50" viewBox="0 0 100 100">${animalInner('eendje')}</svg>
  <svg x="132" y="30" width="50" height="50" viewBox="0 0 100 100">${animalInner('eendje')}</svg>
</svg>`;

export const verhaal: Activity<VerhaalItem> = {
  id: 'verhaal',
  name: 'Eendjes in de vijver',
  skills: ['verhaal-5', 'verhaal-10'],
  makeItem: makeVerhaalItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.verhaal'],
  icon: ICON,
  choice: ['keuze.verhaal'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 2; n <= 10; n++) out.push(['verhaal.start.a', n, 'verhaal.start.b'], ['verhaal.eerst', n]);
    for (let k = 2; k <= 3; k++) out.push(['verhaal.bij.a', k, 'verhaal.bij.b'], ['verhaal.af.a', k, 'verhaal.af.b']);
    for (let a = 1; a <= 9; a++) {
      for (let k = 1; k <= 3; k++) {
        if (a + k <= 10) out.push([a, 'verhaal.en', k, 'verhaal.erbij', a + k]);
        if (a - k >= 1) out.push([a, 'verhaal.en', k, 'verhaal.eraf', a - k]);
      }
    }
    return out;
  },
};
