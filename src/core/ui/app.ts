import type { LineId } from '../../content/spraak.nl';
import type { Activity, ActivityContext, DomainModule, ItemResult } from '../domain';
import { assumeMastered, initialState, manualState, recordAttempt, type ManualLevel } from '../engine/mastery';
import {
  choiceOptions, dueReviews, easyPick, isChoiceMoment, isStruggling, pickNext, scheduleRetry,
  type PlannerInput, type PlayedRef, type RetryEntry,
} from '../engine/planner';
import type { SkillState } from '../engine/types';
import { Fluffy } from '../fluffy/fluffy';
import { Speech, type Seg } from '../audio/speech';
import { Sounds } from '../audio/sounds';
import {
  canStartSession, closeDangling, playUntilTimeUp, SessionClock, type SessionRecord,
} from '../session/session';
import { load, requestPersistence, save, type SaveData } from '../storage/store';
import type { OwnClip } from '../audio/own';
import { el, isoDate, pick, shuffle, sleep, svgEl } from '../util';
import { askChoice } from './choice';
import { onTap } from './drag';
import { openParentArea } from './parent';
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

const HAND_SVG = `<svg viewBox="0 0 100 100"><path d="M38 12 C38 6 48 6 48 12 V46 L52 30 C53 24 62 25 61 31 L60 48 L64 36 C66 30 74 32 72 38 L70 52 L73 44 C75 39 82 41 80 47 L74 74 C71 86 62 94 50 94 C38 94 28 86 26 74 L22 58 C20 52 28 48 31 54 L38 64 Z"
  fill="#fff" stroke="#3b4a6b" stroke-width="4" stroke-linejoin="round"/></svg>`;
const GEAR_SVG = `<svg viewBox="0 0 60 60"><circle class="ring" cx="30" cy="30" r="24"/>
  <path fill="#3b4a6b" d="M30 19a11 11 0 1 0 0 22a11 11 0 1 0 0-22zm0 6a5 5 0 1 1 0 10a5 5 0 1 1 0-10z
  M27 12h6l1 5h-8zM27 48h6l-1-5h-4zM12 27v6l5-1v-4zM48 27v6l-5-1v-4z"/></svg>`;

/**
 * De app: startscherm → begroeting → vak kiezen (rekenen of lezen) → items (planner kiest)
 * → rustig einde → slaapscherm.
 * Zonder menu's: het kind kan nergens anders terechtkomen. Het ouderdeel zit achter een slot.
 */
export class App {
  private data: SaveData;
  private speech = new Speech();
  private sounds = new Sounds();
  private fluffy = new Fluffy();
  private stage = el('div', 'stage');
  private slot = el('div', 'fluffy-slot is-center');
  private gear = el('div', 'gear');
  private gearHint = el('div', 'gear-hint', 'Houd 2 tellen vast voor het ouderdeel');
  private repeatFn: (() => void) | null = null;
  /** Wat een tik op het scherm doet (start- en slaapscherm). */
  private screenTap: (() => void) | null = null;
  private mode: 'start' | 'session' | 'night' = 'start';
  private clock: SessionClock | null = null;
  private record: SessionRecord | null = null;
  private paused = false;
  private resumeWaiters: (() => void)[] = [];
  private lastSleepTalk = 0;
  private rng = Math.random;
  private skillsById: Map<string, DomainModule['skills'][number]>;
  private playable: Set<string>;
  /** Het vak van de lopende sessie. */
  private domain: DomainModule;

  constructor(private root: HTMLElement, private domains: DomainModule[]) {
    this.data = load();
    this.data.sessions = closeDangling(this.data.sessions);
    this.domain = domains[0];
    this.skillsById = new Map(domains.flatMap((d) => d.skills).map((s) => [s.id, s]));
    this.playable = new Set(domains.flatMap((d) => d.activities).flatMap((a) => a.skills));
    this.applySettings();
    if (this.data.startLevelApplied === null) this.applyStartLevel(this.data.settings.startLevel);
    save(this.data);

    this.slot.append(this.fluffy.el);
    this.gear.append(svgEl(GEAR_SVG));
    root.append(this.stage, this.slot, this.gear, this.gearHint);

    this.speech.onSpeaking((on) => this.fluffy.setTalking(on));
    onTap(this.slot, () => this.repeatFn?.());
    root.addEventListener('pointerup', (e) => {
      if (this.paused || this.gear.contains(e.target as Node)) return;
      this.screenTap?.();
    });
    this.setupGear();
    this.setupGlobalGuards();
    requestPersistence();
    void this.speech.init();
  }

