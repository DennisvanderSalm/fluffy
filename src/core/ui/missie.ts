import type { LineId } from '../../content/spraak.nl';
import type { ActivityContext } from '../domain';
import { el, sleep, svgEl } from '../util';
import { onTap } from './drag';
import { MOMENT_SVG, type Moment } from './moments';
import { THUMB } from './samen';

/**
 * Opdracht voor de rest van de dag. Aan het eind van een sessie geeft Fluffy één opdracht die
 * past bij wat ze net deed, bij een gewoon moment van de dag ("Als je de trap op gaat: tel de
 * treden"). Een plaatje helpt onthouden; de volgende keer vraagt Fluffy ernaar. Niet gedaan is
 * ook goed: er valt niets te winnen of te verliezen. Rekenen en lezen in dagelijkse momenten,
 * samen met een ouder, helpt aantoonbaar (Berkowitz e.a., 2015).
 */

/** Kaartje met het plaatje van het moment. Met `onPress` kan ze erop tikken. */
export function missionCard(moment: Moment, onPress?: () => void): HTMLElement {
  const card = el('div', 'missie-kaart');
  card.append(svgEl(MOMENT_SVG[moment]));
  if (onPress) {
    card.classList.add('is-tappable');
    // Niet doorgeven aan het scherm eronder: dat zou Fluffy wakker maken.
    card.addEventListener('pointerup', (e) => e.stopPropagation());
    onTap(card, onPress);
  }
  return card;
}

/** De volgende keer: weet je nog wat je opdracht was? Ze vertelt het, en tikt op het duimpje. */
export async function missionCheck(ctx: ActivityContext, line: LineId, moment: Moment): Promise<void> {
  const root = el('div', 'missie');
  const thumb = el('div', 'm-duim echt-duim');
  thumb.append(svgEl(THUMB));
  root.append(missionCard(moment), thumb);
  ctx.stage.append(root);
  ctx.fluffy.still(true);

  let run = 0;
  let done = false;
  // Het duimpje doet pas iets als ze de vraag één keer helemaal gehoord heeft.
  let ready = false;
  const prompt = async () => {
    const me = ++run;
    const stale = () => done || me !== run;
    ctx.fluffy.set('blij');
    await ctx.say(['missie.terug.a']);
    if (!stale()) await ctx.say([line]);
    if (!stale()) await ctx.say(['missie.terug.b']);
    if (!stale()) ctx.fluffy.set('luisteren');
    if (!stale() || ready) {
      ready = true;
      thumb.classList.add('is-ready');
    }
  };
  await new Promise<void>((resolve) => {
    onTap(thumb, () => ready && resolve());
    ctx.setRepeat(() => void prompt());
    void prompt();
  });
  done = true;
  ctx.setRepeat(null);
  ctx.speechStop();
  thumb.classList.add('is-picked');
  ctx.fluffy.set('blij');
  ctx.sounds.chime();
  await ctx.say(['missie.terug.c']);
  await sleep(300);
  root.remove();
}
