import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * AUN-WEB-7: every text comes from the server's catalogue in English and German; the choice of language
 * is kept by the browser.
 */
test('switching to German shows every text in German and keeps the choice', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  const missing = [];
  page.on('console', (message) => {
    if (message.text().includes('[i18n] missing')) missing.push(message.text());
  });
  await login(page, '/settings');
  await page.getByTestId('language-de').check();
  await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  await expect(page.getByTestId('nav-due')).toHaveText('Fällig');
  await expect(page.getByTestId('view-title')).toHaveText('Einstellungen');
  await page.reload();
  await expect(page.getByTestId('nav-threat-models')).toHaveText('Bedrohungsmodelle');
  await page.getByTestId('nav-due').click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Fällig');
  expect(missing).toEqual([]);
});

test('the catalogue answers both languages and refuses another', async ({ page }) => {
  await login(page, '/');
  const english = await (await page.request.get('/api/v1/messages?lang=en')).json();
  const german = await (await page.request.get('/api/v1/messages?lang=de')).json();
  expect(Object.keys(german).sort()).toEqual(Object.keys(english).sort());
  expect((await page.request.get('/api/v1/messages?lang=fr')).status()).toBe(400);
});
