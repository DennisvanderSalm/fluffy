import type { DomainModule } from '../../core/domain';
import { cijfer } from './cijfer';
import { foutje } from './foutje';
import { kiekeboe } from './kiekeboe';
import { mandje } from './mandje';
import { meer } from './meer';
import { pad } from './pad';
import { patroon } from './patroon';
import { ruimte } from './ruimte';
import { rekenrek } from './rekenrek';
import { splitshuis } from './splitshuis';
import { sommen } from './sommen';
import { tientallen } from './tientallen';
import { REKEN_SKILLS, REKEN_START_LEVELS } from './skills';
import { tellen } from './tellen';
import { verhaal } from './verhaal';
import { vormen } from './vormen';
import { woont } from './woont';

/** Plaatje voor de keuze aan het begin: blokken met 1, 2, 3 en stippen. */
const ICON = `<svg viewBox="0 0 200 160">
  ${[['1', '#8dbbe6', '#5a8fc4'], ['2', '#f8de7e', '#ddbb52'], ['3', '#f5b7c8', '#d98aa0']].map(([n, fill, edge], i) => `
  <rect x="${12 + i * 62}" y="${86 - i * 26}" width="54" height="54" rx="12" fill="${fill}" stroke="${edge}" stroke-width="5"/>
  <text x="${39 + i * 62}" y="${125 - i * 26}" text-anchor="middle" font-size="38" font-weight="800" fill="#3b4a6b" font-family="ui-rounded, system-ui, sans-serif">${n}</text>`).join('')}
</svg>`;

/** Domeinmodule rekenen. Nieuwe activiteiten worden hier aangemeld. */
export const rekenen: DomainModule = {
  id: 'rekenen',
  name: 'Rekenen',
  skills: REKEN_SKILLS,
  activities: [mandje, tellen, foutje, kiekeboe, meer, cijfer, pad, woont, rekenrek, splitshuis, verhaal, sommen, tientallen, patroon, ruimte, vormen],
  startLevels: REKEN_START_LEVELS,
  icon: ICON,
  choice: ['keuze.vak.rekenen'],
  endPraise: ['einde.lof.precies'],
};
