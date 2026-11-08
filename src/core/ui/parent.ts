import type { Speech } from '../audio/speech';
import type { DomainModule, SkillInfo } from '../domain';
import { initialState, manualLevelOf, type ManualLevel } from '../engine/mastery';
import { PLAN_RULES, prerequisitesMet } from '../engine/planner';
import { storageInfo, type SaveData } from '../storage/store';
import type { OwnClip } from '../audio/own';
import { el } from '../util';
import {
  backupReminder, backupSection, listenSection, ownVoiceSection, privacySection, safetySection, strugglesSection, todaySection,
} from './parent-extra';

export interface ParentDeps {
  domains: DomainModule[];
  data: SaveData;
  speech: Speech;
  playable: Set<string>;
  onChange(): void;
  onStartLevel(id: string): void;
  /** De ouder zet een vaardigheid zelf op een niveau. */
  onSkillLevel(id: string, level: ManualLevel): void;
  /** Wat ze nu oefent opnieuw met een proefje laten beginnen. */
  onProbeAgain(): void;
  onReset(): void;
  onAllowSession(): void;
  /** Een eigen opname is gemaakt (of gewist, dan null). */
  onOwnClip(id: string, clip: OwnClip | null): void;
  /** Een back-up terugzetten (de app start daarna opnieuw). */
  onRestore(data: SaveData): void;
  /** Wanneer deze versie gebouwd is, en of er een nieuwe klaarstaat. */
  version: { builtAt: string; updateReady: boolean };
  /** Is er nu een sessie bezig? Dan is Fluffy al wakker. */
  awake: boolean;
  /** Fluffy meteen wakker maken (sessie start zodra het ouderdeel dicht is). */
  onWake(): void;
  onClose(): void;
}

/**
 * Vraag voor de oudervergrendeling: een keersom met een antwoord van twee cijfers (zoals 7 × 8).
 * Een kind van 4 tot 6 kan dat nog niet, ook niet als het al een beetje leest; een ouder doet het
 * in een paar seconden. Gokken lukt niet: één verkeerd cijfer geeft een nieuwe som.
 */
export function lockQuestion(rng: () => number): { a: number; b: number; answer: string } {
  let a = 0;
  let b = 0;
  do {
    a = 3 + Math.floor(rng() * 7);
    b = 3 + Math.floor(rng() * 7);
  } while (a * b < 12);
  return { a, b, answer: String(a * b) };
}

