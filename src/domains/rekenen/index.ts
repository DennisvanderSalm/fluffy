import type { DomainModule } from '../../core/domain';
import { mandje } from './mandje';
import { REKEN_SKILLS, REKEN_START_LEVELS } from './skills';

/** Domeinmodule rekenen. Nieuwe activiteiten worden hier aangemeld. */
export const rekenen: DomainModule = {
  id: 'rekenen',
  name: 'Rekenen',
  skills: REKEN_SKILLS,
  activities: [mandje],
  startLevels: REKEN_START_LEVELS,
};
