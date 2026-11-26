import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import {
  CATALOGS,
  catalogAddress,
  changePath,
  createPath,
  entryAddress,
  fillNewService,
  newEntryAddress,
  retirePath,
} from './helpers/catalogs.js';
import { field, sentTo, useLanguage } from './helpers/documents.js';
import { acts, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * The catalogs lens (UC-CAT-1, UC-CAT-2; AUN-DIR-4, AUN-DIR-5): the five catalogs, their entries, the entry as a sheet
 * generated from the schema, create, change, retire behind a confirmation, the retired entry and the user without the
 * right reading only, the protection needs a service comes to, and the refusals, against the profiles `workshop`,
 * `read-only`, `catalog-admin` and `empty` of the mock (web-mock/README.adoc, Directory and Catalogs). The pages of the
 * directory (`/directory/import`, `/directory/persons`: UC-CAT-3 to UC-CAT-5) are not built yet and have no test here.
 */
const FORBIDDEN = 'You have no right for this action.';
const ID_TAKEN = 'An entry with this id exists already';
const REJECTED = 'The Git server refused the change.';
const GIT_UNAVAILABLE = 'The Git server cannot be reached.';
const NO_RIGHT = 'Changing the catalogs needs the right to administer them.';

// Room for the catalogs, the entries and the sheet side by side (the sheet asks for 780 px); the narrower window has
// its own test, and the phone layout is in mobile.spec.js.
test.use({ viewport: { width: 1600, height: 1000 } });

/** @returns the state-changing requests recorded since the last clear */
async function writes(request) {
  return (await acts(request)).filter((act) => act.method !== 'GET');
}

test.describe('the catalogs and their entries (UC-CAT-1)', () => {
  test('the first visit opens the first catalog, and a later one shows the catalogs', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await page.goto(`/api/v1/auth/login?return=${encodeURIComponent('/catalogs')}`);
    await expect(page.getByTestId('view-title')).toBeVisible();
    await expect(page).toHaveURL(catalogAddress('team'));
    await expect(page.getByTestId('view-title')).toHaveText('Catalogs');
    const catalogs = page.getByTestId('catalog-list');
    for (const catalog of CATALOGS) {
      await expect(catalogs.getByTestId(`catalog-${catalog}`)).toBeVisible();
    }
    await expect(catalogs.getByTestId('catalog-team')).toHaveAttribute('aria-current', 'page');
    await expect(catalogs.getByTestId('catalog-service')).toContainText('Services');
    await expect(catalogs.getByTestId('catalog-service')).toContainText(
      'The services with their owner, their dependencies and their protection needs.',
    );
    await expect(catalogs.getByTestId('catalog-external')).toContainText('External parties');
    // The first catalog lists its entries, the retired one marked.
    const list = page.getByTestId('entry-list');
    await expect(list.getByRole('link')).toHaveCount(5);
    await expect(page.getByTestId('entry-payments')).toContainText('Payments');
    await expect(page.getByTestId('entry-legacy-billing')).toContainText('Retired');
    await expect(page.getByTestId('entry-payments')).not.toContainText('Retired');
    await expect(page.getByText('5 entries')).toBeVisible();
    // The rail leads to the catalogs again: the first visit has been made, so no catalog is opened for the person.
    await page.getByTestId('nav-catalogs').click();
    await expect(page).toHaveURL('/catalogs');
    await expect(page.getByTestId('catalog-list')).toBeVisible();
    await expect(page.getByTestId('entry-list')).toHaveCount(0);
  });

  test('another catalog opens at its address, and a reload restores the same view', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, catalogAddress('team'));
    await page.getByTestId('catalog-service').click();
    await expect(page).toHaveURL(catalogAddress('service'));
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(8);
    await expect(page.getByTestId('entry-ledger')).toContainText('Retired');
    await expect(page.getByTestId('entry-payment-api')).toContainText('payment-api');
    await page.reload();
    await expect(page.getByTestId('catalog-service')).toHaveAttribute('aria-current', 'page');
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(8);
    await page.getByTestId('catalog-external').click();
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(4);
    await expect(page.getByTestId('entry-old-sms-gateway')).toContainText('Retired');
    await page.getByTestId('catalog-role').click();
    await expect(page.getByTestId('entry-release-manager')).toContainText('Retired');
  });

  test('the filter narrows the list by name and by id, and an empty answer says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, catalogAddress('service'));
    const list = page.getByTestId('entry-list');
    await page.getByTestId('filter-name').fill('REPORT');
    await expect(list.getByRole('link')).toHaveCount(2);
    await expect(list).toContainText('Reporting Service');
    await expect(list).toContainText('Report scheduler');
    await page.getByTestId('filter-name').fill('customer-db');
    await expect(list.getByRole('link')).toHaveCount(1);
    await expect(list).toContainText('Customer database');
    await page.getByTestId('filter-name').fill('no such service');
    await expect(list).toHaveCount(0);
    await expect(page.getByText('No entry matches')).toBeVisible();
    await page.getByTestId('filter-name').fill('');
    await expect(list.getByRole('link')).toHaveCount(8);
  });

  test('a selected entry opens as a sheet at its address, with the list beside it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, catalogAddress('service'));
    await page.getByTestId('entry-payment-api').click();
    await expect(page).toHaveURL(entryAddress('service', 'payment-api'));
    await expect(page.getByTestId('entry-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payment API');
    await expect(page.getByTestId('entry-payment-api')).toHaveAttribute('aria-current', 'page');
    // The form is generated from the schema of the catalog; the id cannot change.
    await expect(field(page, '/name').getByRole('textbox')).toHaveValue('Payment API');
    await expect(field(page, '/id')).toContainText('payment-api');
    await expect(field(page, '/lifecycle').locator('option:checked')).toHaveText('Active');
    await expect(field(page, '/owner/team').locator('option:checked')).toHaveText('Payments');
    await expect(field(page, '/owner/role').locator('option:checked')).toHaveText('Service Owner');
    await expect(field(page, '/name')).toContainText('required');
    // The signed history stands in the margin, the newest first.
    const history = page.getByTestId('entry-history');
    await expect(history).toContainText('Saved the entry');
    await expect(history).toContainText('Created the entry');
    await expect(history).toContainText('Noor Haddad');
    await page.reload();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Payment API');
    await expect(page.getByTestId('entry-payment-api')).toHaveAttribute('aria-current', 'page');
  });

  test('the sheet of a catalog without a service follows the schema of that catalog', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('team', 'payments'));
    await expect(page.getByTestId('entry-sheet')).toBeVisible();
    await expect(field(page, '/name').getByRole('textbox')).toHaveValue('Payments');
    await expect(field(page, '/parent')).toBeVisible();
    await expect(page.getByTestId('service-needs')).toHaveCount(0);
    await page.goto(entryAddress('team', 'legacy-billing'));
    await expect(field(page, '/parent')).toContainText('Payments');
  });

  test('an address that names no catalog or no entry is not found', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, catalogAddress('team'));
    await page.goto('/catalogs/no-such-catalog');
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(entryAddress('service', 'no-such-service'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(entryAddress('no-such-catalog', 'payments'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });

  test('a catalog without entries says so, and offers the first one to the administrator', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await login(page, catalogAddress('service'));
    await expect(page.getByText('No entries yet')).toBeVisible();
    await expect(page.getByText('Add the first one.')).toBeVisible();
    await expect(page.getByTestId('entry-list')).toHaveCount(0);
    await expect(page.getByTestId('new-entry')).toHaveAttribute('href', newEntryAddress('service'));
    // No entry of an empty installation can be read.
    await page.goto(entryAddress('service', 'payment-api'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await expectNoSeriousViolations(page, 'catalogs not found (empty)');
  });

  test('the lens in German names the catalogs, the kinds, the acts and the history', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, catalogAddress('service'));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('view-title')).toHaveText('Kataloge');
    await expect(page.getByTestId('catalog-list')).toContainText('Externe Parteien');
    await expect(page.getByTestId('catalog-service')).toContainText(
      'Die Dienste mit Eigentümer, Abhängigkeiten und Schutzbedarf.',
    );
    await expect(page.getByText('8 Einträge')).toBeVisible();
    await expect(page.getByTestId('new-entry')).toHaveText('Dienst anlegen');
    await expect(page.getByTestId('entry-ledger')).toContainText('Stillgelegt');
    await expect(page.getByText('Nach Namen filtern')).toBeVisible();
    await page.getByTestId('entry-payment-api').click();
    await expect(page.getByTestId('save-entry')).toHaveText('Speichern');
    await expect(page.getByTestId('save-state')).toContainText('Alles ist gespeichert.');
    await expect(
      page.getByText('Seit dem letzten Speichern hat sich nichts geändert.'),
    ).toBeVisible();
    await expect(page.getByTestId('entry-history')).toContainText('Hat den Eintrag gespeichert');
    await expect(page.getByTestId('retire-entry')).toHaveText('Stilllegen');
  });
});

