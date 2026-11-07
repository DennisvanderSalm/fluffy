import { readFileSync } from 'node:fs';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

// Strenge Content-Security-Policy: de browser blokkeert elke verbinding naar buiten.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "connect-src 'self'",
  "font-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

// Bestanden uit public/ die altijd offline beschikbaar moeten zijn.
const PUBLIC_FILES = [
  'manifest.webmanifest',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/apple-touch-icon.png',
  'audio/nl/manifest.json',
];

/**
 * De opnames die de app gebruikt (volgens manifest.json), zodat Fluffy ook offline met de goede
 * stem praat. De bestandsnamen bevatten een hash van de tekst: een naam verandert alleen als de
 * opname verandert. Daardoor kunnen ze bewaard blijven als de app een nieuwe versie krijgt.
 */
function audioFiles(): string[] {
  try {
    const clips = JSON.parse(readFileSync('public/audio/nl/manifest.json', 'utf8')).clips as Record<string, string>;
    return [...new Set(Object.values(clips))].sort().map((f) => `audio/nl/${f}`);
  } catch {
    return [];
  }
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/**
 * Service worker (wordt sw.js). Twee opslagen:
 * - fluffy-app-<hash>: de app zelf (klein), per versie opnieuw;
 * - fluffy-audio: de opnames (groot), blijft staan. Bij een nieuwe versie komen alleen nieuwe
 *   opnames erbij, en wat weg mag gaat eruit. Valt het internet halverwege weg, dan blijft wat
 *   al binnen is bewaard en gaat de volgende poging verder waar hij was.
 * Een nieuwe versie wacht tot de app zegt dat het kan ('activeer'): nooit midden in een sessie.
 */
function serviceWorker(appCache: string, appFiles: string[], audio: string[]): string {
  return `// Gegenereerd bij de build. Cachet alleen eigen bestanden; niets gaat naar buiten.
const APP = ${JSON.stringify(appCache)};
const AUDIO = 'fluffy-audio';
const APP_FILES = ${JSON.stringify(appFiles)};
const AUDIO_FILES = ${JSON.stringify(audio)};
const abs = (f) => new URL(f, self.registration.scope).href;
const ours = (k) => k.startsWith('fluffy-');
// Opslag van vóór de splitsing ('fluffy-<hash>', met alles erin).
const isOldStyle = (k) => ours(k) && k !== AUDIO && !k.startsWith('fluffy-app-');

async function fillAudio() {
  const cache = await caches.open(AUDIO);
  const have = new Set((await cache.keys()).map((r) => r.url));
  const todo = AUDIO_FILES.filter((f) => !have.has(abs(f)));
  if (!todo.length) return;
  const old = await Promise.all((await caches.keys()).filter(isOldStyle).map((k) => caches.open(k)));
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const f = todo[next++];
      let res;
      for (const c of old) if (!res) res = await c.match(abs(f));
      for (let t = 0; !res && t < 3; t++) {
        try {
          const r = await fetch(f);
          if (r.ok) res = r;
        } catch (_) { /* nog een keer */ }
      }
      if (!res) throw new Error('Opname niet binnengekomen: ' + f);
      await cache.put(abs(f), res);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
}

self.addEventListener('install', (e) => {
  e.waitUntil((async () => {
    await fillAudio();
    const app = await caches.open(APP);
    // 'reload': nooit een oude index.html uit de browsercache, die past niet bij de nieuwe bestanden.
    await app.addAll(APP_FILES.map((f) => new Request(f, { cache: 'reload' })));
    // Overstap van de oude versie: die kent 'activeer' nog niet, dus dan meteen.
    if ((await caches.keys()).some(isOldStyle)) await self.skipWaiting();
  })());
});

self.addEventListener('message', (e) => {
  if (e.data === 'activeer') self.skipWaiting();
});

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (ours(k) && k !== APP && k !== AUDIO) await caches.delete(k);
    const cache = await caches.open(AUDIO);
    const keep = new Set(AUDIO_FILES.map(abs));
    for (const r of await cache.keys()) if (!keep.has(r.url)) await cache.delete(r);
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  e.respondWith(
    caches.match(e.request, { ignoreSearch: true }).then((hit) => {
      if (hit) return hit;
      if (e.request.mode === 'navigate') return caches.match(abs('./'));
      return fetch(e.request).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(url.pathname.includes('/audio/') ? AUDIO : APP).then((c) => c.put(e.request, copy));
        }
        return res;
      });
    }),
  );
});
`;
}

/** Schrijft sw.js met een precache-lijst van alle gebouwde bestanden. */
function offlinePlugin(): Plugin {
  return {
    name: 'fluffy-offline',
    apply: 'build',
    transformIndexHtml(html) {
      return html.replace(
        '<!--CSP-->',
        `<meta http-equiv="Content-Security-Policy" content="${CSP}">`,
      );
    },
    generateBundle(_options, bundle) {
      const appFiles = ['./', ...Object.keys(bundle), ...PUBLIC_FILES];
      const audio = audioFiles();
      // De manifest zit in de app-opslag; verandert er een opname, dan dus ook de app-versie.
      const appCache = 'fluffy-app-' + hash([...appFiles, ...audio].join('|'));
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: serviceWorker(appCache, appFiles, audio) });
    },
  };
}

export default defineConfig({
  base: './',
  // Wanneer deze versie gebouwd is (voor het ouderdeel).
  define: { __BUILD_TIME__: JSON.stringify(new Date().toISOString()) },
  plugins: [offlinePlugin()],
  build: { target: 'safari15', assetsInlineLimit: 0 },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
