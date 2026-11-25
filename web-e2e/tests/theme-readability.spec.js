import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, useTheme } from './helpers/a11y.js';
import { useScenario } from './helpers/mock.js';
import { login, loginLocal } from './helpers/login.js';

/**
 * AUN-WEB-2: axe-core on every view in both themes; no violation of impact serious or critical.
 */
const VIEWS = [
  ['workshop', '/', 'due-view'],
  ['empty', '/', 'due-view'],
  ['workshop', '/samm', 'samm-overview'],
  ['workshop', '/samm/payments', 'scope-sheet'],
  ['workshop', '/samm/payments/2026-q4', 'assessment-sheet'],
  ['workshop', '/samm/payments/2026-q4/sm', 'practice-sheet'],
  ['read-only', '/samm/payments/2026-q4/sm', 'practice-sheet'],
  ['release', '/samm/payments/2026-q4/release', 'release-view'],
  ['workshop', '/threat-models', 'lens-view'],
  ['workshop', '/settings', 'settings-view'],
  ['workshop', '/no/such/view/at/all', 'not-found-view'],
  ['degraded', '/', 'due-view'],
  ['first-login', '/welcome', 'welcome-view'],
  // The notice of local test accounts on a shell page, and a session without a right (UC-ACC-7).
  ['local', '/', 'due-view'],
  ['no-rights', '/', 'no-rights-view'],
  ['no-rights', '/samm', 'no-rights-view'],
];

/** The pages outside the shell: no login, no shell (UC-ACC-1, UC-ACC-2). */
const OUTSIDE_VIEWS = [
  ['local', '/login', 'login-view'],
  ['workshop', '/signed-out', 'signed-out-view'],
  ['login-trouble#idp-unavailable', '/login-problem?reason=idp-unavailable', 'login-problem-view'],
  ['login-trouble#too-many-logins', '/login-problem?reason=too-many-logins', 'login-problem-view'],
  [
    'login-trouble#unknown-transaction',
    '/login-problem?reason=unknown-transaction',
    'login-problem-view',
  ],
  ['login-trouble#recovered', '/login-problem', 'login-problem-view'],
];

for (const theme of ['light', 'dark']) {
  for (const [scenario, address, view] of VIEWS) {
    test(`${view} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await (scenario === 'local' ? loginLocal : login)(
        page,
        address === '/no/such/view/at/all' ? '/' : address,
      );
      if (address === '/no/such/view/at/all') await page.goto(address);
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `${view} (${scenario}, ${theme})`);
    });
  }
}

for (const theme of ['light', 'dark']) {
  for (const [scenario, address, view] of OUTSIDE_VIEWS) {
    test(`${view} outside the shell of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await page.goto(address);
      await expect(page.getByTestId(view)).toBeVisible();
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `${view} (${scenario}, ${theme})`);
    });
  }
}

test('the command palette passes the audit', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await page.getByTestId('search-open').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
  await expectNoSeriousViolations(page, 'command palette');
});