/** Oudervergrendeling: een keersom uitrekenen en het antwoord intikken (zie lockQuestion). */
export function openParentArea(root: HTMLElement, deps: ParentDeps): void {
  const overlay = el('div', 'overlay');
  // Tikken in het ouderdeel mogen nooit doorlekken naar het spel eronder.
  for (const t of ['pointerdown', 'pointerup'] as const) overlay.addEventListener(t, (e) => e.stopPropagation());
  root.append(overlay);

  let idle = 0;
  let unlocked = false;
  const close = () => {
    clearTimeout(idle);
    overlay.remove();
    deps.onClose();
  };
  // Het slotscherm sluit vanzelf als er niets gebeurt (bv. kind kwam er per ongeluk).
  const bumpIdle = () => {
    clearTimeout(idle);
    if (unlocked) return;
    idle = window.setTimeout(close, 30_000);
  };
  overlay.addEventListener('pointerdown', bumpIdle);
  bumpIdle();

  const showLock = () => {
    const { a, b, answer } = lockQuestion(Math.random);
    let typed = '';
    const shown = el('p', 'lock-typed', ' ');
    const pad = el('div', 'lock-pad');
    const buttons = [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((n) => {
      const btn = el('button', n === 0 ? 'is-zero' : '', String(n));
      btn.addEventListener('click', () => {
        typed += String(n);
        if (!answer.startsWith(typed)) return showLock();
        shown.textContent = typed;
        if (typed === answer) {
          clearTimeout(idle);
          unlocked = true;
          showArea(overlay, deps, close);
        }
      });
      return btn;
    });
    pad.append(...buttons);
    const back = el('button', 'btn', 'Terug naar Fluffy');
    back.addEventListener('click', close);
    overlay.replaceChildren(
      el('div', 'lock', el('div', 'lock-box',
        el('h2', '', 'Voor ouders'),
        el('p', 'muted', 'Reken deze som uit en tik het antwoord:'),
        el('p', 'lock-words', `${a} × ${b}`),
        shown,
        pad,
        back,
      )),
    );
  };
  showLock();
}

function select(options: [string, string][], value: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = el('select');
  for (const [v, label] of options) {
    const o = el('option', '', label);
    o.value = v;
    o.selected = v === value;
    sel.append(o);
  }
  sel.addEventListener('change', () => onChange(sel.value));
  return sel;
}

function statusOf(deps: ParentDeps, domain: DomainModule, skill: SkillInfo): { text: string; cls: string } {
  const st = deps.data.skills[skill.id] ?? initialState();
  if (!deps.playable.has(skill.id)) {
    return st.assumed
      ? { text: 'Kan ze volgens het startniveau al (oefenen komt in een volgende versie)', cls: 'is-done' }
      : { text: 'Komt in een volgende versie', cls: '' };
  }
  if (st.status === 'mastered' && st.assumed && st.probed) {
    return { text: 'Kon ze meteen (proefje). Komt over een paar dagen terug ter controle', cls: 'is-done' };
  }
  if (st.status === 'mastered') {
    return st.assumed
      ? { text: 'Kan ze waarschijnlijk al (wordt even gecontroleerd)', cls: 'is-done' }
      : { text: 'Gaat goed. Komt af en toe terug om het vast te houden', cls: 'is-done' };
  }
  if (st.status === 'practicing' && st.probe !== undefined) {
    return { text: 'Fluffy kijkt eerst of ze dit al kan (proefje)', cls: 'is-busy' };
  }
  if (st.status === 'practicing') {
    return { text: `Hier oefent ze nu mee (stap ${st.level + 1} van ${skill.levels})`, cls: 'is-busy' };
  }
  const input = { skills: domain.skills, playable: deps.playable, states: deps.data.skills, today: '', played: [], retries: [] };
  return prerequisitesMet(input, skill)
    ? { text: 'Komt binnenkort aan bod', cls: '' }
    : { text: 'Nog niet aan begonnen', cls: '' };
}

function showArea(overlay: HTMLElement, deps: ParentDeps, close: () => void): void {
  const { data, domains } = deps;
  const s = data.settings;
  const name = 'je kind';

  const closeBtn = el('button', `btn${deps.awake ? ' primary' : ''}`, 'Terug naar Fluffy');
  closeBtn.addEventListener('click', close);
  // Fluffy meteen wakker maken: slaat rustpauze en dagmaximum één keer over. De tik op de knop
  // telt als tik op het scherm, dus het geluid mag meteen aan (iPadOS).
  const wakeBtn = el('button', 'btn primary', 'Fluffy wakker maken');
  wakeBtn.addEventListener('click', () => {
    deps.onWake();
    close();
  });

  // Voortgang per vak en per vaardigheid, in gewone taal. Geen scores.
  const skillCard = (domain: DomainModule, sk: SkillInfo) => {
    const st = statusOf(deps, domain, sk);
    const chip = el('span', `chip ${st.cls}`, st.text);
    const card = el('div', `skill${deps.playable.has(sk.id) ? '' : ' is-off'}`,
      el('div', 'skill-top', el('span', 'skill-name', sk.name), chip),
      el('p', '', sk.about),
      el('p', 'tip', `Zonder scherm: ${sk.offScreen}`),
    );
    if (deps.playable.has(sk.id)) {
      // Niveau zelf kiezen: makkelijker of moeilijker dan wat de app nu denkt.
      const levels: [string, string][] = [
        ['new', 'Nog niet aan begonnen'],
        ...Array.from({ length: sk.levels }, (_, i): [string, string] => [String(i), `Oefenen, stap ${i + 1} van ${sk.levels}`]),
        ['mastered', 'Kan ze al'],
      ];
      const current = String(manualLevelOf(data.skills[sk.id] ?? initialState()));
      const sel = select(levels, current, (v) => {
        deps.onSkillLevel(sk.id, v === 'new' || v === 'mastered' ? v : Number(v));
        const now = statusOf(deps, domain, sk);
        chip.className = `chip ${now.cls}`;
        chip.textContent = now.text;
        updateBusyNote();
      });
      card.append(el('div', 'skill-level', el('label', '', 'Niveau'), sel));
    }
    return card;
  };
  const busyNote = el('p', 'muted');
  const updateBusyNote = () => {
    const busy = domains.map((dm) => dm.skills.filter((sk) => deps.playable.has(sk.id) && data.skills[sk.id]?.status === 'practicing'));
    const tooMany = busy.find((b) => b.length > PLAN_RULES.frontierSize);
    busyNote.textContent = tooMany
      ? `Let op: Fluffy oefent per vak met hooguit ${PLAN_RULES.frontierSize} dingen tegelijk. Nu staan er ${tooMany.length} op "oefenen"; ze komen op volgorde van de lijst aan bod.`
      : '';
  };
  updateBusyNote();
  const skills = domains.flatMap((dm) => [
    el('h3', '', dm.name),
    ...[...dm.skills].sort((a, b) => a.stage - b.stage).map((sk) => skillCard(dm, sk)),
  ]);

  const fmt = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const actName = (id: string) => domains.flatMap((dm) => dm.activities).find((a) => a.id === id)?.name ?? id;
  const sessions = data.sessions.filter((r) => r.items > 0).slice(-10).reverse().map((r) =>
    el('li', '', `${fmt.format(r.start)}: ${Math.max(1, Math.round(r.activeMs / 60000))} min, ${r.activities.map(actName).join(', ')}`),
  );

  // ── Instellingen ──
  const row = (label: string, control: HTMLElement, hint = '') =>
    el('div', 'form-row', el('div', '', el('label', '', label), hint ? el('div', 'muted', hint) : ''), control);



  const minutes = select([['5', '5 minuten'], ['10', '10 minuten'], ['15', '15 minuten'], ['20', '20 minuten']], String(s.sessionMinutes), (v) => {
    s.sessionMinutes = Number(v);
    deps.onChange();
  });
  const maxPerDay = select([['0', 'Geen maximum'], ['1', '1 per dag'], ['2', '2 per dag'], ['3', '3 per dag']], String(s.maxSessionsPerDay), (v) => {
    s.maxSessionsPerDay = Number(v);
    deps.onChange();
  });
  const rest = select([['30', '30 minuten'], ['60', '1 uur'], ['120', '2 uur'], ['240', '4 uur']], String(s.restMinutes), (v) => {
    s.restMinutes = Number(v);
    deps.onChange();
  });

  const volume = el('input');
  volume.type = 'range';
  volume.min = '0';
  volume.max = '1';
  volume.step = '0.1';
  volume.value = String(s.volume);
  volume.addEventListener('change', () => {
    s.volume = Number(volume.value);
    deps.onChange();
  });

  const voices = deps.speech.dutchVoices();
  const voice = select(
    [['', 'Automatisch (beste Nederlandse stem)'], ...voices.map((v): [string, string] => [v.voiceURI, `${v.name} (${v.lang})`])],
    s.voiceURI ?? '',
    (v) => {
      s.voiceURI = v || null;
      deps.onChange();
    },
  );
  const test = el('button', 'btn', 'Laat Fluffy iets zeggen');
  test.addEventListener('click', () => {
    deps.speech.unlock();
    void deps.speech.say(['ouder.test']);
  });

  // Startniveau bestaat alleen bij een vak waar iets te kiezen valt (rekenen).
  const startDomain = domains.find((dm) => dm.startLevels.length > 1);
  const startLevel = startDomain && select(startDomain.startLevels.map((l) => [l.id, l.label]), s.startLevel, (v) => {
    s.startLevel = v;
    deps.onStartLevel(v);
    deps.onChange();
  });

  const probe = select([
    ['aan', 'Ja, eerst een proefje'],
    ['uit', 'Nee, altijd bij het begin beginnen'],
  ], s.probe ? 'aan' : 'uit', (v) => {
    s.probe = v === 'aan';
    deps.onChange();
  });
  const mission = select([
    ['aan', 'Ja, Fluffy geeft een opdracht mee'],
    ['uit', 'Nee'],
  ], s.mission ? 'aan' : 'uit', (v) => {
    s.mission = v === 'aan';
    deps.onChange();
  });
  const probeAgain = el('button', 'btn', 'Opnieuw laten kijken');
  probeAgain.addEventListener('click', () => {
    deps.onProbeAgain();
    probeAgain.textContent = 'Gedaan. Bij de volgende keer spelen begint alles wat ze oefent met een proefje.';
    probeAgain.disabled = true;
  });

  const subject = select(
    [['kiezen', 'Laat haar kiezen'], ...domains.map((dm): [string, string] => [dm.id, `Altijd ${dm.name.toLowerCase()}`])],
    s.subject,
    (v) => {
      s.subject = v;
      deps.onChange();
    },
  );

  const together = select([
    ['echt', 'Af en toe een opdracht in het echt'],
    ['samen', 'We spelen samen (vaker, en Fluffy praat ook tegen jou)'],
    ['uit', 'Uit'],
  ], s.together, (v) => {
    s.together = v as typeof s.together;
    deps.onChange();
  });
  const grownUp = select([
    ['wie.papaofmama', 'papa of mama'], ['wie.mama', 'mama'], ['wie.papa', 'papa'], ['wie.oma', 'oma'], ['wie.opa', 'opa'],
  ], s.grownUp, (v) => {
    s.grownUp = v;
    deps.onChange();
  });

  // Opslagstatus komt asynchroon binnen.
  const safety = el('div');
  void storageInfo().then((info) => safety.replaceChildren(...safetySection(info, deps.version.builtAt, deps.version.updateReady)));

  const allow = el('button', 'btn', 'Nieuwe sessie toestaan');
  allow.addEventListener('click', () => {
    deps.onAllowSession();
    allow.textContent = 'Toegestaan. Ze kan Fluffy nu zelf wakker tikken.';
  });

  const reset = el('button', 'btn danger', 'Voortgang wissen');
  let armed = 0;
  reset.addEventListener('click', () => {
    if (!armed) {
      reset.textContent = 'Zeker weten? Tik nog een keer';
      armed = window.setTimeout(() => {
        armed = 0;
        reset.textContent = 'Voortgang wissen';
      }, 4000);
      return;
    }
    clearTimeout(armed);
    armed = 0;
    deps.onReset();
    reset.textContent = 'Gewist';
  });

  overlay.replaceChildren(
    el('div', 'parent',
      el('header', '', el('h1', '', 'Ouderdeel'), el('div', 'header-buttons', deps.awake ? '' : wakeBtn, closeBtn)),
      el('p', 'muted', `Alles blijft op dit apparaat. De app verstuurt niets. Zolang dit scherm open is, staat de speeltijd stil.`),
      ...backupReminder(data, Date.now()),
      ...todaySection(data, domains, name),

      el('h2', '', `Waar ${name} mee bezig is`),
      el('p', 'muted', 'Iets nieuws begint met een proefje: drie moeilijke opdrachten. Lukken die meteen, dan gaat Fluffy door naar het volgende. Anders oefent ze, en gaat de app pas verder als het een paar keer goed gaat, verdeeld over minstens twee dagen of sessies. Wat al beheerst wordt, komt af en toe kort terug. Vind je het te makkelijk of te moeilijk? Zet het niveau dan zelf; daarna past de app het weer aan op hoe het gaat.'),
      busyNote,
      ...skills,

      ...strugglesSection(data, domains, name, Date.now()),

      el('h2', '', 'Laatste keren'),
      sessions.length ? el('ul', 'sessions', ...sessions) : el('p', 'muted', 'Nog niet gespeeld.'),

      el('h2', '', 'Instellingen'),
      row('Hoe lang per keer', minutes, 'Daarna maakt Fluffy de opdracht af en gaat slapen.'),
      row('Rustpauze na een sessie', rest, 'Zolang blijft Fluffy slapen.'),
      row('Maximaal per dag', maxPerDay),
      row('Volume', volume),
      row('Stem', voice, [
        deps.speech.clipCount ? `Fluffy praat met opnames (${deps.speech.clipCount} zinnen). Deze computerstem springt alleen in als een opname een keer niet laadt, en alleen met een stem die op dit apparaat zelf werkt (nooit online).` : '',
        voices.length ? 'Tip: download een "verbeterde" Nederlandse stem in Instellingen → Toegankelijkheid → Gesproken materiaal → Stemmen.' : 'Geen Nederlandse stem gevonden op dit apparaat.',
      ].join(' ').trim()),
      row('Stem testen', test),
      row('Samen spelen', together, 'Fluffy vraagt dan af en toe iets in het echt te doen ("Pak eens drie knuffels") en het aan jou te laten zien. Aan het eind zegt ze: "Vertel maar wat we gedaan hebben." Die tijd telt niet als schermtijd.'),
      row('Opdracht voor de rest van de dag', mission, 'Aan het eind geeft Fluffy één opdracht bij een gewoon moment van de dag ("Als je de trap op gaat: tel de treden"), met een plaatje als geheugensteun. Tikt ze op het plaatje, dan hoort ze de opdracht nog een keer. De volgende dag vraagt Fluffy ernaar. Niet gedaan is ook goed.'),
      row('Hoe noemt ze jou?', grownUp, 'Zo noemt Fluffy jou bij de samen-momenten.'),
      row('Rekenen of lezen', subject, 'Bij "laat haar kiezen" vraagt Fluffy het aan het begin, met twee plaatjes.'),
      startLevel ? row(`Startniveau ${startDomain!.name.toLowerCase()}`, startLevel, 'Wat hier "al gekund" wordt, controleert Fluffy nog even. Gaat dat mis, dan oefent ze het gewoon weer.') : '',
      row('Eerst kijken wat ze al kan', probe, 'Een nieuwe vaardigheid begint met drie moeilijke opdrachten. Doet ze die alle drie meteen zelf goed, dan slaat Fluffy die vaardigheid over; over een paar dagen komt hij terug ter controle. Gaat er één mis, dan doet Fluffy het voor en oefent ze vanaf het middelste niveau.'),
      row('Kan ze meer dan Fluffy denkt?', probeAgain, 'Alles waar ze nu mee oefent, begint opnieuw met een proefje. Wat ze al kan, blijft staan.'),
      row('Nieuwe sessie', allow, 'Slaat de rustpauze en het dagmaximum één keer over; Fluffy blijft slapen tot ze op het scherm tikt. Wil je meteen beginnen, gebruik dan "Fluffy wakker maken" bovenaan.'),
      row('Voortgang', reset, 'Begint helemaal opnieuw. Instellingen blijven bewaard.'),

      ...ownVoiceSection(deps.speech, deps.onOwnClip),
      ...listenSection(deps.speech, deps.onOwnClip),
      ...backupSection(data, deps.onRestore, deps.onChange),
      safety,
      ...privacySection(name),

      el('h2', '', 'Tips'),
      el('ul', 'sessions',
        el('li', '', 'Zet de app op het beginscherm (Deel → Zet op beginscherm). Dan werkt hij offline en blijft de voortgang bewaard.'),
        el('li', '', 'Zet Begeleide toegang aan (Instellingen → Toegankelijkheid). Dan blijft je kind in de app.'),
        el('li', '', 'Het mooiste is samen spelen met echte dingen. De tips "Zonder scherm" hierboven helpen daarbij.'),
        el('li', '', 'Zit er zo nu en dan bij. Praat over wat ze doet ("Hoe wist je dat?"), maar geef het antwoord niet voor. Kinderen leren het meest van een scherm als er iemand meekijkt en meepraat.'),
        el('li', '', 'Speel bordspellen met getallen, zoals ganzenbord of slangen en ladders. Zeg bij elke stap het getal hardop: dat helpt haar getalbegrip aantoonbaar (Ramani & Siegler, 2008).'),
        el('li', '', 'Lees elke dag samen voor en praat over het verhaal: wat gebeurt er, waarom, wat zou jij doen? Lezen is klanken én begrijpen. De app oefent alleen de klanken; woordenschat en begrip groeien vooral door samen voorlezen (Mol, Bus & de Jong, 2009).'),
      ),
    ),
  );
  overlay.scrollTop = 0;
}
