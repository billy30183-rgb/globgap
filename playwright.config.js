import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './test/browser', workers: 1, timeout: 20000,
  use: { baseURL: process.env.LIVE_URL || 'http://127.0.0.1:4173/globgap/', browserName: 'chromium', headless: true },
  webServer: process.env.LIVE_URL ? undefined : { command: 'node scripts/serve.js', url: 'http://127.0.0.1:4173/globgap/', reuseExistingServer: !process.env.CI }
});
