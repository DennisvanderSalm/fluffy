/**
 * Laat alle zinnen van Fluffy één keer inspreken door ElevenLabs en zet ze als mp3 in
 * public/audio/nl/. De app speelt die opnames daarna offline af; er gaat tijdens het spelen
 * niets naar buiten, en de API-sleutel komt nooit in de app of in git.
 *
 *   npm run stem -- --proef      laat zien wat er ingesproken wordt en hoeveel tekens dat kost
 *   npm run stem -- --stemmen    toont de stemmen in je ElevenLabs-account (met hun id)
 *   npm run stem -- --max 10     spreekt er maar 10 in (om de stem eerst te beluisteren)
 *   npm run stem                 spreekt alles in wat nieuw of veranderd is, en controleert het
 *   npm run stem -- --opnieuw    spreekt alles opnieuw in
 *
 * Controle (zie hieronder):
 *   npm run stem -- --controle             alleen controleren, niets opnieuw inspreken
 *   npm run stem -- --herstel              controleren, en wat niet klopt opnieuw inspreken (tot 3 keer)
 *   npm run stem -- --afgekeurd id1,id2    deze opnames opnieuw inspreken (bv. de lijst "Klinkt niet
 *                                          goed" uit het ouderdeel), en dan controleren
 *
 * De controle meet elke opname op twee manieren:
 *   1. Afgekapt? Stopt het geluid midden in een klank ("ach" in plaats van "acht")?
 *   2. Klopt het woord? ElevenLabs Speech-to-Text schrijft de opname terug uit, en dat wordt
 *      vergeleken met de bedoelde tekst. Losse klanken (kl.*) kan spraakherkenning niet goed
 *      horen; die alleen op afkappen controleren en zelf beluisteren in het ouderdeel.
 * Uitslagen staan in scripts/controle.json, zodat alleen nieuwe opnames gecontroleerd worden.
 *
 * Instellingen in .env.local (staat in .gitignore):
 *   ELEVENLABS_API_KEY=...       verplicht
 *   ELEVENLABS_VOICE_ID=...      verplicht (zie --stemmen)
 *   ELEVENLABS_MODEL=eleven_multilingual_v2   (optioneel)
 *   ELEVENLABS_SPEED=0.95                     (optioneel, 0.7–1.2)
 *
 * Eigen opnames gaan voor: een id die al in manifest.json staat maar niet door dit script
 * gemaakt is, wordt overgeslagen.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { clipJobs, type ClipJob } from '../src/core/audio/phrases';
import { ALL_PHRASES } from '../src/domains';
import { decodeMp3, endLoudness, freeDecoder, ABRUPT } from './audio';
import { compareHeard, sttMode } from './vergelijk';

const DIR = join(process.cwd(), 'public', 'audio', 'nl');
const MANIFEST = join(DIR, 'manifest.json');
const RESULTS = join(process.cwd(), 'scripts', 'controle.json');
const FORMAT = 'mp3_44100_64';
const CONCURRENCY = 2;
const STT_CONCURRENCY = 4;
const MAX_TAKES = 3;

interface Manifest {
  /** id → bestandsnaam */
  clips: Record<string, string>;
  /** id → hash, alleen voor opnames die dit script maakte */
  generated: Record<string, string>;
  /** id → hoeveelste poging (alleen als een opname opnieuw moest) */
  takes: Record<string, number>;
  voice?: string;
  model?: string;
}

/** Uitslag van de controle van één opname (bestand), in scripts/controle.json. */
interface Verdict {
  file: string;
  ok: boolean;
  /** Stopt de opname midden in een klank? */
  abrupt: boolean;
  /** Wat spraakherkenning hoorde (leeg bij losse klanken en stukjes zin). */
  heard: string;
  /** Waarom het niet goed is. */
  reason?: string;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

type Env = ReturnType<typeof env>;

function env() {
  try {
    process.loadEnvFile('.env.local');
  } catch {
    /* geen .env.local */
  }
  return {
    key: process.env.ELEVENLABS_API_KEY,
    voice: process.env.ELEVENLABS_VOICE_ID,
    model: process.env.ELEVENLABS_MODEL || 'eleven_multilingual_v2',
    speed: process.env.ELEVENLABS_SPEED || '0.95',
    base: process.env.ELEVENLABS_URL || 'https://api.elevenlabs.io',
  };
}

async function readManifest(): Promise<Manifest> {
  try {
    const data = JSON.parse(await readFile(MANIFEST, 'utf8')) as Partial<Manifest> & { clips?: unknown };
    const clips = Array.isArray(data.clips)
      ? Object.fromEntries((data.clips as string[]).map((id) => [id, `${id}.m4a`]))
      : ((data.clips as Record<string, string>) ?? {});
    return { clips, generated: data.generated ?? {}, takes: data.takes ?? {}, voice: data.voice, model: data.model };
  } catch {
    return { clips: {}, generated: {}, takes: {} };
  }
}

const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));

