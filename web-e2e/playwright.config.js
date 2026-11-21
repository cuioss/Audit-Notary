import { defineConfig, devices } from '@playwright/test';
import { BASE_URL, PORTS_ASSIGNED, WEB_PORT, MOCK_PORT } from './tests/helpers/ports.js';

/**
 * The end-to-end suite (doc/specification/testing.adoc): the Vite dev server of web-app, whose `/api` and
 * `/mock` go to web-mock, which the global setup starts. One worker: the mock is one shared instance whose
 * profile the tests switch.
 */
export default defineConfig({
  testDir: './tests',
  outputDir: `${process.env.PLAYWRIGHT_OUTPUT_DIR ?? 'target'}/test-results`,
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { outputFolder: 'target/playwright-report', open: 'never' }]],
  globalSetup: './global-setup.js',
  use: {
    baseURL: BASE_URL,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: `npm run dev --prefix ../web-app -- --port ${WEB_PORT} --strictPort`,
    url: BASE_URL,
    env: { TRAILHAND_WEB_PORT: String(WEB_PORT), TRAILHAND_MOCK_PORT: String(MOCK_PORT) },
    reuseExistingServer: !process.env.CI && !PORTS_ASSIGNED,
    timeout: 60_000,
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /mobile\.spec\.js/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.js/ },
  ],
});
