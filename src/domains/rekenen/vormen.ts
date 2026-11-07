import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { pick, randInt, shuffle, sleep, type Rng } from '../../core/util';
import { PictureCards } from './kaartjes';

/**
 * VORMEN ZOEKEN — rondje, vierkant, driehoek, rechthoek. Kleuters leren vormen vaak alleen in
 * de "standaardhouding" (driehoek met de punt omhoog). Daarom draaien en rekken de vormen op
 * hogere niveaus, en komen er bijna-vormen bij: een ovaal is geen rondje, een langwerpig blok
 * geen vierkant (Clements e.a., 1999). Fluffy benoemt waar je het aan ziet: kanten en punten.
 * Niveaus: twee gewone vormen → drie, ook de rechthoek, iets gedraaid → gedraaide of gerekte
 * vorm, met een bijna-vorm ernaast.
 */

export type Shape = 'rondje' | 'vierkant' | 'driehoek' | 'rechthoek';
/** Bijna-vormen: lijken op een vorm, maar zijn het niet. */
export type NearMiss = 'ovaal' | 'blok' | 'bolle-driehoek' | 'scheef';
export type Figure = Shape | NearMiss;

const NEAR: Record<Shape, NearMiss> = { rondje: 'ovaal', vierkant: 'blok', driehoek: 'bolle-driehoek', rechthoek: 'scheef' };
const NEAR_NAME: Record<NearMiss, string> = {
  ovaal: 'een ovaal', blok: 'een rechthoek', 'bolle-driehoek': 'een vorm met een bolle kant', scheef: 'een scheve vorm',
};

export interface VormFigure {
  kind: Figure;
  /** Draaiing in graden. */
  turn: number;
  /** Rekken: 1 = gewoon. */
  stretch: number;
  color: number;
}

export interface VormItem {
  target: Shape;
  figures: VormFigure[];
}

const BASIC: Shape[] = ['rondje', 'vierkant', 'driehoek'];
const ALL: Shape[] = [...BASIC, 'rechthoek'];

let last: Shape | null = null;

export function makeVormItem(_skill: string, level: number, rng: Rng): VormItem {
  const pool = level <= 0 ? BASIC : ALL;
  let target = pick(rng, pool);
  for (let i = 0; i < 5 && target === last; i++) target = pick(rng, pool);
  last = target;
  const colors = shuffle(rng, [0, 1, 2, 3, 4]);
  const plain = (kind: Figure, k: number, wobble: boolean): VormFigure => ({
    kind,
    turn: wobble ? randInt(rng, -25, 25) : 0,
    stretch: 1,
    color: colors[k],
  });
  let figures: VormFigure[];
  if (level <= 0) {
    const other = pick(rng, BASIC.filter((s) => s !== target));
    figures = [plain(target, 0, false), plain(other, 1, false)];
  } else if (level === 1) {
    const others = shuffle(rng, ALL.filter((s) => s !== target && !(target === 'vierkant' && s === 'rechthoek') && !(target === 'rechthoek' && s === 'vierkant'))).slice(0, 2);
    figures = [plain(target, 0, true), ...others.map((s, k) => plain(s, k + 1, true))];
  } else {
    // De vorm staat schuin of is gerekt; ernaast een bijna-vorm en nog een andere vorm.
    const odd: VormFigure = { ...plain(target, 0, false), turn: pick(rng, [25, 40, 160, 200, -35]), stretch: target === 'rondje' || target === 'vierkant' ? 1 : pick(rng, [0.65, 1.4]) };
    const close = (s: Shape) => (target === 'vierkant' && s === 'rechthoek') || (target === 'rechthoek' && s === 'vierkant');
    const other = pick(rng, ALL.filter((s) => s !== target && !close(s)));
    figures = [odd, plain(NEAR[target], 1, true), plain(other, 2, true)];
  }
  return { target, figures: shuffle(rng, figures) };
}

const COLORS: [string, string][] = [
  ['#f19a8c', '#d27769'], ['#8dbbe6', '#5a8fc4'], ['#f8de7e', '#ddbb52'], ['#a5cf93', '#7fae6c'], ['#c9b8e8', '#9e88c9'],
];

