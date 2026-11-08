import type { DomainModule, SkillInfo } from '../domain';
import { deleteOwnClip, Recorder, saveOwnClip, type OwnClip } from '../audio/own';
import type { Speech } from '../audio/speech';
import { addDays, el, isoDate } from '../util';
import { lineText, type LineId } from '../../content/spraak.nl';
import { byPractice } from '../session/flow';
import { MOMENT_LABEL } from './moments';
import { joinText } from '../audio/phrases';
import { flaggedCommand, loadFlagged, saveFlagged, stillFlagged } from '../audio/flagged';
import { backupDue, makeBackup, readBackup, type SaveData, type StorageInfo } from '../storage/store';

/**
 * Onderdelen van het ouderdeel die over samen spelen gaan: wat je vandaag zonder scherm kunt
 * doen, waar ze tegenaan loopt, eigen opnames en de back-up.
 */

const skillMap = (domains: DomainModule[]) => new Map(domains.flatMap((d) => d.skills).map((s) => [s.id, s]));

/** "Na de laatste keer": één of twee spelletjes zonder scherm die aansluiten bij wat ze net deed. */
export function todaySection(data: SaveData, domains: DomainModule[], name: string): HTMLElement[] {
  const card = dayCard(data, domains, isoDate(Date.now()));
  if (!card) return [];
  const block = (title: string, items: string[]) =>
    items.length ? [el('p', 'muted', title), el('ul', 'sessions', ...items.map((t) => el('li', '', t)))] : [];

  const share = el('button', 'btn', 'Delen');
  share.addEventListener('click', () => {
    const text = dayCardText(card);
    void (async () => {
      try {
        if (navigator.share) await navigator.share({ title: 'Vandaag samen', text });
        else {
          await navigator.clipboard.writeText(text);
          share.textContent = 'Gekopieerd. Plak het in een berichtje.';
        }
      } catch {
        /* geannuleerd of niet toegestaan */
      }
    })();
  });

  return [
    el('div', 'today',
      el('h2', '', 'Vandaag samen'),
      card.mission
        ? el('p', '', `Fluffy gaf ${name} deze opdracht voor de rest van de dag: “${card.mission}” Vraag er eens naar! De volgende keer vraagt Fluffy het ook.`)
        : '',
      card.practiced.length
        ? el('p', 'muted', `${name.charAt(0).toUpperCase() + name.slice(1)} oefende ${card.when} met ${card.practiced.join(' en ')}. Zo kun je er vandaag samen mee verder, zonder scherm:`)
        : '',
      ...block('Tussendoor, bij gewone momenten:', card.moments),
      ...block('Een spelletje:', card.games),
      el('div', 'share-row', share, el('span', 'muted', 'Stuur dit naar wie er vandaag voor haar zorgt. De app verstuurt zelf niets; alleen als jij op Delen tikt.')),
    ),
  ];
}

export interface DayCard {
  when: 'vandaag' | 'de laatste keer';
  /** Wat Fluffy haar als opdracht gaf (alleen vandaag). */
  mission: string | null;
  /** Namen van de vaardigheden waar ze mee oefende. */
  practiced: string[];
  /** Ideeën bij gewone momenten van de dag ("Aan tafel: …"). */
  moments: string[];
  /** Spelletjes zonder scherm. */
  games: string[];
}

/** De dagkaart voor de ouder: wat ze deed, de opdracht van Fluffy, en ideeën voor de rest van de dag. */
export function dayCard(data: SaveData, domains: DomainModule[], today: string): DayCard | null {
  const last = [...data.sessions].reverse().find((r) => r.items > 0 && r.end !== undefined);
  const mission = data.mission && data.mission.date === today ? data.mission.line : null;
  if (!last && !mission) return null;
  const skills = skillMap(domains);
  // Eerst wat ze nog oefent: daar helpt samen spelen het meest.
  const picks = (last ? byPractice(last.skills, data.skills) : [])
    .map((id) => skills.get(id)).filter((s): s is SkillInfo => !!s).slice(0, 2);
  const text = (id: string) => lineText(id as LineId);
  return {
    when: last?.date === today ? 'vandaag' : 'de laatste keer',
    mission: mission ? text(mission) || null : null,
    practiced: picks.map((s) => s.name.toLowerCase()),
    moments: picks.flatMap((s) => s.missions ?? []).filter((m) => m.line !== mission)
      .map((m) => `${MOMENT_LABEL[m.moment]}: ${text(m.line).replace(/^Als [^:]*: /, '')}`).slice(0, 4),
    games: picks.map((s) => s.offScreen),
  };
}

