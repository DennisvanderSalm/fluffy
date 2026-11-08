import type { LineId } from '../../content/spraak.nl';
import type { Mission, SkillInfo, StartLevel } from '../../core/domain';

/**
 * Leerlijn voorbereidend lezen. De beginklank horen en letters koppelen aan klanken voorspellen
 * leren lezen het sterkst (National Early Literacy Panel, 2008; Hulme e.a., 2002), en werken het
 * best samen (Bus & van IJzendoorn, 1999). Rijmen voorspelt weinig en is daarom een opwarmer,
 * geen voorwaarde. Woorden in lettergrepen klappen is weggelaten: dat voegt weinig toe.
 * De volgorde in deze lijst is ook de voorrang: de beginklank komt eerst aan bod.
 */
const d = 'lezen';

export const LEES_SKILLS: SkillInfo[] = [
  {
    id: 'beginklank', domain: d, requires: [], levels: 3, stage: 1,
    name: 'Beginklank horen',
    about: 'Horen dat woorden hetzelfde beginnen: maan en muis, vis en voet. Na het antwoord ziet ze de letter erbij.',
    offScreen: '"Ik zie, ik zie wat jij niet ziet, en het begint als… mmmelk." Rek de eerste klank lekker uit.',
  },
  {
    id: 'rijmen', domain: d, requires: [], levels: 3, stage: 1,
    name: 'Rijmen horen',
    about: 'Horen dat woorden aan het eind hetzelfde klinken: huis en muis. Een leuke opwarmer; voor leren lezen telt de beginklank zwaarder.',
    offScreen: 'Rijmspelletjes in de auto of bij het eten: "Wat rijmt op boom?" Onzinwoorden mogen ook: boom, toom, loom!',
  },
  {
    id: 'letters', domain: d, requires: ['beginklank'], levels: 3, stage: 2,
    name: 'Letters en klanken',
    about: 'Weten welke letter bij een klank hoort: maan begint met de m. Fluffy zegt de klank, niet de letternaam ("mmm", niet "em").',
    offScreen: 'Zoek de letters van haar naam op pakken in de supermarkt, en zeg de klank: "Kijk, de mmm van melk!"',
  },
  {
    id: 'hakken', domain: d, requires: ['beginklank'], levels: 3, stage: 3,
    name: 'Hakken en plakken',
    about: 'Losse klanken samenvoegen tot een woord: m-aa-n wordt maan. Eerst alleen luisteren, later met de letters erbij.',
    offScreen: '"Ik zie een p-oe-s." Kan zij raden welk woord je bedoelt? Zeg de klanken, niet de letternamen.',
  },
  {
    id: 'woordjes', domain: d, requires: ['hakken', 'letters'], levels: 3, stage: 4,
    name: 'Eerste woordjes lezen',
    about: 'Korte woordjes zelf lezen: ze tikt op de letters, hoort de klanken en plakt ze aan elkaar (m-aa-n, maan).',
    offScreen: 'Schrijf korte woordjes (vis, maan, roos) op briefjes en leg ze bij het echte ding.',
  },
  {
    id: 'woordjes-kort', domain: d, requires: ['woordjes'], levels: 3, stage: 5,
    name: 'Korte woordjes lezen',
    about: 'Woordjes met een korte klank lezen, zoals vis, pet en jas (groep 3). Woorden die maar één letter verschillen (pop en kop) staan naast elkaar, zodat ze elke letter echt leest.',
    offScreen: 'Leg letters neer (van een spel of op briefjes): p-e-t. Zeg samen de klanken en plak ze aan elkaar. Wissel dan één letter: pet wordt pot.',
  },
];

/** Opdrachten in het echt per vaardigheid (zie core/ui/samen.ts). */
const TASKS: Record<string, LineId[]> = {
  beginklank: ['echt.beginklank', 'echt.beginklank.b', 'echt.beginklank.c'],
  rijmen: ['echt.rijmen', 'echt.rijmen.b', 'echt.rijmen.c'],
  letters: ['echt.letters', 'echt.letters.b', 'echt.letters.c'],
  hakken: ['echt.hakken', 'echt.hakken.b', 'echt.hakken.c'],
  woordjes: ['echt.woordjes', 'echt.woordjes.b'],
  'woordjes-kort': ['echt.woordjes-kort', 'echt.woordjes-kort.b'],
};
for (const s of LEES_SKILLS) s.realTasks = TASKS[s.id];

/** Opdracht voor de rest van de dag, bij een moment van de dag (zie core/ui/missie.ts). */
const MISSIONS: Record<string, Mission[]> = {
  beginklank: [{ line: 'missie.beginklank.a', moment: 'tafel' }, { line: 'missie.beginklank.b', moment: 'buiten' }],
  rijmen: [{ line: 'missie.rijmen.a', moment: 'bed' }, { line: 'missie.rijmen.b', moment: 'bad' }],
  letters: [{ line: 'missie.letters.a', moment: 'onderweg' }, { line: 'missie.letters.b', moment: 'keuken' }],
  hakken: [{ line: 'missie.hakken.a', moment: 'tafel' }, { line: 'missie.hakken.b', moment: 'bed' }],
  woordjes: [{ line: 'missie.woordjes.a', moment: 'keuken' }, { line: 'missie.woordjes.b', moment: 'bed' }],
  'woordjes-kort': [{ line: 'missie.woordjes-kort.a', moment: 'bed' }, { line: 'missie.woordjes-kort.b', moment: 'keuken' }],
};
for (const s of LEES_SKILLS) s.missions = MISSIONS[s.id];

/** Bij lezen begint iedereen bij het begin; er valt nog niets aan te nemen. */
export const LEES_START_LEVELS: StartLevel[] = [{ id: 'lezen-begin', label: 'Begint met klanken', assumed: [] }];