test.describe('a window with room for one column (UC-CAT-1)', () => {
  test.use({ viewport: { width: 1280, height: 720 } });

  test('with room for one column only, the sheet leads up to the list of its catalog', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    await expect(page.getByTestId('entry-sheet')).toBeVisible();
    await expect(page.getByTestId('entry-list')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'catalog entry in a narrow window');
    await expect(page.getByTestId('triage-up')).toContainText('Up to Services');
    await page.getByTestId('triage-up').click();
    await expect(page).toHaveURL(catalogAddress('service'));
    await expect(page.getByTestId('entry-list')).toBeVisible();
    await expect(page.getByTestId('entry-sheet')).toHaveCount(0);
  });
});

test.describe('read without the right (UC-CAT-1)', () => {
  for (const scenario of ['workshop', 'read-only']) {
    test(`${scenario}: the entry reads, nothing can be saved or retired, and no write is sent`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await clearActs(request);
      await login(page, entryAddress('service', 'payment-api'));
      await expect(page.getByTestId('entry-sheet')).toBeVisible();
      // The status says it once; no notice repeats it.
      await expect(page.getByTestId('save-state')).toContainText(
        'You can read this entry. Changing it needs the right to administer the catalogs.',
      );
      await expect(page.getByTestId('no-right-notice')).toHaveCount(0);
      await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
      await expect(page.getByTestId('save-entry')).toHaveCount(0);
      await expect(page.getByTestId('retire-block')).toHaveCount(0);
      await expect(page.getByTestId('entry-form').getByRole('textbox')).toHaveCount(0);
      await expect(page.getByTestId('entry-form').getByRole('combobox')).toHaveCount(0);
      // What the person reads stays complete: the values, the needs and the history.
      await expect(page.getByTestId('entry-form')).toContainText('Payment API');
      await expect(page.getByTestId('entry-form')).toContainText('Web shop');
      await expect(page.getByTestId('service-needs')).toBeVisible();
      await expect(page.getByTestId('entry-history')).toBeVisible();
      // The act to add an entry says why it is not available, and does not navigate.
      const act = page.getByTestId('new-entry');
      await expect(act).toBeDisabled();
      await expect(page.getByTestId('catalog-new')).toContainText(NO_RIGHT);
      await expect(page.getByRole('button', { name: 'New Service' })).toBeDisabled();
      expect(await writes(request)).toEqual([]);
    });
  }

  test('the address of a new entry says that the right is missing, and leads back', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, newEntryAddress('service'));
    await expect(page.getByTestId('entry-no-right')).toContainText(NO_RIGHT);
    await expect(page.getByTestId('entry-form')).toHaveCount(0);
    await page.getByRole('link', { name: 'Back to the list' }).click();
    await expect(page).toHaveURL(catalogAddress('service'));
    await expect(page.getByTestId('entry-list')).toBeVisible();
  });

  test('a person whose right is withdrawn meanwhile is told so, and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    const description = field(page, '/description').getByRole('textbox');
    await description.fill('Now with refunds.');
    // The session of the page still says that the person may; the server no longer does.
    await useScenario(request, 'workshop');
    await clearActs(request);
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(FORBIDDEN);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(description).toHaveValue('Now with refunds.');
    await page.getByTestId('retire-entry').click();
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('failure-notice')).toContainText(FORBIDDEN);
    await expect(page.getByTestId('retired-notice')).toHaveCount(0);
    expect(sentTo(await acts(request), changePath('service', 'payment-api'), 'PUT')).toHaveLength(
      1,
    );
  });
});