async function writeManifest(m: Manifest): Promise<void> {
  await writeFile(MANIFEST, JSON.stringify({ ...m, clips: sorted(m.clips), generated: sorted(m.generated), takes: sorted(m.takes) }, null, 1) + '\n');
}

async function readResults(): Promise<Record<string, Verdict>> {
  try {
    return JSON.parse(await readFile(RESULTS, 'utf8')) as Record<string, Verdict>;
  } catch {
    return {};
  }
}

async function writeResults(r: Record<string, Verdict>): Promise<void> {
  await writeFile(RESULTS, JSON.stringify(sorted(r), null, 1) + '\n');
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function listVoices(e: Env): Promise<void> {
  if (!e.key) fail('Zet eerst ELEVENLABS_API_KEY in .env.local.');
  const res = await fetch(`${e.base}/v1/voices`, { headers: { 'xi-api-key': e.key! } });
  if (!res.ok) fail(`ElevenLabs gaf ${res.status}: ${await res.text()}`);
  const { voices } = (await res.json()) as { voices: { voice_id: string; name: string; labels?: Record<string, string> }[] };
  console.log('\nStemmen in je account (zet de id als ELEVENLABS_VOICE_ID in .env.local):\n');
  for (const v of voices) {
    const labels = Object.values(v.labels ?? {}).filter(Boolean).join(', ');
    console.log(`  ${v.voice_id}  ${v.name}${labels ? `  (${labels})` : ''}`);
  }
  console.log('\nEen stem uit de Voice Library moet je eerst toevoegen aan "My Voices".\n');
}

function settings(e: Env) {
  return { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: Number(e.speed) };
}

/** Een nieuwe poging krijgt een eigen hash (en dus bestandsnaam), zodat iPads hem ophalen. */
function hashOf(job: ClipJob, e: Env, take = 0): string {
  const parts: unknown[] = [job.text, job.before, job.after, e.voice, e.model, settings(e), FORMAT];
  if (take) parts.push(take);
  return createHash('sha1').update(JSON.stringify(parts)).digest('hex').slice(0, 10);
}

const fileOf = (id: string, hash: string) => `${id.replace(/\+/g, '_')}.${hash}.mp3`;

/** Wachten en opnieuw proberen bij drukte of storing bij ElevenLabs. */
async function request(e: Env, path: string, init: RequestInit, what: string): Promise<Response> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${e.base}${path}`, { ...init, headers: { 'xi-api-key': e.key!, ...init.headers } });
    if (res.ok) return res;
    const text = await res.text();
    if (res.status === 401 && /quota/i.test(text)) fail('Je tegoed bij ElevenLabs is op. Wat al klaar is, blijft bewaard; draai het script later opnieuw.');
    if (res.status === 401) fail('De API-sleutel klopt niet, of mag dit niet (ElevenLabs gaf 401). Voor de controle moet de sleutel ook Speech-to-Text mogen.');
    if (res.status === 404) fail('Die stem bestaat niet in je account. Kijk met --stemmen welke id\'s er zijn.');
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    fail(`ElevenLabs gaf ${res.status} bij ${what}: ${text}`);
  }
}

async function speak(job: ClipJob, e: Env, take: number): Promise<Buffer> {
  const body = {
    text: job.text,
    model_id: e.model,
    voice_settings: settings(e),
    ...(job.before ? { previous_text: job.before } : {}),
    ...(job.after ? { next_text: job.after } : {}),
    // Een nieuwe poging moet echt anders klinken.
    ...(take ? { seed: 1000 + take * 7919 } : {}),
  };
  const res = await request(e, `/v1/text-to-speech/${e.voice}?output_format=${FORMAT}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  }, `"${job.text}"`);
  return Buffer.from(await res.arrayBuffer());
}

/** Spraakherkenning: wat zegt deze opname? */
async function transcribe(file: string, e: Env): Promise<string> {
  const form = new FormData();
  form.append('model_id', 'scribe_v2');
  form.append('language_code', 'nl');
  form.append('tag_audio_events', 'false');
  form.append('timestamps_granularity', 'none');
  form.append('file', new Blob([new Uint8Array(await readFile(join(DIR, file)))], { type: 'audio/mpeg' }), file);
  const res = await request(e, '/v1/speech-to-text', { method: 'POST', body: form }, `de controle van ${file}`);
  return ((await res.json()) as { text?: string }).text?.trim() ?? '';
}

