import type { Seg } from '../../core/audio/speech';
import type { ActivityContext } from '../../core/domain';
import { onTap } from '../../core/ui/drag';
import { el, sleep, svgEl } from '../../core/util';
import { place } from './veld';

/**
 * Twee of drie grote plaatjes naast elkaar; Fluffy stelt een vraag en zij tikt er één aan.
 * Gedeeld door "Waar zit het muisje?" en "Vormen zoeken".
 */
export class PictureCards {
  readonly root: HTMLElement;
  readonly cards: HTMLElement[];
  private answer: ((i: number) => void) | null = null;

  constructor(private ctx: ActivityContext, pictures: string[], className = '') {
    this.root = el('div', `klanken ${className}`.trim());
    this.cards = pictures.map((svg, i) => {
      const c = el('div', 'lz-kaart pc-kaart');
      c.append(svgEl(svg));
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
    const c = Math.min(0.42 * H, 0.23 * W, 300);
    const gap = c * 1.15;
    this.cards.forEach((card, i) => {
      place(card, { x: 0.6 * W + (i - (this.cards.length - 1) / 2) * gap - c / 2, y: 0.2 * H, w: c, h: c });
    });
  };

  glow(i: number | null): void {
    this.cards.forEach((n, j) => n.classList.toggle('is-named', j === i));
  }

  mark(i: number): void {
    this.cards[i].classList.add('is-counted');
  }

  /** Vraag stellen (opnieuw bij een tik op Fluffy) en wachten op een tik. */
  async ask(question: Seg[], highlight?: number): Promise<number> {
    const { ctx } = this;
    this.cards.forEach((c) => c.classList.remove('is-picked', 'is-counted'));
    if (highlight !== undefined) this.mark(highlight);
    this.root.classList.add('is-open');
    const prompt = async () => {
      ctx.fluffy.set('rust');
      await ctx.say(question);
      ctx.fluffy.set('luisteren');
    };
    ctx.setRepeat(() => void prompt());
    const i = await new Promise<number>((resolve) => {
      this.answer = (v) => {
        this.answer = null;
        resolve(v);
      };
      void prompt();
    });
    this.root.classList.remove('is-open');
    ctx.setRepeat(null);
    ctx.speechStop();
    this.glow(null);
    this.cards[i].classList.add('is-picked');
    await sleep(300);
    return i;
  }
}
