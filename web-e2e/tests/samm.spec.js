import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { acts, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * The SAMM lens (UC-SAMM-1 … UC-SAMM-6): the chain of columns, the maturity seal, the workshop's practice sheet
 * with drafts, saves, conflicts and saves by others (AUN-WEB-5), and the release with step-up (AUN-WEB-6).
 */
const PRACTICE = '/samm/payments/2026-q4/sm';
const SAVE = '/api/v1/documents/samm-assessments/payments-2026-q4/save';

test('the seal links every practice and the table states the same scores', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  await login(page, '/samm/payments/2026-q4');
  const seal = page.getByTestId('maturity-seal');
  await expect(seal.getByRole('link')).toHaveCount(15);
  await page.getByTestId('maturity-view-table').check({ force: true });
  await expect(page.getByTestId('maturity-table')).toContainText('Strategy and Metrics');
  await page.getByTestId('maturity-table').getByRole('link', { name: 'Threat Assessment' }).click();
  await expect(page).toHaveURL('/samm/payments/2026-q4/ta');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Threat Assessment');
});

test('a workshop answers with the number keys, keeps a draft and saves for everyone', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  await clearActs(request);
  await login(page, PRACTICE);
  await page.getByTestId('answer-sm-a-1-0').focus();
  await page.keyboard.press('4');
  await expect(page.getByTestId('answer-sm-a-1-3')).toBeChecked();
  await expect(page.getByTestId('save-state')).toContainText('Saved for you');
  await page.keyboard.press('j');
  await page.keyboard.press('1');
  await expect(page.getByTestId('answer-sm-a-2-0')).toBeChecked();
  await page.getByTestId('save-everyone').click();
  await expect(page.getByTestId('save-state')).toContainText('Saved for everyone');
  const sent = (await acts(request)).filter((act) => act.path === SAVE);
  expect(sent).toHaveLength(1);
  expect(sent[0].body.parts.sm.fields).toMatchObject({
    'sm-a-1/answer': 1,
    'sm-a-2/answer': 0,
  });
});

test('a conflict shows both answers and lets the person decide', async ({ page, request }) => {
  await useScenario(request, 'workshop#conflict');
  await login(page, PRACTICE);
  await page.getByTestId('answer-sm-a-2-1').check({ force: true });
  await page.getByTestId('save-everyone').click();
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
  const conflict = page.getByTestId('conflict-sm-a-2');
  await expect(conflict).toContainText('Jordan Weber saved');
  await conflict.getByRole('button', { name: 'Take the answer of Jordan Weber' }).click();
  await page.getByTestId('conflict-sm-b-1').getByRole('button', { name: 'Keep mine' }).click();
  await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
});

test('a save by another assessor refreshes the practice and says who saved', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  await login(page, PRACTICE);
  await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
  await gotoState(request, 'saved-by-other');
  await expect(page.getByText('Jordan Weber just saved this practice.').first()).toBeVisible();
  // The other assessor answered sm-b-1 with 0.25 and sm-b-2 with 1 (the fixture of saved-by-other).
  await expect(page.getByTestId('answer-sm-b-1-1')).toBeChecked();
  await expect(page.getByTestId('answer-sm-b-2-3')).toBeChecked();
});

test('a person with the right read only reads the practice', async ({ page, request }) => {
  await useScenario(request, 'read-only');
  await login(page, PRACTICE);
  await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
  await expect(page.getByTestId('save-everyone')).toHaveCount(0);
});

test('an approver releases with MFA: step-up first, then the seal', async ({ page, request }) => {
  await useScenario(request, 'release');
  await login(page, '/samm/payments/2026-q4/release');
  await expect(page.getByTestId('release-act')).toHaveText('Release (confirm with MFA)');
  // The first press answers STEP_UP_REQUIRED and leaves for the step-up address, which returns to the release.
  const stepUp = page.waitForResponse(
    (response) => response.url().includes('/api/v1/releases/') && response.status() === 403,
  );
  const back = page.waitForURL(/\/api\/v1\/auth\/login\?.*step-up=mfa/);
  await page.getByTestId('release-act').click();
  await stepUp;
  await back;
  await expect(page).toHaveURL('/samm/payments/2026-q4/release');
  await expect(page.getByTestId('release-act')).not.toHaveAttribute('aria-busy', 'true');
  await page.getByTestId('release-act').click();
  await expect(page.getByTestId('release-done')).toContainText('Released as v1');
  await expect(page.getByTestId('release-seal')).toHaveAttribute('data-sealed', 'v1');
  await expectNoSeriousViolations(page, 'release done');
});

test('a local user confirms the release with the password', async ({ page, request }) => {
  await useScenario(request, 'release#wrong-password');
  await login(page, '/samm/payments/2026-q4/release');
  await expect(page.getByTestId('release-act')).toHaveText('Release (confirm with password)');
  await page.getByTestId('release-act').click();
  await page.getByTestId('release-password').fill('wrong');
  await page.getByTestId('release-confirm').click();
  await expect(page.getByRole('dialog')).toContainText('The password is not right');
  await useScenario(request, 'release#password');
  await page.getByTestId('release-confirm').click();
  await expect(page.getByTestId('release-done')).toBeVisible();
});

test('the workshop assessor cannot release and is told why', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/samm/payments/2026-q4/release');
  await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByText('Releasing needs the approve right.')).toBeVisible();
});
