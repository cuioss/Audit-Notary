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
import {
  NEW_SCOPE_ADDRESS,
  OPEN,
  RELEASED,
  assessmentAddress,
  choose,
  fillNewAssessment,
  newAssessmentAddress,
  patchRead,
  trendPath,
} from './helpers/samm.js';
import {
  PAIR,
  REPORTS_ADDRESS,
  RISKS_ADDRESS,
  RISKS_PATH,
  SUMMARY_PATH,
  THREATS_ADDRESS,
  TREND_ADDRESS,
  TREND_PATH,
  compareAddress,
  risksAddress,
  trendAddress,
} from './helpers/reports.js';

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
  ['workshop', '/threat-models', 'threat-evaluation-table'],
  ['release', '/threat-models', 'threat-forbidden'],
  ['workshop', '/threat-models/payment-api', 'model-list'],
  ['workshop', '/threat-models/report-scheduler/new', 'new-threat-model-sheet'],
  ['workshop', '/threat-models/payment-api/checkout-flow', 'threat-model-sheet'],
  ['workshop', '/threat-models/payment-api/checkout-flow?at=v1', 'threat-model-sheet'],
  ['read-only', '/threat-models/payment-api/checkout-flow', 'threat-model-sheet'],
  [
    'workshop#threat-model-in-review',
    '/threat-models/payment-api/checkout-flow/release',
    'release-record',
  ],
  ['workshop', '/reports', 'reports-view'],
  ['workshop', '/reports/samm-trend', 'trend-chart'],
  ['workshop', '/reports/samm-trend?scope=payments', 'trend-functions-chart'],
  ['workshop', '/reports/samm-compare?scope=payments&from=2025-q4&to=2026-q2', 'compare-chart'],
  ['workshop', '/reports/threat-evaluation', 'threat-evaluation-table'],
  ['release', '/reports/threat-evaluation', 'threat-forbidden'],
  ['workshop', '/reports/risk-register', 'risk-table'],
  ['workshop', '/reports/risk-register?as-of=2027-01-01', 'risk-refused'],
  ['empty', '/reports', 'reports-view'],
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

/**
 * The SAMM completion (UC-SAMM-1 to UC-SAMM-5), each state reached on the page after the theme is chosen: the forms of a
 * new scope and a new assessment with their refusals and notices, the targets with their conflict and refusal, the
 * evidence links with the editor, the question before a removal and a refusal, the frozen practice, the refused comparison and
 * the trend with the model versions it leaves out. `shown` is the test id that proves the state is on the page.
 */
