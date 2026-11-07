import type { DomainModule, SkillInfo } from '../domain';
import { deleteOwnClip, Recorder, saveOwnClip, type OwnClip } from '../audio/own';
import type { Speech } from '../audio/speech';
import { addDays, el, isoDate } from '../util';
import { makeBackup, readBackup, type SaveData } from '../storage/store';

/**
 * Onderdelen van het ouderdeel die over samen spelen gaan: wat je vandaag zonder scherm kunt
 * doen, waar ze tegenaan loopt, eigen opnames en de back-up.
 */

const skillMap = (domains: DomainModule[]) => new Map(domains.flatMap((d) => d.skills).map((s) => [s.id, s]));

/** "Na de laatste keer": één of twee spelletjes zonder scherm die aansluiten bij wat ze net deed. */
export function todaySection(data: SaveData, domains: DomainModule[], name: string): HTMLElement[] {
  const last = [...data.sessions].reverse().find((r) => r.items > 0 && r.end !== undefined);
  if (!last) return [];
  const skills = skillMap(domains);
  // Eerst wat ze nog oefent: daar helpt samen spelen het meest.
  const order = [...last.skills].sort((a, b) => rank(data, a) - rank(data, b));
  const picks = order.map((id) => skills.get(id)).filter((s): s is SkillInfo => !!s).slice(0, 2);
  if (!picks.length) return [];
  const when = last.date === isoDate(Date.now()) ? 'vandaag' : 'de laatste keer';
  return [
    el('div', 'today',
      el('h2', '', 'Spelletje voor vandaag'),
      el('p', 'muted', `${name} oefende ${when} met ${picks.map((s) => s.name.toLowerCase()).join(' en ')}. Dit kun je vandaag samen doen, zonder scherm:`),
      el('ul', 'sessions', ...picks.map((s) => el('li', '', s.offScreen))),
      el('p', 'muted', 'Vraag haar ook eens wat ze met Fluffy gedaan heeft. Zelf navertellen helpt om het te onthouden.'),
    ),
  ];
}

function rank(data: SaveData, id: string): number {
  const st = data.skills[id];
  return st?.status === 'practicing' ? 0 : st?.status === 'mastered' ? 2 : 1;
}

/**
 * "Waar ze tegenaan loopt": vaardigheden waar ze de laatste tijd vaak hulp bij nodig had, en
 * wat er bij fouten vaker opviel (bv. "verwisselt b en d"). In gewone taal, zonder scores.
 */
export function strugglesSection(data: SaveData, domains: DomainModule[], name: string, now: number): HTMLElement[] {
  const since = addDays(isoDate(now), -21);
  const skills = skillMap(domains);
  const items: HTMLElement[] = [];

  for (const s of skills.values()) {
    const st = data.skills[s.id];
    if (!st || st.status !== 'practicing') continue;
    const recent = st.history.filter((h) => h.date >= since && !h.review && h.level === st.level).slice(-8);
    if (recent.length < 4) continue;
    const helped = recent.filter((h) => h.credit < 1).length;
    if (helped / recent.length < 0.5) continue;
    items.push(el('li', '',
      el('strong', '', `${s.name}: `),
      `de laatste keren had ${name} hier vaak hulp bij nodig (stap ${st.level + 1}). Dat hoort bij leren. Wil je het makkelijker maken, zet dan hierboven het niveau een stap terug. Samen oefenen: ${s.offScreen}`,
    ));
  }

  const counts = new Map<string, { n: number; skill: string }>();
  for (const note of data.notes.filter((n) => n.date >= since)) {
    const c = counts.get(note.text) ?? { n: 0, skill: note.skill };
    c.n++;
    counts.set(note.text, c);
  }
  for (const [text, c] of [...counts].sort((a, b) => b[1].n - a[1].n)) {
    if (c.n < 2) continue;
    items.push(el('li', '', `${text} (${c.n} keer de laatste weken, bij ${skills.get(c.skill)?.name.toLowerCase() ?? c.skill})`));
  }

  return [
    el('h2', '', 'Waar ze tegenaan loopt'),
    items.length
      ? el('ul', 'sessions struggles', ...items.slice(0, 6))
      : el('p', 'muted', 'Niets wat opvalt. Af en toe hulp nodig hebben hoort erbij: dan leert ze juist.'),
  ];
}

