import { expect, test } from '@playwright/test';
import { acts, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { LOCAL_ACCOUNT, login, loginLocal } from './helpers/login.js';

/**
 * Access (UC-ACC-1, -2, -3, -6, -7): the login of local test accounts and with the identity provider, the pages
 * outside the shell, the notices of the shell, a session without rights, the replaced and the ended session, and the
 * step-up of a release. The mock stands in for the server and the identity provider (web-mock/README.adoc).
 */
const SESSION_COOKIE = 'audit-notary-mock-session';
const LOCAL_NOTICE = 'This installation uses local test accounts';
const NO_RIGHTS_NOTICE = 'Your organisation has not granted you access yet';
const RELEASE = '/samm/payments/2026-q4/release';
const RELEASE_ENDPOINT = '/api/v1/releases/samm-assessments/payments-2026-q4';

/** @returns the notice of the page that carries the given title */
function noticeTitled(page, title) {
  return page.getByTestId('notice').filter({ hasText: title });
}

test.describe('login with local test accounts (UC-ACC-1, UC-ACC-7)', () => {
  test.beforeEach(async ({ request }) => {
    await useScenario(request, 'local');
  });

  test('a deep link without session leads to the login page and returns to the same address', async ({
    page,
  }) => {
    await page.goto('/samm/payments/2026-q4');
    await expect(page).toHaveURL(/\/login\?return=%2Fsamm%2Fpayments%2F2026-q4$/);
    await expect(page.getByTestId('login-view')).toBeVisible();
    await expect(page.getByTestId('view-title')).toHaveCount(0);
    await page.getByTestId('login-username').fill(LOCAL_ACCOUNT.username);
    await page.getByTestId('login-password').fill(LOCAL_ACCOUNT.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/samm/payments/2026-q4');
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText('Signed in as Alex Example');
    const cookies = await page.context().cookies();
    expect(cookies.map((cookie) => cookie.name)).toEqual([SESSION_COOKIE]);
    expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  });

  test('a wrong password says so, keeps the username and clears the password', async ({
    page,
    request,
  }) => {
    await clearActs(request);
    await page.goto('/login?return=%2Fsamm');
    await page.getByTestId('login-username').fill(LOCAL_ACCOUNT.username);
    await page.getByTestId('login-password').fill('not-the-password');
    await page.getByTestId('login-submit').click();
    await expect(noticeTitled(page, 'The username or the password is wrong.')).toBeVisible();
    await expect(page).toHaveURL(/\/login\?return=%2Fsamm$/);
    await expect(page.getByTestId('login-username')).toHaveValue(LOCAL_ACCOUNT.username);
    await expect(page.getByTestId('login-password')).toHaveValue('');
    expect(await page.context().cookies()).toEqual([]);
    // The password is never recorded, and the right one then signs in.
    expect(JSON.stringify(await acts(request))).not.toContain('not-the-password');
    await page.getByTestId('login-password').fill(LOCAL_ACCOUNT.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/samm');
    await expect(page.getByTestId('samm-overview')).toBeVisible();
  });

  test('empty fields are named before anything is sent', async ({ page }) => {
    await page.goto('/login');
    await page.getByTestId('login-submit').click();
    await expect(page.getByText('Fill in this field.')).toHaveCount(2);
    await expect(page).toHaveURL('/login');
    expect(await page.context().cookies()).toEqual([]);
  });

  test('a return address that is no canonical address leads to the start page', async ({
    page,
  }) => {
    await page.goto('/login?return=//evil.example/x');
    await page.getByTestId('login-username').fill(LOCAL_ACCOUNT.username);
    await page.getByTestId('login-password').fill(LOCAL_ACCOUNT.password);
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('due-view')).toBeVisible();
  });

  test('the notice of local test accounts stands on the login page and on every shell page', async ({
    page,
  }) => {
    await page.goto('/login');
    await expect(noticeTitled(page, LOCAL_NOTICE)).toHaveCount(1);
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    await loginLocal(page, '/');
    await expect(noticeTitled(page, LOCAL_NOTICE)).toHaveCount(1);
    await page.getByTestId('nav-samm').click();
    await expect(page.getByTestId('samm-overview')).toBeVisible();
    await expect(noticeTitled(page, LOCAL_NOTICE)).toHaveCount(1);
    await page.goto('/settings');
    await expect(page.getByTestId('settings-view')).toBeVisible();
    await expect(noticeTitled(page, LOCAL_NOTICE)).toHaveCount(1);
  });

  test('a session ends at the provider-less login: no session, back at the login page', async ({
    page,
  }) => {
    await loginLocal(page, '/');
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL(/\/signed-out$/);
    await page.getByTestId('signed-out-login').click();
    await expect(page).toHaveURL(/\/login\?return=%2F$/);
    await expect(page.getByTestId('login-view')).toBeVisible();
  });
});

test.describe('login with the identity provider (UC-ACC-1)', () => {
  test.beforeEach(async ({ request }) => {
    await useScenario(request, 'workshop');
  });

  test('the login page only passes through to the provider and back to the return address', async ({
    page,
  }) => {
    const start = page.waitForRequest((request) =>
      request.url().includes('/api/v1/auth/login?return=%2Fsamm'),
    );
    await page.goto('/login?return=%2Fsamm');
    await start;
    await expect(page).toHaveURL('/samm');
    await expect(page.getByTestId('samm-overview')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText('Signed in as Alex Example');
    await expect(page.getByTestId('login-username')).toHaveCount(0);
    await expect(noticeTitled(page, LOCAL_NOTICE)).toHaveCount(0);
  });

  test('a login page with a return address that is no canonical address returns to the start page', async ({
    page,
  }) => {
    await page.goto('/login?return=https%3A%2F%2Fevil.example%2F');
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('due-view')).toBeVisible();
  });
});

test.describe('a session without a right (UC-ACC-7)', () => {
  test.beforeEach(async ({ request }) => {
    await useScenario(request, 'no-rights');
  });

  test('the shell says so and shows the empty state in place of every repository view', async ({
    page,
  }) => {
    await login(page, '/samm');
    await expect(noticeTitled(page, NO_RIGHTS_NOTICE)).toHaveCount(1);
    await expect(noticeTitled(page, NO_RIGHTS_NOTICE)).toContainText(
      'none of your groups gives you a right on a repository',
    );
    const view = page.getByTestId('no-rights-view');
    await expect(view).toBeVisible();
    await expect(view).toContainText('Nothing to show without access');
    await expect(page.getByTestId('samm-overview')).toHaveCount(0);
    // The shell stays: navigation and the way out.
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
    await expect(page.getByTestId('sign-out')).toBeVisible();
    await page.getByTestId('nav-threat-models').click();
    await expect(page.getByTestId('no-rights-view')).toBeVisible();
    await expect(noticeTitled(page, NO_RIGHTS_NOTICE)).toHaveCount(1);
  });

  test('the start page and the settings work, and no request the server refuses is made', async ({
    page,
  }) => {
    const refused = [];
    page.on('response', (response) => {
      if (response.url().includes('/api/v1/') && response.status() === 403) {
        refused.push(response.url());
      }
    });
    await login(page, '/');
    await expect(page.getByTestId('no-rights-view')).toBeVisible();
    await page.goto('/samm/payments/2026-q4');
    await expect(page.getByTestId('no-rights-view')).toBeVisible();
    await page.goto('/settings');
    await expect(page.getByTestId('settings-view')).toBeVisible();
    await expect(noticeTitled(page, NO_RIGHTS_NOTICE)).toHaveCount(1);
    expect(refused).toEqual([]);
  });

  test('another profile with rights shows no such notice', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await expect(page.getByTestId('due-view')).toBeVisible();
    await expect(noticeTitled(page, NO_RIGHTS_NOTICE)).toHaveCount(0);
  });
});

test.describe('the login does not work (UC-ACC-1)', () => {
  const REASONS = [
    {
      state: 'idp-unavailable',
      title: 'The login service of your organisation cannot be reached',
      body: 'Try again in a few minutes.',
      tone: 'danger',
    },
    {
      state: 'too-many-logins',
      title: 'Many people are logging in right now',
      body: 'Try again in a minute.',
      tone: 'attention',
    },
    {
      state: 'unknown-transaction',
      title: 'The login took too long or was interrupted',
      body: 'Start the login again.',
      tone: 'attention',
    },
  ];

  for (const { state, title, body, tone } of REASONS) {
    test(`${state}: the browser lands on the page that names the reason, and Try again recovers`, async ({
      page,
      request,
    }) => {
      await useScenario(request, `login-trouble#${state}`);
      await page.goto('/api/v1/auth/login?return=%2Fsamm');
      await expect(page).toHaveURL(`/login-problem?reason=${state}`);
      const view = page.getByTestId('login-problem-view');
      await expect(view).toBeVisible();
      await expect(view.getByRole('heading', { level: 1 })).toHaveText('The login did not work');
      const notice = view.getByTestId('notice');
      await expect(notice).toHaveCount(1);
      await expect(notice).toHaveAttribute('data-tone', tone);
      await expect(notice.locator('strong')).toHaveText(title);
      await expect(notice).toContainText(body);
      await expect(notice).toHaveAttribute('role', tone === 'danger' ? 'alert' : 'status');
      // No shell, no session.
      await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
      expect(await page.context().cookies()).toEqual([]);
      // The one act starts the login again with return=/ ; once the login works it signs in.
      const retry = page.getByTestId('login-problem-retry');
      await expect(retry).toHaveText('Try again');
      await expect(retry).toHaveAttribute('href', '/api/v1/auth/login?return=%2F');
      await gotoState(request, 'recovered');
      await retry.click();
      await expect(page).toHaveURL('/');
      await expect(page.getByTestId('due-view')).toBeVisible();
    });
  }

  test('a reason the page does not know, or none, is the general failure', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'login-trouble#recovered');
    for (const address of ['/login-problem?reason=surprise', '/login-problem']) {
      await page.goto(address);
      const notice = page.getByTestId('login-problem-view').getByTestId('notice');
      await expect(notice.locator('strong')).toHaveText('The login could not be completed');
    }
  });

  test('a client that is no browser gets the outcome as JSON, not a redirect', async ({
    request,
  }) => {
    await useScenario(request, 'login-trouble#idp-unavailable');
    const response = await request.get('/api/v1/auth/login?return=%2F', {
      headers: { Accept: 'application/json' },
      maxRedirects: 0,
    });
    expect(response.status()).toBe(502);
    expect(await response.json()).toMatchObject({ outcome: 'IDENTITY_PROVIDER_UNAVAILABLE' });
  });
});

