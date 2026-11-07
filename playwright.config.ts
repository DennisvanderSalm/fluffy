import { defineConfig, devices } from '@playwright/test';

/**
 * Proef in WebKit, de motor van Safari op de iPad (de gewone tests draaien in Node, en in de
 * ontwikkelbrowser is het Chrome). Draait tegen de gebouwde versie: eerst `npm run build`.
 */
export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'line' : 'list',
  use: { ...devices['iPad (gen 7) landscape'], baseURL: 'http://localhost:4173/' },
  projects: [{ name: 'webkit', use: { browserName: 'webkit' } }],
  webServer: {
    command: 'npx vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173/',
    reuseExistingServer: !process.env.CI,
  },
});
