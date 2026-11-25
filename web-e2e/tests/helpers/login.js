import { expect } from '@playwright/test';

/**
 * Signs in at the mock (AUN-AUTH-1 emulated) and waits for the shell at the returned address.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function login(page, address = '/') {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page.getByTestId('view-title')).toBeVisible();
  await expect(page).toHaveURL(address);
}

/** The test account of the `local` profile (web-mock/README.adoc). */
export const LOCAL_ACCOUNT = { username: 'alex', password: 'local-password' };

/**
 * Logs in at the page of local test accounts (UC-ACC-1) and waits for the shell at the returned address. The start
 * of the login (`/api/v1/auth/login`) sends the browser to the page `/login`.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginLocal(page, address = '/') {
  await page.goto(`/login?return=${encodeURIComponent(address)}`);
  await page.getByTestId('login-username').fill(LOCAL_ACCOUNT.username);
  await page.getByTestId('login-password').fill(LOCAL_ACCOUNT.password);
  await page.getByTestId('login-submit').click();
  await expect(page.getByTestId('view-title')).toBeVisible();
  await expect(page).toHaveURL(address);
}