export function figureSvg(f: VormFigure): string {
  const [fill, edge] = COLORS[f.color];
  const a = `fill="${fill}" stroke="${edge}" stroke-width="5" stroke-linejoin="round"`;
  const sx = f.stretch >= 1 ? 1 : f.stretch;
  const sy = f.stretch >= 1 ? 1 / f.stretch : 1;
  const shape = {
    rondje: `<circle cx="50" cy="50" r="34" ${a}/>`,
    ovaal: `<ellipse cx="50" cy="50" rx="40" ry="24" ${a}/>`,
    vierkant: `<rect x="20" y="20" width="60" height="60" ${a}/>`,
    blok: `<rect x="24" y="12" width="52" height="76" ${a}/>`,
    rechthoek: `<rect x="10" y="28" width="80" height="44" ${a}/>`,
    scheef: `<path d="M24 28 H90 L76 72 H10 Z" ${a}/>`,
    driehoek: `<path d="M50 14 L88 80 H12 Z" ${a}/>`,
    'bolle-driehoek': `<path d="M50 14 L88 80 Q50 58 12 80 Z" ${a}/>`,
  }[f.kind];
  return `<svg viewBox="0 0 100 100"><g transform="rotate(${f.turn} 50 50) translate(50 50) scale(${sx} ${sy}) translate(-50 -50)">${shape}</g></svg>`;
}

const shapeLine = (s: Shape) => `vorm.${s}` as LineId;
const traitLine = (s: Shape) => `vorm.kenmerk.${s}` as LineId;

class Round {
  private pics: PictureCards;
  private answer: number;

  constructor(private ctx: ActivityContext, private item: VormItem) {
    this.pics = new PictureCards(ctx, item.figures.map(figureSvg));
    this.answer = item.figures.findIndex((f) => f.kind === item.target);
    this.pics.root.dataset.answer = String(this.answer); // voor tests
  }

  destroy(): void {
    this.pics.destroy();
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item, pics, answer } = this;
    const question: Seg[] = ['vorm.vraag', shapeLine(item.target)];
    ctx.fluffy.still(true);
    await sleep(300);
    ctx.fluffy.set('rust');
    if (ctx.beginner) await ctx.say(['vorm.uitleg']);
    let i = await pics.ask(question);
    if (i === answer) return this.celebrate(1);
    const picked = item.figures[i].kind;
    const note = picked in NEAR_NAME
      ? `Ziet ${NEAR_NAME[picked as NearMiss]} nog aan voor een ${item.target}.`
      : item.figures[answer].turn !== 0 || item.figures[answer].stretch !== 1
        ? `Herkent een ${item.target} nog niet goed als hij schuin staat of uitgerekt is.`
        : `Haalt ${item.target} en ${picked} nog door elkaar.`;

    // Ladder 1: waar zie je het aan?
    ctx.fluffy.set('nadenken');
    await ctx.say([traitLine(item.target)]);
    i = await pics.ask(question);
    if (i === answer) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy wijst hem aan en zegt waarom.
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.luister']);
    pics.glow(answer);
    await ctx.say(['vorm.dit', shapeLine(item.target)]);
    await ctx.say([traitLine(item.target)]);
    pics.glow(null);
    i = await pics.ask(['cijfer.tikjij'], answer);
    if (i === answer) {
      ctx.fluffy.set('blij');
      await ctx.say(['lof.samen.kort']);
    } else {
      pics.mark(answer);
      await ctx.say(['vorm.dit', shapeLine(item.target)]);
    }
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true, note };
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item, pics } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    pics.mark(this.answer);
    await ctx.say(['vorm.ja', shapeLine(item.target)]);
    await ctx.say([attempt === 2 ? 'lof.doorzetten' : 'lof.vorm']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

const ICON = `<svg viewBox="0 0 200 160">
  <circle cx="46" cy="62" r="30" fill="#f19a8c" stroke="#d27769" stroke-width="5"/>
  <rect x="104" y="30" width="58" height="58" fill="#8dbbe6" stroke="#5a8fc4" stroke-width="5" stroke-linejoin="round"/>
  <path d="M100 150 L132 96 L164 150 Z" fill="#f8de7e" stroke="#ddbb52" stroke-width="5" stroke-linejoin="round"/>
</svg>`;

export const vormen: Activity<VormItem> = {
  id: 'vormen',
  name: 'Vormen zoeken',
  skills: ['vormen'],
  makeItem: makeVormItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.vormen'],
  icon: ICON,
  choice: ['keuze.vormen'],
  phrases: () => ALL.flatMap((s): Seg[][] => [['vorm.vraag', shapeLine(s)], ['vorm.dit', shapeLine(s)], ['vorm.ja', shapeLine(s)]]),
};
