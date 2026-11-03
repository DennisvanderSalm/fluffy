import type { DomainModule } from '../../core/domain';
import { cijfer } from './cijfer';
import { foutje } from './foutje';
import { kiekeboe } from './kiekeboe';
import { mandje } from './mandje';
import { meer } from './meer';
import { REKEN_SKILLS, REKEN_START_LEVELS } from './skills';
import { tellen } from './tellen';

/** Domeinmodule rekenen. Nieuwe activiteiten worden hier aangemeld. */
export const rekenen: DomainModule = {
  id: 'rekenen',
  name: 'Rekenen',
  skills: REKEN_SKILLS,
  activities: [mandje, tellen, foutje, kiekeboe, meer, cijfer],
  startLevels: REKEN_START_LEVELS,
};