test.describe('logout (UC-ACC-2)', () => {
  test.beforeEach(async ({ request }) => {
    await useScenario(request, 'workshop');
  });

  test('logout lands on the signed-out page, which opens without a session and Log in returns', async ({
    page,
  }) => {
    await login(page, '/samm');
    await page.getByTestId('sign-out').click();
    await expect(page).toHaveURL('/signed-out');
    const view = page.getByTestId('signed-out-view');
    await expect(view.getByRole('heading', { level: 1 })).toHaveText('You are signed out');
    await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0);
    expect(await page.context().cookies()).toEqual([]);
    expect((await page.request.get('/api/v1/session')).status()).toBe(401);
    // Opening the page again needs no session and creates none.
    await page.reload();
    await expect(view).toBeVisible();
    expect(await page.context().cookies()).toEqual([]);
    // The one act: log in again, at the start page.
    const act = page.getByTestId('signed-out-login');
    await expect(act).toHaveText('Log in');
    await act.click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('due-view')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText('Signed in as Alex Example');
  });
});

test.describe('the session changes under an open tab (UC-ACC-6)', () => {
  /** @returns the anti-CSRF token of the session the browser holds */
  async function csrfToken(page) {
    return (await (await page.request.get('/api/v1/session')).json()).csrfToken;
  }

  test('a replaced session reloads the tab, which then holds the new session', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/samm/payments/2026-q4');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
    const before = await csrfToken(page);
    await page.evaluate(() => {
      window.__beforeReplacement = true;
    });
    const reloaded = page.waitForEvent('load');
    await gotoState(request, 'session-replaced');
    await reloaded;
    await expect(page).toHaveURL('/samm/payments/2026-q4');
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    await expect(page.getByTestId('user-name')).toHaveText('Signed in as Alex Example');
    expect(await page.evaluate(() => window.__beforeReplacement)).toBeUndefined();
    const after = await csrfToken(page);
    expect(after).not.toBe(before);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
  });

  test('an ended session leaves for the login and comes back to the same address', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/samm/payments/2026-q4');
    await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
    const cookieBefore = (await page.context().cookies())[0].value;
    const refused = page.waitForResponse(
      (response) => response.url().endsWith('/api/v1/session') && response.status() === 401,
    );
    await gotoState(request, 'session-ended');
    await refused;
    // The mock's login signs in again at once; the tab is back at its address with another session.
    await expect(page).toHaveURL('/samm/payments/2026-q4');
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    await expect
      .poll(async () => (await page.context().cookies()).map((cookie) => cookie.value))
      .not.toContain(cookieBefore);
  });
});

