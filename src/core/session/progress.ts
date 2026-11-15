import type { Activity, DomainModule, SkillInfo } from '../domain';
import { assumeMastered, initialState, manualState, startProbe, type ManualLevel } from '../engine/mastery';
import type { SkillState } from '../engine/types';
import type { SaveData } from '../storage/store';
import { isoDate } from '../util';

/**
 * Wat er te leren valt (vaardigheden en activiteiten van alle vakken) en hoe ver ze is.
 * Verandert alleen de gegevens; opslaan doet de app.
 */
export class Progress {
  readonly byId: Map<string, SkillInfo>;
  /** Vaardigheden waar een activiteit voor is. */
  readonly playable: Set<string>;
  private activities: Activity<unknown>[];

  constructor(private domains: DomainModule[], private data: SaveData) {
    this.byId = new Map(domains.flatMap((d) => d.skills).map((s) => [s.id, s]));
    this.activities = domains.flatMap((d) => d.activities);
    this.playable = new Set(this.activities.flatMap((a) => a.skills));
  }

  activity(id: string): Activity<unknown> {
    return this.activities.find((a) => a.id === id)!;
  }

  activitiesFor(skill: string): Activity<unknown>[] {
    return this.activities.filter((a) => a.skills.includes(skill));
  }

  stateOf(id: string): SkillState {
    return this.data.skills[id] ?? initialState();
  }

  /** Iets nieuws? Dan eerst een proefje: kan ze het misschien al? */
  maybeProbe(skill: string): void {
    if (this.data.settings.probe && this.stateOf(skill).status === 'new') {
      this.data.skills[skill] = startProbe(this.byId.get(skill)!, this.stateOf(skill));
    }
  }

  /** Wat ze nu oefent: opnieuw kijken of ze het al kan. Wat beheerst is, blijft staan. */
  probeAgain(): void {
    for (const [id, st] of Object.entries(this.data.skills)) {
      const def = this.byId.get(id);
      if (def && st.status === 'practicing' && st.probe === undefined) this.data.skills[id] = startProbe(def, st);
    }
  }

  /** De ouder zet het niveau van een vaardigheid zelf. */
  setLevel(id: string, choice: ManualLevel): void {
    this.data.skills[id] = manualState(this.byId.get(id)!, this.stateOf(id), choice, isoDate(Date.now()));
  }

  applyStartLevel(levelId: string): void {
    const level = this.domains.flatMap((d) => d.startLevels).find((l) => l.id === levelId);
    if (!level) return;
    const today = isoDate(Date.now());
    for (const id of level.assumed) {
      const st = this.data.skills[id];
      if (!st || st.status !== 'mastered') this.data.skills[id] = assumeMastered(this.byId.get(id)!, today);
    }
    this.data.startLevelApplied = levelId;
  }
}
