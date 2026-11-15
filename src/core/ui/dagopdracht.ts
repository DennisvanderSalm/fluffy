import type { LineId } from '../../content/spraak.nl';
import { byPractice, chooseMission, missionAtEnd, missionFollowUpDue } from '../session/flow';
import type { SessionClock, SessionRecord } from '../session/session';
import { save } from '../storage/store';
import { isoDate } from '../util';
import type { Host } from './host';
import { missionCard, missionCheck } from './missie';
import type { Moment } from './moments';

/**
 * De opdracht voor de rest van de dag: aan het eind van een sessie geeft Fluffy er een, op het
 * slaapscherm staat het plaatje, en de volgende keer vraagt ze ernaar.
 */
export class DayMission {
  constructor(private host: Host) {}

  /** De opgeslagen opdracht, alleen als die nog in de app bestaat. */
  private current(): { line: LineId; moment: Moment; date: string } | null {
    const m = this.host.data.mission;
    const known = m && this.host.progress.byId.get(m.skill)?.missions?.find((x) => x.line === m.line);
    return m && known ? { line: known.line, moment: known.moment, date: m.date } : null;
  }

  /** Aan het eind van de sessie: een opdracht voor de rest van de dag (of die van vandaag nog eens). */
  async give(record: SessionRecord): Promise<void> {
    const { data, progress, stage, rng } = this.host;
    if (!data.settings.mission) return;
    const today = isoDate(Date.now());
    const current = this.current();
    if (current && missionAtEnd(data.mission, today) === 'herinner') {
      stage.append(missionCard(current.moment));
      await this.host.say(['missie.vergeet', current.line]);
      return;
    }
    const skills = byPractice(record.skills, data.skills);
    const choice = chooseMission(skills, (id) => progress.byId.get(id)?.missions, data.seen, rng);
    if (!choice) return;
    const { line, moment } = choice.mission;
    data.seen[line] = (data.seen[line] ?? 0) + 1;
    data.mission = { line, skill: choice.skill, moment, date: today, asked: false };
    save(data);
    stage.append(missionCard(moment));
    await this.host.say(['missie.start', line, 'missie.plaatje']);
  }

  /** Op het slaap- en startscherm: het plaatje van de opdracht van vandaag. Tik = nog een keer horen. */
  showCard(): void {
    const m = this.current();
    if (!m || !this.host.data.settings.mission || m.date !== isoDate(Date.now())) return;
    this.host.stage.append(missionCard(m.moment, () => {
      this.host.speech.unlock();
      this.host.speech.stop();
      void this.host.say(['missie.nogeens', m.line]);
    }));
  }

  /** Aan het begin: weet je nog wat je opdracht was? Telt niet als speeltijd. */
  async ask(clock: SessionClock): Promise<void> {
    const { data } = this.host;
    const m = this.current();
    if (!m || !data.settings.mission || !missionFollowUpDue(data.mission, isoDate(Date.now()))) return;
    clock.pause();
    await missionCheck(this.host.context(null), m.line, m.moment);
    await this.host.whenResumed();
    data.mission = { ...data.mission!, asked: true };
    save(data);
    if (!this.host.isPaused()) clock.start();
  }
}
