import { expect } from '@playwright/test';

/**
 * Signs in at the mock (TRH-AUTH-1 emulated) and waits for the shell at the returned address.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function login(page, address = '/') {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page.getByTestId('view-title')).toBeVisible();
  await expect(page).toHaveURL(address);
}
