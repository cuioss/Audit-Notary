import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * TRH-WEB-3: the eight lenses on the rail, one canonical address per view, and a reload restores it.
 */
const ADDRESSES = [
  ['/', 'due-view', 'Due'],
  ['/samm', 'lens-view', 'SAMM'],
  ['/samm/payments/2026-q4/sm', 'lens-view', 'SAMM'],
  ['/samm/payments/2026-q4/release', 'lens-view', 'Release'],
  ['/threat-models/payment-gateway/checkout-flow', 'lens-view', 'Threat models'],
  ['/incidents/2026/inc-0007', 'lens-view', 'Incidents'],
  ['/isms/risks/r-012', 'lens-view', 'ISMS'],
  ['/isms/documents/policy-access', 'lens-view', 'ISMS'],
  ['/catalogs/team/payments', 'lens-view', 'Catalogs'],
  ['/reports/trends', 'lens-view', 'Reports'],
  ['/settings', 'settings-view', 'Settings'],
];

test.beforeEach(async ({ request }) => {
  await useScenario(request, 'workshop');
});

for (const [address, view, title] of ADDRESSES) {
  test(`${address} opens and reloads into the same view`, async ({ page }) => {
    await login(page, address);
    await expect(page.getByTestId(view)).toBeVisible();
    await expect(page.getByTestId('view-title')).toHaveText(title);
    await page.reload();
    await expect(page).toHaveURL(address);
    await expect(page.getByTestId(view)).toBeVisible();
    await expect(page).toHaveTitle(`${title} – TrailHand`);
  });
}

test('the rail offers the eight lenses and marks the current one', async ({ page }) => {
  await login(page, '/');
  const rail = page.getByRole('navigation', { name: 'Main navigation' });
  await expect(rail.getByRole('link')).toHaveText([
    'TrailHand',
    'Due',
    'SAMM',
    'Threat models',
    'Incidents',
    'ISMS',
    'Catalogs',
    'Reports',
    'Settings',
  ]);
  await page.getByTestId('nav-incidents').click();
  await expect(page).toHaveURL('/incidents');
  await expect(page.getByTestId('nav-incidents')).toHaveAttribute('aria-current', 'page');
  await page.goBack();
  await expect(page).toHaveURL('/');
});

test('the search opens a view', async ({ page }) => {
  await login(page, '/');
  await page.keyboard.press('Control+k');
  await page.getByTestId('search-input').fill('thre');
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL('/threat-models');
});

test('the due list leads to the document address', async ({ page }) => {
  await login(page, '/');
  const first = page.getByTestId('due-list').getByRole('link').first();
  const href = await first.getAttribute('href');
  await first.click();
  await expect(page).toHaveURL(href);
});

test('an unknown address answers with the not-found view', async ({ page }) => {
  await login(page, '/');
  await page.goto('/no/such/view/at/all');
  await expect(page.getByTestId('not-found-view')).toBeVisible();
  await page.getByRole('link', { name: 'Go to Due' }).click();
  await expect(page.getByTestId('due-view')).toBeVisible();
});
