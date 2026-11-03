import type { Activity, ActivityContext, DomainModule } from '../domain';
import { assumeMastered, initialState, recordAttempt } from '../engine/mastery';
import {
  choiceOptions, isChoiceMoment, pickNext, scheduleRetry, type PlannerInput, type PlayedRef, type RetryEntry,
} from '../engine/planner';
import type { SkillState } from '../engine/types';
import { Fluffy } from '../fluffy/fluffy';
import { Speech, type Seg } from '../audio/speech';
import { Sounds } from '../audio/sounds';
import {
  canStartSession, closeDangling, playUntilTimeUp, SessionClock, type SessionRecord,
} from '../session/session';
import { load, requestPersistence, save, type SaveData } from '../storage/store';
import { el, isoDate, pick, shuffle, sleep, svgEl } from '../util';
import { askChoice } from './choice';
import { onTap } from './drag';
import { openParentArea } from './parent';

const HAND_SVG = `<svg viewBox="0 0 100 100"><path d="M38 12 C38 6 48 6 48 12 V46 L52 30 C53 24 62 25 61 31 L60 48 L64 36 C66 30 74 32 72 38 L70 52 L73 44 C75 39 82 41 80 47 L74 74 C71 86 62 94 50 94 C38 94 28 86 26 74 L22 58 C20 52 28 48 31 54 L38 64 Z"
  fill="#fff" stroke="#3b4a6b" stroke-width="4" stroke-linejoin="round"/></svg>`;
const GEAR_SVG = `<svg viewBox="0 0 60 60"><circle class="ring" cx="30" cy="30" r="24"/>
  <path fill="#3b4a6b" d="M30 19a11 11 0 1 0 0 22a11 11 0 1 0 0-22zm0 6a5 5 0 1 1 0 10a5 5 0 1 1 0-10z
  M27 12h6l1 5h-8zM27 48h6l-1-5h-4zM12 27v6l5-1v-4zM48 27v6l-5-1v-4z"/></svg>`;

/**
 * De app: startscherm → begroeting → items (planner kiest) → rustig einde → slaapscherm.
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

  constructor(private root: HTMLElement, private domain: DomainModule) {
    this.data = load();
    this.data.sessions = closeDangling(this.data.sessions);
    this.skillsById = new Map(domain.skills.map((s) => [s.id, s]));
    this.playable = new Set(domain.activities.flatMap((a) => a.skills));
    this.applySettings();
    if (this.data.startLevelApplied === null) this.applyStartLevel(this.data.settings.startLevel);
    save(this.data);

    this.slot.append(this.fluffy.el);
    this.gear.append(svgEl(GEAR_SVG));
    root.append(this.stage, this.slot, this.gear);

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
    this.slot.className = 'fluffy-slot';
    await sleep(1300);

    const played: PlayedRef[] = [];
    const retries: RetryEntry[] = [];
    await playUntilTimeUp(this.clock, () => this.playOne(played, retries));
    await this.endSession();
  }

  private async playOne(played: PlayedRef[], retries: RetryEntry[]): Promise<boolean> {
    const today = isoDate(Date.now());
    const input: PlannerInput = {
      skills: this.domain.skills,
      playable: this.playable,
      states: this.data.skills,
      today,
      played,
      retries,
    };
    const choice = pickNext(input);
    if (!choice) return false;

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
    const before = this.stateOf(skill);
    const levelPlayed = isRetry ? (choice as { entry: RetryEntry }).entry.level : before.level;

    const result = await activity.run(this.context(activity.id), params, isRetry);
    await this.whenResumed();
    this.data.seen[activity.id] = (this.data.seen[activity.id] ?? 0) + 1;

    const def = this.skillsById.get(skill)!;
    this.data.skills[skill] = recordAttempt(def, before, {
      credit: result.credit,
      session: this.record!.id,
      today,
    });
    played.push({ skill, review: before.status === 'mastered' });
    if (result.modeled && !isRetry) {
      retries.push(scheduleRetry({ skill, activity: activity.id, level: levelPlayed, params }, played.length));
    }

    const r = this.record!;
    r.items++;
    if (result.credit === 1) r.firstTry++;
    else r.helped++;
    if (!r.activities.includes(activity.id)) r.activities.push(activity.id);
    if (!r.skills.includes(skill)) r.skills.push(skill);
    r.activeMs = this.clock!.elapsed();
    save(this.data);

    this.fluffy.set('rust');
    await sleep(700);
    return true;
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
    summary.push(r.helped > 0 ? 'einde.lof.doorzetten' : 'einde.lof.precies');
    await this.say(summary);
    this.fluffy.set('slaperig');
    await this.say(['einde.slapen', 'einde.dag', 'naam']);

    this.clock!.pause();
    r.activeMs = this.clock!.elapsed();
    r.end = Date.now();
    this.clock = null;
    this.record = null;
    save(this.data);
    this.showNight(true);
  }

  private activity(id: string): Activity<unknown> {
    return this.domain.activities.find((a) => a.id === id)!;
  }

  private activitiesFor(skill: string): Activity<unknown>[] {
    return this.domain.activities.filter((a) => a.skills.includes(skill));
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
    const level = this.domain.startLevels.find((l) => l.id === levelId);
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
    const cancel = () => {
      clearTimeout(timer);
      this.gear.classList.remove('is-holding');
    };
    this.gear.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.gear.classList.add('is-holding');
      // Twee seconden vasthouden; gewoon tikken doet niets.
      timer = window.setTimeout(() => {
        cancel();
        this.openParent();
      }, 2000);
    });
    this.gear.addEventListener('pointerup', cancel);
    this.gear.addEventListener('pointerleave', cancel);
    this.gear.addEventListener('pointercancel', cancel);
  }

  private openParent(): void {
    this.pause();
    openParentArea(this.root, {
      domain: this.domain,
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
      onReset: () => {
        const settings = this.data.settings;
        this.data.skills = {};
        this.data.sessions = this.record ? [this.record] : [];
        this.data.introduced = false;
        this.data.seen = {};
        this.applyStartLevel(settings.startLevel);
        save(this.data);
      },
      onAllowSession: () => {
        this.data.parentAllowedAt = Date.now();
        save(this.data);
      },
      onClose: () => {
        this.resume();
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