/** De dagkaart als tekst, om te delen (bijvoorbeeld via WhatsApp). */
export function dayCardText(card: DayCard): string {
  const lines = ['Vandaag samen'];
  if (card.mission) lines.push('', `Fluffy gaf haar deze opdracht: “${card.mission}” Vraag er eens naar!`);
  if (card.practiced.length) lines.push('', `Ze oefende ${card.when} met ${card.practiced.join(' en ')}.`);
  if (card.moments.length) lines.push('', 'Tussendoor:', ...card.moments.map((t) => `- ${t}`));
  if (card.games.length) lines.push('', 'Een spelletje:', ...card.games.map((t) => `- ${t}`));
  return lines.join('\n');
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

interface RecordControls {
  status: HTMLElement;
  buttons: HTMLElement;
}

/** Knoppen om één zinnetje zelf in te spreken, af te spelen en te wissen. */
function recordControls(
  speech: Speech, id: string, onClip: (id: string, clip: OwnClip | null) => void, maxMs: number, compact = false,
): RecordControls {
  const done = compact ? 'Eigen opname.' : 'Opgenomen.';
  const none = compact ? '' : 'Nog niet opgenomen.';
  const recLabel = compact ? 'Zelf inspreken' : 'Opnemen';
  const status = el('div', 'muted', speech.hasOwn(id) ? done : none);
  const rec = el('button', 'btn', recLabel);
  const play = el('button', 'btn', 'Afspelen');
  const del = el('button', 'btn', compact ? 'Eigen opname wissen' : 'Wissen');
  const sync = () => {
    if (compact) del.hidden = !speech.hasOwn(id);
    else play.disabled = del.disabled = !speech.hasOwn(id);
  };
  sync();
  let recorder: Recorder | null = null;
  rec.addEventListener('click', async () => {
    if (recorder) return recorder.stop();
    recorder = new Recorder();
    try {
      const { done: finished } = await recorder.start(maxMs);
      rec.textContent = 'Stop';
      status.textContent = 'Neemt op… tik op Stop als je klaar bent.';
      const clip = await finished;
      if (clip) {
        await saveOwnClip(id, clip);
        onClip(id, clip);
        status.textContent = done;
      } else status.textContent = 'Er is niets opgenomen.';
    } catch {
      status.textContent = 'Geen toegang tot de microfoon. Sta die toe in de instellingen van je iPad.';
    }
    recorder = null;
    rec.textContent = recLabel;
    sync();
  });
  play.addEventListener('click', () => {
    speech.unlock();
    void speech.say([id as LineId]);
  });
  del.addEventListener('click', async () => {
    await deleteOwnClip(id).catch(() => undefined);
    onClip(id, null);
    status.textContent = none;
    sync();
  });
  return { status, buttons: el('div', 'header-buttons', play, ...(Recorder.supported() ? [rec, del] : [])) };
}

/** Eigen stem: een welterusten-boodschap zelf inspreken. */
export function ownVoiceSection(speech: Speech, onClip: (id: string, clip: OwnClip | null) => void): HTMLElement[] {
  if (!Recorder.supported()) {
    return [el('h2', '', 'Eigen stem'), el('p', 'muted', 'Opnemen kan niet in deze browser.')];
  }
  const slot = (id: string, label: string, hint: string) => {
    const c = recordControls(speech, id, onClip, 10000);
    return el('div', 'form-row', el('div', '', el('label', '', label), el('div', 'muted', hint), c.status), c.buttons);
  };
  return [
    el('h2', '', 'Eigen stem'),
    el('p', 'muted', 'Spreek zelf iets in. De opnames blijven op dit apparaat en gaan nergens heen.'),
    slot('eigen.welterusten', 'Welterusten van jou', 'Na Fluffy\'s "doei doei" hoort ze jouw stem, bijvoorbeeld: "Fluffy slaapt. Kom je bij mij? Dan lezen we een boekje." Kort houden, hooguit 10 seconden.'),
  ];
}

/** Groepen voor "opnames beluisteren": wat het meest nagekeken moet worden, eerst. */
const GROUPS: [prefix: string, label: string][] = [
  ['kl', 'Losse klanken (hakken en plakken)'],
  ['rekt', 'Uitgerekte woordjes ("Mmmm… maan")'],
  ['w', 'Woordjes'],
  ['getal', 'Getallen'],
];

/** De tekst van een opname, ook van een hele zin ('a+getal.4+b'). */
const clipText = (id: string) => joinText(id.split('+').map((p) => lineText(p as LineId)));

/**
 * Alle opnames beluisteren, per onderwerp. Klinkt er één niet goed (bv. "bee" in plaats van de
 * klank b), dan kun je hem hier zelf inspreken; die opname gaat dan voor.
 */
export function listenSection(speech: Speech, onClip: (id: string, clip: OwnClip | null) => void): HTMLElement[] {
  const ids = speech.clipIds();
  if (!ids.length) return [];
  const byGroup = new Map<string, string[]>();
  for (const id of ids) {
    const g = id.split(/[.+]/)[0];
    byGroup.set(g, [...(byGroup.get(g) ?? []), id]);
  }
  const known = new Map(GROUPS);
  const order = [
    ...GROUPS.map(([g]) => g).filter((g) => byGroup.has(g)),
    ...[...byGroup.keys()].filter((g) => !known.has(g)).sort(),
  ];

  // "Klinkt niet goed": markeringen van opnames die inmiddels vervangen zijn, vallen weg.
  const flagged = stillFlagged(loadFlagged(), (id) => speech.clipFile(id));
  saveFlagged(flagged);
  const flagInfo = el('p', 'muted', '');
  const flagText = el('textarea', 'flag-list');
  flagText.readOnly = true;
  flagText.rows = 3;
  const copy = el('button', 'btn', 'Lijst kopiëren');
  const clear = el('button', 'btn', 'Lijst wissen');
  const flagBox = el('div', 'flag-box', flagInfo, flagText, el('div', 'header-buttons', copy, clear));
  const flagButtons = new Map<string, HTMLButtonElement>();
  const syncFlags = () => {
    flagBox.hidden = !flagged.size;
    flagInfo.textContent = `${flagged.size === 1 ? 'Eén opname klinkt' : `${flagged.size} opnames klinken`} niet goed. Geef deze regel door, dan worden ze opnieuw ingesproken en gecontroleerd:`;
    flagText.value = flaggedCommand(flagged);
    for (const [id, b] of flagButtons) {
      b.textContent = flagged.has(id) ? 'Gemarkeerd' : 'Klinkt niet goed';
      b.classList.toggle('is-on', flagged.has(id));
    }
  };
  copy.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(flagText.value);
      copy.textContent = 'Gekopieerd';
    } catch {
      flagText.select();
    }
    setTimeout(() => (copy.textContent = 'Lijst kopiëren'), 2000);
  });
  clear.addEventListener('click', () => {
    flagged.clear();
    saveFlagged(flagged);
    syncFlags();
  });
  const flagButton = (id: string) => {
    const b = el('button', 'btn flag', 'Klinkt niet goed');
    b.addEventListener('click', () => {
      const file = speech.clipFile(id);
      if (flagged.has(id)) flagged.delete(id);
      else if (file) flagged.set(id, file);
      saveFlagged(flagged);
      syncFlags();
    });
    flagButtons.set(id, b);
    return b;
  };
  syncFlags();

  // Eén "alles afspelen" tegelijk.
  let run = 0;
  const playAll = async (list: string[], btn: HTMLButtonElement) => {
    const my = ++run;
    speech.unlock();
    btn.textContent = 'Stop';
    for (const id of list) {
      if (my !== run) break;
      await speech.say([id as LineId]);
      await new Promise((r) => setTimeout(r, 350));
    }
    btn.textContent = 'Alles afspelen';
  };

  const groups = order.map((g) => {
    const list = byGroup.get(g)!.sort((a, b) => a.localeCompare(b, 'nl', { numeric: true }));
    const details = el('details', 'listen');
    const all = el('button', 'btn', 'Alles afspelen');
    all.addEventListener('click', () => {
      if (all.textContent === 'Stop') {
        run++;
        speech.stop();
        return;
      }
      void playAll(list, all);
    });
    details.append(el('summary', '', `${known.get(g) ?? g} (${list.length})`));
    // Pas opbouwen als het open gaat: het zijn er honderden.
    details.addEventListener('toggle', () => {
      if (!details.open || details.childElementCount > 1) return;
      details.append(el('div', 'listen-all', all), ...list.map((id) => {
        const c = recordControls(speech, id, onClip, 6000, true);
        c.buttons.append(flagButton(id));
        return el('div', 'listen-row', el('div', '', el('div', '', clipText(id)), c.status), c.buttons);
      }));
      syncFlags();
    });
    return details;
  });

  return [
    el('h2', '', 'Opnames beluisteren'),
    el('p', 'muted', 'Hier hoor je alles wat Fluffy kan zeggen. Alles is automatisch nagekeken met spraakherkenning, behalve de losse klanken: luister daar zelf naar (b moet klinken als de klank, niet als "bee"). Klinkt iets niet goed? Tik op "Klinkt niet goed", of spreek het zelf in: jouw opname gaat voor.'),
    flagBox,
    ...groups,
  ];
}

