import { expect, test } from '@playwright/test';
import { useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';
import { BASE_URL } from './helpers/ports.js';

/**
 * TRH-WEB-1 and TRH-WEB-2: no resource from a third-party origin; Inter comes from the app itself.
 */
test('every request stays on the own origin and Inter is loaded', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  const origins = new Set();
  page.on('request', (entry) => origins.add(new URL(entry.url()).origin));
  await login(page, '/');
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('16px Inter'))).toBe(true);
  expect([...origins]).toEqual([new URL(BASE_URL).origin]);
});
