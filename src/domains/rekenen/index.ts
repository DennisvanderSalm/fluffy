import type { DomainModule } from '../../core/domain';
import { foutje } from './foutje';
import { kiekeboe } from './kiekeboe';
import { mandje } from './mandje';
import { REKEN_SKILLS, REKEN_START_LEVELS } from './skills';
import { tellen } from './tellen';

/** Domeinmodule rekenen. Nieuwe activiteiten worden hier aangemeld. */
export const rekenen: DomainModule = {
  id: 'rekenen',
  name: 'Rekenen',
  skills: REKEN_SKILLS,
  activities: [mandje, tellen, foutje, kiekeboe],
  startLevels: REKEN_START_LEVELS,
};