/** Hoe veilig staat de voortgang, en welke versie draait er? */
export function safetySection(info: StorageInfo, builtAt: string, updateReady: boolean): HTMLElement[] {
  const fmt = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const lines: string[] = [];
  if (info.saveFailed) lines.push('Let op: het bewaren van de voortgang lukte de laatste keer niet. Maak een back-up, en kijk of de iPad genoeg vrije ruimte heeft.');
  if (!info.standalone) lines.push('Fluffy draait nu als gewone website. Zet hem op het beginscherm (Deel → Zet op beginscherm): dan ruimt Safari de voortgang niet vanzelf op.');
  if (info.persisted === true) lines.push('De iPad heeft beloofd de voortgang niet zelf op te ruimen.');
  else if (info.persisted === false && info.standalone) lines.push('De iPad mag de voortgang opruimen als de opslag vol raakt. Een back-up is dus verstandig.');
  lines.push(`Deze versie is van ${fmt.format(new Date(builtAt))}.`);
  if (updateReady) lines.push('Er staat een nieuwe versie klaar. Die wordt geladen zodra Fluffy slaapt.');
  return [el('h2', '', 'Opslag en versie'), el('ul', 'sessions', ...lines.map((t) => el('li', '', t)))];
}

/** Rustige herinnering bovenaan het ouderdeel als er (lang) geen back-up is gemaakt. */
export function backupReminder(data: SaveData, now: number): HTMLElement[] {
  const due = backupDue(data, now);
  if (!due) return [];
  const text = due === 'nooit'
    ? 'Er is nog geen back-up van de voortgang. Onderaan bij "Back-up" maak je er een.'
    : 'De laatste back-up is meer dan een maand oud. Onderaan bij "Back-up" maak je een nieuwe.';
  return [el('p', 'reminder', text)];
}

