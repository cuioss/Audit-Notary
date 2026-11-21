import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

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
