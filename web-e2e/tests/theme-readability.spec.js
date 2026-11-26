import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations, useTheme } from './helpers/a11y.js';
import { gotoState, useScenario } from './helpers/mock.js';
import { login, loginLocal } from './helpers/login.js';
import { NOTES, field, noteAddress } from './helpers/documents.js';
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
