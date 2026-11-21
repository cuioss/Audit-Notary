import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';

/**
 * TRH-AUTH-1 as the browser sees it, with the mock in place of the identity provider: a 401 sends the user
 * through the login and back to the same canonical address; logout ends the session.
 */
test.beforeEach(async ({ request }) => {
  await useScenario(request, 'workshop');
});

test('a deep link without session returns to the same address after the login', async ({
  page,
}) => {
  await page.goto('/samm/payments/2026-q4');
  await expect(page).toHaveURL('/samm/payments/2026-q4');
  await expect(page.getByTestId('user-name')).toHaveText('Signed in as Alex Example');
  await expect(page.getByTestId('lens-route')).toHaveAttribute('data-route', 'samm.assessment');
});

test('the browser holds the session cookie only, HttpOnly and SameSite=Strict', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(page.getByTestId('due-view')).toBeVisible();
  const cookies = await context.cookies();
  expect(cookies.map((cookie) => cookie.name)).toEqual(['trailhand-mock-session']);
  expect(cookies[0]).toMatchObject({ httpOnly: true, sameSite: 'Strict' });
  expect(await page.evaluate(() => document.cookie)).toBe('');
});

test('a return address that is no canonical address leads to the start page', async ({ page }) => {
  await page.goto('/api/v1/auth/login?return=//evil.example/x');
  await expect(page).toHaveURL('/');
  await expect(page.getByTestId('due-view')).toBeVisible();
});

test('signing out ends the session', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('sign-out').click();
  await expect(page).toHaveURL(/\/api\/v1\/auth\/mock-signed-out$/);
  const session = await page.request.get('/api/v1/session');
  expect(session.status()).toBe(401);
  expect(await session.json()).toMatchObject({ outcome: 'UNAUTHENTICATED' });
});
