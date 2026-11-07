import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, pick, randInt, shuffle, sleep, svgEl, type Rng } from '../../core/util';
import { place } from './veld';

/**
 * KRALENKETTING — herhalende patronen voortzetten. Patronen herkennen bij kleuters hangt samen
 * met later rekenen, ook los van tellen (Rittle-Johnson e.a., 2019). Fluffy zegt het patroon
 * hardop ("rood, blauw, rood, blauw"): benoemen helpt om de herhaling te zien.
 * Elke kleur heeft ook een eigen vorm, zodat het niet alleen op kleur aankomt.
 * Niveaus A-B: twee kralen om uit te kiezen → drie → twee kralen achter elkaar invullen.
 * Moeilijkere patronen: A-A-B of A-B-B → A-B-C → twee kralen achter elkaar.
 */

export type Bead = 'rood' | 'blauw' | 'geel' | 'groen';
const BEADS: Bead[] = ['rood', 'blauw', 'geel', 'groen'];

export interface PatroonItem {
  /** Het stukje dat steeds terugkomt, bv. ['rood', 'blauw']. */
  unit: Bead[];
  /** Wat aan de ketting zit. */
  shown: Bead[];
  /** Wat erna komt (1 of 2 kralen). */
  missing: Bead[];
  options: Bead[];
}

type Shape = 'ab' | 'aab' | 'abb' | 'abc' | 'aabb';
type Row = [shapes: Shape[], missing: number, options: number, offset: boolean];
export const PATROON_LEVELS: Record<string, Row[]> = {
  'patroon-ab': [
    [['ab'], 1, 2, false],
    [['ab'], 1, 3, false],
    [['ab'], 2, 3, true],
  ],
  'patroon-abc': [
    [['aab', 'abb'], 1, 3, false],
    [['abc'], 1, 3, false],
    [['aab', 'abb', 'abc', 'aabb'], 2, 3, true],
  ],
};

let last = '';

export function makePatroonItem(skill: string, level: number, rng: Rng): PatroonItem {
  const rows = PATROON_LEVELS[skill] ?? PATROON_LEVELS['patroon-ab'];
  const [shapes, missing, nOptions, offset] = rows[Math.min(level, rows.length - 1)];
  let unit: Bead[] = [];
  for (let i = 0; i < 5; i++) {
    const shape = pick(rng, shapes);
    const [a, b, c] = shuffle(rng, BEADS);
    const map: Record<string, Bead> = { a, b, c };
    unit = [...shape].map((ch) => map[ch]);
    if (unit.join() !== last) break;
  }
  last = unit.join();
  // Minstens twee keer het hele stukje zichtbaar, en een paar kralen extra.
  const start = offset ? randInt(rng, 1, unit.length - 1) : 0;
  const visible = Math.max(2 * unit.length + 1, 6);
  const total = visible + missing;
  const seq = Array.from({ length: total }, (_, i) => unit[(start + i) % unit.length]);
  const used = [...new Set(unit)];
  const extra = shuffle(rng, BEADS.filter((x) => !used.includes(x)));
  const options = shuffle(rng, [...used, ...extra].slice(0, Math.max(nOptions, used.length)));
  return { unit, shown: seq.slice(0, visible), missing: seq.slice(visible), options };
}

const BEAD_COLOR: Record<Bead, [string, string]> = {
  rood: ['#f19a8c', '#d27769'],
  blauw: ['#8dbbe6', '#5a8fc4'],
  geel: ['#f8de7e', '#ddbb52'],
  groen: ['#a5cf93', '#7fae6c'],
};
/** Elke kleur een eigen vorm: rond, blokje, ruitje, zeshoek. */
const beadSvg = (b: Bead) => {
  const [fill, edge] = BEAD_COLOR[b];
  const a = `fill="${fill}" stroke="${edge}" stroke-width="6" stroke-linejoin="round"`;
  const shape = {
    rood: `<circle cx="50" cy="50" r="38" ${a}/>`,
    blauw: `<rect x="14" y="14" width="72" height="72" rx="14" ${a}/>`,
    geel: `<path d="M50 8 L92 50 L50 92 L8 50 Z" ${a}/>`,
    groen: `<path d="M28 12 H72 L94 50 L72 88 H28 L6 50 Z" ${a}/>`,
  }[b];
  return `<svg viewBox="0 0 100 100">${shape}<circle cx="50" cy="50" r="7" fill="#fff" opacity="0.8"/></svg>`;
};
const colorLine = (b: Bead) => `kleur.${b}` as LineId;

class Round {
  private root: HTMLElement;
  private string: HTMLElement;
  private beads: HTMLElement[];
  private slots: HTMLElement[];
  private cards: HTMLElement[];
  private answer: ((i: number) => void) | null = null;

