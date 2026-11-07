import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { pick, shuffle, sleep, svgInner, type Rng } from '../../core/util';
import { PICTURE } from '../lezen/plaatjes';
import { PictureCards } from './kaartjes';

/**
 * WAAR ZIT HET MUISJE? — ruimtelijke woorden (op, onder, naast, in, voor, achter). Ruimtelijk
 * denken hangt bij kleuters sterk samen met later rekenen (Verdine e.a., 2014), en de woorden
 * zelf helpen daarbij (Pruden, Levine & Huttenlocher, 2011).
 * Niveaus: op/onder/naast met twee plaatjes → drie plaatjes (ook in de doos) → voor en achter.
 */

export type Spot = 'op' | 'onder' | 'naast' | 'in' | 'voor' | 'achter';
type Thing = 'tafel' | 'doos';

export interface RuimteItem {
  thing: Thing;
  spot: Spot;
  options: Spot[];
}

const SPOTS: Record<Thing, Spot[]> = { tafel: ['op', 'onder', 'naast'], doos: ['op', 'in', 'naast', 'voor', 'achter'] };

let last = '';

export function makeRuimteItem(_skill: string, level: number, rng: Rng): RuimteItem {
  let item: RuimteItem;
  for (let i = 0; ; i++) {
    if (level <= 0) {
      const options = shuffle(rng, SPOTS.tafel).slice(0, 2);
      item = { thing: 'tafel', spot: pick(rng, options), options };
    } else if (level === 1) {
      const thing: Thing = rng() < 0.6 ? 'tafel' : 'doos';
      const options = thing === 'tafel' ? shuffle(rng, SPOTS.tafel) : shuffle(rng, ['op', 'in', 'naast'] as Spot[]);
      item = { thing, spot: pick(rng, options), options };
    } else {
      const spot = pick(rng, ['voor', 'achter'] as Spot[]);
      const other: Spot = spot === 'voor' ? 'achter' : 'voor';
      item = { thing: 'doos', spot, options: shuffle(rng, [spot, other, pick(rng, ['in', 'op'] as Spot[])]) };
    }
    if (`${item.thing}/${item.spot}` !== last || i > 4) break;
  }
  last = `${item.thing}/${item.spot}`;
  return item;
}

const MOUSE = svgInner(PICTURE.muis);
/** Muisje met de onderkant van zijn buik op hoogte `bottom`. */
const mouse = (x: number, bottom: number, s: number) =>
  `<svg x="${x}" y="${bottom - 0.86 * s}" width="${s}" height="${s}" viewBox="0 0 100 100">${MOUSE}</svg>`;

const FLOOR = `<path d="M2 91 H98" stroke="#e2d4bc" stroke-width="3" stroke-linecap="round"/>`;
const TABLE = `<rect x="14" y="51" width="6" height="40" rx="2" fill="#c8996a" stroke="#a2764c" stroke-width="2.5"/>
  <rect x="60" y="51" width="6" height="40" rx="2" fill="#c8996a" stroke="#a2764c" stroke-width="2.5"/>
  <rect x="8" y="44" width="64" height="8" rx="3" fill="#e6b980" stroke="#a2764c" stroke-width="3"/>`;
const box = (open: boolean) => `<path d="M26 50 L36 40 H84 L74 50 Z" fill="${open ? '#7a5236' : '#f0cf9f'}" stroke="#c18e55" stroke-width="3" stroke-linejoin="round"/>
  <path d="M74 50 L84 40 V80 L74 90 Z" fill="#d9a86e" stroke="#c18e55" stroke-width="3" stroke-linejoin="round"/>`;
const BOX_FRONT = `<rect x="26" y="50" width="48" height="40" fill="#e6b980" stroke="#c18e55" stroke-width="3"/>`;