/** Back-up: voortgang en instellingen als bestand bewaren en terugzetten. */
export function backupSection(data: SaveData, onRestore: (d: SaveData) => void, onBackedUp: () => void): HTMLElement[] {
  const save = el('button', 'btn', 'Back-up maken');
  const status = el('div', 'muted', '');
  save.addEventListener('click', async () => {
    // Het tijdstip zit ook in de back-up zelf: na terugzetten klopt de herinnering dan.
    data.lastBackup = Date.now();
    onBackedUp();
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

/** De uitleg over Fluffy voor ouders: de README van de openbare repository. */
export const ABOUT_URL = 'https://github.com/DennisvanderSalm/fluffy#readme';

/** Privacy in gewone taal: wat waar staat, en wat er wel en niet naar buiten gaat. */
export function privacySection(name: string): HTMLElement[] {
  // Uitleg voor ouders: hoe Fluffy werkt, privacy en het onderzoek erachter (de README op GitHub).
  const about = el('a', 'about-link', 'Lees hier hoe Fluffy werkt, wat er met gegevens gebeurt en waar het op gebaseerd is');
  about.href = ABOUT_URL;
  about.target = '_blank';
  about.rel = 'noopener noreferrer';
  return [
    el('h2', '', 'Privacy'),
    el('p', '', about, el('span', 'muted', ' (opent GitHub in de browser).')),
    el('ul', 'sessions',
      el('li', '', `Fluffy vraagt geen naam, leeftijd of andere gegevens over ${name}. Wat de app bijhoudt (voortgang, wat opviel, instellingen en je eigen opname) staat alleen op dit apparaat. Niemand anders kan het zien, ook niet wie dezelfde link opent: elk apparaat heeft zijn eigen, lege Fluffy.`),
      el('li', '', 'De app verstuurt niets: geen account, geen reclame, geen statistieken, geen tracking. Dat is ook technisch afgedwongen: de app mag alleen met zijn eigen website praten.'),
      el('li', '', 'De app zelf staat openbaar op GitHub, en iedereen mag hem gebruiken. Als je de app opent, kijkt de iPad bij GitHub of er een nieuwe versie is. GitHub ziet dan, zoals bij elke website, het internetadres en het tijdstip. Niet wat er gespeeld wordt of hoe het gaat.'),
      el('li', '', 'De stem van Fluffy is vooraf opgenomen en staat op het apparaat. Mist er een keer een opname, dan springt de computerstem in, maar alleen een stem die op het apparaat zelf werkt, nooit een online stem.'),
      el('li', '', 'Een back-up bevat de voortgang en de instellingen, en geen opnames. Hij gaat nergens vanzelf heen; jij kiest waar je hem bewaart.'),
      el('li', '', 'De microfoon gebruikt de app alleen als jij zelf iets inspreekt. Delen gebeurt alleen als jij op Delen tikt.'),
      el('li', '', 'Het slot van het ouderdeel is een kinderslot, geen wachtwoord: een keersom kan een kind van 4 tot 6 nog niet, een volwassene wel.'),
    ),
  ];
}
