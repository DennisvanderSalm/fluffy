import { svgEl } from '../util';

export type FluffyState = 'rust' | 'luisteren' | 'nadenken' | 'blij' | 'oeps' | 'slaperig';

/** Wolkvormig lijf: een vereniging van cirkels (eerst de rand, dan de vulling eroverheen). */
const PUFFS: [number, number, number][] = [
  [100, 112, 60], [60, 96, 34], [100, 72, 38], [140, 96, 34],
  [52, 132, 30], [148, 132, 30], [78, 152, 30], [122, 152, 30],
];
const circles = (grow: number, cls: string) =>
  PUFFS.map(([x, y, r]) => `<circle class="${cls}" cx="${x}" cy="${y}" r="${r + grow}"/>`).join('');

const MARKUP = `
<svg class="fluffy" viewBox="0 0 200 200" role="img" aria-label="Fluffy">
  <g class="f-body">
    <g class="f-arm f-arm-l"><circle cx="34" cy="146" r="16" class="f-edge"/><circle cx="34" cy="146" r="13" class="f-fill"/></g>
    <g class="f-arm f-arm-r"><circle cx="166" cy="146" r="16" class="f-edge"/><circle cx="166" cy="146" r="13" class="f-fill"/></g>
    ${circles(3, 'f-edge')}
    ${circles(0, 'f-fill')}
    <ellipse cx="80" cy="74" rx="18" ry="9" class="f-shine" transform="rotate(-20 80 74)"/>
    <ellipse cx="70" cy="128" rx="10" ry="6" class="f-cheek"/>
    <ellipse cx="130" cy="128" rx="10" ry="6" class="f-cheek"/>
    <g class="f-eyes f-eyes-open">
      <g class="f-pupils">
        <ellipse cx="82" cy="108" rx="8" ry="10" class="f-ink"/>
        <ellipse cx="118" cy="108" rx="8" ry="10" class="f-ink"/>
        <circle cx="85" cy="104" r="3" class="f-spark"/>
        <circle cx="121" cy="104" r="3" class="f-spark"/>
      </g>
    </g>
    <g class="f-eyes f-eyes-happy">
      <path d="M73 110 Q82 98 91 110" class="f-line"/>
      <path d="M109 110 Q118 98 127 110" class="f-line"/>
    </g>
    <g class="f-eyes f-eyes-closed">
      <path d="M73 106 Q82 115 91 106" class="f-line"/>
      <path d="M109 106 Q118 115 127 106" class="f-line"/>
    </g>
    <g class="f-mouth">
      <path d="M90 130 Q100 139 110 130" class="f-line f-smile"/>
      <path d="M86 129 Q100 146 114 129" class="f-line f-bigsmile"/>
      <path d="M92 134 L108 133" class="f-line f-flat"/>
      <ellipse cx="100" cy="135" rx="5" ry="6" class="f-o"/>
      <ellipse cx="100" cy="134" rx="8" ry="0" class="f-talk"/>
    </g>
  </g>
  <g class="f-zzz">
    <text x="150" y="58">z</text><text x="164" y="40">z</text><text x="176" y="24">z</text>
  </g>
</svg>`;

/**
 * Fluffy: maatje en voordoener. Standen via data-state; de mond beweegt tijdens het praten.
 * Tijdens een opdracht staat Fluffy stil (geen afleidende animaties, Mayer).
 */
export class Fluffy {
  readonly el: SVGSVGElement;
  private talkEl: SVGEllipseElement;
  private talking = false;
  private raf = 0;

  constructor() {
    this.el = svgEl(MARKUP);
    this.talkEl = this.el.querySelector('.f-talk')!;
    this.set('rust');
  }

  set(state: FluffyState): void {
    this.el.dataset.state = state;
  }

  get state(): FluffyState {
    return this.el.dataset.state as FluffyState;
  }

  /** Stil = geen ademhaling (tijdens opdrachten). */
  still(on: boolean): void {
    this.el.classList.toggle('is-still', on);
  }

  /** Eén korte, kleine sprong (bij "blij"). */
  hop(): void {
    this.el.classList.remove('is-hop');
    void this.el.getBoundingClientRect();
    this.el.classList.add('is-hop');
  }

  setTalking(on: boolean): void {
    if (on === this.talking) return;
    this.talking = on;
    this.el.classList.toggle('is-talking', on);
    cancelAnimationFrame(this.raf);
    if (!on) {
      this.talkEl.setAttribute('ry', '0');
      return;
    }
    const start = performance.now();
    const tick = (t: number) => {
      // Onregelmatig open en dicht, zodat het op praten lijkt.
      const s = (t - start) / 1000;
      const open = Math.max(0, Math.sin(s * 11) * 0.6 + Math.sin(s * 17 + 1) * 0.4);
      this.talkEl.setAttribute('ry', (1 + open * 6).toFixed(2));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }
}
