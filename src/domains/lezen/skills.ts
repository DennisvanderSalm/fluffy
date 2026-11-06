import type { SkillInfo, StartLevel } from '../../core/domain';

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
    about: 'Losse klanken samenvoegen tot een woord (m-aa-n wordt maan) en een woord in klanken hakken.',
    offScreen: '"Ik zie een v-i-s." Kan zij raden welk woord je bedoelt?',
  },
  {
    id: 'woordjes', domain: d, requires: ['hakken', 'letters'], levels: 3, stage: 4,
    name: 'Eerste woordjes lezen',
    about: 'Korte woordjes lezen door de klanken achter elkaar te zeggen: m-aa-n, maan.',
    offScreen: 'Schrijf korte woordjes (vis, maan, roos) op briefjes en leg ze bij het echte ding.',
  },
];

/** Bij lezen begint iedereen bij het begin; er valt nog niets aan te nemen. */
export const LEES_START_LEVELS: StartLevel[] = [{ id: 'lezen-begin', label: 'Begint met klanken', assumed: [] }];
