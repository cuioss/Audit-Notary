import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, useTheme } from './helpers/a11y.js';
import { gotoState, useScenario } from './helpers/mock.js';
import { login, loginLocal } from './helpers/login.js';
import { NOTES, field, noteAddress } from './helpers/documents.js';
import {
  CANDIDATES,
  DESCRIPTOR,
  IMPORT_ADDRESS,
  PERSONS_ADDRESS,
  PROFILE_ADDRESS,
  WELCOME_ADDRESS,
  fillPerson,
  pasteDescriptor,
} from './helpers/directory.js';
import {
  catalogAddress,
  entryAddress,
  fillNewService,
  newEntryAddress,
} from './helpers/catalogs.js';

/**
 * AUN-WEB-2: axe-core on every view in both themes; no violation of impact serious or critical.
 */
const VIEWS = [
  ['workshop', '/', 'due-view'],
  ['empty', '/', 'due-view'],
  ['workshop', '/samm', 'samm-overview'],
  ['workshop', '/samm/payments', 'scope-sheet'],
  ['workshop', '/samm/payments/2026-q4', 'assessment-sheet'],
  ['workshop', '/samm/payments/2026-q4/sm', 'practice-sheet'],
  ['read-only', '/samm/payments/2026-q4/sm', 'practice-sheet'],
  ['release', '/samm/payments/2026-q4/release', 'release-view'],
  ['workshop', '/threat-models', 'lens-view'],
  ['workshop', '/settings', 'settings-view'],
  ['workshop', '/no/such/view/at/all', 'not-found-view'],
  ['degraded', '/', 'due-view'],
  ['first-login', '/welcome', 'welcome-view'],
  // The notice of local test accounts on a shell page, and a session without a right (UC-ACC-7).
  ['local', '/', 'due-view'],
  ['no-rights', '/', 'no-rights-view'],
  ['no-rights', '/samm', 'no-rights-view'],
];

/**
 * The states of the documents lens (UC-DOC-1 to UC-DOC-6): each one is reached on the page, after the theme is chosen,
 * because choosing it reloads the page and a state that was reached by acting would be gone.
 */
const DOCUMENT_STATES = [
  ['the list', 'workshop', '/categories/test-note', 'document-list', async () => {}],
  ['the sheet', 'workshop', noteAddress(NOTES.N2), 'document-sheet', async () => {}],
  [
    'a conflict to decide',
    'workshop#note-conflict',
    noteAddress(NOTES.N2),
    'conflict-panel',
    async (page) => {
      await field(page, '/summary').getByRole('textbox').fill('Rotate every 90 days.');
      await field(page, '/status').getByRole('combobox').selectOption({ label: 'Agreed' });
      await page.getByTestId('save-everyone').click();
    },
  ],
  [
    'an earlier state',
    'workshop',
    noteAddress(NOTES.N6, '?at=v1'),
    'revision-notice',
    async () => {},
  ],
  ['a new document', 'workshop', '/categories/test-note/new', 'new-document-sheet', async () => {}],
  [
    'the mandatory fields that are empty',
    'workshop',
    noteAddress(NOTES.N3),
    'missing-fields',
    async (page) => {
      await page.getByTestId('transition-test-note.submit').click();
    },
  ],
  [
    'a sheet that is read only',
    'read-only',
    noteAddress(NOTES.N2),
    'document-sheet',
    async () => {},
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, prepare] of DOCUMENT_STATES) {
    test(`documents: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId('documents-view')).toBeVisible();
      await prepare(page);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `documents: ${name} (${scenario}, ${theme})`);
    });
  }
}

/**
 * The release of a note (UC-DOC-7) and the search of the documents (UC-DOC-1), each state reached on the page after the
 * theme is chosen. The Due list of `workshop` holds the release requests (UC-DOC-8), so its row above audits them too.
 */
const RELEASE_STATES = [
  [
    'the review of a first release',
    'workshop',
    `${noteAddress(NOTES.N4)}/release`,
    'release-record',
    async () => {},
  ],
  [
    'the review against the last release, with the request',
    'workshop',
    `${noteAddress(NOTES.N5)}/release`,
    'release-request',
    async () => {},
  ],
  [
    'the seal of a release',
    'workshop#note-release-request',
    `${noteAddress(NOTES.N5)}/release`,
    'release-seal',
    async (page) => {
      await page.getByTestId('release-act').click();
      await expect(page.getByTestId('release-done')).toBeVisible();
    },
  ],
  [
    'a refused release',
    'workshop#note-release-incomplete',
    `${noteAddress(NOTES.N4)}/release`,
    'release-record',
    async (page) => {
      await page.getByTestId('release-act').click();
      await expect(page.getByTestId('release-view').getByTestId('notice').first()).toBeVisible();
    },
  ],
  [
    'the confirmation of the release',
    'workshop#note-release-password',
    `${noteAddress(NOTES.N4)}/release`,
    'release-password',
    async (page) => {
      await page.getByTestId('release-act').click();
    },
  ],
  [
    'a release that cannot be taken',
    'read-only',
    `${noteAddress(NOTES.N4)}/release`,
    'release-act',
    async () => {},
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, prepare] of RELEASE_STATES) {
    test(`release: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId('release-view')).toBeVisible();
      await prepare(page);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `release: ${name} (${scenario}, ${theme})`);
    });
  }

  test(`the command palette with results of workshop in the ${theme} theme`, async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await useTheme(page, theme);
    await page.getByTestId('search-open').click();
    await page.getByTestId('search-input').fill('Q4');
    await expect(page.getByTestId('search-documents')).toBeVisible();
    await expectNoSeriousViolations(page, `command palette with results (${theme})`);
    await page.getByTestId('search-input').fill('zzzz');
    await expect(page.getByTestId('search-status')).toContainText('No document matches.');
    await expectNoSeriousViolations(page, `command palette without a match (${theme})`);
  });
}

