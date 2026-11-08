import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { decodeMp3, endLoudness, freeDecoder, isAbrupt } from '../scripts/audio';
import { compareHeard, sttMode, words } from '../scripts/vergelijk';
import { clipJobs } from '../src/core/audio/phrases';
import { ALL_PHRASES } from '../src/domains';
import { flaggedCommand, parseFlagged, stillFlagged } from '../src/core/audio/flagged';

const DIR = join(process.cwd(), 'public', 'audio', 'nl');
const manifest = JSON.parse(readFileSync(join(DIR, 'manifest.json'), 'utf8')) as { clips: Record<string, string> };

const texts = new Map(clipJobs(ALL_PHRASES()).map((j) => [j.id, j.text]));

afterAll(freeDecoder);

describe('opnames', () => {
  it('geen opname die de app los afspeelt, stopt midden in een klank', async () => {
    const abrupt: string[] = [];
    for (const [id, file] of Object.entries(manifest.clips)) {
      // Stukjes zin ("en") speelt de app alleen binnen een hele zin, die apart is ingesproken.
      if (sttMode(id, texts.get(id) ?? '') === 'stukje') continue;
      const d = await decodeMp3(join(DIR, file));
      if (isAbrupt(d)) abrupt.push(`${id} (${endLoudness(d).toFixed(2)})`);
    }
    expect(abrupt).toEqual([]);
  }, 60_000);
});

describe('controle met spraakherkenning', () => {
  it('maakt teksten vergelijkbaar', () => {
    expect(words('Ja, het zijn er 4!')).toEqual(['ja', 'het', 'zijn', 'er', 'vier']);
    expect(words('Één.')).toEqual(['een']);
    expect(words('Vóór vier komt drie.')).toEqual(['voor', 'vier', 'komt', 'drie']);
  });

  it('keurt een goede opname goed, ook met cijfers of andere leestekens', () => {
    expect(compareHeard('getal.8', 'acht.', 'Acht.')).toBeNull();
    expect(compareHeard('getal.1', 'één.', '1')).toBeNull();
    expect(compareHeard('x', 'Dus het is er één.', 'Dus het is er een')).toBeNull();
    expect(compareHeard('rekt.maan', 'Mmmm… maan', 'mmm maan')).toBeNull();
    expect(compareHeard('rekt.maan', 'Mmmm… maan', 'Maan.')).toBeNull();
  });

  it('vindt een afgekapt of verkeerd woord', () => {
    expect(compareHeard('getal.8', 'acht.', 'Ach.')).toBe('ander woord');
    expect(compareHeard('getal.5', 'vijf.', 'five')).toBe('ander woord');
    expect(compareHeard('w.pet', 'pet', '')).toBe('niets verstaan');
    expect(compareHeard('rekt.vis', 'Vvvv… vis', 'vies')).toBe('ander woord');
  });

  it('is streng op getallen, ook in een lange zin', () => {
    const want = 'Drie en één erbij is vier.';
    expect(compareHeard('x', want, 'Drie en één erbij is vijf.')).toBe('ander getal');
    const long = 'Ik heb ze allemaal één keer aangewezen, en de getallen goed gezegd. Dus het klopte.';
    expect(compareHeard('x', long, 'Ik heb ze allemaal een keer aangewezen en de getallen goed gezegd, dus het klopt.')).toBeNull();
    expect(compareHeard('x', 'Kun je vier appels in het mandje doen?', 'Kun je vier appels in het mandje doen')).toBeNull();
    expect(compareHeard('x', 'Kun je vier appels in het mandje doen?', 'Kun je vier ballen in het mandje doen?')).toBe('andere woorden');
  });

  it('laat losse klanken over aan de ouder, en stukjes zin aan de hele zin', () => {
    expect(sttMode('kl.m', 'mmm')).toBe('klank');
    expect(sttMode('w.maan', 'maan')).toBe('check');
    expect(sttMode('getal.8', 'acht.')).toBe('check');
    expect(sttMode('tellen.tik.a', 'Kun jij de')).toBe('stukje');
    expect(sttMode('tellen.tik.a+getal.3+tellen.tik.b', 'Kun jij de drie aantikken?')).toBe('check');
    expect(sttMode('meer.uitleg', 'Tik op het bordje.')).toBe('check');
  });

  it('spaties tellen niet', () => {
    expect(compareHeard('obj.x', 'lieveheersbeestjes', 'Lieve heersbeestjes')).toBeNull();
  });
});

describe('"Klinkt niet goed" in het ouderdeel', () => {
  it('leest een opgeslagen lijst, en negeert rommel', () => {
    expect([...parseFlagged('{"getal.8":"getal.8.abc.mp3"}')]).toEqual([['getal.8', 'getal.8.abc.mp3']]);
    expect(parseFlagged('[1,2]').size).toBe(0);
    expect(parseFlagged('kapot').size).toBe(0);
    expect(parseFlagged(null).size).toBe(0);
    expect(parseFlagged('{"<script>":"x.mp3","w.vis":5}').size).toBe(0);
  });

  it('een markering valt weg als de opname vervangen is', () => {
    const flagged = new Map([['getal.8', 'oud.mp3'], ['w.vis', 'vis.mp3']]);
    const now: Record<string, string> = { 'getal.8': 'nieuw.mp3', 'w.vis': 'vis.mp3' };
    expect([...stillFlagged(flagged, (id) => now[id]).keys()]).toEqual(['w.vis']);
  });

  it('geeft een regel om ze opnieuw te laten inspreken', () => {
    expect(flaggedCommand(new Map([['w.vis', 'a'], ['getal.8', 'b']]))).toBe('npm run stem -- --afgekeurd getal.8,w.vis');
  });
});
