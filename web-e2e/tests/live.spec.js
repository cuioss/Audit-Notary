import { expect, test } from '@playwright/test';
import { broadcast, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * The event stream (TRH-WEB-5, TRH-WEB-9) and the degraded state (TRH-GEN-6).
 */
test('the live indicator reports the connected stream', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'connected');
  await expect(page.getByTestId('live-indicator')).toHaveText('Live');
});

test('an unreachable Git server is shown, and its recovery clears the notice', async ({
  page,
  request,
}) => {
  await useScenario(request, 'degraded');
  await login(page, '/');
  const notice = page.getByTestId('notice').filter({ hasText: 'Git server unreachable' });
  await expect(notice).toBeVisible();
  await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'connected');
  await gotoState(request, 'recovered');
  await expect(notice).toBeHidden();
});

test('a status event switches the degraded state without a reload', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await expect(page.getByTestId('live-indicator')).toHaveAttribute('data-state', 'connected');
  await broadcast(request, 'status', {
    version: '0.1.0-SNAPSHOT',
    degraded: true,
    repositories: [{ alias: 'samm-assessments', fetch: 'DOWN' }],
  });
  await expect(page.getByText('Git server unreachable')).toBeVisible();
});
