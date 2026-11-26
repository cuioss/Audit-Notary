import { expect } from '@playwright/test';

/**
 * What the catalogs lens of the end-to-end suite needs of the page and of the mock (web-mock/README.adoc, Directory and
 * Catalogs): the addresses, the paths of the requests and the shared steps.
 */

/** The five catalogs, in the order of the first column. */
export const CATALOGS = ['team', 'role', 'service', 'system', 'external'];

/** @returns the canonical address of a catalog */
export function catalogAddress(catalog) {
  return `/catalogs/${catalog}`;
}

/** @returns the canonical address of an entry */
export function entryAddress(catalog, id) {
  return `/catalogs/${catalog}/${id}`;
}

/** @returns the canonical address of the form for a new entry */
export function newEntryAddress(catalog) {
  return `/catalogs/${catalog}/new`;
}

/** @returns the path of the creation of an entry at the mock */
export function createPath(catalog) {
  return `/api/v1/catalogs/${catalog}`;
}

/** @returns the path of the change of an entry at the mock */
export function changePath(catalog, id) {
  return `/api/v1/catalogs/${catalog}/${id}`;
}

/** @returns the path of the retirement of an entry at the mock */
export function retirePath(catalog, id) {
  return `/api/v1/catalogs/${catalog}/${id}/retirement`;
}

/**
 * Signs in at the mock and waits for the catalogs lens at the returned address. On a phone the top bar shows only the
 * last step of a path, so the title of the lens (which `login` waits for) is not visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginToCatalogs(page, address) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('catalogs-view')).toBeVisible();
}

/**
 * Fills the mandatory fields of a new service.
 *
 * @param page the page
 * @param field the helper that finds the holder of a field by its JSON Pointer
 * @param values the id and the name of the service
 */
export async function fillNewService(page, field, { id, name }) {
  await field(page, '/id').getByRole('textbox').fill(id);
  await field(page, '/name').getByRole('textbox').fill(name);
  await field(page, '/lifecycle').getByRole('combobox').selectOption({ label: 'Active' });
  await field(page, '/owner/team').getByRole('combobox').selectOption({ label: 'Payments' });
  await field(page, '/owner/role').getByRole('combobox').selectOption({ label: 'Service Owner' });
  for (const dimension of ['confidentiality', 'integrity', 'availability']) {
    await field(page, `/protection-needs/${dimension}`)
      .getByRole('combobox')
      .selectOption({ label: 'Normal' });
  }
}