/** Eigen stem: de naam en een welterusten-boodschap zelf inspreken. */
export function ownVoiceSection(speech: Speech, onClip: (id: string, clip: OwnClip | null) => void): HTMLElement[] {
  if (!Recorder.supported()) {
    return [el('h2', '', 'Eigen stem'), el('p', 'muted', 'Opnemen kan niet in deze browser.')];
  }
  const slot = (id: string, label: string, hint: string) => {
    const status = el('div', 'muted', speech.hasOwn(id) ? 'Opgenomen.' : 'Nog niet opgenomen.');
    const rec = el('button', 'btn', 'Opnemen');
    const play = el('button', 'btn', 'Afspelen');
    const del = el('button', 'btn', 'Wissen');
    const sync = () => {
      play.disabled = del.disabled = !speech.hasOwn(id);
    };
    sync();
    let recorder: Recorder | null = null;
    rec.addEventListener('click', async () => {
      if (recorder) return recorder.stop();
      recorder = new Recorder();
      try {
        const { done } = await recorder.start(id === 'naam' ? 4000 : 10000);
        rec.textContent = 'Stop';
        status.textContent = 'Neemt op… tik op Stop als je klaar bent.';
        const clip = await done;
        if (clip) {
          await saveOwnClip(id, clip);
          onClip(id, clip);
          status.textContent = 'Opgenomen.';
        } else status.textContent = 'Er is niets opgenomen.';
      } catch {
        status.textContent = 'Geen toegang tot de microfoon. Sta die toe in de instellingen van je iPad.';
      }
      recorder = null;
      rec.textContent = 'Opnemen';
      sync();
    });
    play.addEventListener('click', () => {
      speech.unlock();
      void speech.say([id as never]);
    });
    del.addEventListener('click', async () => {
      await deleteOwnClip(id).catch(() => undefined);
      onClip(id, null);
      status.textContent = 'Nog niet opgenomen.';
      sync();
    });
    return el('div', 'form-row', el('div', '', el('label', '', label), el('div', 'muted', hint), status),
      el('div', 'header-buttons', rec, play, del));
  };
  return [
    el('h2', '', 'Eigen stem'),
    el('p', 'muted', 'Spreek zelf iets in. De opnames blijven op dit apparaat en gaan nergens heen.'),
    slot('naam', 'Haar naam', 'Fluffy zegt de naam dan met jouw opname in plaats van met de computerstem.'),
    slot('eigen.welterusten', 'Welterusten van jou', 'Na Fluffy\'s "doei doei" hoort ze jouw stem, bijvoorbeeld: "Fluffy slaapt. Kom je bij mij? Dan lezen we een boekje." Kort houden, hooguit 10 seconden.'),
  ];
}

/** Back-up: voortgang en instellingen als bestand bewaren en terugzetten. */
export function backupSection(data: SaveData, onRestore: (d: SaveData) => void): HTMLElement[] {
  const save = el('button', 'btn', 'Back-up maken');
  const status = el('div', 'muted', '');
  save.addEventListener('click', async () => {
    const json = JSON.stringify(makeBackup(data, Date.now()), null, 1);
    const file = new File([json], `fluffy-backup-${isoDate(Date.now())}.json`, { type: 'application/json' });
    // Op de iPad werkt "delen" het best (bewaar in Bestanden); anders gewoon downloaden.
    const nav = navigator as Navigator & { canShare?(d: { files: File[] }): boolean };
    if (nav.canShare?.({ files: [file] })) {
      try {
        await nav.share({ files: [file], title: 'Fluffy back-up' });
        status.textContent = 'Back-up gemaakt.';
        return;
      } catch {
        /* geannuleerd: val terug op downloaden */
      }
    }
    const a = el('a');
    a.href = URL.createObjectURL(file);
    a.download = file.name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    status.textContent = 'Back-up gedownload.';
  });

  const input = el('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.style.display = 'none';
  const restore = el('button', 'btn', 'Back-up terugzetten');
  let pending: SaveData | null = null;
  restore.addEventListener('click', () => {
    if (pending) return onRestore(pending);
    input.click();
  });
  input.addEventListener('change', async () => {
    const f = input.files?.[0];
    if (!f) return;
    const d = readBackup(await f.text());
    if (!d) {
      status.textContent = 'Dit is geen Fluffy-back-up.';
      return;
    }
    pending = d;
    restore.textContent = 'Zeker weten? Tik nog een keer';
    status.textContent = `Back-up met ${d.sessions.length} sessies gevonden. De huidige voortgang wordt vervangen.`;
  });

  return [
    el('h2', '', 'Back-up'),
    el('div', 'form-row',
      el('div', '', el('label', '', 'Voortgang bewaren'), el('div', 'muted', 'Bewaar af en toe een back-up in Bestanden of iCloud. Handig bij een nieuwe iPad, of als de opslag van Safari ooit gewist wordt. Eigen opnames zitten er niet in.'), status),
      el('div', 'header-buttons', save, restore, input)),
  ];
}
