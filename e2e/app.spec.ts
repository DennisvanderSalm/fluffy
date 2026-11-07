import { cp, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

/**
 * De belangrijkste paden in WebKit (Safari): een sessie starten, het ouderdeel openen, de
 * voortgang bewaren, en offline werken. Spraak gaat in deze proef razendsnel (nep-stem, geen
 * opnames), anders duurt elke sessie minuten.
 */

const WORDS = ['', 'één', 'twee', 'drie', 'vier', 'vijf', 'zes', 'zeven', 'acht', 'negen'];

async function fastSpeech(page: Page, keepClips = false): Promise<void> {
  await page.addInitScript(() => {
    const fake = {
      speaking: false,
      pending: false,
      cancel() {},
      getVoices: () => [],
      speak(u: { onend?: (() => void) | null }) {
        setTimeout(() => u.onend?.(), 5);
      },
      addEventListener() {},
    };
    Object.defineProperty(window, 'speechSynthesis', { value: fake, configurable: true });
    if (!('SpeechSynthesisUtterance' in window)) {
      (window as unknown as Record<string, unknown>).SpeechSynthesisUtterance = class { constructor(public text: string) {} };
    }
  });
  // Geen opnames: dan zegt Fluffy alles met de (nep-)computerstem.
  if (!keepClips) await page.route('**/audio/nl/manifest.json', (r) => r.fulfill({ json: { clips: {} } }));
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function openParentArea(page: Page): Promise<void> {
  const gear = page.locator('.gear');
  const box = (await gear.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(2300);
  await page.mouse.up();
  const words = (await page.locator('.lock-words').textContent())!.split(' – ');
  for (const w of words) await page.locator('.lock-pad button', { hasText: String(WORDS.indexOf(w)) }).click();
  await expect(page.getByRole('heading', { name: 'Ouderdeel' })).toBeVisible();
}

test.describe('zonder service worker', () => {
  test.use({ serviceWorkers: 'block' });

  test('sessie starten: begroeting, vak kiezen, eerste spelletje', async ({ page }) => {
    const errors = collectErrors(page);
    await fastSpeech(page);
    await page.goto('./');
    await page.mouse.click(400, 300);
    const cards = page.locator('.keuze .k-card');
    await expect(cards).toHaveCount(2, { timeout: 15_000 });
    await cards.first().click();
    // Na de keuze staat er een spelletje op het scherm.
    await expect(page.locator('.stage > :not(.keuze)').first()).toBeVisible({ timeout: 15_000 });
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fluffy.v1') ?? 'null'));
    expect(saved.sessions).toHaveLength(1);
    expect(saved.sessions[0].domain).toBeTruthy();

    // De voortgang overleeft herladen.
    await page.reload();
    const again = await page.evaluate(() => JSON.parse(localStorage.getItem('fluffy.v1') ?? 'null'));
    expect(again.sessions).toHaveLength(1);
    expect(errors).toEqual([]);
  });

  test('ouderdeel: slot, opnames beluisteren, opslag en versie', async ({ page }) => {
    const errors = collectErrors(page);
    await fastSpeech(page, true);
    await page.goto('./');
    await openParentArea(page);
    await expect(page.getByRole('heading', { name: 'Opnames beluisteren' })).toBeVisible();
    await page.locator('details.listen summary', { hasText: 'Losse klanken' }).click();
    await expect(page.locator('details.listen[open] .listen-row').first()).toBeVisible();
    await expect(page.getByText(/Deze versie is van/)).toBeVisible();
    await page.getByRole('button', { name: 'Terug naar Fluffy' }).click();
    await expect(page.locator('.overlay')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
});

/** Een eigen kleine webserver voor dist/, die de test halverwege echt uitzet. */
interface DistServer {
  url: string;
  /** Welke paden de server heeft uitgeleverd. */
  log: string[];
  /** Vanaf nu een andere map uitleveren (een "nieuwe versie"). */
  root: string;
  stop(): Promise<void>;
}

async function serveDist(override: Record<string, string> = {}): Promise<DistServer> {
  const types: Record<string, string> = {
    '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
    '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.png': 'image/png', '.svg': 'image/svg+xml',
  };
  const out = { log: [] as string[], root: 'dist' };
  const server = createServer(async (req, res) => {
    const path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    out.log.push(path);
    if (path in override) {
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(override[path]);
    }
    const file = join(out.root, path.endsWith('/') ? `${path}index.html` : path);
    try {
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': types[extname(file)] ?? 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  // Poort 0: een vrije poort, en dus ook elke keer een schone browseropslag.
  await new Promise<void>((r) => server.listen(0, r));
  const { port } = server.address() as { port: number };
  return Object.assign(out, {
    url: `http://localhost:${port}/`,
    stop: () => new Promise<void>((r) => {
      server.closeAllConnections();
      server.close(() => r());
    }),
  });
}

test('offline: na het eerste bezoek werkt alles zonder internet, met alle opnames', async ({ page }) => {
  // Alle opnames (zo'n 18 MB) gaan eerst de offline-opslag in.
  test.setTimeout(120_000);
  const server = await serveDist();
  try {
    await page.goto(server.url);
    const expected = await page.evaluate(async () => {
      const m = await (await fetch('audio/nl/manifest.json')).json();
      return new Set(Object.values(m.clips as Record<string, string>)).size;
    });
    // (Kan even herladen als er nog een oudere versie van een vorige proef klaarstond.)
    await expect.poll(() => page.evaluate(async () => {
      await navigator.serviceWorker.ready;
      const keys = await caches.keys();
      const audio = (await (await caches.open('fluffy-audio')).keys()).length;
      return keys.some((k) => k.startsWith('fluffy-app-')) && audio;
    }), { timeout: 60_000 }).toBe(expected);
  } finally {
    await server.stop();
  }

  // De server is weg: wat nu nog werkt, komt uit de offline-opslag.
  await page.reload();
  await expect(page.locator('.gear')).toBeVisible();
  const clip = await page.evaluate(async () => {
    const m = await (await fetch('audio/nl/manifest.json')).json();
    const res = await fetch(`audio/nl/${m.clips['getal.3']}`);
    return { ok: res.ok, size: (await res.arrayBuffer()).byteLength };
  });
  expect(clip.ok).toBe(true);
  expect(clip.size).toBeGreaterThan(1000);
});

test('nieuwe versie: opnames blijven staan, en overschakelen gebeurt op het startscherm', async ({ page }) => {
  test.setTimeout(120_000);
  // "Versie 2": dezelfde bestanden, maar een andere app-opslag (zoals na een codewijziging).
  const v2 = test.info().outputPath('dist-v2');
  await rm(v2, { recursive: true, force: true });
  await cp('dist', v2, { recursive: true });
  const sw = await readFile(join(v2, 'sw.js'), 'utf8');
  await writeFile(join(v2, 'sw.js'), sw.replace(/const APP = "fluffy-app-[^"]+"/, 'const APP = "fluffy-app-v2"'));

  const server = await serveDist();
  try {
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    server.root = v2;
    server.log.length = 0;
    // Kan halverwege herladen (dat is juist de bedoeling), dus fouten hier negeren.
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update()).catch(() => undefined);
    // Fluffy staat op het startscherm: de nieuwe versie wordt meteen geladen (herladen).
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).sort()).catch(() => null), { timeout: 30_000 })
      .toEqual(['fluffy-app-v2', 'fluffy-audio']);
    await expect(page.locator('.gear')).toBeVisible();
    // Geen enkele opname opnieuw opgehaald.
    expect(server.log.filter((p) => p.endsWith('.mp3'))).toEqual([]);
  } finally {
    await server.stop();
  }
});

test('nieuwe versie: tijdens een sessie wacht hij', async ({ page }) => {
  test.setTimeout(120_000);
  const v2 = test.info().outputPath('dist-v2');
  await rm(v2, { recursive: true, force: true });
  await cp('dist', v2, { recursive: true });
  const sw = await readFile(join(v2, 'sw.js'), 'utf8');
  await writeFile(join(v2, 'sw.js'), sw.replace(/const APP = "fluffy-app-[^"]+"/, 'const APP = "fluffy-app-v2"'));

  // Zonder opnames (manifest leeg), zodat de nep-stem de sessie snel laat lopen.
  const server = await serveDist({ '/audio/nl/manifest.json': '{"clips":{}}' });
  try {
    await fastSpeech(page, true);
    await page.goto(server.url);
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
    const before = await page.evaluate(async () => (await caches.keys()).find((k) => k.startsWith('fluffy-app-')));

    await page.mouse.click(400, 300);
    await expect(page.locator('.keuze .k-card')).toHaveCount(2, { timeout: 15_000 });
    server.root = v2;
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistration())!.update());
    await expect.poll(() => page.evaluate(async () => !!(await navigator.serviceWorker.getRegistration())!.waiting), { timeout: 30_000 })
      .toBe(true);
    await page.waitForTimeout(1500);
    // Nog steeds de oude versie, en de sessie loopt gewoon door.
    expect(await page.evaluate(async () => (await caches.keys()).includes('fluffy-app-v2'))).toBe(true);
    expect(await page.evaluate(async () => (await caches.keys()).find((k) => k.startsWith('fluffy-app-') && k !== 'fluffy-app-v2'))).toBe(before);
    await expect(page.locator('.keuze .k-card')).toHaveCount(2);
  } finally {
    await server.stop();
  }
});
