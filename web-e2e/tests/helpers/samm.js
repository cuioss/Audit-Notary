import { expect } from '@playwright/test';

/**
 * What the SAMM completion of the end-to-end suite needs of the page and of the mock (web-mock/README.adoc, SAMM
 * Completion): the addresses, the paths of the requests, the fixtures the pages show and the shared steps. The fixtures
 * are static: `samm-completion.spec.js` has one test that compares them with what the mock answers, so a change of the
 * mock fails that test and not every test that uses a value.
 */

/** The canonical addresses. */
export const NEW_SCOPE_ADDRESS = '/samm/new';
export const SAMM_ADDRESS = '/samm';

/** @returns the canonical address of the form of a new assessment of a scope */
export function newAssessmentAddress(scope) {
  return `/samm/${scope}/new`;
}

/** @returns the canonical address of an assessment, or of one of its practices */
export function assessmentAddress(scope, assessment, practice) {
  return `/samm/${scope}/${assessment}${practice ? `/${practice}` : ''}`;
}

/** The paths of the requests at the mock. */
export const SCOPES_PATH = '/api/v1/samm/scopes';
export const MODELS_PATH = '/api/v1/samm/models';

/** @returns the path of the creation of an assessment of a scope */
export function assessmentsPath(scope) {
  return `/api/v1/samm/${scope}/assessments`;
}

/** @returns the path of the trend of a scope */
export function trendPath(scope) {
  return `/api/v1/samm/${scope}/trend`;
}

/** @returns the path of the comparison of a scope's two newest released assessments */
export function comparePath(scope) {
  return `/api/v1/samm/${scope}/compare`;
}

/** @returns the path of the save of a scope's targets, or of an assessment */
export function savePath(document) {
  return `/api/v1/documents/samm-assessments/${document}/save`;
}

/** @returns the path of the draft of an assessment */
export function draftPath(document) {
  return `/api/v1/drafts/samm-assessments/${document}`;
}

/** @returns the path of the submit of an assessment */
export function submitPath(document) {
  return `/api/v1/documents/samm-assessments/${document}/transitions/samm.submit`;
}

/** @returns the path of the release of an assessment */
export function releasePath(document) {
  return `/api/v1/releases/samm-assessments/${document}`;
}

/** What the mock answers to a create (the creates are fixed: the body is not read, README.adoc, Limits). */
export const CREATED = {
  scope: { id: 'mobile', document: 'mobile', address: '/samm/mobile' },
  shop: { id: '2026-q4', document: 'shop-2026-q4', address: '/samm/shop/2026-q4' },
  organisation: {
    id: '2026-h2',
    document: 'organisation-2026-h2',
    address: '/samm/organisation/2026-h2',
  },
  mobile: { id: '2026-q4', document: 'mobile-2026-q4', address: '/samm/mobile/2026-q4' },
};

/** The pinned model versions, the default first. */
export const MODELS = [
  { version: 'v2.2.0', default: true },
  { version: 'v2.1.0', default: false },
];

/** The steps a target takes: 0 to 3 in steps of one half (AUN-SAMM-6). */
export const TARGET_STEPS = ['0', '0.5', '1', '1.5', '2', '2.5', '3'];

/** The persons of the directory the assessors are picked from. */
export const JORDAN = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };

/** The released assessment of Payments the frozen flows read, and the tag its writes answer. */
export const RELEASED = {
  scope: 'payments',
  assessment: '2026-q2',
  document: 'payments-2026-q2',
  tag: 'assessments/payments-2026-q2/v1',
};

/** The open workshop of Payments. */
export const OPEN = { scope: 'payments', assessment: '2026-q4', document: 'payments-2026-q4' };

/** The evidence links of the practice `sb` of the open workshop, in order. */
export const EVIDENCE = [
  {
    question: 'sb-b-1',
    title: 'Pipeline of the payment service',
    url: 'https://ci.example/payments/pipeline',
  },
  {
    question: null,
    title: 'Dependency policy',
    url: 'https://wiki.example/payments/dependency-policy',
  },
];

/** The targets of Payments the roadmap flows start from (the practices they change). */
export const PAYMENTS_TARGETS = {
  sm: { target: 2 },
  ta: { target: 2.5, due: '2027-03-31' },
  rt: { target: 1.5 },
  om: { target: 1.5 },
};

/** @returns the headers of a state-changing request of the signed-in page */
export async function csrf(page) {
  const session = await (await page.request.get('/api/v1/session')).json();
  return { 'X-CSRF-Token': session.csrfToken };
}

/**
 * Signs in at the mock and waits for the SAMM lens at the returned address. On a phone the top bar shows only the last
 * step of a path, so the title of the lens (which `login` waits for) is not visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginToSamm(page, address) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('samm-view')).toBeVisible();
}

/**
 * Chooses an option of a native select by its label.
 *
 * @param page the page
 * @param testId the test id of the select
 * @param label the text of the option
 */
export async function choose(page, testId, label) {
  await page.getByTestId(testId).selectOption({ label });
}

/**
 * Types a title, chooses a team and the targets of the created scope of the mock (`sm` 2, `ta` 2.5 due 2027-03-31,
 * `sb` 1.5), the values the data file shows afterwards.
 *
 * @param page the page, at `/samm/new`
 */
export async function fillNewScope(page) {
  await page.getByTestId('new-scope-title').fill('Mobile Apps');
  await choose(page, 'new-scope-subject', 'Mobile Apps');
  await expect(page.getByTestId('new-scope-targets-editor-sm-target')).toBeVisible();
  await choose(page, 'new-scope-targets-editor-sm-target', '2');
  await choose(page, 'new-scope-targets-editor-ta-target', '2.5');
  await page.getByTestId('new-scope-targets-editor-ta-due').fill('2027-03-31');
  await choose(page, 'new-scope-targets-editor-sb-target', '1.5');
}

/**
 * Fills the required fields of a new assessment.
 *
 * @param page the page, at `/samm/<scope>/new`
 * @param title the title
 * @param date the date, `YYYY-MM-DD`
 */
export async function fillNewAssessment(page, title, date = '2026-11-26') {
  await page.getByTestId('new-assessment-title').fill(title);
  await page.getByTestId('new-assessment-date').fill(date);
}

/**
 * Patches the answer of a read, so a state the mock has no profile for can be shown. The real answer is fetched and
 * changed; the test says what it changes.
 *
 * @param page the page
 * @param pattern the glob of the URL
 * @param patch a function that gets the parsed body and returns the changed one
 * @param options `times`: how many reads are patched, the first ones; the later ones are the mock's own answer
 */
export async function patchRead(page, pattern, patch, { times = Infinity } = {}) {
  let left = times;
  await page.route(pattern, async (route) => {
    if (route.request().method() !== 'GET' || left <= 0) return route.continue();
    left -= 1;
    const response = await route.fetch();
    const body = await response.json();
    return route.fulfill({ response, json: patch(body) });
  });
}
