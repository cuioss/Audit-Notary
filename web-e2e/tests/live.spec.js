import { expect, test } from '@playwright/test';
import { broadcast, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * The event stream (AUN-WEB-5, AUN-WEB-9) and the degraded state (AUN-GEN-6).
 */
test('the shell connects the event stream and shows no connection state', async ({
  page,
  request,
}) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
  await expect(page.getByText('Live', { exact: true })).toHaveCount(0);
});

test('an unreachable Git server is shown, and its recovery clears the notice', async ({
  page,
  request,
}) => {
  await useScenario(request, 'degraded');
  await login(page, '/');
  const notice = page.getByTestId('notice').filter({ hasText: 'Git server unreachable' });
  await expect(notice).toBeVisible();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
  await gotoState(request, 'recovered');
  await expect(notice).toBeHidden();
});

test('a status event switches the degraded state without a reload', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
  await broadcast(request, 'status', {
    version: '0.1.0-SNAPSHOT',
    degraded: true,
    repositories: [{ alias: 'samm-assessments', fetch: 'DOWN' }],
  });
  await expect(page.getByText('Git server unreachable')).toBeVisible();
});