  start(): void {
    this.showRestingScreen();
  }

  // ── Schermen ──

  /** Slaapscherm (dag): Fluffy slaapt, één tik waar dan ook maakt haar wakker. */
  private showRestingScreen(): void {
    const check = canStartSession(this.data.sessions, this.data.settings, Date.now(), this.data.parentAllowedAt);
    if (!check.ok) return this.showNight(false);

    this.mode = 'start';
    document.body.classList.remove('is-night');
    this.stage.replaceChildren();
    this.slot.className = 'fluffy-slot is-center';
    this.fluffy.set('slaperig');
    this.fluffy.still(false);
    this.repeatFn = null;

    const hint = el('div', 'tap-hint');
    hint.append(svgEl(HAND_SVG));
    this.stage.append(hint);
    const t = setTimeout(() => hint.classList.add('is-on'), 2500);

    this.screenTap = () => {
      this.screenTap = null;
      clearTimeout(t);
      // Binnen de tik: geluid ontgrendelen (iPadOS).
      this.speech.unlock();
      this.sounds.unlock();
      hint.remove();
      void this.runSession();
    };
  }

  /** Eindscherm: rustig, donker, Fluffy slaapt. Geen knop om door te spelen. */
  private showNight(afterSession: boolean): void {
    this.mode = 'night';
    document.body.classList.add('is-night');
    this.stage.replaceChildren();
    this.slot.className = 'fluffy-slot is-center';
    this.fluffy.set('slaperig');
    this.fluffy.still(false);
    this.repeatFn = null;
    if (afterSession) this.lastSleepTalk = Date.now();

    this.screenTap = () => {
      this.speech.unlock();
      this.sounds.unlock();
      const check = canStartSession(this.data.sessions, this.data.settings, Date.now(), this.data.parentAllowedAt);
      if (check.ok) {
        this.screenTap = null;
        document.body.classList.remove('is-night');
        void this.runSession();
        return;
      }
      // Hooguit af en toe een zacht zinnetje; Fluffy blijft slapen.
      if (Date.now() - this.lastSleepTalk > 15_000) {
        this.lastSleepTalk = Date.now();
        void this.say(['slaap.tik']);
      }
    };
  }

  // ── Sessie ──

  private async runSession(): Promise<void> {
    this.mode = 'session';
    this.screenTap = null;
    const now = Date.now();
    this.data.parentAllowedAt = null;
    this.record = {
      id: `s${now}`, date: isoDate(now), start: now, activeMs: 0,
      items: 0, firstTry: 0, helped: 0, activities: [], skills: [],
    };
    this.data.sessions.push(this.record);
    this.clock = new SessionClock(this.data.settings.sessionMinutes * 60_000, Date.now);
    this.clock.start();
    save(this.data);

    // Wakker worden en begroeten.
    this.fluffy.set('rust');
    await sleep(700);
    this.fluffy.set('blij');
    if (!this.data.introduced) {
      await this.say(['begroeting.eerste.a', 'naam', 'begroeting.eerste.b']);
      this.fluffy.set('rust');
      await this.say(['begroeting.uitleg.fluffy']);
      this.data.introduced = true;
      save(this.data);
    } else {
      await this.say(['begroeting.terug.a', 'naam', 'begroeting.terug.b']);
    }
    if (this.data.settings.together === 'samen') await this.say(['samen.hoi', this.grownUp()]);
    this.slot.className = 'fluffy-slot';
    await sleep(1300);
    this.domain = await this.chooseDomain();
    this.record.domain = this.domain.id;
    save(this.data);

    const played: PlayedRef[] = [];
    const retries: RetryEntry[] = [];
    const recent: ItemResult[] = [];
    await this.warmUp(played, retries);
    await playUntilTimeUp(this.clock, () => this.playOne(played, retries, recent));
    await this.endSession();
  }

  /** Hoe ze de ouder noemt ("papa of mama"). */
  private grownUp(): LineId {
    return this.data.settings.grownUp as LineId;
  }

  private plannerInput(domain: DomainModule, played: PlayedRef[], retries: RetryEntry[], today: string): PlannerInput {
    return { skills: domain.skills, playable: this.playable, states: this.data.skills, today, played, retries };
  }