/**
 * The states of the catalogs lens (UC-CAT-1, UC-CAT-2): each one is reached on the page, after the theme is chosen,
 * because choosing it reloads the page and a state that was reached by acting would be gone.
 */
const CATALOG_STATES = [
  [
    'the catalogs and the entries of the first',
    'workshop',
    catalogAddress('team'),
    'entry-list',
    async () => {},
  ],
  ['the list of the services', 'workshop', catalogAddress('service'), 'entry-list', async () => {}],
  [
    'the filter without a match',
    'workshop',
    catalogAddress('service'),
    'catalog-list',
    async (page) => {
      await page.getByTestId('filter-name').fill('no such service');
      await expect(page.getByText('No entry matches')).toBeVisible();
    },
  ],
  [
    'a catalog without entries',
    'empty',
    catalogAddress('service'),
    'catalog-list',
    async (page) => {
      await expect(page.getByText('No entries yet')).toBeVisible();
    },
  ],
  [
    'the sheet of a service with its needs',
    'workshop',
    entryAddress('service', 'payment-api'),
    'service-needs',
    async () => {},
  ],
  [
    'the sheet of a service on a circle',
    'workshop',
    entryAddress('service', 'reporting'),
    'cycle-notice',
    async () => {},
  ],
  [
    'the sheet of a team',
    'workshop',
    entryAddress('team', 'payments'),
    'entry-sheet',
    async () => {},
  ],
  [
    'a sheet without the right',
    'read-only',
    entryAddress('service', 'payment-api'),
    'save-state',
    async () => {},
  ],
  [
    'the form of a new service',
    'catalog-admin',
    newEntryAddress('service'),
    'entry-form',
    async () => {},
  ],
  [
    'a retired entry',
    'catalog-admin',
    entryAddress('service', 'ledger'),
    'retired-notice',
    async () => {},
  ],
  [
    'the question before a retirement',
    'catalog-admin',
    entryAddress('service', 'customer-portal'),
    'retire-confirm',
    async (page) => {
      await page.getByTestId('retire-entry').click();
    },
  ],
  [
    'the question before a retirement with changes',
    'catalog-admin',
    entryAddress('service', 'customer-portal'),
    'retire-dirty',
    async (page) => {
      await field(page, '/description').getByRole('textbox').fill('Typed, not saved.');
      await page.getByTestId('retire-entry').click();
    },
  ],
  [
    'a form with field errors',
    'catalog-admin#catalog-invalid',
    newEntryAddress('service'),
    'failure-notice',
    async (page) => {
      await fillNewService(page, field, {
        id: 'notification-gateway',
        name: 'Notification gateway',
      });
      await page.getByTestId('save-entry').click();
    },
  ],
  [
    'an id that is taken',
    'catalog-admin#catalog-id-taken',
    newEntryAddress('service'),
    'failure-notice',
    async (page) => {
      await fillNewService(page, field, { id: 'ledger', name: 'Ledger again' });
      await page.getByTestId('save-entry').click();
    },
  ],
  [
    'a Git server that cannot be reached',
    'catalog-admin#git-unavailable',
    entryAddress('service', 'payment-api'),
    'failure-notice',
    async (page) => {
      await field(page, '/description').getByRole('textbox').fill('Kept.');
      await page.getByTestId('save-entry').click();
    },
  ],
  [
    'a change by someone else over an edit',
    'catalog-admin',
    entryAddress('service', 'payment-api'),
    'stale-notice',
    async (page, request) => {
      await field(page, '/description').getByRole('textbox').fill('My own wording.');
      await gotoState(request, 'catalog-changed-elsewhere');
    },
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, prepare] of CATALOG_STATES) {
    test(`catalogs: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId('catalogs-view')).toBeVisible();
      await prepare(page, request);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `catalogs: ${name} (${scenario}, ${theme})`);
    });
  }
}

/**
 * The directory pages (UC-ACC-4, UC-ACC-5, UC-CAT-3 to UC-CAT-5): each state is reached on the page, after the theme is
 * chosen, because choosing it reloads the page. `view` is the root of the page; `shown` is what the state must show.
 */
const DIRECTORY_STATES = [
  [
    'the choice of the documents',
    'catalog-admin',
    IMPORT_ADDRESS,
    'import-view',
    'import-choose',
    async () => {},
  ],
  [
    'the chosen documents',
    'catalog-admin',
    IMPORT_ADDRESS,
    'import-view',
    'import-documents',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
    },
  ],
  [
    'the check of the import',
    'catalog-admin',
    IMPORT_ADDRESS,
    'import-view',
    'import-left-out',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
      await page.getByTestId('import-check').click();
    },
  ],
  [
    'the result of the import',
    'catalog-admin',
    IMPORT_ADDRESS,
    'import-view',
    'import-updated',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
      await page.getByTestId('import-check').click();
      await page.getByTestId('import-apply').click();
      await expect(page.getByTestId('import-again')).toBeVisible();
    },
  ],
  [
    'an import without news',
    'catalog-admin#import-nothing-new',
    IMPORT_ADDRESS,
    'import-view',
    'import-left-out',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
      await page.getByTestId('import-check').click();
    },
  ],
  [
    'a descriptor that is not valid',
    'catalog-admin#import-invalid',
    IMPORT_ADDRESS,
    'import-view',
    'import-document-invalid',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
      await page.getByTestId('import-check').click();
    },
  ],
  [
    'a request that is too large',
    'catalog-admin#import-too-large',
    IMPORT_ADDRESS,
    'import-view',
    'import-failure',
    async (page) => {
      await pasteDescriptor(page, DESCRIPTOR);
      await page.getByTestId('import-check').click();
    },
  ],
  [
    'the import without the right',
    'workshop',
    IMPORT_ADDRESS,
    'import-view',
    'import-view',
    async () => {},
  ],
  [
    'the persons with the prefill',
    'catalog-admin',
    PERSONS_ADDRESS,
    'persons-view',
    'persons-add',
    async () => {},
  ],
  [
    'the persons without the right',
    'read-only',
    PERSONS_ADDRESS,
    'persons-view',
    'persons-read-only',
    async () => {},
  ],
  [
    'the persons of an empty installation',
    'empty',
    PERSONS_ADDRESS,
    'persons-view',
    'persons-add',
    async () => {},
  ],
  [
    'the prefill with a refusal on its row',
    'catalog-admin#persons-invalid',
    PERSONS_ADDRESS,
    'persons-view',
    'person-row-0',
    async (page) => {
      await fillPerson(page, 0, { name: 'Nadia Kovac' });
      await page.getByTestId('persons-add-row').click();
      await fillPerson(page, 1, { name: 'Omar Haddad' });
      await page.getByTestId('persons-submit').click();
      await expect(page.getByTestId('person-row-1')).toContainText('leads nowhere');
    },
  ],
  [
    'the question before an erasure',
    'catalog-admin',
    PERSONS_ADDRESS,
    'persons-view',
    'erase-confirm',
    async (page) => {
      await page.getByTestId('erase-p-2b7f10').click();
    },
  ],
  [
    'persons kept in the source of the organisation',
    'catalog-admin#erase-managed-by-source',
    PERSONS_ADDRESS,
    'persons-view',
    'managed-notice',
    async (page) => {
      await page.getByTestId('erase-p-2b7f10').click();
      await page.getByTestId('erase-confirm').click();
    },
  ],
  [
    'the own entry',
    'workshop',
    PROFILE_ADDRESS,
    'profile-view',
    'profile-last-confirmed',
    async () => {},
  ],
  [
    'the own entry with the question "Is this still right?"',
    'workshop#confirmation-due',
    PROFILE_ADDRESS,
    'profile-view',
    'profile-confirm',
    async () => {},
  ],
  [
    'the own entry with changes that are not saved',
    'workshop#confirmation-due',
    PROFILE_ADDRESS,
    'profile-view',
    'profile-confirm',
    async (page) => {
      await page.getByTestId('profile-name').fill('Alexandra Example');
      await expect(page.getByTestId('profile-confirm-act')).toBeDisabled();
    },
  ],
  [
    'the own entry refused by the server',
    'workshop#entry-invalid',
    PROFILE_ADDRESS,
    'profile-view',
    'profile-save',
    async (page) => {
      await page.getByTestId('profile-name').fill('Alexandra Example');
      await page.getByTestId('profile-save').click();
      await expect(page.getByTestId('profile-view')).toContainText('leads nowhere');
    },
  ],
  [
    'the notice of a due confirmation on a shell page',
    'workshop#confirmation-due',
    '/',
    'due-view',
    'confirmation-notice',
    async () => {},
  ],
  [
    'the entries a first login is offered',
    'first-login#candidates',
    WELCOME_ADDRESS,
    'welcome-view',
    'welcome-candidates',
    async (page) => {
      await page.getByTestId('welcome-role').selectOption({ label: 'Developer' });
      await page.getByTestId('welcome-save').click();
      await expect(page.getByRole('radio', { name: CANDIDATES[0].label })).toBeVisible();
    },
  ],
  [
    'an entry that cannot be taken over',
    'first-login#candidates-not-bindable',
    WELCOME_ADDRESS,
    'welcome-view',
    'welcome-candidates',
    async (page) => {
      await page.getByTestId('welcome-role').selectOption({ label: 'Developer' });
      await page.getByTestId('welcome-save').click();
      await page.getByRole('radio', { name: CANDIDATES[0].label }).check();
      await page.getByTestId('welcome-continue').click();
      await expect(page.getByTestId('welcome-candidates')).toContainText('cannot be taken over');
    },
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, shown, prepare] of DIRECTORY_STATES) {
    test(`directory: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await prepare(page);
      await expect(page.getByTestId(shown).first()).toBeVisible();
      await expectNoSeriousViolations(page, `directory: ${name} (${scenario}, ${theme})`);
    });
  }
}

