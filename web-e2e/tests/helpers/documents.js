import { expect } from '@playwright/test';

/**
 * The notes of the test category of the mock (web-mock/README.adoc, Document Lifecycle) and what the documents lens
 * of the end-to-end suite needs of the page.
 */
export const NOTES = {
  /** Released as v1, clean: a save reopens it as version 2. */
  N1: '01JZ8Q4Y5N6V7X8B9C0D1E2F3G',
  /** Draft with the person's own draft and a release request: the target of the outcome states. */
  N2: '01JZ8R7A9C1E3G5J7M9P1S3V5X',
  /** Draft with only title and summary: a submit lists the missing fields. */
  N3: '01JZ8S2B4D6F8H0K2N4Q6T8W0Y',
  /** In review, never released. */
  N4: '01JZ8T5C7E9G1J3M5P7R9V1X3Z',
  /** In review, released once before. */
  N5: '01JZ8V8D0F2H4K6N8Q0S2W4Y6A',
  /** Released twice: the revision picker. */
  N6: '01JZ8W1E3G5J7M9P1R3T5X7Z9B',
  /** Draft in version 3. */
  N7: '01JZ8X4F6H8K0N2Q4S6V8Y0A2C',
  /** Every mark of the form kit. */
  N8: '01JZ8Y7G9J1M3P5R7T9W1Z3B5D',
  /** The flow document. */
  N9: '01JZ8Z0H2K4N6Q8S0V2X4A6C8E',
  /** What a create answers. */
  N10: '01JZ9A3J5M7P9R1T3W5Y7B9D1F',
};

/** @returns the canonical address of a note */
export function noteAddress(id, query = '') {
  return `/categories/test-note/${id}${query}`;
}

/** @returns the path of the save of a note at the mock */
export function savePath(id) {
  return `/api/v1/documents/test-notes/${id}/save`;
}

/** @returns the path of the draft of a note at the mock */
export function draftPath(id) {
  return `/api/v1/drafts/test-notes/${id}`;
}

/** @returns the path of the submit of a note at the mock */
export function submitPath(id) {
  return `/api/v1/documents/test-notes/${id}/transitions/test-note.submit`;
}

/** The path of a create at the mock. */
export const CREATE_PATH = '/api/v1/documents/test-notes';

/**
 * Chooses the language the way the settings view does, and reloads.
 *
 * @param page the page
 * @param language `en` or `de`
 */
export async function useLanguage(page, language) {
  await page.evaluate(
    (value) => window.localStorage.setItem('audit_notary_locale', value),
    language,
  );
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang', language);
}

/**
 * @param page the page
 * @param pointer the JSON Pointer of a property of the form
 * @returns the holder of the field: its label, control, hints and error
 */
export function field(page, pointer) {
  return page.locator(`[data-pointer="${pointer}"]`);
}

/** @returns the requests of the mock to one path, in the order they were sent */
export function sentTo(sent, path, method) {
  return sent.filter((act) => act.path === path && (method === undefined || act.method === method));
}

/**
 * Signs in at the mock and waits for the documents lens at the returned address. On a phone the top bar shows only the
 * last step of a path, so the title of the lens (which `login` waits for) is not visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginToDocuments(page, address) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('documents-view')).toBeVisible();
}
