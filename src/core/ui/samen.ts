import { SPRAAK, type LineId } from '../../content/spraak.nl';
import type { Seg } from '../audio/speech';
import type { ActivityContext } from '../domain';
import { el, sleep, svgEl } from '../util';
import { onTap } from './drag';

export const THUMB = `<svg viewBox="0 0 100 100"><path d="M24 48 h12 v40 h-12 z M42 48 L54 20 C57 12 69 15 67 26 L63 42 H80 C87 42 90 49 88 56 L82 80 C80 87 75 89 69 89 H42 Z"
  fill="#fff" stroke="#3b4a6b" stroke-width="5" stroke-linejoin="round"/></svg>`;

/** Een groot en een klein handje: samen in het echt. */
const HANDS = `<svg viewBox="0 -14 200 160">
  <path d="M58 138 C40 138 30 124 30 106 V66 C30 58 42 58 42 66 V92 V40 C42 31 55 31 55 40 V86 V30 C55 21 68 21 68 30 V86 V36 C68 27 81 27 81 36 V92 V60 C81 52 93 52 93 60 V106 C93 124 80 138 62 138 Z"
    fill="#f6d2b8" stroke="#d9a98a" stroke-width="5" stroke-linejoin="round"/>
  <path d="M138 140 C124 140 116 130 116 116 V90 C116 84 125 84 125 90 V104 V74 C125 67 135 67 135 74 V100 V68 C135 61 145 61 145 68 V100 V72 C145 65 155 65 155 72 V104 V86 C155 80 164 80 164 86 V116 C164 130 154 140 140 140 Z"
    fill="#f8dcc6" stroke="#d9a98a" stroke-width="5" stroke-linejoin="round"/>
  <path transform="translate(8 -20)" d="M100 30 C92 18 76 24 82 38 C86 46 100 54 100 54 C100 54 114 46 118 38 C124 24 108 18 100 30 Z" fill="#f5b7c8" stroke="#d98aa0" stroke-width="4"/>
</svg>`;

/**
 * Opdracht in het echt: Fluffy vraagt iets te doen buiten het scherm ("Pak eens drie knuffels")
 * en dat samen met papa of mama te doen. Er valt niets te winnen of te verliezen: ze tikt op het
 * duimpje als ze klaar is. Leren met echte dingen en met een ouder erbij blijft beter hangen
 * dan alleen op een scherm (Hirsh-Pasek e.a., 2015).
 */
export async function realTask(ctx: ActivityContext, task: LineId, who: LineId): Promise<void> {
  const root = el('div', 'echt');
  const pic = el('div', 'echt-plaat');
  pic.append(svgEl(HANDS));
  const thumb = el('div', 'm-duim echt-duim');
  thumb.append(svgEl(THUMB));
  root.append(pic, thumb);
  ctx.stage.append(root);
  ctx.fluffy.still(true);

  let run = 0;
  let done = false;
  // Het duimpje doet pas iets als ze de opdracht één keer helemaal gehoord heeft.
  let ready = false;
  const prompt = async (first: boolean) => {
    const me = ++run;
    const stale = () => done || me !== run;
    ctx.fluffy.set('blij');
    if (first) await ctx.say(['echt.start']);
    if (!stale()) await ctx.say([task]);
    if (!stale()) await ctx.say(['echt.samen', who]);
    if (!stale()) await ctx.say(['echt.duim']);
    if (!stale()) ctx.fluffy.set('luisteren');
    if (!stale() || ready) {
      ready = true;
      thumb.classList.add('is-ready');
    }
  };
  await new Promise<void>((resolve) => {
    onTap(thumb, () => ready && resolve());
    ctx.setRepeat(() => void prompt(false));
    void prompt(true);
  });
  done = true;
  ctx.setRepeat(null);
  ctx.speechStop();
  thumb.classList.add('is-picked');
  ctx.fluffy.set('blij');
  ctx.sounds.chime();
  await ctx.say(['echt.goed']);
  await sleep(300);
  root.remove();
}

/** Hoe het kind de ouder kan noemen (zinnetjes 'wie.*'). */
export const GROWN_UPS = (Object.keys(SPRAAK) as LineId[]).filter((id) => id.startsWith('wie.'));

/** Zinnen met "papa of mama" erin, als hele opname. */
export function togetherPhrases(): Seg[][] {
  return GROWN_UPS.flatMap((w): Seg[][] => [['echt.samen', w], ['samen.hoi', w], ['einde.vertel.a', w, 'einde.vertel.b']]);
}