test.describe('step-up of a release (UC-ACC-3)', () => {
  test('a local user is asked for the password: Cancel sends nothing, an empty field is named', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release#password');
    await clearActs(request);
    await login(page, RELEASE);
    await page.getByTestId('release-act').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Confirm your identity' })).toBeVisible();
    await expect(dialog).toContainText('Enter your password to release');
    await dialog.getByTestId('release-confirm').click();
    await expect(dialog.getByText('Fill in this field.')).toBeVisible();
    await dialog.locator('form').getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    expect((await acts(request)).filter((act) => act.path === RELEASE_ENDPOINT)).toEqual([]);
  });

  test('the right password releases; the password is never recorded', async ({ page, request }) => {
    await useScenario(request, 'release#password');
    await clearActs(request);
    await login(page, RELEASE);
    await page.getByTestId('release-act').click();
    await page.getByTestId('release-password').fill('s3cret-pass');
    await page.getByTestId('release-confirm').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    const sent = (await acts(request)).filter((act) => act.path === RELEASE_ENDPOINT);
    expect(sent).toHaveLength(1);
    expect(JSON.stringify(sent)).not.toContain('s3cret-pass');
  });

  test('a wrong password keeps the dialog open and says so; nothing is released', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release#wrong-password');
    await login(page, RELEASE);
    await page.getByTestId('release-act').click();
    await page.getByTestId('release-password').fill('wrong');
    await page.getByTestId('release-confirm').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('The password is not right. Nothing was changed.');
    await expect(dialog).toBeVisible();
    await expect(page.getByTestId('release-done')).toHaveCount(0);
  });

  test('too many logins at the step-up show a notice and write nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release#too-many-logins');
    await login(page, RELEASE);
    const refused = page.waitForResponse(
      (response) => response.url().endsWith(RELEASE_ENDPOINT) && response.status() === 503,
    );
    await page.getByTestId('release-act').click();
    expect((await refused).headers()['retry-after']).toBe('60');
    const notice = noticeTitled(page, 'Many people are logging in right now');
    await expect(notice).toBeVisible();
    await expect(notice).toContainText('Try again in a minute.');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await expect(page).toHaveURL(RELEASE);
    // The control names the act only, never the mechanism.
    await expect(page.getByTestId('release-act')).toHaveText('Release');
  });
});
