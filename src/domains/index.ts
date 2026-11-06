import type { DomainModule } from '../core/domain';
import { lezen } from './lezen';
import { rekenen } from './rekenen';

/** Alle vakken. De volgorde is alleen de standaard; aan het begin kiest het kind (of de ouder). */
export const DOMAINS: DomainModule[] = [rekenen, lezen];

export const ALL_ACTIVITIES = DOMAINS.flatMap((d) => d.activities);
