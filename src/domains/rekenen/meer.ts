import type { Activity, ActivityContext, ItemResult } from '../../core/domain';
import type { Seg } from '../../core/audio/speech';
import type { LineId } from '../../content/spraak.nl';
import { onTap } from '../../core/ui/drag';
import { el, pick, randInt, sleep, svgEl, svgInner, type Rng } from '../../core/util';
import { place, POINTER_SVG, THUMB_SVG, type Box } from './veld';

/**
 * KOEKJES VERGELIJKEN — meer, minder, evenveel (leerlijn vergelijken, Clements & Sarama; Mix, 1999).
 * Twee bordjes boven elkaar. "Op welk bordje liggen er meer koekjes?" en later "Maak evenveel".
 * Steun: koekjes krijgen een maatje (één-op-één koppelen). Op het hoogste niveau ligt het kleinste
 * groepje soms wijd uit elkaar, zodat het langer lijkt: dan moet ze echt naar het aantal kijken.
 */

export type MeerKind = 'meer' | 'minder' | 'evenveel';

export interface MeerItem {
  kind: MeerKind;
  top: number;
  bottom: number;
  /** Ligt het kleinste groepje wijd uit elkaar (langere rij, maar minder)? */
  conflict: boolean;
}

/** Hoeveel koekjes er maximaal op een bordje passen. */
export const SLOTS = 7;

export function makeMeerItem(_skill: string, level: number, rng: Rng): MeerItem {
  if (level <= 0) {
    // Groot verschil, kleine aantallen.
    let a = randInt(rng, 1, 5);
    let b = randInt(rng, 1, 5);
    while (Math.abs(a - b) < 2) [a, b] = [randInt(rng, 1, 5), randInt(rng, 1, 5)];
    return { kind: 'meer', top: a, bottom: b, conflict: false };
  }
  if (level === 1 || rng() < 0.5) {
    // Klein verschil; op niveau 2 met een rij die misleidt.
    const a = randInt(rng, 2, 6);
    const d = pick(rng, [1, 2]) * pick(rng, [1, -1]);
    const b = a + d >= 1 && a + d <= 6 ? a + d : a - d;
    return { kind: rng() < 0.4 ? 'minder' : 'meer', top: a, bottom: b, conflict: level >= 2 };
  }
  const top = randInt(rng, 2, 6);
  return { kind: 'evenveel', top, bottom: randInt(rng, 1, top - 1), conflict: false };
}

/** Is het goede bordje het bovenste (0) of het onderste (1)? */
export function rightTray(item: MeerItem): 0 | 1 {
  const topWins = item.kind === 'meer' ? item.top > item.bottom : item.top < item.bottom;
  return topWins ? 0 : 1;
}

