import { expect } from '@playwright/test';

/**
 * What the lens Threat models of the end-to-end suite needs of the page and of the mock (web-mock/README.adoc, Threat
 * Models): the addresses, the paths of the requests, the fixtures the pages show and the shared steps. The fixtures are
 * static: `threat-models.spec.js` has one test that compares them with what the mock answers, so a change of the mock
 * fails that test and not every test that uses a value.
 */

/** The canonical address of the first column of the lens. */
export const LENS_ADDRESS = '/threat-models';

/** @returns the address of the page of a service */
export function serviceAddress(service) {
  return `${LENS_ADDRESS}/${service}`;
}

/** @returns the address of the sheet of a model, of an earlier state of it with `at` */
export function modelAddress(service, model, at) {
  return `${LENS_ADDRESS}/${service}/${model}${at ? `?at=${at}` : ''}`;
}

/** @returns the address of the release of a model */
export function releaseAddress(service, model) {
  return `${LENS_ADDRESS}/${service}/${model}/release`;
}

/** @returns the address of the wizard of a new model, with the recipe when one is named */
export function newAddress(service, recipe) {
  return `${LENS_ADDRESS}/${service}/new${recipe ? `?recipe=${recipe}` : ''}`;
}

/** The model the flows of the lifecycle walk through: the checkout flow of the Payment API. */
export const CHECKOUT = {
  service: 'payment-api',
  model: 'checkout-flow',
  document: 'payment-api-checkout-flow',
  title: 'Payment API, checkout flow',
  address: '/threat-models/payment-api/checkout-flow',
};

/** @returns the path of the save of a threat model at the mock */
export function savePath(document = CHECKOUT.document) {
  return `/api/v1/documents/threat-models/${document}/save`;
}

/** @returns the path of the draft of a threat model at the mock */
export function draftPath(document = CHECKOUT.document) {
  return `/api/v1/drafts/threat-models/${document}`;
}

/** @returns the path of the submit of a threat model at the mock */
export function submitPath(document = CHECKOUT.document) {
  return `/api/v1/documents/threat-models/${document}/transitions/threat-model.submit`;
}

/** @returns the path of the release of a threat model at the mock */
export function releasePath(document = CHECKOUT.document) {
  return `/api/v1/releases/threat-models/${document}`;
}

/** @returns the path of the service page at the mock */
export function servicePath(service) {
  return `/api/v1/threat-models/${service}`;
}

/** @returns the path of the model read at the mock */
export function modelPath(service, model) {
  return `/api/v1/threat-models/${service}/${model}`;
}

/** The path of the schema of the document type. */
export const SCHEMA_PATH = '/api/v1/categories/threat-models/schema';

/** Today of the mock, the day the review is prefilled with. */
export const TODAY = '2026-11-26';

/**
 * The nine services of the catalog as the lens shows them: the page of each, its models and the words of its head.
 * `interval` is the line under the protection need.
 */
export const SERVICES = [
  {
    id: 'payment-api',
    name: 'Payment API',
    need: 'Very high',
    interval: 'Every 6 months',
    models: ['checkout-flow'],
  },
  {
    id: 'identity-provider',
    name: 'Identity Provider',
    need: 'Very high',
    interval: 'Every 6 months',
    models: ['login-flow'],
  },
  {
    id: 'customer-portal',
    name: 'Customer Portal',
    need: 'Very high',
    interval: 'Every 6 months',
    models: ['portal'],
  },
  {
    id: 'customer-db',
    name: 'Customer database',
    need: 'Very high',
    interval: 'Every 6 months',
    models: ['storage'],
  },
  {
    id: 'reporting',
    name: 'Reporting Service',
    need: 'Normal',
    interval: 'Every 24 months',
    models: ['report-generation'],
  },
  {
    id: 'notification-service',
    name: 'Notification service',
    need: 'Normal',
    interval: 'Every 24 months',
    models: ['notification-flows'],
  },
  {
    id: 'report-scheduler',
    name: 'Report scheduler',
    need: 'Normal',
    interval: 'Every 24 months',
    models: [],
  },
  {
    id: 'notification-gateway',
    name: 'Notification gateway',
    need: 'Normal',
    interval: 'Every 24 months',
    models: [],
  },
  {
    id: 'ledger',
    name: 'Ledger',
    need: 'Very high',
    interval: 'Every 6 months',
    models: [],
    retired: true,
  },
];

