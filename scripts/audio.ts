/**
 * Opnames nameten zonder ze te beluisteren: mp3 decoderen en kijken of een opname midden in
 * een klank stopt (afgekapt). Gebruikt door `npm run stem -- --controle` en door de tests.
 */
import { readFile } from 'node:fs/promises';
import { MPEGDecoder } from 'mpg123-decoder';

export interface Decoded {
  samples: Float32Array;
  sampleRate: number;
}

let decoder: Promise<MPEGDecoder> | null = null;
/** Eén decoder, en één bestand tegelijk (de controle draait meerdere opnames tegelijk). */
let queue: Promise<unknown> = Promise.resolve();

export function decodeMp3(path: string): Promise<Decoded> {
  const run = queue.then(async () => {
    const data = new Uint8Array(await readFile(path));
    decoder ??= (async () => {
      const d = new MPEGDecoder();
      await d.ready;
      return d;
    })();
    const d = await decoder;
    await d.reset();
    const { channelData, sampleRate } = d.decode(data);
    return { samples: channelData[0], sampleRate };
  });
  queue = run.catch(() => undefined);
  return run;
}

export async function freeDecoder(): Promise<void> {
  await queue;
  (await decoder)?.free();
  decoder = null;
}

/** Hoe hard de laatste 30 ms nog zijn, vergeleken met het hardste stuk (0 = stil, 1 = even hard). */
export function endLoudness({ samples, sampleRate }: Decoded): number {
  const w = Math.round(sampleRate * 0.03);
  if (samples.length < 2 * w) return 0;
  const rms = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += samples[i] * samples[i];
    return Math.sqrt(s / (to - from));
  };
  let peak = 0;
  for (let i = 0; i + w <= samples.length; i += w) peak = Math.max(peak, rms(i, i + w));
  return peak ? rms(samples.length - w, samples.length) / peak : 0;
}

/** Boven deze waarde stopt een opname midden in een klank ("ach" in plaats van "acht"). */
export const ABRUPT = 0.15;

export const isAbrupt = (d: Decoded) => endLoudness(d) > ABRUPT;