const COOKIE_SVG = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="#e6b980" stroke="#c18e55" stroke-width="5"/>
  <circle cx="36" cy="38" r="5" fill="#7a5236"/><circle cx="60" cy="34" r="4.5" fill="#7a5236"/><circle cx="64" cy="58" r="5" fill="#7a5236"/>
  <circle cx="40" cy="64" r="4.5" fill="#7a5236"/><circle cx="50" cy="50" r="3.5" fill="#7a5236"/></svg>`;

const JAR_SVG = `<svg viewBox="0 0 120 120"><rect x="28" y="8" width="64" height="16" rx="6" fill="#d9cdee" stroke="#b3a8d6" stroke-width="4"/>
  <path d="M24 26 H96 C104 26 106 34 106 42 V100 C106 110 100 114 90 114 H30 C20 114 14 110 14 100 V42 C14 34 16 26 24 26 Z" fill="#eef6fb" stroke="#a3cdea" stroke-width="5"/>
  <svg x="22" y="52" width="44" height="44" viewBox="0 0 100 100">${svgInner(COOKIE_SVG)}</svg>
  <svg x="56" y="60" width="44" height="44" viewBox="0 0 100 100">${svgInner(COOKIE_SVG)}</svg>
  <svg x="38" y="34" width="40" height="40" viewBox="0 0 100 100">${svgInner(COOKIE_SVG)}</svg></svg>`;

class Round {
  private root: HTMLElement;
  private trays: [HTMLElement, HTMLElement];
  private rows: [HTMLElement[], HTMLElement[]] = [[], []];
  private jar: HTMLElement | null = null;
  private duim: HTMLElement | null = null;
  private pointer: HTMLElement;
  /** Koekjes onder elkaar als maatjes (na de hint), of zoals ze lagen. */
  private paired = false;
  private locked = true;
  private onTray: ((t: 0 | 1) => void) | null = null;
  private onDuim: (() => void) | null = null;

  constructor(private ctx: ActivityContext, private item: MeerItem) {
    this.root = el('div', 'meer is-locked');
    this.root.dataset.answer = item.kind === 'evenveel' ? String(item.top) : String(rightTray(item)); // voor tests
    this.trays = [el('div', 'mr-bord'), el('div', 'mr-bord')];
    this.trays.forEach((t, i) => {
      onTap(t, () => !this.locked && this.onTray?.(i as 0 | 1));
      this.root.append(t);
    });
    for (let i = 0; i < item.top; i++) this.addCookie(0);
    for (let i = 0; i < item.bottom; i++) this.addCookie(1);
    if (item.kind === 'evenveel') {
      this.jar = el('div', 'mr-pot');
      this.jar.append(svgEl(JAR_SVG));
      onTap(this.jar, () => {
        if (this.locked || this.rows[1].length >= SLOTS) return;
        this.addCookie(1);
        this.ctx.sounds.plop();
        this.layout();
      });
      this.duim = el('div', 'm-duim');
      this.duim.append(svgEl(THUMB_SVG));
      onTap(this.duim, () => !this.locked && this.onDuim?.());
      this.root.append(this.jar, this.duim);
    }
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.pointer);
    ctx.stage.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
    this.root.remove();
  }

  private addCookie(row: 0 | 1): void {
    const c = el('div', 'mr-koek');
    c.append(svgEl(COOKIE_SVG));
    if (row === 1 && this.item.kind === 'evenveel') {
      c.classList.add('is-tap');
      onTap(c, () => {
        if (this.locked) return;
        this.rows[1].splice(this.rows[1].indexOf(c), 1);
        c.remove();
        this.layout();
      });
    }
    this.rows[row].push(c);
    this.root.append(c);
  }

  private trayBox(row: 0 | 1): Box {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    return { x: 0.22 * W, y: (row === 0 ? 0.05 : 0.36) * H, w: 0.75 * W, h: 0.27 * H };
  }

  private size(): number {
    const t = this.trayBox(0);
    return Math.min(t.h * 0.7, (t.w / SLOTS) * 0.9, 120);
  }

  private layout = (): void => {
    const W = this.ctx.stage.clientWidth;
    const H = this.ctx.stage.clientHeight;
    const s = this.size();
    ([0, 1] as const).forEach((row) => {
      const t = this.trayBox(row);
      place(this.trays[row], t);
      const cookies = this.rows[row];
      const n = cookies.length;
      const fewer = this.rows[row].length < this.rows[1 - row].length;
      const slot = t.w / SLOTS;
      cookies.forEach((c, i) => {
        let cx = t.x + slot * (i + 0.5);
        if (this.item.conflict && !this.paired) {
          // Het kleinste groepje wijd uit elkaar, het grootste dicht op elkaar.
          cx = fewer && n > 1 ? t.x + s / 2 + 8 + (i * (t.w - s - 16)) / (n - 1) : t.x + s / 2 + 8 + i * s * 1.02;
        }
        place(c, { x: cx - s / 2, y: t.y + (t.h - s) / 2, w: s, h: s });
      });
    });
    if (this.jar && this.duim) {
      const j = Math.min(0.24 * H, 170);
      place(this.jar, { x: 0.5 * W - j / 2, y: 0.7 * H, w: j, h: j });
      const d = Math.min(124, 0.16 * H);
      place(this.duim, { x: W - d - 0.03 * W, y: H - d - 0.04 * H, w: d, h: d });
    }
  };

  private lock(on: boolean): void {
    this.locked = on;
    this.root.classList.toggle('is-locked', on);
  }

  private pointAt(node: HTMLElement): void {
    const r = node.getBoundingClientRect();
    const st = this.ctx.stage.getBoundingClientRect();
    const p = r.width * 0.8;
    place(this.pointer, { x: r.left - st.left + r.width / 2 - p * 0.43, y: r.top - st.top + r.height * 0.6, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  private question(): Seg[] {
    const { kind } = this.item;
    if (kind === 'evenveel') return this.ctx.beginner ? ['meer.evenveel', 'meer.evenveel.uitleg'] : ['meer.evenveel'];
    const q: LineId = kind === 'meer' ? 'meer.vraag.meer' : 'meer.vraag.minder';
    return this.ctx.beginner ? [q, 'meer.uitleg'] : [q];
  }

  /**
   * Vraag stellen (opnieuw bij een tik op Fluffy) en wachten op een bordje of het duimpje.
   * Met `quiet` begint Fluffy niet meteen te praten (na een hint mag ze direct verder).
   */
  private async answer(segs: Seg[], quiet = false): Promise<0 | 1 | 'duim'> {
    const { ctx } = this;
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(segs);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt());
    this.lock(false);
    const a = await new Promise<0 | 1 | 'duim'>((resolve) => {
      if (this.item.kind === 'evenveel') this.onDuim = () => resolve('duim');
      else this.onTray = (t) => resolve(t);
      if (quiet) ctx.fluffy.set('luisteren');
      else void prompt();
    });
    this.onTray = this.onDuim = null;
    this.lock(true);
    ctx.setRepeat(null);
    ctx.speechStop();
    if (a !== 'duim') {
      this.trays[a].classList.add('is-picked');
      await sleep(400);
      this.trays[a].classList.remove('is-picked');
    }
    return a;
  }

  private isRight(a: 0 | 1 | 'duim'): boolean {
    return a === 'duim' ? this.rows[1].length === this.item.top : a === rightTray(this.item);
  }

  async play(retry: boolean): Promise<ItemResult> {
    const { ctx } = this;
    ctx.fluffy.still(true);
    await sleep(300);
    if (await this.waitAnswer(this.question())) return this.celebrate(1);

    // Ladder 1: maatjes maken, zodat zichtbaar wordt wat er over is.
    await this.pairUp();
    if (await this.waitAnswer(this.question(), this.item.kind === 'evenveel')) return this.celebrate(2);

    // Ladder 2: Fluffy telt beide bordjes en zegt wat meer of minder is.
    await this.model();
    if (!retry) await ctx.say(['later.nog']);
    return { credit: 0, modeled: true };
  }

  private async waitAnswer(segs: Seg[], quiet = false): Promise<boolean> {
    for (;;) {
      const a = await this.answer(segs, quiet);
      // Duimpje bij een leeg bordje: per ongeluk, gewoon nog eens.
      if (a === 'duim' && this.rows[1].length === 0) {
        quiet = false;
        continue;
      }
      return this.isRight(a);
    }
  }

  /** Koekjes onder elkaar leggen als maatjes; wie geen maatje heeft, licht op. */
  private async pairUp(): Promise<void> {
    const { ctx } = this;
    ctx.fluffy.set('nadenken');
    await ctx.say(['meer.maatjes']);
    this.paired = true;
    this.root.classList.add('is-paired');
    this.layout();
    await sleep(900);
    const [top, bottom] = this.rows;
    const extra = top.length > bottom.length ? top.slice(bottom.length) : bottom.slice(top.length);
    extra.forEach((c) => c.classList.add('is-counted'));
    if (this.item.kind === 'evenveel') {
      if (!extra.length) await ctx.say(['meer.allemaatje']);
      else await ctx.say(['meer.geenmaatje', bottom.length < top.length ? 'hint.teweinig' : 'hint.teveel']);
    } else {
      await ctx.say(['meer.geenmaatje']);
    }
    await sleep(300);
  }

  private async countRow(row: 0 | 1): Promise<void> {
    const cookies = this.rows[row];
    const beat = this.ctx.countBeat();
    for (let i = 0; i < cookies.length; i++) {
      this.pointAt(cookies[i]);
      await beat();
      await this.ctx.say([i + 1]);
    }
    this.pointer.classList.remove('is-on');
    await this.ctx.say(['hier.zijn', cookies.length]);
  }

  private async model(): Promise<void> {
    const { ctx, item } = this;
    ctx.fluffy.set('nadenken');
    await ctx.say(['voordoen.start']);
    if (item.kind === 'evenveel') {
      await this.countRow(0);
      // Fluffy maakt het onderste bordje gelijk, met maatjes.
      while (this.rows[1].length > item.top) this.rows[1].pop()!.remove();
      while (this.rows[1].length < item.top) this.addCookie(1);
      this.rows.flat().forEach((c) => c.classList.remove('is-counted'));
      this.layout();
      ctx.sounds.plop();
      await sleep(700);
      await ctx.say(['meer.allemaatje', 'meer.nu', item.top, 'meer.en', item.top, 'meer.evenveelklaar']);
      return;
    }
    await this.countRow(0);
    await this.countRow(1);
    const big = Math.max(item.top, item.bottom);
    const small = Math.min(item.top, item.bottom);
    await ctx.say(item.kind === 'meer' ? [big, 'meer.ismeerdan', small] : [small, 'meer.isminderdan', big]);
    const right = rightTray(item);
    this.trays[right].classList.add('is-counted');
    if ((await this.answer(['meer.tikjij'])) === right) {
      ctx.fluffy.set('blij');
      await ctx.say([item.kind === 'meer' ? 'meer.goed.meer' : 'meer.goed.minder', 'lof.samen']);
    }
  }

  private async celebrate(attempt: 1 | 2): Promise<ItemResult> {
    const { ctx, item } = this;
    ctx.fluffy.set('blij');
    ctx.fluffy.hop();
    ctx.sounds.chime();
    const praise: LineId = attempt === 2 ? 'lof.doorzetten' : item.kind === 'evenveel' ? 'lof.maatjes' : 'lof.vergelijk';
    if (item.kind === 'evenveel') {
      await ctx.say(['meer.nu', item.top, 'meer.en', item.top, 'meer.evenveelklaar', praise]);
    } else {
      this.trays[rightTray(item)].classList.add('is-counted');
      await ctx.say([item.kind === 'meer' ? 'meer.goed.meer' : 'meer.goed.minder', praise]);
    }
    await sleep(400);
    return attempt === 1 ? { credit: 1, modeled: false } : { credit: 0.5, modeled: false };
  }
}

/** Plaatje voor het keuzemoment: twee bordjes, eentje met meer koekjes. */
const cookieAt = (x: number, y: number) => `<svg x="${x}" y="${y}" width="34" height="34" viewBox="0 0 100 100">${svgInner(COOKIE_SVG)}</svg>`;
const ICON = `<svg viewBox="0 0 200 160">
  <rect x="14" y="18" width="172" height="54" rx="22" fill="#f3ebdd" stroke="#e2d4bc" stroke-width="5"/>
  <rect x="14" y="88" width="172" height="54" rx="22" fill="#f3ebdd" stroke="#e2d4bc" stroke-width="5"/>
  ${[0, 1, 2, 3].map((i) => cookieAt(26 + i * 40, 28)).join('')}
  ${[0, 1].map((i) => cookieAt(26 + i * 40, 98)).join('')}
</svg>`;

export const meer: Activity<MeerItem> = {
  id: 'meer',
  name: 'Koekjes vergelijken',
  skills: ['vergelijken'],
  makeItem: makeMeerItem,
  async run(ctx, item, retry) {
    const round = new Round(ctx, item);
    try {
      return await round.play(retry);
    } finally {
      await sleep(300);
      round.destroy();
    }
  },
  summary: ['einde.meer'],
  icon: ICON,
  choice: ['keuze.meer'],
  phrases() {
    const out: Seg[][] = [];
    for (let a = 1; a <= 6; a++) {
      out.push(['meer.nu', a, 'meer.en', a, 'meer.evenveelklaar']);
      for (let b = 1; b < a; b++) out.push([a, 'meer.ismeerdan', b], [b, 'meer.isminderdan', a]);
    }
    for (let n = 1; n <= 10; n++) out.push(['hier.zijn', n]);
    return out;
  },
};
