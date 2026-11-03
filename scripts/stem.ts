/**
 * Laat alle zinnen van Fluffy één keer inspreken door ElevenLabs en zet ze als mp3 in
 * public/audio/nl/. De app speelt die opnames daarna offline af; er gaat tijdens het spelen
 * niets naar buiten, en de API-sleutel komt nooit in de app of in git.
 *
 *   npm run stem -- --proef      laat zien wat er ingesproken wordt en hoeveel tekens dat kost
 *   npm run stem -- --stemmen    toont de stemmen in je ElevenLabs-account (met hun id)
 *   npm run stem -- --max 10     spreekt er maar 10 in (om de stem eerst te beluisteren)
 *   npm run stem                 spreekt alles in wat nieuw of veranderd is
 *   npm run stem -- --opnieuw    spreekt alles opnieuw in
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
import { rekenen } from '../src/domains/rekenen';

const DIR = join(process.cwd(), 'public', 'audio', 'nl');
const MANIFEST = join(DIR, 'manifest.json');
const FORMAT = 'mp3_44100_64';
const CONCURRENCY = 2;

interface Manifest {
  /** id → bestandsnaam */
  clips: Record<string, string>;
  /** id → hash, alleen voor opnames die dit script maakte */
  generated: Record<string, string>;
  voice?: string;
  model?: string;
}

const args = process.argv.slice(2);
const flag = (name: string) => args.includes(name);
const option = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

function env(): Record<string, string | undefined> {
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
    const data = JSON.parse(await readFile(MANIFEST, 'utf8')) as { clips?: unknown; generated?: Record<string, string> };
    const clips = Array.isArray(data.clips)
      ? Object.fromEntries((data.clips as string[]).map((id) => [id, `${id}.m4a`]))
      : ((data.clips as Record<string, string>) ?? {});
    return { clips, generated: data.generated ?? {} };
  } catch {
    return { clips: {}, generated: {} };
  }
}

async function writeManifest(m: Manifest): Promise<void> {
  const sorted = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(MANIFEST, JSON.stringify({ ...m, clips: sorted(m.clips), generated: sorted(m.generated) }, null, 1) + '\n');
}

function fail(msg: string): never {
  console.error(`\n✗ ${msg}\n`);
  process.exit(1);
}

async function listVoices(e: ReturnType<typeof env>): Promise<void> {
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

function settings(e: ReturnType<typeof env>) {
  return { stability: 0.55, similarity_boost: 0.8, style: 0.15, use_speaker_boost: true, speed: Number(e.speed) };
}

const hashOf = (job: ClipJob, e: ReturnType<typeof env>) =>
  createHash('sha1').update(JSON.stringify([job.text, job.before, job.after, e.voice, e.model, settings(e), FORMAT])).digest('hex').slice(0, 10);

const fileOf = (id: string, hash: string) => `${id.replace(/\+/g, '_')}.${hash}.mp3`;

async function speak(job: ClipJob, e: ReturnType<typeof env>): Promise<Buffer> {
  const body = {
    text: job.text,
    model_id: e.model,
    voice_settings: settings(e),
    ...(job.before ? { previous_text: job.before } : {}),
    ...(job.after ? { next_text: job.after } : {}),
  };
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${e.base}/v1/text-to-speech/${e.voice}?output_format=${FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': e.key!, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
      body: JSON.stringify(body),
    });
    if (res.ok) return Buffer.from(await res.arrayBuffer());
    const text = await res.text();
    if (res.status === 401 && /quota/i.test(text)) fail('Je tegoed bij ElevenLabs is op. Wat al klaar is, blijft bewaard; draai het script later opnieuw.');
    if (res.status === 401) fail('De API-sleutel klopt niet (ElevenLabs gaf 401).');
    if (res.status === 404) fail('Die stem bestaat niet in je account. Kijk met --stemmen welke id\'s er zijn.');
    if ((res.status === 429 || res.status >= 500) && attempt < 6) {
      const wait = Number(res.headers.get('retry-after')) * 1000 || 2000 * attempt;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    fail(`ElevenLabs gaf ${res.status} bij "${job.text}": ${text}`);
  }
}

async function main(): Promise<void> {
  const e = env();
  if (flag('--stemmen')) return listVoices(e);

  const jobs = clipJobs(rekenen.activities.flatMap((a) => a.phrases()));
  const m = await readManifest();
  const own = new Set(Object.keys(m.clips).filter((id) => !(id in m.generated)));
  const wanted = jobs.filter((j) => !own.has(j.id));
  const todo = wanted.filter((j) => {
    if (flag('--opnieuw')) return true;
    const h = hashOf(j, e);
    return m.generated[j.id] !== h || !existsSync(join(DIR, fileOf(j.id, h)));
  });
  const chars = (list: ClipJob[]) => list.reduce((n, j) => n + j.text.length, 0);

  console.log(`\n${jobs.length} opnames in totaal (${chars(jobs)} tekens).`);
  if (own.size) console.log(`${own.size} eigen opnames gaan voor en worden overgeslagen.`);
  console.log(`${todo.length} nieuw of veranderd (${chars(todo)} tekens).`);

  if (flag('--proef')) {
    for (const j of todo.slice(0, 25)) console.log(`  ${j.id}\n      "${j.text}"`);
    if (todo.length > 25) console.log(`  … en nog ${todo.length - 25}`);
    console.log('\nProefrun: er is niets naar ElevenLabs gestuurd.\n');
    return;
  }
  if (!e.key || !e.voice) fail('Zet ELEVENLABS_API_KEY en ELEVENLABS_VOICE_ID in .env.local (zie README).');

  const max = Number(option('--max')) || todo.length;
  const batch = todo.slice(0, max);
  let done = 0;
  const queue = [...batch];
  const worker = async () => {
    for (let job = queue.shift(); job; job = queue.shift()) {
      const h = hashOf(job, e);
      const file = fileOf(job.id, h);
      await writeFile(join(DIR, file), await speak(job, e));
      const old = m.clips[job.id];
      m.clips[job.id] = file;
      m.generated[job.id] = h;
      if (old && old !== file && existsSync(join(DIR, old))) await unlink(join(DIR, old));
      await writeManifest(m);
      done++;
      process.stdout.write(`\r${done}/${batch.length} ingesproken`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  // Opruimen: wat dit script ooit maakte maar niet meer nodig is.
  if (batch.length === todo.length) {
    const ids = new Set(jobs.map((j) => j.id));
    for (const id of Object.keys(m.generated)) {
      if (ids.has(id)) continue;
      const file = m.clips[id];
      if (file && existsSync(join(DIR, file))) await unlink(join(DIR, file));
      delete m.clips[id];
      delete m.generated[id];
    }
  }
  m.voice = e.voice;
  m.model = e.model;
  await writeManifest(m);
  console.log(`\n\nKlaar. ${done} opnames gemaakt (${chars(batch)} tekens).`);
  if (batch.length < todo.length) console.log(`Nog ${todo.length - batch.length} te gaan: draai het script nog een keer zonder --max.`);
  console.log('Beluister ze met "npm run dev". Tevreden? Commit en push public/audio/nl, dan staan ze online.\n');
}

void main();
