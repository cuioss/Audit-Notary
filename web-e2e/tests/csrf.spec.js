import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * AUN-WEB-8: a state-changing request needs the anti-CSRF header, and a foreign Origin is refused.
 */
test.beforeEach(async ({ request }) => {
  await useScenario(request, 'first-login');
});

test('a request without the anti-CSRF header is refused', async ({ page }) => {
  await login(page, '/welcome');
  const response = await page.request.put('/api/v1/directory/me', {
    data: { name: 'x', team: 'payments', role: 'assessor' },
  });
  expect(response.status()).toBe(403);
  expect(await response.json()).toEqual({ outcome: 'CSRF_REJECTED' });
});

test('a request from a foreign origin is refused even with the token', async ({ page }) => {
  await login(page, '/welcome');
  const session = await (await page.request.get('/api/v1/session')).json();
  const response = await page.request.put('/api/v1/directory/me', {
    headers: { 'X-CSRF-Token': session.csrfToken, Origin: 'https://evil.example' },
    data: { name: 'x', team: 'payments', role: 'assessor' },
  });
  expect(response.status()).toBe(403);
});

test('the app sends the header with its own request', async ({ page }) => {
  await login(page, '/welcome');
  const sent = page.waitForRequest(
    (request) => request.method() === 'PUT' && request.url().endsWith('/api/v1/directory/me'),
  );
  await page.getByTestId('welcome-role').selectOption({ index: 1 });
  await page.getByTestId('welcome-save').click();
  const request = await sent;
  expect(request.headers()['x-csrf-token']).toBeTruthy();
  await expect(page).toHaveURL('/');
});
