import { onTap } from '../../core/ui/drag';
import { el, svgEl } from '../../core/util';
import { place, POINTER_SVG, type Box } from './veld';

/**
 * Een getallenlijn van 1 tot 10 over de hele breedte: vakjes (Getallenpad) of huisjes
 * (Waar woont…?). Links naar rechts, op één rij: dat lineaire beeld is precies waar het om gaat
 * (Siegler & Ramani, 2008). Elk vakje of huisje is een tikdoel; nummers kunnen verborgen zijn.
 */

export type LijnKind = 'vakjes' | 'huisjes';

const HOUSE_SVG = `<svg viewBox="0 0 100 120"><path d="M8 52 L50 12 L92 52 Z" fill="#f4a690" stroke="#d98670" stroke-width="5" stroke-linejoin="round"/>
  <rect x="16" y="50" width="68" height="64" rx="6" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5"/>
  <rect x="40" y="80" width="20" height="34" rx="4" fill="#a3cdea" stroke="#73a9cf" stroke-width="4"/></svg>`;

export class Lijn {
  readonly root: HTMLElement;
  readonly slots: HTMLElement[] = [];
  private labels: HTMLElement[] = [];
  private pointer: HTMLElement;
  private locked = true;
  onTap: ((n: number) => void) | null = null;

  constructor(
    parent: HTMLElement,
    private stage: HTMLElement,
    private kind: LijnKind,
    /** Welke nummers zichtbaar zijn. */
    visible: (n: number) => boolean,
    private y: (H: number) => number,
  ) {
    this.root = el('div', `lijn is-${kind}`);
    for (let n = 1; n <= 10; n++) {
      const slot = el('div', 'lj-slot');
      if (kind === 'huisjes') slot.append(svgEl(HOUSE_SVG));
      const label = el('div', 'lj-nr', visible(n) ? String(n) : '');
      slot.append(label);
      onTap(slot, () => !this.locked && this.onTap?.(n));
      this.slots.push(slot);
      this.labels.push(label);
      this.root.append(slot);
    }
    this.pointer = el('div', 'v-pointer');
    this.pointer.append(svgEl(POINTER_SVG));
    this.root.append(this.pointer);
    parent.append(this.root);
    this.layout();
    window.addEventListener('resize', this.layout);
  }

  destroy(): void {
    window.removeEventListener('resize', this.layout);
  }

  /** Breedte van één plek op de lijn. */
  slotWidth(): number {
    return (0.94 * this.stage.clientWidth) / 10;
  }

  box(n: number): Box {
    const W = this.stage.clientWidth;
    const H = this.stage.clientHeight;
    const step = this.slotWidth();
    const w = step * (this.kind === 'vakjes' ? 0.9 : 0.94);
    const h = this.kind === 'vakjes' ? w : w * 1.2;
    return { x: 0.03 * W + step * (n - 1) + (step - w) / 2, y: this.y(H) - h / 2, w, h };
  }

  private layout = (): void => {
    this.slots.forEach((s, i) => place(s, this.box(i + 1)));
  };

  lock(on: boolean): void {
    this.locked = on;
    this.root.classList.toggle('is-locked', on);
  }

  showNumber(n: number): void {
    this.labels[n - 1].textContent = String(n);
  }

  mark(n: number, on = true): void {
    this.slots[n - 1].classList.toggle('is-counted', on);
  }

  clearMarks(): void {
    this.slots.forEach((s) => s.classList.remove('is-counted', 'is-picked'));
  }

  picked(n: number): void {
    this.slots[n - 1].classList.add('is-picked');
  }

  pointAt(n: number): void {
    const b = this.box(n);
    const p = Math.min(b.w * 0.8, 80);
    place(this.pointer, { x: b.x + b.w / 2 - p * 0.43, y: b.y + b.h * 0.72, w: p, h: p });
    this.pointer.classList.add('is-on');
  }

  hidePointer(): void {
    this.pointer.classList.remove('is-on');
  }
}
