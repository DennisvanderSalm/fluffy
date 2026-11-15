import { describe, expect, it } from 'vitest';
import { Progress } from '../src/core/session/progress';
import { emptyData } from '../src/core/storage/store';
import { DOMAINS } from '../src/domains';

describe('voortgang', () => {
  it('kent elke vaardigheid en vindt de activiteiten erbij', () => {
    const p = new Progress(DOMAINS, emptyData());
    for (const d of DOMAINS) {
      for (const a of d.activities) {
        expect(p.activity(a.id)).toBe(a);
        for (const s of a.skills) expect(p.activitiesFor(s)).toContain(a);
      }
      for (const s of d.skills) expect(p.byId.get(s.id)).toBe(s);
    }
    expect(p.stateOf('bestaat-niet').status).toBe('new');
  });

  it('een beginniveau zet wat ze al kan op beheerst, en laat de rest staan', () => {
    const data = emptyData();
    const p = new Progress(DOMAINS, data);
    const level = DOMAINS.flatMap((d) => d.startLevels).find((l) => l.assumed.length > 0)!;
    p.applyStartLevel(level.id);
    expect(data.startLevelApplied).toBe(level.id);
    for (const id of level.assumed) expect(p.stateOf(id).status).toBe('mastered');
    expect(Object.keys(data.skills)).toHaveLength(level.assumed.length);
    p.applyStartLevel('bestaat-niet');
    expect(data.startLevelApplied).toBe(level.id);
  });

  it('een proefje begint alleen bij iets nieuws, en alleen als de ouder dat wil', () => {
    const data = emptyData();
    const p = new Progress(DOMAINS, data);
    const skill = DOMAINS[0].skills[0].id;
    data.settings.probe = false;
    p.maybeProbe(skill);
    expect(data.skills[skill]).toBeUndefined();
    data.settings.probe = true;
    p.maybeProbe(skill);
    expect(p.stateOf(skill).probe === undefined).toBe(false);
  });
});