const SAMM_COMPLETION_STATES = [
  [
    'a new scope',
    'workshop',
    NEW_SCOPE_ADDRESS,
    'new-scope-sheet',
    'new-scope-targets-editor',
    async () => {},
  ],
  [
    'a new scope that was refused',
    'workshop#scope-invalid',
    NEW_SCOPE_ADDRESS,
    'new-scope-sheet',
    'notice',
    async (page) => {
      await page.getByTestId('new-scope-title').fill('Bad');
      await choose(page, 'new-scope-subject', 'Payments');
      await choose(page, 'new-scope-targets-editor-ta-target', '2.5');
      await page.getByTestId('create-scope').click();
    },
  ],
  [
    'a new scope without the right',
    'read-only',
    NEW_SCOPE_ADDRESS,
    'new-scope-no-right',
    'new-scope-no-right',
    async () => {},
  ],
  [
    'a new scope without a pinned model',
    'workshop#models-none',
    NEW_SCOPE_ADDRESS,
    'new-scope-no-model',
    'new-scope-no-model',
    async () => {},
  ],
  [
    'a new assessment',
    'workshop',
    newAssessmentAddress('shop'),
    'new-assessment-sheet',
    'assessor-self',
    async (page) => {
      await page.getByTestId('assessor-add').click();
    },
  ],
  [
    'a new assessment while one is open',
    'workshop',
    newAssessmentAddress('payments'),
    'new-assessment-sheet',
    'open-notice',
    async () => {},
  ],
  [
    'a new assessment that was refused',
    'workshop#assessment-invalid',
    newAssessmentAddress('shop'),
    'new-assessment-sheet',
    'save-state',
    async (page) => {
      await fillNewAssessment(page, 'Web shop 2026 Q4');
      await page.getByTestId('create-assessment').click();
      await expect(page.getByTestId('new-assessment-date')).toHaveAttribute('aria-invalid', 'true');
    },
  ],
  [
    'the targets of a scope',
    'workshop',
    '/samm/payments',
    'scope-sheet',
    'targets-ta-target',
    async () => {},
  ],
  [
    'the targets that were changed',
    'workshop',
    '/samm/payments',
    'scope-sheet',
    'save-targets',
    async (page) => {
      await choose(page, 'targets-ta-target', '3');
    },
  ],
  [
    'a conflict of the targets',
    'workshop#targets-conflict',
    '/samm/payments',
    'scope-sheet',
    'conflict-target-ta',
    async (page) => {
      await choose(page, 'targets-ta-target', '3');
      await page.getByTestId('save-targets').click();
    },
  ],
  [
    'the targets that were refused',
    'workshop#targets-invalid',
    '/samm/payments',
    'scope-sheet',
    'targets-failure',
    async (page) => {
      await choose(page, 'targets-ta-target', '3');
      await page.getByTestId('save-targets').click();
      await expect(page.getByTestId('targets-ta-target')).toHaveAttribute('aria-invalid', 'true');
    },
  ],
  [
    'the targets read only',
    'read-only',
    '/samm/payments',
    'scope-sheet',
    'targets',
    async () => {},
  ],
  [
    'the trend with the versions it leaves out',
    'workshop',
    '/samm/payments',
    'scope-sheet',
    'trend-omitted',
    async (page) => {
      await patchRead(page, `**${trendPath('payments')}`, (trend) => ({ ...trend, omitted: 2 }));
      await page.reload();
    },
  ],
  [
    'the evidence of a practice',
    'workshop',
    assessmentAddress(OPEN.scope, OPEN.assessment, 'sb'),
    'practice-sheet',
    'evidence-editor-table',
    async () => {},
  ],
  [
    'the editor of an evidence link',
    'workshop',
    assessmentAddress(OPEN.scope, OPEN.assessment, 'sb'),
    'practice-sheet',
    'evidence-editor-field-url',
    async (page) => {
      await page.getByRole('button', { name: 'Add row' }).click();
      await page.getByTestId('evidence-editor-apply').click();
    },
  ],
  [
    'the question before an evidence link is removed',
    'workshop',
    assessmentAddress(OPEN.scope, OPEN.assessment, 'sb'),
    'practice-sheet',
    'evidence-editor-remove-confirm',
    async (page) => {
      await page.getByRole('button', { name: 'Remove row 1' }).click();
    },
  ],
  [
    'the evidence that was refused',
    'workshop#evidence-invalid',
    assessmentAddress(OPEN.scope, OPEN.assessment, 'sb'),
    'practice-sheet',
    'evidence-editor-errors',
    async (page) => {
      await page.getByTestId('comment-sb-b-1').fill('x');
      await page.getByTestId('save-everyone').click();
    },
  ],
  [
    'a frozen practice with its evidence',
    'workshop',
    assessmentAddress(RELEASED.scope, RELEASED.assessment, 'sb'),
    'practice-sheet',
    'start-new-assessment',
    async () => {},
  ],
  [
    'a frozen assessment',
    'workshop',
    assessmentAddress(RELEASED.scope, RELEASED.assessment),
    'assessment-sheet',
    'start-new-assessment',
    async () => {},
  ],
  [
    'the refused comparison',
    'workshop#model-versions-differ',
    assessmentAddress(RELEASED.scope, RELEASED.assessment),
    'assessment-sheet',
    'versions-differ',
    async () => {},
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, shown, prepare] of SAMM_COMPLETION_STATES) {
    test(`samm completion: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await prepare(page);
      await expect(page.getByTestId(shown).first()).toBeVisible();
      await expectNoSeriousViolations(page, `samm completion: ${name} (${scenario}, ${theme})`);
    });
  }
}

/**
 * The states of the lens Reports (UC-SAMM-5, UC-TM-4, UC-ISMS-3) beside the views above: the notices, the refusals, the empty
 * and the unavailable registers, the trend of one scope with what it leaves out, the comparison with its practices
 * opened. Each is reached on the page after the theme is chosen, which reloads it.
 */
const REPORT_STATES = [
  [
    'the dashboard of a person who may read no register',
    'workshop',
    REPORTS_ADDRESS,
    'reports-view',
    'reports-view',
    async (page) => {
      // The mock has no such session; the answer is cut down to its date.
      await patchRead(page, `**${SUMMARY_PATH}`, ({ today }) => ({ today }));
      await page.reload();
      await expect(page.getByText('No report to show')).toBeVisible();
    },
  ],
  [
    'the dashboard without threat models',
    'workshop#no-threat-models',
    REPORTS_ADDRESS,
    'reports-view',
    'reports-threats',
    async () => {},
  ],
  [
    'the dashboard of a person who may not read the threat models',
    'release',
    REPORTS_ADDRESS,
    'reports-view',
    'reports-risks',
    async () => {},
  ],
  [
    'the trend with the versions of the model',
    'workshop#trend-mixed-models',
    TREND_ADDRESS,
    'samm-trend-view',
    'trend-versions',
    async () => {},
  ],
  [
    'the trend with an assessment it leaves out',
    'workshop#trend-mixed-models',
    TREND_ADDRESS,
    'samm-trend-view',
    'trend-omitted',
    async () => {},
  ],
  [
    'the trend of a scope that is not there',
    'workshop',
    trendAddress('nope'),
    'samm-trend-view',
    'trend-scope-unknown',
    async () => {},
  ],
  [
    'the trend of a scope without a release',
    'workshop',
    trendAddress('identity'),
    'samm-trend-view',
    'trend-scope-section',
    async () => {},
  ],
  [
    'the trend of a scope with one assessment',
    'workshop',
    trendAddress('shop'),
    'samm-trend-view',
    'trend-functions-chart',
    async () => {},
  ],
  [
    'the trend with a sixth scope in the table only',
    'workshop',
    TREND_ADDRESS,
    'samm-trend-view',
    'trend-beyond',
    async (page) => {
      await patchRead(page, `**${TREND_PATH}`, (trend) => {
        const shop = trend.scopes.find((scope) => scope.scope === 'shop');
        const copy = (id) => ({
          ...shop,
          scope: id,
          title: id,
          points: shop.points.map((point) => ({ ...point, assessment: `${id}-1`, title: id })),
        });
        return { ...trend, scopes: [...trend.scopes, copy('extra-a'), copy('extra-b')] };
      });
      await page.reload();
    },
  ],
  [
    'the trend of the empty installation',
    'empty',
    TREND_ADDRESS,
    'samm-trend-view',
    'samm-trend-view',
    async () => {},
  ],
  [
    'the pairs of a scope and its pickers',
    'workshop',
    compareAddress('payments'),
    'samm-compare-view',
    'compare-pairs',
    async () => {},
  ],
  [
    'the scope that has too few assessments to compare',
    'workshop',
    compareAddress('shop'),
    'samm-compare-view',
    'compare-too-few',
    async () => {},
  ],
  [
    'the practices of a business function opened',
    'workshop',
    compareAddress(PAIR.scope, PAIR.from, PAIR.to),
    'samm-compare-view',
    'dumbbell-governance-sm-A',
    async (page) => {
      await page.getByText('Practices of Governance').click();
    },
  ],
  [
    'the comparison of two model versions that is refused',
    'workshop#model-versions-differ',
    compareAddress(PAIR.scope, PAIR.from, PAIR.to),
    'samm-compare-view',
    'compare-differ',
    async () => {},
  ],
  [
    'the comparison with an assessment that is missing',
    'workshop',
    compareAddress(PAIR.scope, 'nope', PAIR.to),
    'samm-compare-view',
    'compare-missing',
    async () => {},
  ],
  [
    'the threat evaluation in another order',
    'workshop',
    THREATS_ADDRESS,
    'threat-evaluation-view',
    'threat-evaluation-table',
    async (page) => {
      await choose(page, 'threat-evaluation-sort', 'Open threats');
    },
  ],
  [
    'the threat evaluation without a model',
    'workshop#no-threat-models',
    THREATS_ADDRESS,
    'threat-evaluation-view',
    'threat-evaluation-none',
    async () => {},
  ],
  [
    'the threat evaluation of the empty installation',
    'empty',
    THREATS_ADDRESS,
    'threat-evaluation-view',
    'threat-evaluation-view',
    async () => {},
  ],
  [
    'the risk register of a day',
    'workshop',
    risksAddress('2026-03-01'),
    'risk-register-view',
    'risk-earlier-commit',
    async () => {},
  ],
  [
    'the risk register of a tag',
    'workshop',
    risksAddress('audit-2026-03'),
    'risk-register-view',
    'risk-table',
    async () => {},
  ],
  [
    'the risk register of a day before its first commit',
    'workshop',
    risksAddress('2025-06-01'),
    'risk-register-view',
    'risk-before-first',
    async () => {},
  ],
  [
    'the risk register of a day that has not come',
    'workshop',
    risksAddress('2027-01-01'),
    'risk-register-view',
    'risk-refused',
    async () => {},
  ],
  [
    'the risk register of a name that is no tag',
    'workshop',
    risksAddress('no-such-tag'),
    'risk-register-view',
    'risk-refused',
    async () => {},
  ],
  [
    'the risk register while the Git server is down',
    'workshop#risk-register-git-unavailable',
    risksAddress('2026-03-01'),
    'risk-register-view',
    'risk-git-unavailable',
    async () => {},
  ],
  [
    'the empty risk register',
    'workshop#risk-register-empty',
    RISKS_ADDRESS,
    'risk-register-view',
    'risk-result',
    async () => {},
  ],
  [
    'the risk register of a person who may not read it',
    'workshop',
    RISKS_ADDRESS,
    'risk-register-view',
    'risk-forbidden',
    async (page) => {
      // The mock has no profile that reads the reports and not the register; the register answers as the server does.
      await page.route(`**${RISKS_PATH}**`, (route) =>
        route.fulfill({ status: 403, json: { outcome: 'FORBIDDEN' } }),
      );
      await page.reload();
    },
  ],
];

for (const theme of ['light', 'dark']) {
  for (const [name, scenario, address, view, shown, prepare] of REPORT_STATES) {
    test(`reports: ${name} of ${scenario} at ${address} in the ${theme} theme`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await login(page, address);
      await useTheme(page, theme);
      await expect(page.getByTestId(view)).toBeVisible();
      await prepare(page);
      await expect(page.getByTestId(shown).first()).toBeVisible();
      await expectNoSeriousViolations(page, `reports: ${name} (${scenario}, ${theme})`);
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
