import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import { el, randInt, sleep, svgEl, type Rng } from '../../core/util';
import { numberOptions } from './tellen';
import { NumberCards } from './veld';

/**
 * SOMMEN MET KRALEN — optellen en aftrekken met cijfers en de tekens + en −.
 * Opgebouwd zoals in onderzoek dat werkt bij kleuters: eerst met materiaal, dan met vingers, dan
 * de som alleen (Jordan e.a., 2012: sommen tot 10 met vingers, blokjes en geschreven sommen;
 * Kullberg e.a., 2019: vingerpatronen en deel-deel-geheel, 5 + 5 is twee hele handen).
 * Montessori-geïnspireerd: kralenstaafjes in de vaste Montessori-kleuren, en ze kan zichzelf altijd
 * controleren door te tellen.
 * Niveaus: met kralen → met handjes → alleen de som (ze mag haar vingers gebruiken).
 * Tot 20 (groep 3): over de tien heen, met het gouden tienstaafje; daar alleen kralen → de som.
 */

export type SomOp = '+' | '-';
export type SomMode = 'kralen' | 'handen' | 'som';

export interface SomItem {
  a: number;
  b: number;
  op: SomOp;
  mode: SomMode;
  options: number[];
}

export const somResult = (it: Pick<SomItem, 'a' | 'b' | 'op'>) => (it.op === '+' ? it.a + it.b : it.a - it.b);

/** Tot 20 zijn handjes te weinig (meer dan tien vingers): daar alleen kralen en de som. */
export const modesFor = (skill: string): SomMode[] => (skill === 'sommen-20' ? ['kralen', 'som'] : ['kralen', 'handen', 'som']);

/** Alle sommen die bij een vaardigheid horen. Uitkomst altijd 1 t/m 10. */
export function somCombos(skill: string): { a: number; b: number; op: SomOp }[] {
  const out: { a: number; b: number; op: SomOp }[] = [];
  const ten = skill === 'sommen-10';
  if (skill === 'sommen-20') {
    // Over de tien heen: 8 + 5, en terug: 13 − 5. Getallen onder de tien erbij of eraf.
    for (let a = 2; a <= 9; a++) for (let b = 2; b <= 9; b++) if (a + b >= 11) out.push({ a, b, op: '+' });
    for (let a = 11; a <= 18; a++) for (let b = 2; b <= 9; b++) if (a - b >= 2 && a - b <= 9) out.push({ a, b, op: '-' });
    return out;
  }
  for (let a = 1; a <= 10; a++) {
    for (let b = 1; b <= 10; b++) {
      // Tot 5: alles binnen vijf. Tot 10: wat boven de vijf uitkomt, en eraf vanaf 6.
      if (ten ? a + b >= 6 && a + b <= 10 : a + b <= 5) out.push({ a, b, op: '+' });
      if (ten ? a >= 6 && b <= 5 && a - b >= 1 : a <= 5 && a - b >= 1) out.push({ a, b, op: '-' });
    }
  }
  return out;
}

let last = '';

export function makeSomItem(skill: string, level: number, rng: Rng): SomItem {
  const combos = somCombos(skill);
  const modes = modesFor(skill);
  const mode = modes[Math.min(level, modes.length - 1)];
  let c = combos[0];
  for (let i = 0; i < 20; i++) {
    // Tot 10: geregeld een dubbele (3 + 3, 5 + 5), die zijn met twee handen goed te zien.
    const doubles = combos.filter((x) => x.op === '+' && x.a === x.b);
    c = skill === 'sommen-10' && rng() < 0.3 ? doubles[randInt(rng, 0, doubles.length - 1)] : combos[randInt(rng, 0, combos.length - 1)];
    if (`${c.a}${c.op}${c.b}` !== last) break;
  }
  last = `${c.a}${c.op}${c.b}`;
  return { ...c, mode, options: numberOptions(somResult(c), skill === 'sommen-20' ? 20 : 10, rng) };
}

/** De Montessori-kleuren van de kralenstaafjes 1 t/m 10. */
export const BEAD_COLORS: readonly [fill: string, edge: string][] = [
  ['#e0574f', '#b63b35'], // 1 rood
  ['#5bb46a', '#3f8a4c'], // 2 groen
  ['#f3a3bf', '#d17797'], // 3 roze
  ['#f5d547', '#cfae22'], // 4 geel
  ['#8fcbe8', '#5ea4c7'], // 5 lichtblauw
  ['#a982cc', '#8160a6'], // 6 paars
  ['#fbfaf4', '#b9b4a6'], // 7 wit
  ['#a0714a', '#7a5333'], // 8 bruin
  ['#30589f', '#20407a'], // 9 donkerblauw
  ['#c8901c', '#8a5f0c'], // 10 goud (donkerder dan het geel van 4, zodat het tienstaafje opvalt)
];

