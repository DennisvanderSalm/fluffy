import type { Seg } from '../core/audio/speech';
import type { DomainModule } from '../core/domain';
import { togetherPhrases } from '../core/ui/samen';
import { lezen } from './lezen';
import { rekenen } from './rekenen';

/** Alle vakken. De volgorde is alleen de standaard; aan het begin kiest het kind (of de ouder). */
export const DOMAINS: DomainModule[] = [rekenen, lezen];

export const ALL_ACTIVITIES = DOMAINS.flatMap((d) => d.activities);

/** Alle zinnen die als geheel ingesproken worden: van de activiteiten en van de kern. */
export const ALL_PHRASES = (): Seg[][] => [...ALL_ACTIVITIES.flatMap((a) => a.phrases()), ...togetherPhrases()];
