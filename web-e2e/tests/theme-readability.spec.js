import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, useTheme } from './helpers/a11y.js';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * AUN-WEB-2: axe-core on every view in both themes; no violation of impact serious or critical.
 */
const VIEWS = [
  ['workshop', '/', 'due-view'],
  ['empty', '/', 'due-view'],
  ['workshop', '/samm/payments/2026-q4/sm', 'lens-view'],
  ['workshop', '/settings', 'settings-view'],
  ['workshop', '/no/such/view/at/all', 'not-found-view'],
  ['degraded', '/', 'due-view'],
  ['first-login', '/welcome', 'welcome-view'],
];

for (const theme of ['light', 'dark']) {
  for (const [scenario, address, view] of VIEWS) {
    test(`${view} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address === '/no/such/view/at/all' ? '/' : address);
      if (address === '/no/such/view/at/all') await page.goto(address);
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
