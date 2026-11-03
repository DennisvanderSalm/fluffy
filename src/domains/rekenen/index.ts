import type { DomainModule } from '../../core/domain';
import { cijfer } from './cijfer';
import { foutje } from './foutje';
import { kiekeboe } from './kiekeboe';
import { mandje } from './mandje';
import { meer } from './meer';
import { pad } from './pad';
import { REKEN_SKILLS, REKEN_START_LEVELS } from './skills';
import { tellen } from './tellen';
import { woont } from './woont';

/** Domeinmodule rekenen. Nieuwe activiteiten worden hier aangemeld. */
export const rekenen: DomainModule = {
  id: 'rekenen',
  name: 'Rekenen',
  skills: REKEN_SKILLS,
  activities: [mandje, tellen, foutje, kiekeboe, meer, cijfer, pad, woont],
  startLevels: REKEN_START_LEVELS,
};