  /**
   * Opwarmer: één herhaling uit het andere vak, als daar iets aan de beurt is. Zo blijft wat ze al
   * kan ook terugkomen als ze een tijdje alleen het ene vak kiest (gespreid herhalen).
   * Niet als de ouder het vak heeft vastgezet.
   */
  private async warmUp(played: PlayedRef[], retries: RetryEntry[]): Promise<void> {
    if (this.data.settings.subject !== 'kiezen') return;
    const today = isoDate(Date.now());
    for (const d of this.domains) {
      if (d === this.domain || !d.activities.length) continue;
      const skill = dueReviews(this.plannerInput(d, [], [], today))[0];
      if (!skill) continue;
      const activity = pick(this.rng, this.activitiesFor(skill));
      const level = this.stateOf(skill).level;
      await this.playItem({ skill, activity, params: activity.makeItem(skill, level, this.rng), retry: false, level, record: true }, played, retries);
      return;
    }
  }

  /** Rekenen of lezen: vastgezet door de ouder, of ze kiest zelf met twee plaatjes. */
  private async chooseDomain(): Promise<DomainModule> {
    const options = this.domains.filter((d) => d.activities.length > 0);
    const fixed = options.find((d) => d.id === this.data.settings.subject);
    if (fixed || options.length < 2) return fixed ?? options[0];
    const order = shuffle(this.rng, options);
    const i = await askChoice(this.context(null), order.map((d) => ({ icon: d.icon, label: d.choice })));
    await this.whenResumed();
    return order[i];
  }

  private async playOne(played: PlayedRef[], retries: RetryEntry[], recent: ItemResult[]): Promise<boolean> {
    const input = this.plannerInput(this.domain, played, retries, isoDate(Date.now()));
    // Liep het net een paar keer stroef? Dan eerst iets wat ze al kan.
    let plan = isStruggling(recent) ? this.easyWin(input, played) : null;
    if (plan) recent.length = 0;
    plan ??= await this.planNext(input, played, retries);
    if (!plan) return false;
    recent.push(await this.playItem(plan, played, retries));
    await this.maybeTogether(plan.skill, played.length);
    this.fluffy.set('rust');
    await sleep(700);
    return true;
  }

  /** Een succesje: een beheerste vaardigheid, of anders hetzelfde één stap makkelijker (telt niet mee). */
  private easyWin(input: PlannerInput, played: PlayedRef[]): Plan | null {
    const solid = easyPick(input);
    if (solid) {
      const activity = pick(this.rng, this.activitiesFor(solid));
      const level = this.stateOf(solid).level;
      return { skill: solid, activity, params: activity.makeItem(solid, level, this.rng), retry: false, level, record: true };
    }
    const skill = played[played.length - 1]?.skill;
    const level = skill ? this.stateOf(skill).level - 1 : -1;
    if (!skill || level < 0) return null;
    const activity = pick(this.rng, this.activitiesFor(skill));
    return { skill, activity, params: activity.makeItem(skill, level, this.rng), retry: false, level, record: false };
  }

  /** Wat de planner kiest: een item dat terugkomt, of iets nieuws (soms mag ze kiezen). */
  private async planNext(input: PlannerInput, played: PlayedRef[], retries: RetryEntry[]): Promise<Plan | null> {
    const choice = pickNext(input);
    if (!choice) return null;

    let activity: Activity<unknown>;
    let skill: string;
    let params: unknown;
    let isRetry = false;
    if (choice.kind === 'retry') {
      retries.splice(retries.indexOf(choice.entry), 1);
      activity = this.activity(choice.entry.activity);
      skill = choice.entry.skill;
      params = choice.entry.params;
      isRetry = true;
    } else {
      skill = choice.skill;
      activity = pick(this.rng, this.activitiesFor(skill));
      // Keuzemoment: ze kiest zelf uit twee activiteiten die allebei in het plan passen.
      const options = isChoiceMoment(played)
        ? choiceOptions(input, (s) => shuffle(this.rng, this.activitiesFor(s)).map((a) => a.id))
        : [];
      if (options.length === 2) {
        const order = shuffle(this.rng, options);
        const i = await askChoice(this.context(null), order.map((o) => ({
          icon: this.activity(o.activity).icon,
          label: this.activity(o.activity).choice,
        })));
        await this.whenResumed();
        skill = order[i].skill;
        activity = this.activity(order[i].activity);
      }
      params = activity.makeItem(skill, this.stateOf(skill).level, this.rng);
    }
    const level = isRetry ? (choice as { entry: RetryEntry }).entry.level : this.stateOf(skill).level;
    return { skill, activity, params, retry: isRetry, level, record: true };
  }

