import type { Activity, DomainModule, ItemResult } from '../domain';
import { recordAttempt } from '../engine/mastery';
import {
  choiceOptions, isChoiceMoment, isStruggling, pickNext, scheduleRetry,
  type PlannerInput, type PlayedRef, type RetryEntry,
} from '../engine/planner';
import { easyWin, pickRealTask, togetherDue, warmUpSkill } from '../session/flow';
import type { SessionClock, SessionRecord } from '../session/session';
import { save } from '../storage/store';
import { isoDate, pick, shuffle, sleep } from '../util';
import { askChoice } from './choice';
import type { Host } from './host';
import { realTask } from './samen';

/** Eén item dat gespeeld gaat worden. */
interface Plan {
  skill: string;
  activity: Activity<unknown>;
  params: unknown;
  retry: boolean;
  /** Niveau waarop het item gemaakt is. */
  level: number;
  /** Telt het mee voor de voortgang? (Niet bij een makkelijker succesje na een lastig stukje.) */
  record: boolean;
}

/**
 * De items van één sessie: de planner kiest wat er komt, de activiteit speelt het, en hier wordt
 * bijgehouden wat er gebeurde (voortgang, terugkomen, wat opviel, de sessie).
 */
export class Player {
  private played: PlayedRef[] = [];
  private retries: RetryEntry[] = [];
  private recent: ItemResult[] = [];
  /** Het vorige item van deze sessie: blijft het hetzelfde soort opdracht, of begint er een nieuwe reeks? */
  private lastItem: { skill: string; activity: string } | null = null;

  constructor(private host: Host, private domain: DomainModule, private clock: SessionClock, private record: SessionRecord) {}

  private plannerInput(domain: DomainModule, played: PlayedRef[], retries: RetryEntry[], today: string): PlannerInput {
    const { progress, data } = this.host;
    return { skills: domain.skills, playable: progress.playable, states: data.skills, today, played, retries };
  }

  /**
   * Opwarmer: één herhaling uit het andere vak, als daar iets aan de beurt is. Zo blijft wat ze al
   * kan ook terugkomen als ze een tijdje alleen het ene vak kiest (gespreid herhalen).
   * Niet als de ouder het vak heeft vastgezet.
   */
  async warmUp(): Promise<void> {
    const { data, domains, progress } = this.host;
    const today = isoDate(Date.now());
    const skill = warmUpSkill(data.settings.subject, domains, this.domain, (d) => this.plannerInput(d, [], [], today));
    if (skill) await this.playItem(this.planFor(skill, progress.stateOf(skill).level, true));
  }

  /** Speelt het volgende item. False als er niets meer te spelen valt. */
  async playOne(): Promise<boolean> {
    const { played, retries, recent } = this;
    const input = this.plannerInput(this.domain, played, retries, isoDate(Date.now()));
    // Liep het net een paar keer stroef? Dan eerst iets wat ze al kan.
    const easy = isStruggling(recent) ? easyWin(input, played[played.length - 1]?.skill) : null;
    let plan = easy && this.planFor(easy.skill, easy.level, easy.record);
    if (plan) recent.length = 0;
    plan ??= await this.planNext(input);
    if (!plan) return false;
    recent.push(await this.playItem(plan));
    await this.maybeTogether(plan.skill, played.length);
    this.host.fluffy.set('rust');
    await sleep(700);
    return true;
  }

  /** Een nieuw item voor deze vaardigheid op dit niveau, met een passende activiteit. */
  private planFor(skill: string, level: number, record: boolean): Plan {
    const { progress, rng } = this.host;
    const activity = pick(rng, progress.activitiesFor(skill));
    return { skill, activity, params: activity.makeItem(skill, level, rng), retry: false, level, record };
  }

