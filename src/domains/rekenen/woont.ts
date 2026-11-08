import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { el, randInt, sleep, type Rng } from '../../core/util';
import { Lijn } from './lijn';

/**
 * WAAR WOONT ZEVEN? — een getal op de getallenlijn plaatsen. Een straat met tien huisjes op
 * een rij; niet elk huisje heeft een nummer. Hoe minder nummers, hoe meer ze moet weten dat
 * 9 bijna aan het eind ligt en 2 vlak bij het begin (Siegler & Booth, 2004; Siegler & Ramani, 2009).
 * Niveaus: alleen het gezochte huisje zonder nummer → alleen 1, 5 en 10 → alleen 1 en 10.
 */

export interface WoontItem {
  n: number;
  /** Huisjes waarop het nummer staat. */
  visible: number[];
}

export const WOONT_LANDMARKS: number[][] = [
  [], // niveau 0: alles behalve het gezochte nummer
  [1, 5, 10],
  [1, 10],
];

let lastN = 0;

export function makeWoontItem(_skill: string, level: number, rng: Rng): WoontItem {
  const marks = WOONT_LANDMARKS[Math.min(level, WOONT_LANDMARKS.length - 1)];
  let n = randInt(rng, 2, 9);
  for (let i = 0; i < 10 && (n === lastN || marks.includes(n)); i++) n = randInt(rng, 2, 9);
  lastN = n;
  const visible = marks.length ? marks.filter((m) => m !== n) : Array.from({ length: 10 }, (_, i) => i + 1).filter((m) => m !== n);
  return { n, visible };
}

/** Het zichtbare nummer dat het dichtst bij het gezochte ligt (om vanaf te tellen). */
export function nearestLandmark(item: WoontItem): number {
  return [...item.visible].sort((a, b) => Math.abs(a - item.n) - Math.abs(b - item.n) || a - b)[0];
}

class Round {
  private root: HTMLElement;
  private lijn: Lijn;

  constructor(private ctx: ActivityContext, private item: WoontItem) {
    this.root = el('div', 'woont');
    this.root.dataset.n = String(item.n); // voor tests
    ctx.stage.append(this.root);
    this.lijn = new Lijn(this.root, ctx.stage, 'huisjes', (n) => item.visible.includes(n), (H) => 0.4 * H);
  }

  destroy(): void {
    this.lijn.destroy();
    this.root.remove();
  }

  private async ask(segs: Seg[], highlight?: number): Promise<number> {
    const { ctx, lijn } = this;
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
    await sleep(300);
    return n;
  }

  /** Fluffy telt van een zichtbaar nummer naar het gezochte huisje, en wijst elk huisje aan. */
  private async countFrom(from: number, to: number): Promise<void> {
    const dir = Math.sign(to - from) || 1;
    const beat = this.ctx.countBeat();
    for (let n = from; n !== to + dir; n += dir) {
      this.lijn.pointAt(n);
      await beat();
      await this.ctx.say([n]);
    }
    this.lijn.hidePointer();
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item, lijn } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    const question: Seg[] = ctx.beginner ? ['woont.uitleg', 'woont.vraag', item.n] : ['woont.vraag', item.n];
    let v = await this.ask(question);
    if (v === item.n) return this.celebrate(1);

    // Ladder 1: laten zien waar een bekend nummer woont, en dan zelf verder zoeken.
    ctx.fluffy.set('nadenken');
    const mark = nearestLandmark(item);
    lijn.pointAt(mark);
    await ctx.say(['woont.hier', mark, 'woont.zoekverder']);
    lijn.hidePointer();
    v = await this.ask(['woont.vraag', item.n]);
    if (v === item.n) return this.celebrate(2);

    // Ladder 2: samen tellen vanaf het bekende nummer tot het gezochte huisje.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.start']);
    await this.countFrom(mark, item.n);
    lijn.showNumber(item.n);
    await ctx.say(['woont.hier', item.n]);
    v = await this.ask(['cijfer.tikjij'], item.n);
    if (v === item.n) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen']);
    } else {
      lijn.mark(item.n);
      await ctx.say(['tellen.kijkdeze']);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item, lijn } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    lijn.showNumber(item.n);
    lijn.mark(item.n);
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : 'lof.plek';
    await ctx.say(['woont.hier', item.n, praise]);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

const HOUSE = `<path d="M8 52 L50 12 L92 52 Z" fill="#f4a690" stroke="#d98670" stroke-width="5" stroke-linejoin="round"/>
  <rect x="16" y="50" width="68" height="64" rx="6" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5"/>`;

/** Plaatje voor het keuzemoment: een straatje met huisjes en een vraagteken. */
const ICON = `<svg viewBox="0 0 200 160">
  ${[0, 1, 2, 3].map((i) => `<svg x="${6 + i * 46}" y="44" width="44" height="54" viewBox="0 0 100 120">${HOUSE}</svg>`).join('')}
  <path d="M6 112 H194" stroke="#d6ba8c" stroke-width="6" stroke-linecap="round"/>
  <text x="121" y="84" text-anchor="middle" font-size="30" font-weight="800" fill="#7a86a3" font-family="ui-rounded, system-ui, sans-serif">?</text>
</svg>`;

export const woont: Activity<WoontItem> = {
  id: 'woont',
  name: 'Waar woont…?',
  skills: ['plaats-10'],
  makeItem: makeWoontItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.woont'],
  icon: ICON,
  choice: ['keuze.woont'],
  phrases() {
    const out: Seg[][] = [];
    for (let n = 1; n <= 10; n++) out.push(['woont.vraag', n], ['woont.hier', n]);
    return out;
  },
};
