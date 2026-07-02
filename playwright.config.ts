import { defineConfig } from '@playwright/test';

/**
 * E2E config for the Electron app.
 *
 * The app is launched per-spec through Playwright's Electron runner
 * (`_electron.launch` in test/e2e/helpers.ts), so there is no browser project,
 * no dev server, and no baseURL. `globalSetup` builds the app (dist/ +
 * dist-electron/) before any spec runs.
 */
export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Electron instances are heavy; run specs serially for stability.
  workers: 1,
  // Each test launches a fresh Electron app (cold start + WASM init), so allow
  // ample per-test time.
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: 'html',
  use: {
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
});