/** Een opname inspreken (poging `take`) en in het manifest zetten. */
async function record(job: ClipJob, e: Env, m: Manifest, take: number): Promise<void> {
  const h = hashOf(job, e, take);
  const file = fileOf(job.id, h);
  await writeFile(join(DIR, file), await speak(job, e, take));
  const old = m.clips[job.id];
  m.clips[job.id] = file;
  m.generated[job.id] = h;
  if (take) m.takes[job.id] = take;
  else delete m.takes[job.id];
  if (old && old !== file && existsSync(join(DIR, old))) await unlink(join(DIR, old));
  await writeManifest(m);
}

async function runPool<T>(items: T[], n: number, fn: (item: T) => Promise<void>): Promise<void> {
  const queue = [...items];
  await Promise.all(Array.from({ length: n }, async () => {
    for (let x = queue.shift(); x !== undefined; x = queue.shift()) await fn(x);
  }));
}

/** Controleert de opnames van `ids` die nog geen uitslag hebben (of een nieuw bestand). */
/** Oordeel op grond van de metingen (opnieuw te berekenen als de vergelijking verbetert). */
function judge(id: string, text: string, file: string, abrupt: boolean, heard: string): Verdict {
  const mode = sttMode(id, text);
  const match = mode === 'check' ? compareHeard(id, text, heard) : null;
  // Een stukje zin wordt nooit los afgespeeld: afgekapt maakt dan niet uit.
  const reasons = [...(abrupt && mode !== 'stukje' ? ['afgekapt'] : []), ...(match ? [match] : [])];
  return { file, ok: !reasons.length, abrupt, heard, ...(reasons.length ? { reason: reasons.join('; ') } : {}) };
}

/** Controleert de opnames van `ids`. Alleen nieuwe bestanden worden opnieuw gemeten. */
async function check(ids: string[], jobs: Map<string, ClipJob>, e: Env, m: Manifest, results: Record<string, Verdict>): Promise<void> {
  for (const id of ids) {
    const old = results[id];
    if (m.clips[id] && old?.file === m.clips[id]) {
      results[id] = judge(id, jobs.get(id)!.text, old.file, old.abrupt ?? /afgekapt/.test(old.reason ?? ''), old.heard);
    }
  }
  const todo = ids.filter((id) => m.clips[id] && results[id]?.file !== m.clips[id]);
  if (!todo.length) return writeResults(results);
  if (!e.key) fail('Zet ELEVENLABS_API_KEY in .env.local (zie README).');
  let done = 0;
  await runPool(todo, STT_CONCURRENCY, async (id) => {
    const file = m.clips[id];
    const text = jobs.get(id)!.text;
    const abrupt = endLoudness(await decodeMp3(join(DIR, file))) > ABRUPT;
    const heard = sttMode(id, text) === 'check' ? await transcribe(file, e) : '';
    results[id] = judge(id, text, file, abrupt, heard);
    done++;
    if (done % 10 === 0 || done === todo.length) {
      await writeResults(results);
      process.stdout.write(`\r${done}/${todo.length} gecontroleerd`);
    }
  });
  await writeResults(results);
  console.log('');
}

/** Wat niet klopt opnieuw inspreken en opnieuw controleren, tot MAX_TAKES pogingen. */
async function repair(jobs: Map<string, ClipJob>, e: Env, m: Manifest, results: Record<string, Verdict>, force: string[] = []): Promise<void> {
  let forced = new Set(force);
  for (let round = 1; round <= MAX_TAKES; round++) {
    const bad = [...jobs.keys()].filter((id) => m.generated[id] && (forced.has(id) || results[id]?.ok === false));
    const tryable = bad;
    if (!tryable.length) return;
    console.log(`\nRonde ${round}: ${tryable.length} opnieuw inspreken…`);
    await runPool(tryable, CONCURRENCY, (id) => record(jobs.get(id)!, e, m, (m.takes[id] ?? 0) + 1));
    forced = new Set();
    await check(tryable, jobs, e, m, results);
  }
}

function report(jobs: Map<string, ClipJob>, m: Manifest, results: Record<string, Verdict>): void {
  const ids = [...jobs.keys()].filter((id) => m.generated[id]);
  const bad = ids.filter((id) => results[id]?.file === m.clips[id] && !results[id].ok);
  const unchecked = ids.filter((id) => results[id]?.file !== m.clips[id]);
  const sounds = ids.filter((id) => sttMode(id, jobs.get(id)!.text) === 'klank');
  const pieces = ids.filter((id) => sttMode(id, jobs.get(id)!.text) === 'stukje');
  console.log(`\nControle: ${ids.length - bad.length - unchecked.length} van ${ids.length} opnames in orde.`);
  if (unchecked.length) console.log(`${unchecked.length} nog niet gecontroleerd (draai met --controle).`);
  if (bad.length) {
    console.log(`\n${bad.length} klinken nog niet goed. Beluister ze in het ouderdeel, en spreek ze zo nodig zelf in:\n`);
    for (const id of bad) console.log(`  ${id}\n      bedoeld:  "${jobs.get(id)!.text}"\n      probleem: ${results[id].reason}${results[id].heard ? `\n      gehoord:  "${results[id].heard}"` : ''}`);
  }
  if (sounds.length) console.log(`\nLosse klanken (${sounds.length}) kan spraakherkenning niet beoordelen; die zijn alleen op afkappen gecontroleerd.`);
  if (pieces.length) console.log(`Stukjes zin (${pieces.length}) zegt de app alleen binnen een hele zin; die hele zinnen zijn wel gecontroleerd.`);
}

