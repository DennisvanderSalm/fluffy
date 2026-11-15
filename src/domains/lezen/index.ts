import type { Seg } from '../../core/audio/speech';
import type { DomainModule } from '../../core/domain';
import { hakken, kortewoordjes, woordjes } from './hakken';
import { beginklank, phrasesFor, rijmen } from './klanken';
import { letterPhrases, letters } from './letters';
import { setClipCheck, wordLine, WORDS, type Word } from './plaatjes';
import { LEES_SKILLS, LEES_START_LEVELS } from './skills';

/** Plaatje voor de keuze aan het begin: een open boekje met een a en een b. */
const ICON = `<svg viewBox="0 0 200 160">
  <path d="M100 40 C80 26 46 24 18 32 V132 C46 124 80 126 100 140 Z" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5" stroke-linejoin="round"/>
  <path d="M100 40 C120 26 154 24 182 32 V132 C154 124 120 126 100 140 Z" fill="#fbf4e6" stroke="#d6ba8c" stroke-width="5" stroke-linejoin="round"/>
  <text x="58" y="100" text-anchor="middle" font-size="54" font-weight="800" fill="#d98670" font-family="ui-rounded, system-ui, sans-serif">a</text>
  <text x="142" y="100" text-anchor="middle" font-size="54" font-weight="800" fill="#5a8fc4" font-family="ui-rounded, system-ui, sans-serif">b</text>
</svg>`;

/** De hele zinnen waar een woord in zit, als alleen deze woorden meedoen. */
export const wordPhrases = (words: readonly Word[]): Seg[][] => [
  ...phrasesFor('rijm', words), ...phrasesFor('begin', words), ...letterPhrases(words),
];

/** Domeinmodule lezen (voorbereidend: klanken horen, letters, klanken plakken, eerste woordjes). */
export const lezen: DomainModule = {
  id: 'lezen',
  name: 'Lezen',
  skills: LEES_SKILLS,
  activities: [beginklank, rijmen, letters, hakken, woordjes, kortewoordjes],
  startLevels: LEES_START_LEVELS,
  icon: ICON,
  choice: ['keuze.vak.lezen'],
  endPraise: ['einde.lof.luisteren'],
  // Zijn er opnames van woorden, dan doen alleen woorden mee die Fluffy zelf kan zeggen.
  onClips: (hasClip) => {
    if (WORDS.some((w) => hasClip(wordLine(w)))) setClipCheck(hasClip);
  },
};