/** The pages outside the shell: no login, no shell (UC-ACC-1, UC-ACC-2). */
const OUTSIDE_VIEWS = [
  ['local', '/login', 'login-view'],
  ['workshop', '/signed-out', 'signed-out-view'],
  ['login-trouble#idp-unavailable', '/login-problem?reason=idp-unavailable', 'login-problem-view'],
  ['login-trouble#too-many-logins', '/login-problem?reason=too-many-logins', 'login-problem-view'],
  [
    'login-trouble#unknown-transaction',
    '/login-problem?reason=unknown-transaction',
    'login-problem-view',
  ],
  ['login-trouble#recovered', '/login-problem', 'login-problem-view'],
];

for (const theme of ['light', 'dark']) {
  for (const [scenario, address, view] of VIEWS) {
    test(`${view} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await (scenario === 'local' ? loginLocal : login)(
        page,
        address === '/no/such/view/at/all' ? '/' : address,
      );
      if (address === '/no/such/view/at/all') await page.goto(address);
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `${view} (${scenario}, ${theme})`);
    });
  }
}

for (const theme of ['light', 'dark']) {
  for (const [scenario, address, view] of OUTSIDE_VIEWS) {
    test(`${view} outside the shell of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await page.goto(address);
      await expect(page.getByTestId(view)).toBeVisible();
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await expectNoSeriousViolations(page, `${view} (${scenario}, ${theme})`);
    });
  }
}

test('the command palette passes the audit', async ({ page, request }) => {
  await useScenario(request, 'workshop');
  await login(page, '/');
  await page.getByTestId('search-open').click();
  await expect(page.getByTestId('search-input')).toBeVisible();
  await expectNoSeriousViolations(page, 'command palette');
});
