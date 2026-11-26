import { expect } from '@playwright/test';

/**
 * What the directory pages of the end-to-end suite need of the page and of the mock (web-mock/README.adoc, Directory
 * and Catalogs): the addresses, the paths of the requests, the fixtures the pages show and the shared steps. The
 * fixtures are static: `directory.spec.js` has one test that compares them with what the mock answers, so a change of
 * the mock fails that test and not every test that uses a value.
 */

/** The canonical addresses of the pages. */
export const IMPORT_ADDRESS = '/directory/import';
export const PERSONS_ADDRESS = '/directory/persons';
export const PROFILE_ADDRESS = '/settings/profile';
export const WELCOME_ADDRESS = '/welcome';

/** The paths of the requests at the mock. */
export const PERSONS_PATH = '/api/v1/directory/persons';
export const ERASE_PATH = '/api/v1/directory/erasures';
export const IMPORT_PATH = '/api/v1/catalogs/import/backstage';
export const PREVIEW_PATH = '/api/v1/catalogs/import/backstage/preview';
export const ME_PATH = '/api/v1/directory/me';
export const CONFIRM_PATH = '/api/v1/directory/me/confirmation';

/**
 * The limits of the import and the prefill. The budget line of the import page names the first two, so the drift test
 * reads them there.
 */
export const LIMITS = { documents: 100, bytes: 2 * 1024 * 1024, persons: 100, memberships: 5 };

/**
 * The persons the mock lists in `catalog-admin`; `workshop` and `read-only` list the first five of them.
 * `places` is how the table writes the memberships.
 */
export const PERSONS = [
  {
    pseudonym: 'p-4c1a9e',
    name: 'Alex Example',
    state: 'Bound to a login',
    places: 'Payments, Security Champion',
  },
  {
    pseudonym: 'p-2b7f10',
    name: 'Jordan Weber',
    state: 'Bound to a login',
    places: 'Payments, Developer',
  },
  {
    pseudonym: 'p-61c0d4',
    name: 'Lea Brandt',
    state: 'Bound to a login',
    places: 'Identity Platform, Product Owner',
  },
  {
    pseudonym: 'p-7d52e8',
    name: 'Mira Haas',
    state: 'Not yet bound',
    places: 'Mobile Apps, Developer',
  },
  {
    pseudonym: 'p-9e33a1',
    name: 'Sam Okafor',
    state: 'Bound to a login',
    places: 'Payments, Developer',
  },
  {
    pseudonym: 'p-7d2e58',
    name: 'Noor Haddad',
    state: 'Bound to a login',
    places: 'Security Office, Chief Information Security Officer',
  },
  {
    pseudonym: 'p-b3f1c7',
    name: 'Priya Raman',
    state: 'Not yet bound',
    places: 'Mobile Apps, Developer',
  },
  {
    pseudonym: 'p-e08a52',
    name: 'Tomas Ferreira',
    state: 'Not yet bound',
    places: 'Identity Platform, Security Champion',
  },
];

/** The persons of the profiles without `administer-catalogs` (and of the first states of `workshop`). */
export const READ_PERSONS = PERSONS.slice(0, 5);

/** The result of the import of `catalog-admin`: preview and import answer the same sets. */
export const IMPORT_RESULT = {
  created: [
    { catalog: 'service', id: 'checkout-ui', name: 'Checkout UI', kind: 'Service' },
    { catalog: 'system', id: 'storefront', name: 'Storefront', kind: 'System' },
    { catalog: 'team', id: 'storefront', name: 'Storefront', kind: 'Team' },
  ],
  updated: [
    { catalog: 'service', id: 'payment-api', name: 'Payment API', kind: 'Service' },
    { catalog: 'team', id: 'payments', name: 'Payments', kind: 'Team' },
  ],
  unchanged: 4,
  /** In the order of the mock; `reason` is the code of the register, `text` the sentence of the page (English). */
  leftOut: [
    {
      entity: 'component:default/billing-batch',
      reason: 'LIFECYCLE_UNMAPPED',
      text: 'The lifecycle has no mapping.',
      detail: 'experimental',
    },
    {
      entity: 'component:default/search-index',
      reason: 'DEFAULTS_MISSING',
      text: 'A new service needs the defaults for its owner role and its protection needs',
      detail: 'owner.role, protection-needs',
    },
    {
      entity: 'component:ops/legacy-export',
      reason: 'NAMESPACE_NOT_DEFAULT',
      text: 'Only the default namespace is imported',
      detail: 'ops',
    },
    {
      entity: 'component:default/payment-api',
      reason: 'REFERENCE_KIND_NOT_SUPPORTED',
      text: 'this reference points to a kind that is not supported',
      detail: 'resource:default/payments-db',
    },
    {
      entity: 'api:default/payments-openapi',
      reason: 'KIND_NOT_SUPPORTED',
      text: 'Only components, systems and groups are imported',
      detail: 'API',
    },
  ],
};

/** The two entries the mock offers a first login (`first-login#candidates`), with the text the page shows. */
export const CANDIDATES = [
  { pseudonym: 'p-3d7a15', label: 'Robin Newcomer (Payments, Developer)' },
  { pseudonym: 'p-8e2b40', label: 'Rowan Newman (Payments, Developer)' },
];

/** A descriptor as Backstage keeps it; the mock does not read it, the app sends it as text. */
export const DESCRIPTOR = [
  'apiVersion: backstage.io/v1alpha1',
  'kind: Component',
  'metadata:',
  '  name: checkout-ui',
  'spec:',
  '  type: service',
  '  lifecycle: production',
  '  owner: group:default/payments',
].join('\n');

/** What `window.localStorage` and the page show for a pseudonym: a `p-` and six hexadecimal digits. */
export const PSEUDONYM = /\bp-[0-9a-f]{6}\b/;

/**
 * Signs in at the mock and waits for the view at the returned address. On a phone the top bar shows only the last step
 * of a path, so the title (which `login` waits for) is not always visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 * @param view the test id of the view that must show
 */
export async function loginToDirectory(page, address, view) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId(view)).toBeVisible();
}

/**
 * Pastes a descriptor into the import page and takes it over.
 *
 * @param page the page, at the first step of the import
 * @param text the text to paste
 */
export async function pasteDescriptor(page, text = DESCRIPTOR) {
  await page.getByTestId('import-paste').fill(text);
  await page.getByTestId('import-paste-add').click();
}

/**
 * Fills the first row of the prefill with a person.
 *
 * @param page the page
 * @param row the position of the row
 * @param person the name, and the team and role as the selects name them
 */
export async function fillPerson(page, row, { name, team = 'Payments', role = 'Developer' }) {
  await page.getByTestId(`person-row-${row}-name`).fill(name);
  await page.getByTestId(`person-row-${row}-membership-0-team`).selectOption({ label: team });
  await page.getByTestId(`person-row-${row}-membership-0-role`).selectOption({ label: role });
}