test.describe('create an entry (UC-CAT-1, UC-CAT-2)', () => {
  test('the act leads to the form, the first save creates the entry, and its sheet opens', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, catalogAddress('service'));
    await expect(page.getByTestId('new-entry')).toHaveText('New Service');
    await page.getByTestId('new-entry').click();
    await expect(page).toHaveURL(newEntryAddress('service'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New Service');
    // Nothing is kept before the first save, and nothing can be saved before something was typed.
    await expect(page.getByTestId('save-state')).toContainText(
      'Not saved yet. Nothing is kept until the first save.',
    );
    await expect(page.getByTestId('save-entry')).toBeDisabled();
    // Nothing was saved before, so the reason is not "nothing changed since the last save".
    await expect(page.getByText('Fill in the form first.')).toBeVisible();
    await expect(page.getByText('Nothing changed since the last save.')).toHaveCount(0);
    await expect(page.getByTestId('retire-block')).toHaveCount(0);
    await expect(page.getByTestId('entry-history')).toHaveCount(0);
    expect(await writes(request)).toEqual([]);
    await fillNewService(page, field, { id: 'notification-gateway', name: 'Notification gateway' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await page.getByTestId('save-entry').click();
    // The server names the address; the sheet of the new entry takes the place of the form.
    await expect(page).toHaveURL(entryAddress('service', 'notification-gateway'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Notification gateway');
    await expect(page.getByTestId('entry-history')).toBeVisible();
    await expect(page.getByTestId('entry-notification-gateway')).toBeVisible();
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(9);
    const created = sentTo(await acts(request), createPath('service'), 'POST');
    expect(created).toHaveLength(1);
    expect(created[0].body.value).toMatchObject({
      id: 'notification-gateway',
      name: 'Notification gateway',
      lifecycle: 'active',
      owner: { team: 'team:payments', role: 'role:service-owner' },
      'protection-needs': {
        confidentiality: 'normal',
        integrity: 'normal',
        availability: 'normal',
      },
    });
    // The back button does not return to the form that was replaced.
    await page.goBack();
    await expect(page).not.toHaveURL(newEntryAddress('service'));
  });

  test('a catalog other than the services creates its own kind of entry', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, catalogAddress('team'));
    await expect(page.getByTestId('new-entry')).toHaveText('New Team');
    await page.getByTestId('new-entry').click();
    await expect(page).toHaveURL(newEntryAddress('team'));
    // A team needs an id and a name only; the form has no field of a service.
    await expect(field(page, '/owner')).toHaveCount(0);
    await field(page, '/id').getByRole('textbox').fill('platform');
    await field(page, '/name').getByRole('textbox').fill('Platform');
    await field(page, '/parent').getByRole('combobox').selectOption({ label: 'Payments' });
    await page.getByTestId('save-entry').click();
    await expect
      .poll(async () => sentTo(await acts(request), createPath('team'), 'POST'))
      .toHaveLength(1);
    const [sent] = sentTo(await acts(request), createPath('team'), 'POST');
    expect(sent.body.value).toMatchObject({
      id: 'platform',
      name: 'Platform',
      parent: 'team:payments',
    });
  });

  test('the pickers offer the entries that are not retired, and no retired one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, newEntryAddress('service'));
    const team = field(page, '/owner/team').getByRole('combobox');
    await expect(team.locator('option')).toContainText([
      'Choose…',
      'Payments',
      'Identity Platform',
      'Mobile Apps',
      'Security Office',
    ]);
    await expect(team).not.toContainText('Legacy Billing');
    await expect(field(page, '/owner/role').getByRole('combobox')).not.toContainText(
      'Release Manager',
    );
    await expect(field(page, '/system').getByRole('combobox')).not.toContainText('Legacy ERP');
  });

  test('a field that is not valid is marked at the field, and what was typed stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-invalid');
    await login(page, newEntryAddress('service'));
    await fillNewService(page, field, { id: 'notification-gateway', name: 'Notification gateway' });
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('save-state')).toContainText(
      'Some entries need a correction. Your changes stay on this page.',
    );
    await expect(page.getByTestId('failure-notice')).toContainText(
      'Some entries are not valid. Correct the marked fields.',
    );
    await expect(field(page, '/owner/team')).toContainText('This reference leads nowhere.');
    await expect(field(page, '/name')).toContainText('Fill in this field.');
    await expect(page).toHaveURL(newEntryAddress('service'));
    await expect(field(page, '/id').getByRole('textbox')).toHaveValue('notification-gateway');
    await expect(field(page, '/owner/role').getByRole('combobox')).toHaveValue(
      'role:service-owner',
    );
    await expectNoSeriousViolations(page, 'catalog entry with field errors');
  });

  test('an id that is taken, perhaps by a retired entry, is said so and can be changed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-id-taken');
    await login(page, newEntryAddress('service'));
    await fillNewService(page, field, { id: 'ledger', name: 'Ledger again' });
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(ID_TAKEN);
    await expect(page.getByTestId('failure-notice')).toContainText('Choose another id.');
    await expect(page).toHaveURL(newEntryAddress('service'));
    await expect(field(page, '/id').getByRole('textbox')).toHaveValue('ledger');
    // Another id is another save: the mock answers the same until its state changes.
    await gotoState(request, 'ready');
    await field(page, '/id').getByRole('textbox').fill('notification-gateway');
    await page.getByTestId('save-entry').click();
    await expect(page).toHaveURL(entryAddress('service', 'notification-gateway'));
  });

  test('a change the Git server refuses is told, and nothing is lost', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-rejected');
    await login(page, newEntryAddress('service'));
    await fillNewService(page, field, { id: 'notification-gateway', name: 'Notification gateway' });
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(REJECTED);
    await expect(page.getByTestId('save-state')).toContainText(
      'Not saved. Your changes stay on this page.',
    );
    await expect(field(page, '/name').getByRole('textbox')).toHaveValue('Notification gateway');
    await expect(page).toHaveURL(newEntryAddress('service'));
  });

  test('a Git server that cannot be reached costs the save only, and the lists stay readable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#git-unavailable');
    await login(page, newEntryAddress('service'));
    await fillNewService(page, field, { id: 'notification-gateway', name: 'Notification gateway' });
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('failure-notice')).toContainText('Your work is kept');
    await expect(field(page, '/name').getByRole('textbox')).toHaveValue('Notification gateway');
    // The reads answer as before: the catalogs are still there to read.
    await page.getByTestId('nav-catalogs').click();
    await page.getByTestId('leave-confirm').click();
    await page.getByTestId('catalog-service').click();
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(8);
  });

  test('leaving a form with typed text asks first, and staying keeps the text', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, newEntryAddress('service'));
    await field(page, '/name').getByRole('textbox').fill('Half a name');
    await page.getByTestId('catalog-team').click();
    const question = page.getByRole('dialog');
    await expect(question).toBeVisible();
    await page.getByTestId('leave-stay').click();
    await expect(question).toHaveCount(0);
    await expect(page).toHaveURL(newEntryAddress('service'));
    await expect(field(page, '/name').getByRole('textbox')).toHaveValue('Half a name');
    await page.getByTestId('catalog-team').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL(catalogAddress('team'));
    await expect(page.getByTestId('entry-list')).toBeVisible();
  });

  test('the form in German and its refusals read in German', async ({ page, request }) => {
    await useScenario(request, 'catalog-admin#catalog-id-taken');
    await login(page, newEntryAddress('service'));
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Dienst anlegen');
    await expect(page.getByTestId('save-state')).toContainText(
      'Noch nicht gespeichert. Bis zum ersten Speichern wird nichts aufbewahrt.',
    );
    await field(page, '/id').getByRole('textbox').fill('ledger');
    await field(page, '/name').getByRole('textbox').fill('Hauptbuch');
    await field(page, '/lifecycle').getByRole('combobox').selectOption({ label: 'Aktiv' });
    await field(page, '/owner/team').getByRole('combobox').selectOption({ label: 'Payments' });
    await field(page, '/owner/role').getByRole('combobox').selectOption({ index: 1 });
    for (const dimension of ['confidentiality', 'integrity', 'availability']) {
      await field(page, `/protection-needs/${dimension}`)
        .getByRole('combobox')
        .selectOption({ label: 'Normal' });
    }
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'Ein Eintrag mit dieser Kennung gibt es schon, vielleicht einen stillgelegten.',
    );
    await gotoState(request, 'git-unavailable');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'Der Git-Server ist nicht erreichbar.',
    );
  });
});

