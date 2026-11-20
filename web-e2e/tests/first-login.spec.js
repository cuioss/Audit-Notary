import { expect, test } from '@playwright/test';
import { acts, clearActs, useScenario } from './helpers/mock.js';

/**
 * TRH-DIR-2: without a directory entry the first-login form is the only view; saving it ends the
 * restriction.
 */
test('every address leads to the form until the entry is saved', async ({ page, request }) => {
  await useScenario(request, 'first-login');
  await clearActs(request);
  await page.goto('/samm');
  await expect(page).toHaveURL('/welcome');
  await expect(page.getByTestId('welcome-name')).toHaveValue('Robin Newcomer');
  await expect(page.getByTestId('welcome-information')).toBeVisible();
  const role = page.getByTestId('welcome-role');
  await role.selectOption({ index: 1 });
  await page.getByTestId('welcome-save').click();
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('due-view')).toBeVisible();
  const recorded = await acts(request);
  expect(JSON.stringify(recorded)).toContain('/api/v1/directory/me');
});

test('a refused team is shown at the field', async ({ page, request }) => {
  await useScenario(request, 'first-login#invalid-team');
  await page.goto('/welcome');
  await page.getByTestId('welcome-role').selectOption({ index: 1 });
  await page.getByTestId('welcome-save').click();
  await expect(page.getByText('Pick an entry from the list.')).toBeVisible();
  await expect(page).toHaveURL('/welcome');
});