  /** Wat de planner kiest: een item dat terugkomt, of iets nieuws (soms mag ze kiezen). */
  private async planNext(input: PlannerInput): Promise<Plan | null> {
    const { progress, rng } = this.host;
    const choice = pickNext(input);
    if (!choice) return null;

    if (choice.kind === 'retry') {
      const { entry } = choice;
      this.retries.splice(this.retries.indexOf(entry), 1);
      return {
        skill: entry.skill, activity: progress.activity(entry.activity), params: entry.params,
        retry: true, level: entry.level, record: true,
      };
    }

    let skill = choice.skill;
    // Binnen een reeks hetzelfde spelletje houden; bij een nieuwe reeks mag het een ander zijn.
    const same = this.lastItem?.skill === skill
      ? progress.activitiesFor(skill).find((a) => a.id === this.lastItem!.activity)
      : undefined;
    let activity = same ?? pick(rng, progress.activitiesFor(skill));
    // Keuzemoment (tussen twee reeksen): ze kiest zelf uit twee activiteiten die allebei in het plan passen.
    const options = isChoiceMoment(input)
      ? choiceOptions(input, (s) => shuffle(rng, progress.activitiesFor(s)).map((a) => a.id))
      : [];
    if (options.length === 2) {
      const order = shuffle(rng, options);
      const i = await askChoice(this.host.context(null), order.map((o) => ({
        icon: progress.activity(o.activity).icon,
        label: progress.activity(o.activity).choice,
      })));
      await this.host.whenResumed();
      skill = order[i].skill;
      activity = progress.activity(order[i].activity);
    }
    progress.maybeProbe(skill);
    const level = progress.stateOf(skill).level;
    return { skill, activity, params: activity.makeItem(skill, level, rng), retry: false, level, record: true };
  }

  /** Speelt één item en houdt alles bij: voortgang, terugkomen, wat opviel, de sessie. */
  private async playItem(p: Plan): Promise<ItemResult> {
    const { data, progress } = this.host;
    const { played, retries } = this;
    const today = isoDate(Date.now());
    const before = progress.stateOf(p.skill);
    const newRun = this.lastItem?.skill !== p.skill || this.lastItem?.activity !== p.activity.id;
    this.lastItem = { skill: p.skill, activity: p.activity.id };
    const result = await p.activity.run(this.host.context(p.activity.id, newRun), p.params, p.retry);
    await this.host.whenResumed();
    data.seen[p.activity.id] = (data.seen[p.activity.id] ?? 0) + 1;

    if (p.record) {
      data.skills[p.skill] = recordAttempt(progress.byId.get(p.skill)!, before, {
        credit: result.credit,
        session: this.record.id,
        today,
      });
    }
    played.push({ skill: p.skill, review: before.status === 'mastered' });
    if (result.modeled && !p.retry) {
      retries.push(scheduleRetry({ skill: p.skill, activity: p.activity.id, level: p.level, params: p.params }, played.length));
    }
    if (result.note) data.notes.push({ skill: p.skill, text: result.note, date: today });

    const r = this.record;
    r.items++;
    if (result.credit === 1) r.firstTry++;
    else r.helped++;
    if (!r.activities.includes(p.activity.id)) r.activities.push(p.activity.id);
    if (!r.skills.includes(p.skill)) r.skills.push(p.skill);
    r.activeMs = this.clock.elapsed();
    save(data);
    return result;
  }

  /**
   * Samen-moment: een opdracht in het echt die past bij wat ze net deed. Bij 'echt' één keer per
   * sessie, bij 'samen' om de vier items. De speelklok staat zolang stil: het is geen schermtijd.
   */
  private async maybeTogether(skill: string, count: number): Promise<void> {
    const { data, progress, rng } = this.host;
    const due = togetherDue(data.settings.together, count);
    const tasks = progress.byId.get(skill)?.realTasks;
    if (!due || !tasks?.length || this.clock.isTimeUp()) return;
    this.host.fluffy.set('rust');
    await sleep(500);
    this.clock.pause();
    const task = pickRealTask(tasks, data.seen, rng);
    data.seen[task] = (data.seen[task] ?? 0) + 1;
    await realTask(this.host.context(null), task, this.host.grownUp());
    await this.host.whenResumed();
    if (!this.host.isPaused()) this.clock.start();
  }
}