/** Een kralenstaafje van n kralen, in de kleur van n (10 = het gouden tienstaafje). */
export function beadBar(n: number): SVGSVGElement {
  const [fill, edge] = BEAD_COLORS[n - 1];
  const w = n * 22 + 6;
  const beads = Array.from({ length: n }, (_, i) =>
    `<circle class="som-kraal" cx="${14 + i * 22}" cy="16" r="10" fill="${fill}" stroke="${edge}" stroke-width="3"/>`).join('');
  return svgEl(`<svg class="som-staaf" viewBox="0 0 ${w} 32"><path d="M2 16 H${w - 2}" stroke="#9a8f7a" stroke-width="3"/>${beads}</svg>`);
}

/** Een hand met `up` vingers omhoog; de laatste `gone` daarvan zijn weggedaan (min). */
function hand(up: number, gone = 0): SVGSVGElement {
  const fingers = [
    { x: 18, y: 50, w: 13, h: 34, r: -38 }, // duim
    { x: 33, y: 8, w: 13, h: 50, r: -6 },
    { x: 48, y: 4, w: 13, h: 54, r: 0 },
    { x: 63, y: 8, w: 13, h: 50, r: 5 },
    { x: 77, y: 18, w: 12, h: 42, r: 11 },
  ];
  const parts = fingers.map((f, i) => {
    const raised = i < up;
    const away = raised && i >= up - gone;
    const h = raised ? f.h : 16;
    const y = raised ? f.y : f.y + f.h - 16 + 4;
    const cls = away ? 'som-vinger is-weg' : raised ? 'som-vinger' : 'som-vinger is-dicht';
    return `<rect class="${cls}" x="${f.x}" y="${y}" width="${f.w}" height="${h}" rx="6.5" transform="rotate(${f.r} ${f.x + f.w / 2} ${f.y + f.h})"/>`;
  }).join('');
  return svgEl(`<svg class="som-hand" viewBox="0 0 100 116">${parts}<rect class="som-palm" x="24" y="54" width="62" height="56" rx="20"/></svg>`);
}

/** Een getal als handen: tot vijf één hand, daarboven een hele hand en nog wat. */
function hands(n: number, gone = 0): HTMLElement {
  const box = el('div', 'som-handen');
  const first = Math.min(n, 5);
  const second = n - first;
  // Weggedaan worden de laatste vingers: eerst van de tweede hand, dan van de eerste.
  const goneSecond = Math.min(gone, second);
  box.append(hand(first, gone - goneSecond));
  if (second > 0) box.append(hand(second, goneSecond));
  return box;
}

const sign = (t: string) => el('div', 'som-teken', t);

class Round {
  private root: HTMLElement;
  private material: HTMLElement;
  private cards: NumberCards;

  constructor(private ctx: ActivityContext, private item: SomItem) {
    this.root = el('div', 'som');
    this.root.dataset.answer = String(somResult(item)); // voor tests
    const text = el('div', 'som-tekst');
    text.append(
      el('span', '', String(item.a)), el('span', 'som-op', item.op === '+' ? '+' : '−'),
      el('span', '', String(item.b)), el('span', 'som-op', '='), el('span', 'som-vraag', '?'),
    );
    this.material = el('div', 'som-materiaal');
    this.root.append(text, this.material);
    ctx.stage.append(this.root);
    this.cards = new NumberCards(this.root, ctx.stage, item.options);
  }

  destroy(): void {
    this.cards.destroy();
    this.root.remove();
  }

  /** Kralen: bij plus twee staafjes, bij min één staafje waarvan de laatste kralen weg zijn. */
  private showBeads(): SVGCircleElement[] {
    const { a, b, op } = this.item;
    this.material.replaceChildren();
    if (op === '+') {
      this.material.append(beadBar(a), sign('+'), beadBar(b));
    } else {
      // Boven de tien: het gouden tienstaafje en wat erbij hoort. De laatste kralen gaan eraf.
      const bars = a > 10 ? [beadBar(10), beadBar(a - 10)] : [beadBar(a)];
      this.material.append(...bars);
      const all = bars.flatMap((bar) => [...bar.querySelectorAll('.som-kraal')]);
      all.slice(a - b).forEach((k) => k.classList.add('is-weg'));
    }
    return [...this.material.querySelectorAll<SVGCircleElement>('.som-kraal:not(.is-weg)')];
  }