test.describe('change an entry (UC-CAT-1, UC-CAT-2)', () => {
  test('a change is saved with the id, the sheet says when, and the list stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, entryAddress('service', 'payment-api'));
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('save-entry')).toBeDisabled();
    const description = field(page, '/description').getByRole('textbox');
    await description.fill('Takes payments and books refunds.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await expect(page.getByTestId('save-state')).toContainText('Changed. Not saved yet.');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('save-state')).toContainText(/Saved at \d/);
    const sent = sentTo(await acts(request), changePath('service', 'payment-api'), 'PUT');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.value).toMatchObject({
      id: 'payment-api',
      name: 'Payment API',
      description: 'Takes payments and books refunds.',
      lifecycle: 'active',
    });
    await expect(page).toHaveURL(entryAddress('service', 'payment-api'));
    await expect(description).toHaveValue('Takes payments and books refunds.');
    await expect(page.getByTestId('save-entry')).toBeDisabled();
    // A second change is a second save: the last save is the one that stands.
    await description.fill('Takes payments.');
    await page.getByTestId('save-entry').click();
    await expect
      .poll(async () => sentTo(await acts(request), changePath('service', 'payment-api'), 'PUT'))
      .toHaveLength(2);
  });

  test('a dependency and a protection need are changed through the form kit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, entryAddress('service', 'notification-service'));
    await field(page, '/protection-needs/availability')
      .getByRole('combobox')
      .selectOption({ label: 'Very high' });
    await field(page, '/system').getByRole('combobox').selectOption({ label: 'Core platform' });
    await page.getByTestId('save-entry').click();
    await expect
      .poll(async () =>
        sentTo(await acts(request), changePath('service', 'notification-service'), 'PUT'),
      )
      .toHaveLength(1);
    const [sent] = sentTo(
      await acts(request),
      changePath('service', 'notification-service'),
      'PUT',
    );
    expect(sent.body.value).toMatchObject({
      id: 'notification-service',
      system: 'system:core-platform',
      'protection-needs': { availability: 'very-high' },
    });
  });

  test('a field that is not valid is marked, the sheet keeps the change, and a fix saves', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-invalid');
    await login(page, entryAddress('service', 'payment-api'));
    await field(page, '/description').getByRole('textbox').fill('Changed');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(field(page, '/owner/team')).toContainText('This reference leads nowhere.');
    await expect(field(page, '/description').getByRole('textbox')).toHaveValue('Changed');
    await gotoState(request, 'ready');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(field(page, '/owner/team')).not.toContainText('This reference leads nowhere.');
  });

  test('a change by someone else replaces an untouched sheet and says who', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    await expect(field(page, '/description').getByRole('textbox')).toHaveValue(
      'Takes payments for the web shop and talks to the payment provider.',
    );
    await gotoState(request, 'catalog-changed-elsewhere');
    await expect(field(page, '/description').getByRole('textbox')).toHaveValue(
      'Takes payments for the web shop, talks to the payment provider and books refunds.',
    );
    await expect(page.locator('p.sr-only[role="status"]').first()).toContainText(
      'Jordan Weber saved this entry. What you see is up to date.',
    );
    await expect(page.getByTestId('entry-history')).toContainText('Jordan Weber');
    await expect(page.getByTestId('stale-notice')).toHaveCount(0);
  });

  test('a change by someone else warns a sheet with changes, which keeps them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    const description = field(page, '/description').getByRole('textbox');
    await description.fill('My own wording.');
    await gotoState(request, 'catalog-changed-elsewhere');
    await expect(page.getByTestId('stale-notice')).toContainText(
      'Jordan Weber saved this entry after you opened it. Your changes are still here.',
    );
    await expect(description).toHaveValue('My own wording.');
    await expect(page.getByTestId('entry-history')).toContainText('Jordan Weber');
    // Saving replaces what was saved: the last save stands.
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('stale-notice')).toHaveCount(0);
  });

  test('an open list follows what others create, within the push of the event stream', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, catalogAddress('service'));
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(8);
    await expect(page.getByTestId('entry-notification-gateway')).toHaveCount(0);
    await gotoState(request, 'service-created');
    await expect(page.getByTestId('entry-notification-gateway')).toBeVisible();
    await expect(page.getByTestId('entry-list').getByRole('link')).toHaveCount(9);
  });

  test('a save that cannot reach the Git server keeps the change on the page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#git-unavailable');
    await login(page, entryAddress('service', 'payment-api'));
    await field(page, '/description').getByRole('textbox').fill('Kept.');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(field(page, '/description').getByRole('textbox')).toHaveValue('Kept.');
    await expect(page.getByTestId('entry-sheet')).toBeVisible();
  });

  test('a change the Git server refuses is told on the sheet of an entry', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-rejected');
    await login(page, entryAddress('service', 'payment-api'));
    await field(page, '/description').getByRole('textbox').fill('Refused.');
    await page.getByTestId('save-entry').click();
    await expect(page.getByTestId('failure-notice')).toContainText(REJECTED);
    await expect(field(page, '/description').getByRole('textbox')).toHaveValue('Refused.');
  });

  test('leaving a sheet with unsaved changes asks first', async ({ page, request }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    await field(page, '/description').getByRole('textbox').fill('Not saved.');
    await page.getByTestId('entry-customer-db').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(entryAddress('service', 'payment-api'));
    await page.getByTestId('entry-customer-db').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL(entryAddress('service', 'customer-db'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer database');
  });
});