/**
 * The threats of the checkout flow in `workshop` as the table shows them: the id, the status, the countermeasure that
 * treats it and whether the threat is untreated. `T-07` is the one that was carried into the risk register.
 */
export const THREATS = [
  { id: 'T-01', status: 'open', measure: null, untreated: true },
  { id: 'T-02', status: 'open', measure: null, untreated: true },
  { id: 'T-03', status: 'open', measure: 'M-03', untreated: false },
  { id: 'T-04', status: 'mitigated', measure: 'M-04', untreated: false },
  { id: 'T-05', status: 'mitigated', measure: 'M-05', untreated: false },
  { id: 'T-06', status: 'mitigated', measure: 'M-06', untreated: false },
  { id: 'T-07', status: 'accepted', measure: null, untreated: false, risk: 'R-009' },
  { id: 'T-08', status: 'mitigated', measure: 'M-08', untreated: false },
  { id: 'T-09', status: 'accepted', measure: null, untreated: false },
];

/** The countermeasures of the checkout flow in order, each with the threat it treats and its issue ids. */
export const MEASURES = [
  { id: 'M-03', threat: 'T-03', status: 'planned', issues: ['PAY-1423'] },
  { id: 'M-04', threat: 'T-04', status: 'implemented', issues: ['PAY-1301'] },
  { id: 'M-05', threat: 'T-05', status: 'implemented', issues: ['PAY-1288'] },
  { id: 'M-06', threat: 'T-06', status: 'implemented', issues: ['PAY-1355', 'PAY-1356'] },
  { id: 'M-08', threat: 'T-08', status: 'implemented', issues: ['PAY-1190'] },
];

/** The review of the checkout flow in `workshop`: the last release is v3, reviewed 2026-06-01, due 2026-12-01. */
export const REVIEW = {
  last: 'Jun 1, 2026',
  ago: '178 days ago',
  due: 'Dec 1, 2026',
  status: 'Due in 5 days',
  interval: 'Every 6 months',
  need: 'Protection need: Very high',
};

/**
 * Signs in at the mock and waits for the lens Threat models at the returned address. On a phone the top bar shows only
 * the last step of a path, so the title of the lens (which `login` waits for) is not visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginToThreats(page, address = LENS_ADDRESS) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('threat-models-view')).toBeVisible();
}

/**
 * Signs in and waits for the sheet of a model with its tables drawn.
 *
 * @param page the page
 * @param address the canonical address of the model
 */
export async function loginToSheet(page, address = CHECKOUT.address) {
  await loginToThreats(page, address);
  await expect(page.getByTestId('threat-model-sheet')).toBeVisible();
  await expect(page.getByTestId('threats-table')).toBeVisible();
}

/**
 * @param page the page
 * @returns the whole value of the status control of every threat in the order shown
 */
export async function threatStatuses(page) {
  return page
    .getByTestId('threats-table')
    .locator('select')
    .evaluateAll((selects) => selects.map((select) => select.value));
}

/** Opens the dialog that changes a threat and waits for it. */
export async function editThreat(page, id) {
  await page
    .getByRole('button', { name: `Edit ${id}`, exact: true })
    .first()
    .click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** @returns the last body the mock received on a path with a method, `null` when it received none */
export function lastBody(sent, path, method) {
  const found = sent.filter((act) => act.path === path && act.method === method);
  return found.length === 0 ? null : found.at(-1).body;
}

/** @returns the requests that changed something, in the order they were sent, as `METHOD path` */
export function changes(sent) {
  return sent
    .filter((act) => act.method !== 'GET')
    .map((act) => `${act.method} ${act.path.split('?')[0]}`);
}
