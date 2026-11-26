import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';
import { BASE_URL, MOCK_PORT, MOCK_URL, PORTS_ASSIGNED } from './tests/helpers/ports.js';

/**
 * Starts web-mock through its own script (web-mock/start.sh, profile workshop, timing ordered) unless one
 * already answers on the port, warms the Vite dev server up, and stops the mock again after the suite.
 */
const WEB_MOCK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'web-mock');

async function mockAnswers() {
  try {
    const response = await fetch(`${MOCK_URL}/mock/state`);
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Loads the two entrances of the app once, in a browser, and waits until each has drawn itself: the page of the local
 * login (outside the shell) and the shell at the start address (through the login of the mock). The dev server of Vite
 * transforms a module on its first request, and the first page asks for about 700 of them, so a cold start answers the
 * first page of the first test late. The first test of a run would then wait for its redirect to `/login` longer than
 * its timeout, on a busy machine more often than on an idle one. Waiting here, for the real pages and not for a
 * duration, takes that cost out of every test; the tests themselves keep their own short timeouts.
 *
 * A failure, the launch of the browser included, is a warning and not an error: the suite then runs as before, and the
 * tests say what is wrong.
 *
 * @param config the resolved configuration of the run; its first project says how the browser is launched
 */
async function warmUpApp(config) {
  let browser;
  try {
    browser = await chromium.launch(config.projects[0]?.use?.launchOptions ?? {});
    const page = await browser.newPage({ baseURL: BASE_URL });
    // The page that shows itself decides: the login page, or the shell when the profile signs in without a form.
    const drawn = page.getByTestId('login-view').or(page.getByTestId('view-title'));
    await page.goto('/login');
    await drawn.waitFor({ timeout: WARM_UP_TIMEOUT });
    await page.goto(`/api/v1/auth/login?return=${encodeURIComponent('/')}`);
    await drawn.waitFor({ timeout: WARM_UP_TIMEOUT });
  } catch (error) {
    console.warn(`web-e2e: the warm-up of the app failed (${error.message.split('\n')[0]})`);
  } finally {
    // A failure to close is as little fatal as a failure to launch: the browser is only there for the warm-up.
    await browser?.close().catch(() => {});
  }
}

/** How long the warm-up waits for a page to draw itself: far above a cold start, far below the run's own limit. */
const WARM_UP_TIMEOUT = 120_000;

export default async function globalSetup(config) {
  if (await mockAnswers()) {
    if (PORTS_ASSIGNED || process.env.CI) {
      throw new Error(`a server already answers on the assigned mock port ${MOCK_PORT}`);
    }
    console.info(`web-e2e: reusing the mock server on ${MOCK_URL}`);
    await warmUpApp(config);
    return () => {};
  }
  execFileSync(
    path.join(WEB_MOCK, 'start.sh'),
    ['-s', 'workshop', '-p', String(MOCK_PORT), '-t', 'ordered'],
    {
      stdio: 'inherit',
    },
  );
  await warmUpApp(config);
  return () => {
    execFileSync(path.join(WEB_MOCK, 'stop.sh'), [], { stdio: 'inherit' });
  };
}
