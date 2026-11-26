import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { LOCAL_ACCOUNT, login, loginLocal } from './helpers/login.js';
import { NOTES, field, loginToDocuments, noteAddress } from './helpers/documents.js';

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

  test('the documents list fits, and the act to start a document is reachable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, '/categories/test-note');
    await expect(page.getByTestId('document-list')).toBeVisible();
    await expect(page.getByTestId('new-document')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'documents list (phone)');
  });

  test('a document sheet fits, and saving and its steps are reachable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, noteAddress(NOTES.N2));
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    await expect(page.getByTestId('save-everyone')).toBeInViewport();
    await page.getByTestId('transition-test-note.submit').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('transition-test-note.submit')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document sheet (phone)');
  });

  test('the table of a document fits, and its row editor is a dialog in the viewport', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, noteAddress(NOTES.N2));
    await page.getByTestId('table--actions').getByRole('button', { name: 'Add row' }).click();
    await expect(page.getByRole('dialog')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document row editor (phone)');
  });

  test('the conflict panel fits, and each field can be decided', async ({ page, request }) => {
    await useScenario(request, 'workshop#note-conflict');
    await loginToDocuments(page, noteAddress(NOTES.N2));
    await field(page, '/status').getByRole('combobox').selectOption({ label: 'Agreed' });
    await field(page, '/summary').getByRole('textbox').fill('Rotate every 90 days.');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('conflict-panel')).toBeVisible();
    await expect(page.getByTestId('keep-own-/summary')).toBeVisible();
    await page.getByTestId('keep-own-/summary').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('keep-own-/summary')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document conflict (phone)');
  });

  test('the list of empty mandatory fields fits, and leads back to editing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, noteAddress(NOTES.N3));
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByTestId('missing-fields')).toBeVisible();
    await expect(page.getByTestId('back-to-editing')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document missing fields (phone)');
    await page.getByTestId('back-to-editing').click();
    await expect(page.getByTestId('missing-fields')).toHaveCount(0);
  });

  test('an earlier state and the revision picker fit', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, noteAddress(NOTES.N6, '?at=v1'));
    await expect(page.getByTestId('revision-notice')).toBeVisible();
    await page.getByTestId('revision-select').scrollIntoViewIfNeeded();
    await expect(page.getByTestId('revision-select')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document earlier state (phone)');
  });

  test('a new document fits, and the question before leaving is in the viewport', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDocuments(page, '/categories/test-note/new');
    await field(page, '/title').getByRole('textbox').fill('Typed on a phone');
    await expect(page.getByTestId('save-everyone')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'new document (phone)');
    await page.getByTestId('bottom-more').click();
    await page.getByRole('dialog').getByRole('link', { name: 'Settings' }).click();
    await expect(page.getByTestId('leave-confirm')).toBeInViewport();
    await expectNoSeriousViolations(page, 'leave question (phone)');
  });

  test('a sheet that is read only fits', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToDocuments(page, noteAddress(NOTES.N2));
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'document read only (phone)');
  });

  test('the release of a note fits, its act is reachable, and the seal fits', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await page.goto(
      `/api/v1/auth/login?return=${encodeURIComponent(`${noteAddress(NOTES.N5)}/release`)}`,
    );
    await expect(page.getByTestId('release-view')).toBeVisible();
    // The act stays in reach above the record, as the save state of a sheet does.
    await expect(page.getByTestId('release-act')).toBeInViewport();
    await expect(page.getByTestId('release-request')).toBeVisible();
    await page.getByTestId('record-actions').scrollIntoViewIfNeeded();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'release review (phone)');
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-seal')).toBeVisible();
    await expect(page.getByTestId('release-open')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'release done (phone)');
  });

  test('the palette with results fits, and a hit is reachable', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await page.goto('/api/v1/auth/login?return=%2F');
    await expect(page.getByTestId('due-view')).toBeVisible();
    await page.getByTestId('search-open').click();
    await page.getByTestId('search-input').fill('Q4');
    await expect(page.getByTestId('search-documents')).toBeVisible();
    await expect(page.getByTestId(`search-document-${NOTES.N3}`)).toBeVisible();
    await expect(page.getByRole('dialog')).toBeInViewport();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'palette with results (phone)');
  });

  test('the release requests in Due fit', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await page.goto('/api/v1/auth/login?return=%2F');
    await expect(page.getByTestId('due-list')).toBeVisible();
    await expect(page.getByTestId('due-request').first()).toBeVisible();
    await expectNoSideways(page);
    await expectNoSeriousViolations(page, 'due with release requests (phone)');
  });
});