  private showHands(): void {
    const { a, b, op } = this.item;
    this.material.replaceChildren();
    if (op === '+') this.material.append(hands(a), sign('+'), hands(b));
    else this.material.append(hands(a, b));
  }

  private question(): Seg[] {
    const { a, b, op } = this.item;
    return ['som.hoeveel', a, op === '+' ? 'som.plus' : 'som.min', b];
  }

  /** "Drie plus twee is vijf." */
  private sum(): Seg[] {
    const { a, b, op } = this.item;
    return [a, op === '+' ? 'som.plus' : 'som.min', b, 'som.is', somResult(this.item)];
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx, item } = this;
    const result = somResult(item);
    ctx.fluffy.still(true);
    await sleep(300);
    if (ctx.beginner) await ctx.say([item.op === '+' ? 'som.uitleg.plus' : 'som.uitleg.min']);
    if (item.mode === 'kralen') this.showBeads();
    if (item.mode === 'handen') {
      this.showHands();
      if (ctx.beginner) await ctx.say(['som.handen']);
    }
    if (item.mode === 'som' && ctx.beginner) await ctx.say(['som.vingers']);
    let v = await this.cards.ask(ctx, this.question());
    if (v === result) return this.celebrate(1);
    const note = v === item.a
      ? 'Noemt bij sommen soms het eerste getal: wat plus en min doen, is nog nieuw.'
      : item.op === '-' && v === item.a + item.b
        ? 'Telt bij min-sommen soms erbij in plaats van eraf.'
        : undefined;

    // Ladder 1: zelf natellen (kralen), of het met de vingers doen (handjes).
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    if (item.mode === 'kralen' || item.a > 10 || somResult(item) > 10) {
      this.showBeads();
      await ctx.say([item.op === '+' ? 'som.hint.plus' : 'som.hint.min']);
    } else {
      this.showHands();
      await ctx.say(['som.hint.vingers']);
    }
    v = await this.cards.ask(ctx, this.question());
    if (v === result) return { ...(await this.celebrate(2)), note };

    // Ladder 2: Fluffy laat de kralen zien en telt wat er is.
    ctx.fluffy.set('nadenken');
    this.cards.show(false);
    await ctx.say(['voordoen.start']);
    const beads = this.showBeads();
    await sleep(600);
    const beat = ctx.countBeat();
    for (const [k, bead] of beads.entries()) {
      bead.classList.add('is-counted');
      await beat();
      await ctx.say([k + 1]);
    }
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

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    this.cards.mark(somResult(item));
    this.root.querySelector('.som-vraag')!.textContent = String(somResult(item));
    await sleep(400);
    await ctx.say([...this.sum(), attempt === 2 ? 'lof.doorzetten' : 'lof.som']);
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: twee kralenstaafjes met een plus ertussen. */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M14 60 H86 M114 60 H186" stroke="#9a8f7a" stroke-width="4"/>
  ${[0, 1, 2].map((i) => `<circle cx="${28 + i * 22}" cy="60" r="10" fill="${BEAD_COLORS[2][0]}" stroke="${BEAD_COLORS[2][1]}" stroke-width="3"/>`).join('')}
  ${[0, 1].map((i) => `<circle cx="${139 + i * 22}" cy="60" r="10" fill="${BEAD_COLORS[1][0]}" stroke="${BEAD_COLORS[1][1]}" stroke-width="3"/>`).join('')}
  <path d="M100 48 V72 M88 60 H112" stroke="#3b4a6b" stroke-width="6" stroke-linecap="round"/>
  <text x="100" y="134" text-anchor="middle" font-size="40" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">3 + 2</text>
</svg>`;

export const sommen: Activity<SomItem> = {
  id: 'sommen',
  name: 'Sommen met kralen',
  skills: ['sommen-5', 'sommen-10', 'sommen-20'],
  makeItem: makeSomItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.som'],
  icon: ICON,
  choice: ['keuze.som'],
  phrases() {
    const out: Seg[][] = [];
    for (const skill of ['sommen-5', 'sommen-10', 'sommen-20']) {
      for (const { a, b, op } of somCombos(skill)) {
        const word = op === '+' ? 'som.plus' : 'som.min';
        out.push(['som.hoeveel', a, word, b], [a, word, b, 'som.is', somResult({ a, b, op })]);
      }
    }
    for (let n = 11; n <= 20; n++) out.push(['tellen.tik.a', n, 'tellen.tik.b'], ['tellen.dushet', n]);
    return out;
  },
};