async function main(): Promise<void> {
  const e = env();
  if (flag('--stemmen')) return listVoices(e);

  const jobList = clipJobs(ALL_PHRASES());
  const jobs = new Map(jobList.map((j) => [j.id, j]));
  const m = await readManifest();
  const results = await readResults();
  const own = new Set(Object.keys(m.clips).filter((id) => !(id in m.generated)));
  const wanted = jobList.filter((j) => !own.has(j.id));
  const todo = wanted.filter((j) => {
    if (flag('--opnieuw')) return true;
    const h = hashOf(j, e, m.takes[j.id]);
    return m.generated[j.id] !== h || !existsSync(join(DIR, fileOf(j.id, h)));
  });
  const chars = (list: ClipJob[]) => list.reduce((n, j) => n + j.text.length, 0);

  console.log(`\n${jobList.length} opnames in totaal (${chars(jobList)} tekens).`);
  if (own.size) console.log(`${own.size} eigen opnames gaan voor en worden overgeslagen.`);
  console.log(`${todo.length} nieuw of veranderd (${chars(todo)} tekens).`);

  if (flag('--proef')) {
    for (const j of todo.slice(0, 25)) console.log(`  ${j.id}\n      "${j.text}"${j.before ? `   (na "${j.before}")` : ''}`);
    if (todo.length > 25) console.log(`  … en nog ${todo.length - 25}`);
    console.log('\nProefrun: er is niets naar ElevenLabs gestuurd.\n');
    return;
  }
  if (!e.key || !e.voice) fail('Zet ELEVENLABS_API_KEY en ELEVENLABS_VOICE_ID in .env.local (zie README).');

  const generatedIds = () => [...jobs.keys()].filter((id) => m.generated[id]);
  if (flag('--controle')) {
    await check(generatedIds(), jobs, e, m, results);
    report(jobs, m, results);
    await freeDecoder();
    return;
  }

  const max = Number(option('--max')) || todo.length;
  const batch = todo.slice(0, max);
  if (batch.length) {
    let done = 0;
    await runPool(batch, CONCURRENCY, async (job) => {
      // Veranderde tekst: weer bij poging 0 beginnen.
      await record(job, e, m, flag('--opnieuw') ? 0 : (m.takes[job.id] ?? 0));
      done++;
      process.stdout.write(`\r${done}/${batch.length} ingesproken`);
    });
    console.log(`\n${done} opnames gemaakt (${chars(batch)} tekens).`);
  }

  // Opruimen: wat dit script ooit maakte maar niet meer nodig is.
  if (batch.length === todo.length) {
    for (const id of Object.keys(m.generated)) {
      if (jobs.has(id)) continue;
      const file = m.clips[id];
      if (file && existsSync(join(DIR, file))) await unlink(join(DIR, file));
      delete m.clips[id];
      delete m.generated[id];
      delete m.takes[id];
      delete results[id];
    }
  }
  m.voice = e.voice;
  m.model = e.model;
  await writeManifest(m);

  // Controleren wat nieuw is; met --herstel of --afgekeurd ook opnieuw inspreken wat niet klopt.
  const rejected = (option('--afgekeurd') ?? '').split(/[\s,]+/).filter(Boolean);
  const unknown = rejected.filter((id) => !m.generated[id]);
  if (unknown.length) console.log(`\nOnbekend of eigen opname, overgeslagen: ${unknown.join(', ')}`);
  await check(batch.map((j) => j.id), jobs, e, m, results);
  if (flag('--herstel') || rejected.length) {
    await check(generatedIds(), jobs, e, m, results);
    await repair(jobs, e, m, results, rejected.filter((id) => m.generated[id]));
  }
  report(jobs, m, results);
  await freeDecoder();
  if (batch.length < todo.length) console.log(`Nog ${todo.length - batch.length} te gaan: draai het script nog een keer zonder --max.`);
  console.log('\nBeluister ze met "npm run dev". Tevreden? Commit en push public/audio/nl, dan staan ze online.\n');
}

void main();