  /** Speelt één item en houdt alles bij: voortgang, terugkomen, wat opviel, de sessie. */
  private async playItem(p: Plan, played: PlayedRef[], retries: RetryEntry[]): Promise<ItemResult> {
    const today = isoDate(Date.now());
    const before = this.stateOf(p.skill);
    const result = await p.activity.run(this.context(p.activity.id), p.params, p.retry);
    await this.whenResumed();
    this.data.seen[p.activity.id] = (this.data.seen[p.activity.id] ?? 0) + 1;

    if (p.record) {
      this.data.skills[p.skill] = recordAttempt(this.skillsById.get(p.skill)!, before, {
        credit: result.credit,
        session: this.record!.id,
        today,
      });
    }
    played.push({ skill: p.skill, review: before.status === 'mastered' });
    if (result.modeled && !p.retry) {
      retries.push(scheduleRetry({ skill: p.skill, activity: p.activity.id, level: p.level, params: p.params }, played.length));
    }
    if (result.note) this.data.notes.push({ skill: p.skill, text: result.note, date: today });

    const r = this.record!;
    r.items++;
    if (result.credit === 1) r.firstTry++;
    else r.helped++;
    if (!r.activities.includes(p.activity.id)) r.activities.push(p.activity.id);
    if (!r.skills.includes(p.skill)) r.skills.push(p.skill);
    r.activeMs = this.clock!.elapsed();
    save(this.data);
    return result;
  }

  /**
   * Samen-moment: een opdracht in het echt die past bij wat ze net deed. Bij 'echt' één keer per
   * sessie, bij 'samen' om de vier items. De speelklok staat zolang stil: het is geen schermtijd.
   */
  private async maybeTogether(skill: string, count: number): Promise<void> {
    const mode = this.data.settings.together;
    const due = mode === 'samen' ? count % 4 === 0 : mode === 'echt' && count === 5;
    const tasks = this.skillsById.get(skill)?.realTasks;
    if (!due || !tasks?.length || this.clock!.isTimeUp()) return;
    this.fluffy.set('rust');
    await sleep(500);
    this.clock!.pause();
    await realTask(this.context(null), pick(this.rng, tasks), this.grownUp());
    await this.whenResumed();
    if (!this.paused) this.clock?.start();
  }

  private async endSession(): Promise<void> {
    const r = this.record!;
    this.repeatFn = null;
    this.slot.className = 'fluffy-slot is-center';
    this.fluffy.still(false);
    this.fluffy.set('blij');
    await sleep(1200);

    const summary: Seg[] = ['einde.start'];
    for (const id of r.activities) summary.push(...this.activity(id).summary);
    summary.push(...(r.helped > 0 ? ['einde.lof.doorzetten' as const] : this.domain.endPraise));
    await this.say(summary);
    // Een gesprek op gang helpen: ze vertelt het zelf na aan papa of mama.
    if (this.data.settings.together !== 'uit') await this.say(['einde.vertel.a', this.grownUp(), 'einde.vertel.b']);
    this.fluffy.set('slaperig');
    await this.say(['einde.slapen', 'einde.dag', 'naam']);
    if (this.speech.hasOwn('eigen.welterusten')) {
      await sleep(700);
      await this.say(['eigen.welterusten']);
    }

    this.clock!.pause();
    r.activeMs = this.clock!.elapsed();
    r.end = Date.now();
    this.clock = null;
    this.record = null;
    save(this.data);
    this.showNight(true);
  }

  private activity(id: string): Activity<unknown> {
    return this.domains.flatMap((d) => d.activities).find((a) => a.id === id)!;
  }

  private activitiesFor(skill: string): Activity<unknown>[] {
    return this.domains.flatMap((d) => d.activities).filter((a) => a.skills.includes(skill));
  }

  private context(activityId: string | null): ActivityContext {
    return {
      stage: this.stage,
      fluffy: this.fluffy,
      say: (segs) => this.say(segs),
      speechStop: () => this.speech.stop(),
      sounds: this.sounds,
      setRepeat: (fn) => (this.repeatFn = fn),
      beginner: activityId !== null && (this.data.seen[activityId] ?? 0) < 2,
      rng: this.rng,
    };
  }

  /** Spreken wacht als het ouderdeel open is. */
  private async say(segs: Seg[]): Promise<void> {
    await this.whenResumed();
    await this.speech.say(segs);
  }

  private whenResumed(): Promise<void> {
    if (!this.paused) return Promise.resolve();
    return new Promise((r) => this.resumeWaiters.push(r));
  }