  constructor(private ctx: ActivityContext, private item: PatroonItem) {
    this.root = el('div', 'klanken patroon');
    this.root.dataset.answer = item.missing.join(','); // voor tests
    this.string = el('div', 'pt-draad');
    this.root.append(this.string);
    this.beads = item.shown.map((b) => {
      const n = el('div', 'pt-kraal');
      n.append(svgEl(beadSvg(b)));
      this.root.append(n);
      return n;
    });
    this.slots = item.missing.map(() => {
      const n = el('div', 'pt-kraal is-leeg');
      this.root.append(n);
      return n;
    });
    this.cards = item.options.map((b, i) => {
      const c = el('div', 'lz-kaart');
      c.dataset.bead = b;
      c.append(svgEl(beadSvg(b)));
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
    const all = [...this.beads, ...this.slots];
    const left = 0.22 * W;
    const width = 0.76 * W;
    const b = Math.min(width / (all.length * 1.12), 0.17 * H, 110);
    const step = b * 1.12;
    const x0 = left + (width - all.length * step) / 2;
    const y = 0.16 * H;
    all.forEach((n, i) => place(n, { x: x0 + i * step, y, w: b, h: b }));
    place(this.string, { x: x0 - b * 0.3, y: y + b / 2 - 3, w: all.length * step + b * 0.4, h: 6 });
    const c = Math.min(0.24 * H, 0.16 * W, 180);
    const gap = c * 1.35;
    this.cards.forEach((card, i) => {
      place(card, { x: 0.59 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2, y: 0.5 * H, w: c, h: c });
    });
  };

  private light(node: HTMLElement | null): void {
    [...this.beads, ...this.slots].forEach((n) => n.classList.toggle('is-named', n === node));
  }

  /** Fluffy noemt de kralen één voor één (en de ingevulde erbij). */
  private async name(upto: number, gap = 120, stale: () => boolean = () => false): Promise<void> {
    const seq = [...this.item.shown, ...this.item.missing].slice(0, upto);
    const nodes = [...this.beads, ...this.slots];
    for (let i = 0; i < seq.length && !stale(); i++) {
      this.light(nodes[i]);
      await this.ctx.say([colorLine(seq[i])]);
      await sleep(gap);
    }
    this.light(null);
  }

  private fill(k: number, b: Bead | null): void {
    const slot = this.slots[k];
    slot.replaceChildren();
    slot.classList.toggle('is-leeg', b === null);
    if (b) slot.append(svgEl(beadSvg(b)));
  }

  private async ask(question: Seg[], k: number, highlight?: Bead): Promise<Bead> {
    const { ctx, item } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight) this.cards[item.options.indexOf(highlight)].classList.add('is-counted');
    this.slots[k].classList.add('is-named');
    this.root.classList.add('is-open');
    let run = 0;
    let done = false;
    const prompt = async (again: boolean) => {
      const me = ++run;
      const stale = () => done || me !== run;
      ctx.fluffy.set('rust');
      if (again) await this.name(item.shown.length + k, 120, stale);
      if (!stale()) await ctx.say(question);
      if (!stale()) {
        ctx.fluffy.set('luisteren');
        this.slots[k].classList.add('is-named');
      }
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
    this.light(null);
    this.cards[i].classList.add('is-picked');
    this.fill(k, item.options[i]);
    ctx.sounds.plop();
    await ctx.say([colorLine(item.options[i])]);
    return item.options[i];
  }

  /** Alle open plekken invullen. Goed als alles in één keer klopt. */
  private async askAll(first: Seg[]): Promise<{ ok: boolean; wrong?: Bead }> {
    const { item } = this;
    for (let k = 0; k < item.missing.length; k++) {
      const b = await this.ask(k === 0 ? first : ['patroon.volgende'], k);
      if (b !== item.missing[k]) {
        await sleep(500);
        for (let j = 0; j <= k; j++) this.fill(j, null);
        return { ok: false, wrong: b };
      }
    }
    return { ok: true };
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say(['patroon.uitleg']);
    await this.name(item.shown.length);
    const question: Seg[] = [item.missing.length > 1 ? 'patroon.vraag.twee' : 'patroon.vraag'];
    let r = await this.askAll(question);
    if (r.ok) return this.celebrate(1);
    const note = r.wrong === item.shown[item.shown.length - 1]
      ? 'Bij patronen kiest ze soms gewoon dezelfde kraal als de laatste.'
      : undefined;

    // Ladder 1: samen het patroon opzeggen, met een pauze waar de kraal moet komen.
    ctx.fluffy.set('nadenken');
    await ctx.say(['patroon.hint']);
    await this.name(item.shown.length, 380);
    r = await this.askAll(question);
    if (r.ok) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy zegt het stukje dat steeds terugkomt, en vult in met haar.
    ctx.fluffy.set('nadenken');
    await ctx.say(['patroon.voordoen', ...item.unit.map(colorLine), 'patroon.opnieuw']);
    for (let k = 0; k < item.missing.length; k++) {
      const b = await this.ask(['cijfer.tikjij'], k, item.missing[k]);
      if (b !== item.missing[k]) this.fill(k, item.missing[k]);
    }
    ctx.fluffy.set('blij');
    await this.name(item.shown.length + item.missing.length, 80);
    await ctx.say(['lof.samen.kort']);
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.slots.forEach((s) => s.classList.add('is-counted'));
    await this.name(item.shown.length + item.missing.length, 60);
    await ctx.say([attempt === 2 ? 'lof.doorzetten' : 'lof.patroon']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: een stukje kralenketting. */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M6 80 H194" stroke="#c9a26e" stroke-width="5"/>
  ${(['rood', 'blauw', 'rood', 'blauw', 'rood'] as Bead[]).map((b, i) =>
    `<svg x="${8 + i * 38}" y="62" width="36" height="36" viewBox="0 0 100 100">${beadSvg(b).replace(/^<svg[^>]*>|<\/svg>$/g, '')}</svg>`).join('')}
</svg>`;

export const patroon: Activity<PatroonItem> = {
  id: 'patroon',
  name: 'Kralenketting',
  skills: ['patroon-ab', 'patroon-abc'],
  makeItem: makePatroonItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.patroon'],
  icon: ICON,
  choice: ['keuze.patroon'],
  phrases: () => [],
};