test.describe('retire an entry (UC-CAT-1)', () => {
  test('the act asks first, cancelling retires nothing, and the confirmation retires', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, entryAddress('service', 'customer-portal'));
    await expect(page.getByTestId('retire-block')).toContainText('Retire this entry');
    await expect(page.getByTestId('retire-block')).toContainText(
      'The entry stays for what refers to it. The lists stop offering it.',
    );
    await page.getByTestId('retire-entry').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Retire Customer Portal?');
    await expect(dialog).toContainText(
      'Documents and entries that refer to it keep their reference',
    );
    await expect(dialog).toContainText('this app has no way back');
    await expect(page.getByTestId('retire-dirty')).toHaveCount(0);
    await page.getByTestId('retire-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect(await writes(request)).toEqual([]);
    await expect(page.getByTestId('retired-notice')).toHaveCount(0);
    // The question again, and this time the answer is yes.
    await page.getByTestId('retire-entry').click();
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('retired-notice')).toContainText('This entry is retired');
    await expect(page.getByTestId('entry-state')).toHaveText('Retired');
    await expect(page.getByTestId('entry-customer-portal')).toContainText('Retired');
    const sent = sentTo(await acts(request), retirePath('service', 'customer-portal'), 'POST');
    expect(sent).toHaveLength(1);
    // The entry reads only now: the same sheet, no way to change or to retire again.
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-state')).toContainText(
      'This entry is retired. It can be read only.',
    );
    await expect(page.getByTestId('save-entry')).toHaveCount(0);
    await expect(page.getByTestId('retire-block')).toHaveCount(0);
    await expect(page.getByTestId('entry-form').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByTestId('entry-history')).toContainText('Retired the entry');
    await expect(page).toHaveURL(entryAddress('service', 'customer-portal'));
  });

  test('changes that were not saved are named in the question and dropped with the retirement', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'customer-portal'));
    await field(page, '/description').getByRole('textbox').fill('Typed, not saved.');
    await page.getByTestId('retire-entry').click();
    await expect(page.getByTestId('retire-dirty')).toContainText(
      'Changes you have not saved are dropped.',
    );
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('retired-notice')).toBeVisible();
    // Leaving needs no question: the retired sheet has nothing of the person's to lose.
    await page.getByTestId('entry-identity-provider').click();
    await expect(page).toHaveURL(entryAddress('service', 'identity-provider'));
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('a retired entry reads only, in every catalog, and what refers to it is still shown', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await clearActs(request);
    await login(page, entryAddress('service', 'ledger'));
    await expect(page.getByTestId('retired-notice')).toContainText(
      'What refers to it keeps its reference and shows it as retired.',
    );
    await expect(page.getByTestId('entry-state')).toHaveText('Retired');
    await expect(page.getByTestId('save-entry')).toHaveCount(0);
    await expect(page.getByTestId('retire-block')).toHaveCount(0);
    await expect(page.getByTestId('entry-form').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByTestId('entry-history')).toContainText('Retired the entry');
    for (const [catalog, id] of [
      ['team', 'legacy-billing'],
      ['role', 'release-manager'],
      ['system', 'legacy-erp'],
      ['external', 'old-sms-gateway'],
    ]) {
      await page.goto(entryAddress(catalog, id));
      await expect(page.getByTestId('retired-notice')).toBeVisible();
      await expect(page.getByTestId('save-entry')).toHaveCount(0);
      await expect(page.getByTestId('entry-state')).toHaveText('Retired');
    }
    expect(await writes(request)).toEqual([]);
  });

  test('a retired entry stays in the list, marked, and is not offered by a picker', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, newEntryAddress('service'));
    await expect(page.getByTestId('entry-ledger')).toContainText('Retired');
    // The dependencies are picked from services and external parties, grouped, without the retired ones.
    await field(page, '/dependsOn').getByRole('button', { name: 'Add row' }).click();
    const editor = page.getByRole('dialog');
    const picker = editor.getByRole('combobox');
    await expect(picker).toContainText('Payment API');
    await expect(picker).toContainText('Cloud hosting');
    await expect(picker).not.toContainText('Ledger');
    await expect(picker).not.toContainText('SMS gateway (old)');
    await expect(picker.locator('optgroup')).toHaveCount(2);
  });

  test('a retirement the Git server cannot take is told, and the entry stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#catalog-rejected');
    await login(page, entryAddress('service', 'customer-portal'));
    await page.getByTestId('retire-entry').click();
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('failure-notice')).toContainText(REJECTED);
    await expect(page.getByTestId('retired-notice')).toHaveCount(0);
    await expect(page.getByTestId('save-entry')).toBeVisible();
    await gotoState(request, 'git-unavailable');
    await page.getByTestId('retire-entry').click();
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('failure-notice')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('retired-notice')).toHaveCount(0);
  });

  test('an entry that someone else retired is read again and reads only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'customer-portal'));
    await expect(page.getByTestId('save-entry')).toBeVisible();
    await gotoState(request, 'service-retired');
    await expect(page.getByTestId('retired-notice')).toBeVisible();
    await expect(page.getByTestId('save-entry')).toHaveCount(0);
    await expect(page.getByTestId('entry-customer-portal')).toContainText('Retired');
  });

  test('the question and its answer in German', async ({ page, request }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'customer-portal'));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('retire-block')).toContainText('Diesen Eintrag stilllegen');
    await page.getByTestId('retire-entry').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Customer Portal stilllegen?');
    await expect(dialog).toContainText('Die Auswahllisten bieten ihn nicht mehr an');
    await page.getByTestId('retire-confirm').click();
    await expect(page.getByTestId('retired-notice')).toContainText(
      'Dieser Eintrag ist stillgelegt',
    );
    await expect(page.getByTestId('entry-state')).toHaveText('Stillgelegt');
  });
});

