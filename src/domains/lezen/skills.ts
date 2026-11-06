import type { SkillInfo, StartLevel } from '../../core/domain';

/**
 * Leerlijn voorbereidend lezen. Bij een vierjarige gaat het eerst om klanken horen
 * (fonologisch bewustzijn), nog niet om letters: van grote stukken (rijm) naar kleine
 * (beginklank, losse klanken), en pas daarna letters koppelen aan klanken
 * (National Early Literacy Panel, 2008; Ehri, 2005).
 */
const d = 'lezen';

export const LEES_SKILLS: SkillInfo[] = [
  {
    id: 'rijmen', domain: d, requires: [], levels: 3, stage: 1,
    name: 'Rijmen horen',
    about: 'Horen dat woorden aan het eind hetzelfde klinken: huis en muis, beer en veer.',
    offScreen: 'Rijmspelletjes in de auto of bij het eten: "Wat rijmt op boom?" Onzinwoorden mogen ook: boom, toom, loom!',
  },
  {
    id: 'beginklank', domain: d, requires: [], levels: 3, stage: 1,
    name: 'Beginklank horen',
    about: 'Horen dat woorden hetzelfde beginnen: maan en muis, vis en voet.',
    offScreen: '"Ik zie, ik zie wat jij niet ziet, en het begint als… mmmelk." Rek de eerste klank lekker uit.',
  },
  {
    id: 'klappen', domain: d, requires: ['rijmen'], levels: 3, stage: 2,
    name: 'Woorden in stukjes klappen',
    about: 'Een woord in klankgroepen verdelen: o-li-fant, drie klappen.',
    offScreen: 'Klap samen de namen van iedereen in het gezin. Wie heeft de langste naam?',
  },
  {
    id: 'hakken', domain: d, requires: ['beginklank'], levels: 3, stage: 3,
    name: 'Hakken en plakken',
    about: 'Losse klanken samenvoegen tot een woord (m-aa-n wordt maan) en een woord in klanken hakken.',
    offScreen: '"Ik zie een v-i-s." Kan zij raden welk woord je bedoelt?',
  },
  {
    id: 'letters', domain: d, requires: ['beginklank'], levels: 3, stage: 4,
    name: 'Letters en klanken',
    about: 'Weten welke klank bij een letter hoort: de m zegt mmm.',
    offScreen: 'Zoek de eerste letter van haar naam op pakken in de supermarkt.',
  },
  {
    id: 'woordjes', domain: d, requires: ['hakken', 'letters'], levels: 3, stage: 5,
    name: 'Eerste woordjes lezen',
    about: 'Korte woordjes lezen door de klanken achter elkaar te zeggen: m-aa-n, maan.',
    offScreen: 'Schrijf korte woordjes (vis, maan, roos) op briefjes en leg ze bij het echte ding.',
  },
];

/** Bij lezen begint iedereen bij het begin; er valt nog niets aan te nemen. */
export const LEES_START_LEVELS: StartLevel[] = [{ id: 'lezen-begin', label: 'Begint met klanken', assumed: [] }];
