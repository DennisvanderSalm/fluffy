import type { Seg } from '../audio/speech';
import type { ActivityContext } from '../domain';
import { el, sleep, svgEl } from '../util';
import { onTap } from './drag';

export interface ChoiceCard {
  icon: string;
  label: Seg[];
}

/**
 * Keuzemoment: twee grote plaatjes, Fluffy noemt ze allebei. Eén tik kiest.
 * Autonomie (zelfdeterminatietheorie): een kleine, echte keuze werkt beter dan een beloning.
 * Meer dan twee opties is voor een kind dat nog niet leest te veel om te onthouden.
 */
export async function askChoice(ctx: ActivityContext, options: ChoiceCard[]): Promise<number> {
  const root = el('div', 'keuze');
  const cards = options.map((o) => {
    const c = el('div', 'k-card');
    c.append(svgEl(o.icon));
    root.append(c);
    return c;
  });
  ctx.stage.append(root);
  ctx.fluffy.still(true);

  let done = false;
  let run = 0;
  const prompt = async () => {
    const me = ++run;
    const stale = () => done || me !== run;
    ctx.fluffy.set('rust');
    await ctx.say(['keuze.vraag']);
    for (let i = 0; i < options.length && !stale(); i++) {
      cards.forEach((c, j) => c.classList.toggle('is-named', j === i));
      await ctx.say(i === 0 ? options[i].label : ['keuze.of', ...options[i].label]);
      await sleep(250);
    }
    if (stale()) return;
    cards.forEach((c) => c.classList.remove('is-named'));
    await ctx.say(['keuze.tik']);
    if (!stale()) ctx.fluffy.set('luisteren');
  };

  const chosen = await new Promise<number>((resolve) => {
    cards.forEach((c, i) => onTap(c, () => resolve(i)));
    ctx.setRepeat(() => void prompt());
    void prompt();
  });

  done = true;
  ctx.setRepeat(null);
  ctx.speechStop();
  cards.forEach((c, i) => {
    c.classList.remove('is-named');
    c.classList.toggle('is-chosen', i === chosen);
    c.classList.toggle('is-other', i !== chosen);
  });
  ctx.fluffy.set('blij');
  await ctx.say(['keuze.goed']);
  await sleep(300);
  root.remove();
  return chosen;
}
