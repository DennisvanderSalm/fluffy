import type { LineId } from '../../content/spraak.nl';
import type { ActivityContext, DomainModule } from '../domain';
import type { ManualLevel } from '../engine/mastery';
import { Fluffy } from '../fluffy/fluffy';
import { Speech, type Seg } from '../audio/speech';
import { Sounds } from '../audio/sounds';
import { canStartSession, closeDangling, playUntilTimeUp, SessionClock, type SessionRecord } from '../session/session';
import { Progress } from '../session/progress';
import { load, requestPersistence, save, type SaveData } from '../storage/store';
import { deleteOwnClip, type OwnClip } from '../audio/own';
import { COUNT_BEAT, el, isoDate, makeBeat, shuffle, sleep, svgEl } from '../util';
import { askChoice } from './choice';
import { DayMission } from './dagopdracht';
import { onTap } from './drag';
import { holdToOpen } from './gear';
import type { Host } from './host';
import { openParentArea } from './parent';
import { Player } from './play';
import type { Updates } from '../update';

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
  /** Vaardigheden, activiteiten en hoe ver ze is. */
  private progress: Progress;
  /** De opdracht voor de rest van de dag. */
  private mission: DayMission;
  /** Wat de onderdelen van een sessie van de app mogen gebruiken. */
  private host: Host;
  /** Het vak van de lopende sessie. */
  private domain: DomainModule;

  constructor(private root: HTMLElement, private domains: DomainModule[], private updates?: Updates) {
    this.data = load();
    this.data.sessions = closeDangling(this.data.sessions);
    this.domain = domains[0];
    this.progress = new Progress(domains, this.data);
    this.host = {
      data: this.data,
      domains,
      progress: this.progress,
      stage: this.stage,
      fluffy: this.fluffy,
      speech: this.speech,
      rng: this.rng,
      say: (segs) => this.say(segs),
      whenResumed: () => this.whenResumed(),
      isPaused: () => this.paused,
      context: (activityId, newRun) => this.context(activityId, newRun),
      grownUp: () => this.grownUp(),
    };
    this.mission = new DayMission(this.host);
    this.applySettings();
    if (this.data.startLevelApplied === null) this.progress.applyStartLevel(this.data.settings.startLevel);
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
    holdToOpen(this.gear, this.gearHint, () => this.openParent());
    this.setupGlobalGuards();
    requestPersistence();
    // Uit een eerdere versie: een eigen opname van de naam. Fluffy zegt geen naam meer, dus weg ermee.
    void deleteOwnClip('naam').catch(() => undefined);
    void this.speech.init().then(() => domains.forEach((d) => d.onClips?.((id) => this.speech.clipFile(id) !== undefined)));
    this.updates?.onReady(() => this.maybeUpdate());
  }

  /** Nieuwe versie laden, maar alleen als er niet gespeeld wordt en het ouderdeel dicht is. */
  private maybeUpdate(): void {
    if (this.updates?.ready && this.mode !== 'session' && !this.paused) this.updates.apply();
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
    this.mission.showCard();
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
    this.maybeUpdate();
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
    this.mission.showCard();

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
    this.maybeUpdate();
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
      await this.say(['begroeting.eerste.a', 'begroeting.eerste.b']);
      this.fluffy.set('rust');
      await this.say(['begroeting.uitleg.fluffy']);
      this.data.introduced = true;
      save(this.data);
    } else {
      await this.say(['begroeting.terug.a', 'begroeting.terug.b']);
    }
    if (this.data.settings.together === 'samen') await this.say(['samen.hoi', this.grownUp()]);
    await this.mission.ask(this.clock);
    this.slot.className = 'fluffy-slot';
    await sleep(1300);
    this.domain = await this.chooseDomain();
    this.record.domain = this.domain.id;
    save(this.data);

    const player = new Player(this.host, this.domain, this.clock, this.record);
    await player.warmUp();
    await playUntilTimeUp(this.clock, () => player.playOne());
    await this.endSession();
  }

  /** Hoe ze de ouder noemt ("papa of mama"). */
  private grownUp(): LineId {
    return this.data.settings.grownUp as LineId;
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

  private async endSession(): Promise<void> {
    const r = this.record!;
    this.repeatFn = null;
    this.slot.className = 'fluffy-slot is-center';
    this.fluffy.still(false);
    this.fluffy.set('blij');
    await sleep(1200);

    const summary: Seg[] = ['einde.start'];
    for (const id of r.activities) summary.push(...this.progress.activity(id).summary);
    summary.push(...(r.helped > 0 ? ['einde.lof.doorzetten' as const] : this.domain.endPraise));
    await this.say(summary);
    // Een gesprek op gang helpen: ze vertelt het zelf na aan papa of mama.
    if (this.data.settings.together !== 'uit') await this.say(['einde.vertel.a', this.grownUp(), 'einde.vertel.b']);
    await this.mission.give(r);
    this.fluffy.set('slaperig');
    await this.say(['einde.slapen', 'einde.dag']);
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

  private context(activityId: string | null, newRun = false): ActivityContext {
    return {
      stage: this.stage,
      fluffy: this.fluffy,
      say: (segs) => this.say(segs),
      speechStop: () => this.speech.stop(),
      sounds: this.sounds,
      setRepeat: (fn) => (this.repeatFn = fn),
      beginner: activityId !== null && (this.data.seen[activityId] ?? 0) < 2,
      newRun,
      countBeat: (slow = false) =>
        makeBeat(slow || (activityId !== null && (this.data.seen[activityId] ?? 0) < 2) ? COUNT_BEAT.beginner : COUNT_BEAT.normal),
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

  // ── Instellingen ──

  private applySettings(): void {
    const s = this.data.settings;
    this.speech.volume = s.volume;
    this.speech.voiceURI = s.voiceURI;
    this.sounds.volume = s.volume;
  }

  // ── Ouderdeel ──

  private openParent(): void {
    this.pause();
    let wake = false;
    openParentArea(this.root, {
      domains: this.domains,
      data: this.data,
      speech: this.speech,
      playable: this.progress.playable,
      onChange: () => {
        this.applySettings();
        save(this.data);
      },
      onStartLevel: (id) => {
        this.progress.applyStartLevel(id);
        save(this.data);
      },
      onSkillLevel: (id: string, choice: ManualLevel) => {
        this.progress.setLevel(id, choice);
        save(this.data);
      },
      onProbeAgain: () => {
        this.progress.probeAgain();
        save(this.data);
      },
      onReset: () => {
        const settings = this.data.settings;
        this.data.skills = {};
        this.data.sessions = this.record ? [this.record] : [];
        this.data.introduced = false;
        this.data.seen = {};
        this.data.notes = [];
        this.progress.applyStartLevel(settings.startLevel);
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
      version: { builtAt: __BUILD_TIME__, updateReady: !!this.updates?.ready },
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
        else this.maybeUpdate();
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
        this.updates?.check();
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