test.describe('a service and its protection needs (UC-CAT-2)', () => {
  test('the needs stored on the service stand beside the effective ones and who decides', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'payment-api'));
    const needs = page.getByTestId('needs-table');
    await expect(page.getByTestId('service-needs')).toContainText('Effective protection needs');
    await expect(needs.getByRole('columnheader')).toHaveText([
      'Dimension',
      'Stored on the service',
      'Effective',
      'Decided by',
    ]);
    const confidentiality = page.getByTestId('needs-confidentiality');
    await expect(confidentiality.getByRole('cell').nth(0)).toHaveText('High');
    await expect(confidentiality.getByRole('cell').nth(1)).toHaveText('Very high');
    await expect(confidentiality.getByRole('link', { name: 'Customer database' })).toHaveAttribute(
      'href',
      entryAddress('service', 'customer-db'),
    );
    await expect(
      page.getByTestId('needs-integrity').getByRole('link', { name: 'Identity Provider' }),
    ).toBeVisible();
    // Where the service itself decides, it says so and does not link to itself.
    const availability = page.getByTestId('needs-availability');
    await expect(availability.getByRole('cell').nth(1)).toHaveText('High');
    await expect(availability.getByRole('cell').nth(2)).toHaveText('This service');
    await expect(availability.getByRole('link')).toHaveCount(0);
  });

  test('the dependencies stand as a chain, with the reason each does or does not count', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'payment-api'));
    const customerDb = page.getByTestId('depends-service:customer-db');
    await expect(customerDb).toContainText('Customer database');
    await expect(customerDb).toContainText('This service');
    await expect(customerDb).toContainText('Very high');
    await expect(customerDb).toContainText('Counts');
    const external = page.getByTestId('depends-external:psp-provider');
    await expect(external).toContainText('Payment service provider');
    await expect(external).toContainText('No needs of its own, does not count');
    await expect(external).toContainText('None stored');
    // A dependency of a dependency is reached through that one.
    const deep = page.getByTestId('depends-external:cloud-hosting');
    await expect(deep).toContainText('Customer database');
    await expect(deep).toContainText('does not count');
    await expect(page.getByTestId('cycle-notice')).toHaveCount(0);
    // The dependencies lead to their own sheets.
    await customerDb.getByRole('link', { name: 'Customer database' }).click();
    await expect(page).toHaveURL(entryAddress('service', 'customer-db'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Customer database');
  });

  test('the party that decides leads to its own sheet', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'payment-api'));
    await page
      .getByTestId('needs-confidentiality')
      .getByRole('link', { name: 'Customer database' })
      .click();
    await expect(page).toHaveURL(entryAddress('service', 'customer-db'));
    await expect(page.getByTestId('entry-sheet')).toContainText('Customer database');
    // That service depends on nobody who counts: its own needs are the effective ones.
    await expect(page.getByTestId('needs-confidentiality').getByRole('cell').nth(2)).toHaveText(
      'This service',
    );
  });

  test('a service that depends on nothing says that its own needs are the effective ones', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'notification-service'));
    await expect(page.getByTestId('depends-none')).toContainText(
      'This service depends on nothing, so its own needs are the effective ones.',
    );
    await expect(page.getByTestId('depends-table')).toHaveCount(0);
    await expect(page.getByTestId('cycle-notice')).toHaveCount(0);
  });

  test('a circle of dependencies is a notice that names the services, and the needs stay complete', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'reporting'));
    const notice = page.getByTestId('cycle-notice');
    await expect(notice).toContainText('Services depend on each other in a circle');
    await expect(notice).toContainText(
      /Report scheduler, Reporting Service|Reporting Service, Report scheduler/,
    );
    await expect(notice).toContainText('Remove one dependency to end the circle.');
    // A retired service is listed and does not count; the one on the circle counts once.
    await expect(page.getByTestId('depends-service:ledger')).toContainText(
      'Retired, does not count',
    );
    await expect(page.getByTestId('depends-service:report-scheduler')).toContainText('Counts');
    await expect(page.getByTestId('needs-table')).toBeVisible();
    // The sheet of the other service on the circle names the same two.
    await page.goto(entryAddress('service', 'report-scheduler'));
    await expect(page.getByTestId('cycle-notice')).toContainText(
      /Report scheduler, Reporting Service|Reporting Service, Report scheduler/,
    );
    await expect(page.getByTestId('service-needs')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Report scheduler');
  });

  test('the needs follow a change the next time the entry is read, not before', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, entryAddress('service', 'payment-api'));
    await field(page, '/protection-needs/confidentiality')
      .getByRole('combobox')
      .selectOption({ label: 'Normal' });
    // What is not saved is not in the effective needs: the table reads the saved entry.
    await expect(page.getByTestId('needs-confidentiality').getByRole('cell').nth(0)).toHaveText(
      'High',
    );
    await expect(page.getByTestId('service-needs')).toContainText(
      'Read from the saved entry and its dependencies.',
    );
  });

  test('the sheet in German names the dimensions, the levels and the reasons', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, entryAddress('service', 'reporting'));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('service-needs')).toContainText('Wirksamer Schutzbedarf');
    await expect(page.getByTestId('needs-confidentiality')).toContainText('Vertraulichkeit');
    await expect(page.getByTestId('needs-integrity')).toContainText('Integrität');
    await expect(page.getByTestId('needs-availability')).toContainText('Verfügbarkeit');
    await expect(page.getByTestId('needs-table').getByRole('columnheader')).toHaveText([
      'Schutzziel',
      'Am Dienst hinterlegt',
      'Wirksam',
      'Bestimmt durch',
    ]);
    await expect(page.getByTestId('needs-confidentiality')).toContainText('Normal');
    await expect(page.getByTestId('cycle-notice')).toContainText(
      'Dienste hängen im Kreis voneinander ab',
    );
    await expect(page.getByTestId('depends-service:ledger')).toContainText(
      'Stillgelegt, zählt nicht',
    );
    await expect(page.getByTestId('depends-service:report-scheduler')).toContainText('Zählt');
    await page.goto(entryAddress('service', 'payment-api'));
    await expect(page.getByTestId('needs-confidentiality')).toContainText('Sehr hoch');
    await expect(page.getByTestId('depends-external:psp-provider')).toContainText(
      'Kein eigener Bedarf, zählt nicht',
    );
    await expect(page.getByTestId('needs-availability')).toContainText('Dieser Dienst');
  });
});