  private pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.clock?.pause();
    this.speech.stop();
  }

  private resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.mode === 'session') this.clock?.start();
    this.resumeWaiters.splice(0).forEach((r) => r());
    this.repeatFn?.();
  }

  // ── Vaardigheden en instellingen ──

  private stateOf(id: string): SkillState {
    return this.data.skills[id] ?? initialState();
  }

  private applySettings(): void {
    const s = this.data.settings;
    this.speech.volume = s.volume;
    this.speech.childName = s.childName;
    this.speech.voiceURI = s.voiceURI;
    this.sounds.volume = s.volume;
  }

  private applyStartLevel(levelId: string): void {
    const level = this.domains.flatMap((d) => d.startLevels).find((l) => l.id === levelId);
    if (!level) return;
    const today = isoDate(Date.now());
    for (const id of level.assumed) {
      const st = this.data.skills[id];
      if (!st || st.status !== 'mastered') this.data.skills[id] = assumeMastered(this.skillsById.get(id)!, today);
    }
    this.data.startLevelApplied = levelId;
  }

  // ── Ouderdeel ──

  private setupGear(): void {
    let timer = 0;
    let hintTimer = 0;
    const cancel = () => {
      clearTimeout(timer);
      this.gear.classList.remove('is-holding');
    };
    // Gewoon tikken opent niets (dan komt een kind er niet per ongeluk in), maar de ouder ziet hoe het wel moet.
    const release = () => {
      const short = this.gear.classList.contains('is-holding');
      cancel();
      if (!short) return;
      clearTimeout(hintTimer);
      this.gearHint.classList.add('is-on');
      hintTimer = window.setTimeout(() => this.gearHint.classList.remove('is-on'), 2500);
    };
    this.gear.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.gear.classList.add('is-holding');
      // Twee seconden vasthouden; gewoon tikken doet niets.
      timer = window.setTimeout(() => {
        cancel();
        this.gearHint.classList.remove('is-on');
        this.openParent();
      }, 2000);
    });
    this.gear.addEventListener('pointerup', release);
    this.gear.addEventListener('pointerleave', cancel);
    this.gear.addEventListener('pointercancel', cancel);
  }

  private openParent(): void {
    this.pause();
    let wake = false;
    openParentArea(this.root, {
      domains: this.domains,
      data: this.data,
      speech: this.speech,
      playable: this.playable,
      onChange: () => {
        this.applySettings();
        save(this.data);
      },
      onStartLevel: (id) => {
        this.applyStartLevel(id);
        save(this.data);
      },
      onSkillLevel: (id: string, choice: ManualLevel) => {
        this.data.skills[id] = manualState(this.skillsById.get(id)!, this.stateOf(id), choice, isoDate(Date.now()));
        save(this.data);
      },
      onReset: () => {
        const settings = this.data.settings;
        this.data.skills = {};
        this.data.sessions = this.record ? [this.record] : [];
        this.data.introduced = false;
        this.data.seen = {};
        this.data.notes = [];
        this.applyStartLevel(settings.startLevel);
        save(this.data);
      },
      onAllowSession: () => {
        this.data.parentAllowedAt = Date.now();
        save(this.data);
      },
      onOwnClip: (id: string, clip: OwnClip | null) => this.speech.setOwn(id, clip),
      onRestore: (data: SaveData) => {
        save(data);
        location.reload();
      },
      awake: this.mode === 'session',
      onWake: () => {
        // Binnen de tik: geluid ontgrendelen (iPadOS), dan meteen beginnen.
        this.speech.unlock();
        this.sounds.unlock();
        this.data.parentAllowedAt = Date.now();
        save(this.data);
        wake = true;
      },
      onClose: () => {
        this.resume();
        if (wake && this.mode !== 'session') {
          this.screenTap = null;
          this.stage.replaceChildren();
          document.body.classList.remove('is-night');
          void this.runSession();
          return;
        }
        if (this.mode === 'night' && this.data.parentAllowedAt !== null) this.showRestingScreen();
      },
    });
  }

  private setupGlobalGuards(): void {
    // Geen knijp-zoom, geen contextmenu (iPadOS negeert user-scalable=no).
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());
    // Niet in beeld = klok stil.
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.clock?.pause();
        this.speech.stop();
      } else if (!this.paused) {
        if (this.mode === 'session') this.clock?.start();
        else if (this.mode === 'night') this.showRestingScreenIfAllowed();
      }
    });
  }

  private showRestingScreenIfAllowed(): void {
    const check = canStartSession(this.data.sessions, this.data.settings, Date.now(), this.data.parentAllowedAt);
    if (check.ok) this.showRestingScreen();
  }
}
