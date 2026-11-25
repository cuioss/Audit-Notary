import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { LOCAL_ACCOUNT, login, loginLocal } from './helpers/login.js';

/**
 * The phone layout (pm-web-app design, below 768 px): the rail gives way to the bottom bar with "More".
 */
test('the bottom bar replaces the rail and "More" holds the other lenses', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeHidden();
  await expect(page.getByTestId('bottom-nav-samm')).toBeVisible();
  await page.getByTestId('bottom-more').click();
  await page.getByRole('dialog').getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL('/settings');
  await expect(page.getByTestId('settings-view')).toBeVisible();
});

/**
 * The pages outside the shell and the notices of the shell at 390 px (UC-ACC-1, -2, -7): one column, nothing wider
 * than the screen, the acts reachable.
 */
test.describe('at 390 px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  /** Fails when the page scrolls sideways. */
  async function expectNoSideways(page) {
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  }

  test('the login page of local test accounts fits and logs in', async ({ page, request }) => {
    await useScenario(request, 'local');
    await page.goto('/login?return=%2Fsamm');
    await expect(page.getByTestId('login-view')).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    await expect(page.getByTestId('bottom-nav-samm')).toHaveCount(0);
    await expect(page.getByTestId('notice').first()).toContainText('local test accounts');
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'login (phone)');
    await page.getByTestId('login-username').fill(LOCAL_ACCOUNT.username);
    await page.getByTestId('login-password').fill(LOCAL_ACCOUNT.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/samm');
    await expect(page.getByTestId('bottom-nav-samm')).toBeVisible();
  });

  test('the signed-out page fits and its act is reachable', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await page.goto('/signed-out');
    await expect(page.getByTestId('signed-out-view')).toBeVisible();
    await expect(page.getByTestId('signed-out-login')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'signed-out (phone)');
  });

  for (const reason of ['idp-unavailable', 'too-many-logins', 'unknown-transaction']) {
    test(`the login problem ${reason} fits and its act is reachable`, async ({ page, request }) => {
      await useScenario(request, `login-trouble#${reason}`);
      await page.goto(`/login-problem?reason=${reason}`);
      await expect(page.getByTestId('login-problem-view')).toBeVisible();
      await expect(page.getByTestId('login-problem-retry')).toBeInViewport();
      await expectNoSideways(page);
      await expectNoSeriousViolations(page, `login-problem ${reason} (phone)`);
    });
  }

  test('the notice of local test accounts on a shell page fits', async ({ page, request }) => {
    await useScenario(request, 'local');
    await loginLocal(page, '/');
    await expect(page.getByTestId('notice').first()).toContainText('local test accounts');
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'local notice (phone)');
  });

  test('a session without a right shows the notice and the empty state', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'no-rights');
    await login(page, '/samm');
    await expect(page.getByTestId('no-rights-view')).toBeVisible();
    await expect(page.getByTestId('bottom-nav-samm')).toBeVisible();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'no rights (phone)');
  });
});