export function sceneSvg(thing: Thing, spot: Spot): string {
  let inner: string;
  if (thing === 'tafel') {
    const m = { op: mouse(22, 44.5, 36), onder: mouse(23, 90, 34), naast: mouse(67, 90, 33) }[spot as 'op'];
    inner = FLOOR + TABLE + m;
  } else {
    inner = {
      op: FLOOR + box(false) + BOX_FRONT + mouse(34, 46, 40),
      in: FLOOR + box(true) + mouse(32, 58, 40) + BOX_FRONT,
      naast: FLOOR + box(false) + BOX_FRONT + mouse(-6, 90, 34),
      voor: FLOOR + box(false) + BOX_FRONT + mouse(28, 99, 40),
      // Achter: het muisje zit op de grond achter de doos; alleen achterlijf en staart steken uit.
      achter: FLOOR + mouse(64, 84, 40) + box(false) + BOX_FRONT,
    }[spot as 'op'];
  }
  return `<svg viewBox="0 0 100 100">${inner}</svg>`;
}

const spotLine = (thing: Thing, spot: Spot) => `ruimte.${spot}.${thing}` as LineId;
const NAMES: Record<Spot, string> = { op: 'op', onder: 'onder', naast: 'naast', in: 'in', voor: 'voor', achter: 'achter' };

class Round {
  private pics: PictureCards;

  constructor(private ctx: ActivityContext, private item: RuimteItem) {
    this.pics = new PictureCards(ctx, item.options.map((s) => sceneSvg(item.thing, s)));
    this.pics.root.dataset.answer = item.spot; // voor tests
  }

  destroy(): void {
    this.pics.destroy();
  }

  private question(): Seg[] {
    return ['ruimte.vraag', spotLine(this.item.thing, this.item.spot)];
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item, pics } = this;
    const answer = item.options.indexOf(item.spot);
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say([item.thing === 'tafel' ? 'ruimte.uitleg.tafel' : 'ruimte.uitleg.doos']);
    let i = await pics.ask(this.question());
    if (i === answer) return this.celebrate(1);
    const picked = item.options[i];
    const note = `Haalt ${NAMES[item.spot]} en ${NAMES[picked]} nog door elkaar (waar zit het muisje?).`;

    // Ladder 1: Fluffy zegt bij elk plaatje waar het muisje zit.
    ctx.fluffy.set('nadenken');
    await ctx.say(['ruimte.hint']);
    for (let k = 0; k < item.options.length; k++) {
      pics.glow(k);
      await ctx.say(['ruimte.hier', spotLine(item.thing, item.options[k])]);
      await sleep(250);
    }
    pics.glow(null);
    i = await pics.ask(this.question());
    if (i === answer) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy wijst het goede plaatje aan, en dan tikt zij het aan.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.luister']);
    pics.glow(answer);
    await ctx.say(['ruimte.hier', spotLine(item.thing, item.spot)]);
    pics.glow(null);
    i = await pics.ask(['cijfer.tikjij'], answer);
    if (i === answer) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen.kort']);
    } else {
      pics.mark(answer);
      await ctx.say(['ruimte.hier', spotLine(item.thing, item.spot)]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item, pics } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    pics.mark(item.options.indexOf(item.spot));
    await ctx.say(['ruimte.ja', spotLine(item.thing, item.spot), attempt === 2 ? 'lof.doorzetten' : 'lof.ruimte']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

const ICON = `<svg viewBox="0 0 200 160"><svg x="40" y="10" width="140" height="140" viewBox="0 0 100 100">${svgInner(sceneSvg('tafel', 'onder'))}</svg></svg>`;

export const ruimte: Activity<RuimteItem> = {
  id: 'ruimte',
  name: 'Waar zit het muisje?',
  skills: ['ruimte'],
  makeItem: makeRuimteItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.ruimte'],
  icon: ICON,
  choice: ['keuze.ruimte'],
  phrases() {
    const out: Seg[][] = [];
    for (const thing of ['tafel', 'doos'] as Thing[]) {
      for (const spot of SPOTS[thing]) {
        out.push(['ruimte.vraag', spotLine(thing, spot)], ['ruimte.hier', spotLine(thing, spot)], ['ruimte.ja', spotLine(thing, spot)]);
      }
    }
    return out;
  },
};
