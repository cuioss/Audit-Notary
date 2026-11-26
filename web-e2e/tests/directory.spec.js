import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { sentTo, useLanguage } from './helpers/documents.js';
import {
  CANDIDATES,
  CONFIRM_PATH,
  DESCRIPTOR,
  ERASE_PATH,
  IMPORT_ADDRESS,
  IMPORT_PATH,
  IMPORT_RESULT,
  LIMITS,
  ME_PATH,
  PERSONS,
  PERSONS_ADDRESS,
  PERSONS_PATH,
  PREVIEW_PATH,
  PROFILE_ADDRESS,
  PSEUDONYM,
  READ_PERSONS,
  WELCOME_ADDRESS,
  fillPerson,
  loginToDirectory,
  pasteDescriptor,
} from './helpers/directory.js';
import { login } from './helpers/login.js';
import { acts, clearActs, useScenario } from './helpers/mock.js';

/**
 * The directory pages (UC-ACC-4, UC-ACC-5, UC-CAT-3 to UC-CAT-5; AUN-DIR-2 to AUN-DIR-5): the Backstage import as a
 * wizard of three steps, the table of the persons with the prefill and the erasure, the candidates a first login is
 * offered, the own entry at `/settings/profile` with its question "Is this still right?", and the notice of the shell
 * while that question is due. They run against the profiles `workshop`, `read-only`, `catalog-admin`, `empty` and
 * `first-login` of the mock (web-mock/README.adoc, Directory and Catalogs).
 *
 * The persons, the result of the import and the candidates are static fixtures of `helpers/directory.js`; the first
 * test compares them with what the mock answers.
 */
const FORBIDDEN = 'You have no right for this action.';
const GIT_UNAVAILABLE = 'The Git server cannot be reached.';
const NOT_PREPARED = 'Choose or paste a document first.';
const NOTHING_NEW = 'Nothing would be created or updated.';

/** @returns the state-changing requests recorded since the last clear */
async function writes(request) {
  return (await acts(request)).filter((act) => act.method !== 'GET');
}

/** @returns the headers of a state-changing request of the signed-in page */
async function csrf(page) {
  const session = await (await page.request.get('/api/v1/session')).json();
  return { 'X-CSRF-Token': session.csrfToken };
}

/** Walks the import to its second step with the descriptor pasted. */
async function previewImport(page) {
  await pasteDescriptor(page);
  await page.getByTestId('import-check').click();
  await expect(page.getByTestId('import-result')).toBeVisible();
}

test.describe('the fixtures of this spec', () => {
  test('the persons, the result of the import and the limits are what the mock and the page say', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, IMPORT_ADDRESS);
    const list = await (await page.request.get(PERSONS_PATH)).json();
    expect(list.persons.map(({ pseudonym, name, state }) => ({ pseudonym, name, state }))).toEqual(
      PERSONS.map(({ pseudonym, name, state }) => ({
        pseudonym,
        name,
        state: state === 'Bound to a login' ? 'bound' : 'unbound',
      })),
    );
    const preview = await (
      await page.request.post(PREVIEW_PATH, {
        headers: await csrf(page),
        data: { documents: [{ name: 'a.yaml', content: DESCRIPTOR }] },
      })
    ).json();
    expect(preview.created.map(({ catalog, id, name }) => ({ catalog, id, name }))).toEqual(
      IMPORT_RESULT.created.map(({ catalog, id, name }) => ({ catalog, id, name })),
    );
    expect(preview.updated.map(({ catalog, id, name }) => ({ catalog, id, name }))).toEqual(
      IMPORT_RESULT.updated.map(({ catalog, id, name }) => ({ catalog, id, name })),
    );
    expect(preview.unchanged).toBe(IMPORT_RESULT.unchanged);
    expect(
      preview.leftOut.map(({ entity, reason, detail }) => ({ entity, reason, detail })),
    ).toEqual(
      IMPORT_RESULT.leftOut.map(({ entity, reason, detail }) => ({ entity, reason, detail })),
    );
    // The page names the limits of the import, which the helper holds for the tests of the limits.
    await pasteDescriptor(page);
    const max = LIMITS.bytes / (1024 * 1024);
    await expect(page.getByTestId('import-budget')).toContainText(
      `Documents: 1 of ${LIMITS.documents}.`,
    );
    await expect(page.getByTestId('import-budget')).toContainText(`of ${max.toFixed(1)} MiB.`);
    await useScenario(request, 'workshop');
    await page.goto(PERSONS_ADDRESS);
    await expect(page.getByTestId('persons-table').locator('tbody tr')).toHaveCount(
      READ_PERSONS.length,
    );
  });
});

test.describe('the Backstage import (UC-CAT-3)', () => {
  test('the catalogs lens leads to the page, which starts at the choice and says what is missing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, '/catalogs/team');
    await page.getByTestId('directory-import').click();
    await expect(page).toHaveURL(IMPORT_ADDRESS);
    await expect(page.getByTestId('import-view')).toBeVisible();
    const steps = page.getByTestId('import-steps').getByRole('listitem');
    await expect(steps).toHaveText([/Choose documents/, /Check/, /Result/]);
    await expect(steps.first()).toHaveAttribute('aria-current', 'step');
    await expect(steps.nth(1)).not.toHaveAttribute('aria-current', 'step');
    // Nothing is chosen: the check says why it cannot be taken, and does not send.
    await clearActs(request);
    await expect(page.getByTestId('import-check')).toBeDisabled();
    await expect(page.getByTestId('import-view')).toContainText(NOT_PREPARED);
    await page.getByTestId('import-check').click({ force: true });
    await expect(page.getByTestId('import-result')).toHaveCount(0);
    await expect(page.getByTestId('import-paste-add')).toBeDisabled();
    expect(await writes(request)).toEqual([]);
    await expectNoSeriousViolations(page, 'import choose');
  });

  test('pasted text and chosen files are listed with their size, and either can be removed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await pasteDescriptor(page);
    await expect(page.getByTestId('import-document-0')).toContainText('Pasted text 1');
    await expect(page.getByTestId('import-document-0')).toContainText(
      `${new TextEncoder().encode(DESCRIPTOR).length} bytes`,
    );
    // The text field is empty again, ready for the next document.
    await expect(page.getByTestId('import-paste')).toHaveValue('');
    await page.getByTestId('import-pick-input').setInputFiles([
      { name: 'catalog-info.yaml', mimeType: 'text/yaml', buffer: Buffer.from(DESCRIPTOR) },
      { name: 'groups.yml', mimeType: 'text/yaml', buffer: Buffer.from('kind: Group') },
    ]);
    await expect(page.getByTestId('import-documents').getByRole('listitem')).toHaveCount(3);
    await expect(page.getByTestId('import-document-1')).toContainText('catalog-info.yaml');
    await expect(page.getByTestId('import-document-2')).toContainText('groups.yml');
    await expect(page.getByTestId('import-budget')).toContainText('Documents: 3 of');
    // The same file chosen twice stands once.
    await page
      .getByTestId('import-pick-input')
      .setInputFiles([
        { name: 'groups.yml', mimeType: 'text/yaml', buffer: Buffer.from('kind: Group\n') },
      ]);
    await expect(page.getByTestId('import-documents').getByRole('listitem')).toHaveCount(3);
    await page.getByRole('button', { name: 'Remove Pasted text 1' }).click();
    await expect(page.getByTestId('import-documents').getByRole('listitem')).toHaveCount(2);
    await expect(page.getByTestId('import-document-0')).toContainText('catalog-info.yaml');
    await page.getByTestId('import-remove-0').click();
    await page.getByTestId('import-remove-0').click();
    await expect(page.getByTestId('import-documents')).toHaveCount(0);
    await expect(page.getByTestId('import-check')).toBeDisabled();
  });

  test('the check writes nothing, shows what would change, and going back keeps the documents', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await clearActs(request);
    await previewImport(page);
    await expect(page.getByTestId('import-steps').getByRole('listitem').nth(1)).toHaveAttribute(
      'aria-current',
      'step',
    );
    await expect(page.getByTestId('import-result')).toContainText(
      'This is a check, nothing is written yet',
    );
    await expect(page.getByTestId('count-created')).toHaveText(
      String(IMPORT_RESULT.created.length),
    );
    await expect(page.getByTestId('count-updated')).toHaveText(
      String(IMPORT_RESULT.updated.length),
    );
    await expect(page.getByTestId('count-unchanged')).toHaveText(String(IMPORT_RESULT.unchanged));
    await expect(page.getByTestId('count-left-out')).toHaveText(
      String(IMPORT_RESULT.leftOut.length),
    );
    // The entries are not links yet: they do not exist.
    await expect(page.getByTestId('import-created').getByRole('link')).toHaveCount(0);
    const sent = await acts(request);
    expect(sentTo(sent, PREVIEW_PATH, 'POST')).toHaveLength(1);
    expect(sentTo(sent, IMPORT_PATH, 'POST')).toHaveLength(0);
    expect(sentTo(sent, PREVIEW_PATH)[0].body).toEqual({
      documents: [{ name: 'Pasted text 1', content: DESCRIPTOR }],
    });
    await expectNoSeriousViolations(page, 'import preview');
    await page.getByTestId('import-back').click();
    await expect(page.getByTestId('import-choose')).toBeVisible();
    await expect(page.getByTestId('import-document-0')).toContainText('Pasted text 1');
    expect(sentTo(await acts(request), IMPORT_PATH, 'POST')).toHaveLength(0);
  });

  test('the import creates and updates, names every entry and every left out entity with its reason', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await previewImport(page);
    await clearActs(request);
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result')).toContainText('The import is finished');
    await expect(page.getByTestId('import-steps').getByRole('listitem').nth(2)).toHaveAttribute(
      'aria-current',
      'step',
    );
    const sent = await acts(request);
    expect(sentTo(sent, IMPORT_PATH, 'POST')).toHaveLength(1);
    expect(sentTo(sent, IMPORT_PATH)[0].body).toEqual({
      documents: [{ name: 'Pasted text 1', content: DESCRIPTOR }],
    });
    await expect(page.getByTestId('count-created')).toHaveText(
      String(IMPORT_RESULT.created.length),
    );
    for (const item of IMPORT_RESULT.created) {
      const row = page.getByTestId(`created-${item.catalog}-${item.id}`);
      await expect(row).toContainText(item.name);
      await expect(row).toContainText(item.kind);
      await expect(row).toContainText(item.id);
      await expect(row.getByRole('link', { name: item.name })).toHaveAttribute(
        'href',
        `/catalogs/${item.catalog}/${item.id}`,
      );
    }
    for (const item of IMPORT_RESULT.updated) {
      const row = page.getByTestId(`updated-${item.catalog}-${item.id}`);
      await expect(row).toContainText(item.kind);
      await expect(row.getByRole('link', { name: item.name })).toHaveAttribute(
        'href',
        `/catalogs/${item.catalog}/${item.id}`,
      );
    }
    // The changed fields are named as the form of the catalog names them, not as paths.
    await expect(page.getByTestId('updated-service-payment-api')).toContainText('Lifecycle');
    await expect(page.getByTestId('updated-service-payment-api')).not.toContainText('owner.team');
    await expect(page.getByTestId('updated-team-payments')).toContainText('Parent');
    const leftOut = page.getByTestId('import-left-out');
    await expect(leftOut.locator('tbody tr')).toHaveCount(IMPORT_RESULT.leftOut.length);
    for (const [index, item] of IMPORT_RESULT.leftOut.entries()) {
      const row = page.getByTestId(`left-out-${index}`);
      await expect(row).toHaveAttribute('data-reason', item.reason);
      await expect(row).toContainText(item.entity);
      await expect(row).toContainText(item.text);
      await expect(row).toContainText(item.detail);
    }
    await expectNoSeriousViolations(page, 'import result');
    // Importing more starts again; the way on leads to the catalogs.
    await expect(page.getByTestId('import-open')).toHaveAttribute('href', '/catalogs');
    await page.getByTestId('import-again').click();
    await expect(page.getByTestId('import-choose')).toBeVisible();
    await expect(page.getByTestId('import-documents')).toHaveCount(0);
    await expect(page.getByTestId('import-steps').getByRole('listitem').first()).toHaveAttribute(
      'aria-current',
      'step',
    );
  });

  test('a repeated import that finds nothing new cannot be applied, and says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#import-nothing-new');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await previewImport(page);
    await expect(page.getByTestId('count-created')).toHaveText('0');
    await expect(page.getByTestId('count-updated')).toHaveText('0');
    await expect(page.getByTestId('count-unchanged')).toHaveText('11');
    await expect(page.getByTestId('count-left-out')).toHaveText('3');
    await expect(page.getByTestId('import-created')).toHaveCount(0);
    await expect(page.getByTestId('import-updated')).toHaveCount(0);
    await expect(page.getByTestId('import-left-out').locator('tbody tr')).toHaveCount(3);
    await clearActs(request);
    await expect(page.getByTestId('import-apply')).toBeDisabled();
    await expect(page.getByTestId('import-acts')).toContainText(NOTHING_NEW);
    await page.getByTestId('import-apply').click({ force: true });
    expect(sentTo(await acts(request), IMPORT_PATH, 'POST')).toHaveLength(0);
    await expectNoSeriousViolations(page, 'import nothing new');
  });

  test('more documents or more bytes than one import takes cannot be checked, and the page says which limit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await clearActs(request);
    const many = Array.from({ length: LIMITS.documents + 1 }, (_, index) => ({
      name: `component-${index}.yaml`,
      mimeType: 'text/yaml',
      buffer: Buffer.from(`metadata:\n  name: c${index}\n`),
    }));
    await page.getByTestId('import-pick-input').setInputFiles(many);
    await expect(page.getByTestId('import-budget')).toContainText(
      `Documents: ${LIMITS.documents + 1} of ${LIMITS.documents}.`,
    );
    await expect(page.getByTestId('import-check')).toBeDisabled();
    await expect(page.getByTestId('import-acts')).toContainText(
      `At most ${LIMITS.documents} documents can be imported at once.`,
    );
    await page.getByTestId('import-check').click({ force: true });
    // One document less is the limit itself: allowed.
    await page.getByTestId('import-remove-0').click();
    await expect(page.getByTestId('import-acts')).not.toContainText('can be imported at once');
    await expect(page.getByTestId('import-check')).toBeEnabled();
    // Together above two MiB: the list is chosen anew, so that the number of documents is no reason.
    await page.reload();
    await expect(page.getByTestId('import-view')).toBeVisible();
    await page
      .getByTestId('import-pick-input')
      .setInputFiles([
        { name: 'big.yaml', mimeType: 'text/yaml', buffer: Buffer.alloc(LIMITS.bytes + 1, 'a') },
      ]);
    await expect(page.getByTestId('import-check')).toBeDisabled();
    await expect(page.getByTestId('import-acts')).toContainText(
      'The documents may be at most 2.0 MiB together.',
    );
    expect(await writes(request)).toEqual([]);
  });

  test('a descriptor the server cannot read is marked on its row, and a correction goes on', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#import-invalid');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await pasteDescriptor(page);
    await page.getByTestId('import-check').click();
    await expect(page.getByTestId('import-failure')).toContainText(
      'A descriptor could not be read. Check that it is valid YAML.',
    );
    await expect(
      page.getByTestId('import-document-0').getByTestId('import-document-invalid'),
    ).toContainText('Not valid');
    await expect(page.getByTestId('import-result')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'import invalid');
    // Changing the documents takes the mark away, and a document added afterwards the notice.
    await page.getByTestId('import-remove-0').click();
    await expect(page.getByTestId('import-document-invalid')).toHaveCount(0);
    await pasteDescriptor(page);
    await expect(page.getByTestId('import-failure')).toHaveCount(0);
  });

  test('a request that is too large says the limit of the server', async ({ page, request }) => {
    await useScenario(request, 'catalog-admin#import-too-large');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await pasteDescriptor(page);
    await page.getByTestId('import-check').click();
    await expect(page.getByTestId('import-failure')).toContainText('The documents are too large.');
    await expect(page.getByTestId('import-failure')).toContainText(
      'The limit is 2.0 MiB together.',
    );
    await expect(page.getByTestId('import-choose')).toBeVisible();
    await expect(page.getByTestId('import-document-0')).toBeVisible();
  });

  test('a Git server that cannot be reached refuses the import and leaves the check on the page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#git-unavailable');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await previewImport(page);
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-failure')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('import-result')).toContainText('This is a check');
    await expect(page.getByTestId('import-apply')).toBeEnabled();
    await expectNoSeriousViolations(page, 'import git unavailable');
  });

  test('a person whose right is withdrawn meanwhile is told so, and the check stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await previewImport(page);
    // The page still says that the person may; the server no longer does.
    await page.route(`**${IMPORT_PATH}`, (route) =>
      route.fulfill({ status: 403, json: { outcome: 'FORBIDDEN' } }),
    );
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-failure')).toContainText(FORBIDDEN);
    await expect(page.getByTestId('import-result')).toContainText('This is a check');
    await expect(page.getByTestId('import-apply')).toBeEnabled();
  });

  for (const scenario of ['workshop', 'read-only']) {
    test(`${scenario}: without the right the page says so, offers nothing and sends nothing`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await clearActs(request);
      await login(page, IMPORT_ADDRESS);
      await expect(page.getByTestId('import-view')).toContainText(
        'Importing needs the right to administer the catalogs.',
      );
      await expect(page.getByTestId('import-steps')).toHaveCount(0);
      await expect(page.getByTestId('import-check')).toHaveCount(0);
      await expect(page.getByTestId('import-paste')).toHaveCount(0);
      await page.getByRole('link', { name: 'Back to the catalogs' }).click();
      await expect(page).toHaveURL('/catalogs/team');
      expect(await writes(request)).toEqual([]);
    });
  }

  test('the page in German names the steps, the counts and the reasons', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, IMPORT_ADDRESS, 'import-view');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('import-steps')).toContainText('Dokumente wählen');
    await expect(page.getByTestId('import-check')).toBeDisabled();
    await expect(page.getByTestId('import-view')).toContainText(
      'Wählen Sie zuerst ein Dokument aus oder fügen Sie eines ein.',
    );
    await pasteDescriptor(page);
    await expect(page.getByTestId('import-budget')).toContainText('Dokumente: 1 von');
    await page.getByTestId('import-check').click();
    await expect(page.getByTestId('import-result')).toContainText(
      'Das ist eine Prüfung, noch wird nichts geschrieben',
    );
    await expect(page.getByTestId('import-counts')).toContainText('Angelegt');
    await expect(page.getByTestId('import-counts')).toContainText('Unverändert');
    await expect(page.getByTestId('import-counts')).toContainText('Ausgelassen');
    await expect(page.getByTestId('left-out-2')).toContainText(
      'Nur der Standard-Namensraum wird importiert',
    );
    await page.getByTestId('import-apply').click();
    await expect(page.getByTestId('import-result')).toContainText('Der Import ist abgeschlossen');
    await expect(page.getByTestId('import-again')).toHaveText('Weitere Dokumente importieren');
  });
});

test.describe('the persons (UC-CAT-4, UC-CAT-5)', () => {
  test('the catalogs lens leads to the table, which lists every person with team, role and state', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await login(page, '/catalogs/team');
    await page.getByTestId('directory-persons').click();
    await expect(page).toHaveURL(PERSONS_ADDRESS);
    await expect(page.getByTestId('persons-view')).toBeVisible();
    await expect(page.getByTestId('persons-table').locator('tbody tr')).toHaveCount(PERSONS.length);
    for (const person of PERSONS) {
      const row = page.getByTestId(`person-${person.pseudonym}`);
      await expect(row).toContainText(person.name);
      await expect(row).toContainText(person.places);
      await expect(row).toContainText(person.state);
      await expect(page.getByTestId(`erase-${person.pseudonym}`)).toBeEnabled();
    }
    // The pseudonym is what documents carry; it is never what a person reads.
    await expect(page.getByTestId('persons-view')).not.toContainText(PSEUDONYM);
    await expect(page.getByTestId('persons-read-only')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'persons');
  });

  test('the search narrows the table at once, asks the server, and an empty answer says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    const rows = page.getByTestId('persons-table').locator('tbody tr');
    const asked = page.waitForRequest((sent) => sent.url().includes(`${PERSONS_PATH}?q=HA`));
    await page.getByTestId('persons-search').fill('HA');
    await expect(rows).toHaveText([/Mira Haas/, /Noor Haddad/]);
    await asked;
    await page.getByTestId('persons-search').fill('  haas ');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText('Mira Haas');
    await page.getByTestId('persons-search').fill('nobody of this name');
    await expect(page.getByText('No person matches')).toBeVisible();
    await expect(page.getByTestId('persons-table')).toHaveCount(0);
    await page.getByTestId('persons-search').fill('');
    await expect(rows).toHaveCount(PERSONS.length);
  });

  for (const scenario of ['workshop', 'read-only']) {
    test(`${scenario}: without the right the table reads, and neither adding nor erasing is offered`, async ({
      page,
      request,
    }) => {
      await useScenario(request, scenario);
      await clearActs(request);
      await login(page, PERSONS_ADDRESS);
      await expect(page.getByTestId('persons-read-only')).toContainText(
        'You can read the persons. Adding and erasing them needs the right to administer the catalogs.',
      );
      await expect(page.getByTestId('persons-table').locator('tbody tr')).toHaveCount(
        READ_PERSONS.length,
      );
      for (const person of READ_PERSONS) {
        await expect(page.getByTestId(`person-${person.pseudonym}`)).toContainText(person.name);
        await expect(page.getByTestId(`erase-${person.pseudonym}`)).toHaveCount(0);
      }
      await expect(page.getByRole('columnheader', { name: 'Act' })).toHaveCount(0);
      await expect(page.getByTestId('persons-add')).toHaveCount(0);
      await expect(page.getByTestId('persons-submit')).toHaveCount(0);
      // Reading and searching still work.
      await page.getByTestId('persons-search').fill('lea');
      await expect(page.getByTestId('persons-table').locator('tbody tr')).toHaveCount(1);
      expect(await writes(request)).toEqual([]);
      await expectNoSeriousViolations(page, `persons read only (${scenario})`);
    });
  }

  test('an installation without persons says so and offers the first entry to the administrator', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await login(page, PERSONS_ADDRESS);
    await expect(page.getByText('No persons yet')).toBeVisible();
    await expect(
      page.getByText('Add the people of a workshop or a team below, before they log in.'),
    ).toBeVisible();
    await expect(page.getByTestId('persons-table')).toHaveCount(0);
    await expect(page.getByTestId('persons-search')).toHaveCount(0);
    await expect(page.getByTestId('persons-add')).toBeVisible();
    await expectNoSeriousViolations(page, 'persons empty');
  });

  test('persons are entered before they log in: one request for all, and the form starts again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await clearActs(request);
    // Nothing is filled: the act says why it cannot be taken.
    await expect(page.getByTestId('persons-submit')).toBeDisabled();
    await expect(page.getByTestId('persons-add')).toContainText(
      'Fill in a name, a team and a role first.',
    );
    await fillPerson(page, 0, { name: 'Nadia Kovac' });
    await expect(page.getByTestId('persons-submit')).toHaveText('Add one person');
    await page.getByTestId('persons-add-row').click();
    await fillPerson(page, 1, { name: 'Omar Haddad', team: 'Mobile Apps' });
    await expect(page.getByTestId('persons-submit')).toHaveText('Add 2 persons');
    await page.getByTestId('persons-submit').click();
    await expect(page.getByTestId('persons-done')).toHaveText('2 persons were added.');
    const sent = sentTo(await acts(request), PERSONS_PATH, 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      persons: [
        { name: 'Nadia Kovac', memberships: [{ team: 'team:payments', role: 'role:developer' }] },
        { name: 'Omar Haddad', memberships: [{ team: 'team:mobile', role: 'role:developer' }] },
      ],
    });
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('');
    await expect(page.getByTestId('person-row-1')).toHaveCount(0);
  });

  test('a person has several teams, a retired team or role is not offered, and the last one stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    const team = page.getByTestId('person-row-0-membership-0-team');
    await expect(team.locator('option', { hasText: 'Payments' })).toHaveCount(1);
    await expect(team.locator('option', { hasText: 'Legacy Billing' })).toHaveCount(0);
    await expect(
      page
        .getByTestId('person-row-0-membership-0-role')
        .locator('option', { hasText: 'Release Manager' }),
    ).toHaveCount(0);
    await expect(page.getByTestId('person-row-0-membership-0-remove')).toHaveCount(0);
    await fillPerson(page, 0, { name: 'Nadia Kovac' });
    for (let at = 1; at < LIMITS.memberships; at++) {
      await page.getByTestId('person-row-0-membership-add').click();
      await expect(page.getByTestId(`person-row-0-membership-${at}`)).toBeVisible();
    }
    await expect(page.getByTestId('person-row-0-membership-add')).toBeDisabled();
    await expect(page.getByTestId('person-row-0')).toContainText(
      `A person can have at most ${LIMITS.memberships} teams and roles.`,
    );
    await page.getByTestId('person-row-0-membership-4-remove').click();
    await expect(page.getByTestId('person-row-0-membership-add')).toBeEnabled();
    // A membership left half empty is not sent.
    await clearActs(request);
    await page.getByTestId('persons-submit').click();
    await expect(page.getByTestId('person-row-0-membership-1-team')).toHaveAccessibleDescription(
      /Fill in this field./,
    );
    expect(await writes(request)).toEqual([]);
  });

  test('an entry left incomplete says which field, and sends nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await clearActs(request);
    await page.getByTestId('person-row-0-membership-0-team').selectOption({ label: 'Payments' });
    await page.getByTestId('persons-submit').click();
    await expect(page.getByTestId('person-row-0')).toContainText('Fill in this field.');
    await expect(page.getByTestId('person-row-0-name')).toHaveAttribute('aria-invalid', 'true');
    expect(await writes(request)).toEqual([]);
    await page.getByTestId('person-row-0-name').fill('Nadia Kovac');
    await page.getByTestId('person-row-0-membership-0-role').selectOption({ label: 'Developer' });
    await expect(page.getByTestId('person-row-0')).not.toContainText('Fill in this field.');
  });

  test('a name that is in the list already is said, and the entry is allowed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await page.getByTestId('person-row-0-name').fill('alex  EXAMPLE');
    await expect(page.getByTestId('person-row-0-same-name')).toContainText(
      'A person with this name is in the list already. Two people may share a name.',
    );
    await page.getByTestId('person-row-0-name').fill('Alexandra Example');
    await expect(page.getByTestId('person-row-0-same-name')).toHaveCount(0);
  });

  test('a row can be removed, the only row is cleared, and the number of rows has its limit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await expect(page.getByTestId('person-row-0-remove')).toHaveCount(0);
    await fillPerson(page, 0, { name: 'First' });
    await page.getByTestId('persons-add-row').click();
    await fillPerson(page, 1, { name: 'Second' });
    await page.getByTestId('person-row-0-remove').click();
    await expect(page.getByTestId('person-row-1')).toHaveCount(0);
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('Second');
    await page.getByTestId('person-row-0-remove').click();
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('');
    await expect(page.getByTestId('person-row-0-remove')).toHaveCount(0);
    for (let row = 1; row < LIMITS.persons; row++) {
      await page.getByTestId('persons-add-row').click();
    }
    await expect(page.getByTestId('persons-add-row')).toBeDisabled();
    await expect(page.getByTestId('persons-add')).toContainText(
      `At most ${LIMITS.persons} persons can be added at once.`,
    );
  });

  test('a refusal is shown on the row it belongs to, even when an empty row lies between', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#persons-invalid');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await clearActs(request);
    await fillPerson(page, 0, { name: 'Nadia Kovac' });
    await page.getByTestId('persons-add-row').click();
    await page.getByTestId('persons-add-row').click();
    await fillPerson(page, 2, { name: 'Omar Haddad', team: 'Mobile Apps' });
    await page.getByTestId('persons-submit').click();
    // The server counts the persons it received: its second one is the third row; the empty row was not sent.
    const sent = sentTo(await acts(request), PERSONS_PATH, 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.persons.map((person) => person.name)).toEqual([
      'Nadia Kovac',
      'Omar Haddad',
    ]);
    await expect(page.getByTestId('person-row-2')).toContainText(
      'This reference leads nowhere. Check it or choose another.',
    );
    await expect(page.getByTestId('person-row-0')).not.toContainText(
      'This reference leads nowhere',
    );
    await expect(page.getByTestId('person-row-1')).not.toContainText(
      'This reference leads nowhere',
    );
    // What was typed stays.
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('Nadia Kovac');
    await expect(page.getByTestId('person-row-2-name')).toHaveValue('Omar Haddad');
    await expectNoSeriousViolations(page, 'persons prefill refused');
  });

  test('a person is erased after a question that says it cannot be undone', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await clearActs(request);
    await page.getByTestId('erase-p-2b7f10').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Erase Jordan Weber?');
    await expect(dialog).toContainText('cannot be brought back');
    await expectNoSeriousViolations(page, 'persons erase question');
    // Cancelling sends nothing and keeps the person.
    await page.getByTestId('erase-cancel').click();
    await expect(dialog).toHaveCount(0);
    expect(await writes(request)).toEqual([]);
    await expect(page.getByTestId('person-p-2b7f10')).toBeVisible();
    await page.getByTestId('erase-p-2b7f10').click();
    await page.getByTestId('erase-confirm').click();
    await expect(page.getByTestId('persons-done')).toHaveText('Jordan Weber is erased.');
    const sent = sentTo(await acts(request), ERASE_PATH, 'POST');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({ pseudonym: 'p-2b7f10' });
    await expect(page.getByTestId('person-p-2b7f10')).toHaveCount(0);
    await expect(page.getByTestId('persons-table').locator('tbody tr')).toHaveCount(
      PERSONS.length - 1,
    );
  });

  test('a directory kept in the source of the organisation is said, and nothing here changes', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#erase-managed-by-source');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await page.getByTestId('erase-p-2b7f10').click();
    await page.getByTestId('erase-confirm').click();
    await expect(page.getByTestId('managed-notice')).toContainText(
      "Persons are kept in your organisation's own source",
    );
    await expect(page.getByTestId('managed-notice')).toContainText(
      'Add and erase persons there. Nothing was changed here.',
    );
    await expect(page.getByTestId('persons-done')).toHaveCount(0);
    await expect(page.getByTestId('person-p-2b7f10')).toBeVisible();
    await expectNoSeriousViolations(page, 'persons managed by source');
    // The prefill is refused the same way, and what was typed stays.
    await fillPerson(page, 0, { name: 'Nadia Kovac' });
    await page.getByTestId('persons-submit').click();
    await expect(page.getByTestId('managed-notice')).toBeVisible();
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('Nadia Kovac');
  });

  test('a Git server that cannot be reached refuses the erasure and the prefill', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin#git-unavailable');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await page.getByTestId('erase-p-2b7f10').click();
    await page.getByTestId('erase-confirm').click();
    await expect(page.getByTestId('persons-view')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('person-p-2b7f10')).toBeVisible();
    await fillPerson(page, 0, { name: 'Nadia Kovac' });
    await page.getByTestId('persons-submit').click();
    await expect(page.getByTestId('persons-view')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('person-row-0-name')).toHaveValue('Nadia Kovac');
  });

  test('a person erased by someone else meanwhile is told so, and the table is read again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await page.route(`**${ERASE_PATH}`, (route) =>
      route.fulfill({ status: 404, json: { outcome: 'NOT_FOUND' } }),
    );
    await page.getByTestId('erase-p-2b7f10').click();
    await page.getByTestId('erase-confirm').click();
    await expect(page.getByTestId('persons-view')).toContainText(
      'This entry is gone already. The list is up to date.',
    );
  });

  test('the page in German names the table, the prefill and the question before the erasure', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'catalog-admin');
    await loginToDirectory(page, PERSONS_ADDRESS, 'persons-view');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('persons-view')).toContainText('Personen im Verzeichnis');
    await expect(page.getByTestId('person-p-7d52e8')).toContainText('Noch nicht verknüpft');
    await expect(page.getByTestId('person-p-4c1a9e')).toContainText(
      'Mit einer Anmeldung verknüpft',
    );
    await expect(page.getByTestId('persons-submit')).toBeDisabled();
    await expect(page.getByTestId('persons-add')).toContainText(
      'Tragen Sie zuerst einen Namen, ein Team und eine Rolle ein.',
    );
    await page.getByTestId('erase-p-2b7f10').click();
    await expect(page.getByRole('dialog')).toContainText('Jordan Weber löschen?');
    await expect(page.getByRole('dialog')).toContainText('lässt sich nicht wiederherstellen');
    await page.getByTestId('erase-confirm').click();
    await expect(page.getByTestId('persons-done')).toHaveText('Jordan Weber ist gelöscht.');
  });
});

test.describe('the first login offers prefilled entries (UC-ACC-4)', () => {
  /** Takes the first-login form to the candidates. */
  async function toCandidates(page) {
    await page.goto(WELCOME_ADDRESS);
    await expect(page.getByTestId('welcome-name')).toHaveValue('Robin Newcomer');
    await page.getByTestId('welcome-role').selectOption({ label: 'Developer' });
    await page.getByTestId('welcome-save').click();
    await expect(page.getByTestId('welcome-candidates')).toBeVisible();
  }

  test('the entries prepared for the team and role are offered by name and place, never by pseudonym', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'first-login#candidates');
    await clearActs(request);
    await login(page, WELCOME_ADDRESS);
    await toCandidates(page);
    await expect(page.getByTestId('welcome-candidates')).toContainText('Is one of these you?');
    const choices = page.getByRole('radio');
    await expect(choices).toHaveCount(CANDIDATES.length + 1);
    for (const candidate of CANDIDATES) {
      await expect(page.getByRole('radio', { name: candidate.label })).not.toBeChecked();
    }
    await expect(
      page.getByRole('radio', { name: 'None of these is me: create a new entry' }),
    ).toBeVisible();
    await expect(page.getByTestId('welcome-view')).not.toContainText(PSEUDONYM);
    // The first save was refused with the candidates; nothing is saved, and nothing is chosen for the person.
    expect(sentTo(await acts(request), ME_PATH, 'PUT')).toHaveLength(1);
    await expect(page.getByTestId('welcome-continue')).toBeDisabled();
    await expect(page.getByTestId('welcome-candidates')).toContainText(
      'Choose one entry, or create a new one.',
    );
    await expectNoSeriousViolations(page, 'welcome candidates');
  });

  test('taking over an entry sends the choice once, and the person is in the shell', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'first-login#candidates');
    await login(page, WELCOME_ADDRESS);
    await toCandidates(page);
    await clearActs(request);
    await page.getByRole('radio', { name: CANDIDATES[0].label }).check();
    await page.getByTestId('welcome-continue').click();
    await expect(page).toHaveURL('/');
    await expect(page.getByTestId('due-view')).toBeVisible();
    const sent = sentTo(await acts(request), ME_PATH, 'PUT');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toMatchObject({
      name: 'Robin Newcomer',
      binding: CANDIDATES[0].pseudonym,
    });
    // The restriction is over: another page opens.
    await page.goto('/samm');
    await expect(page).toHaveURL('/samm');
  });

  test('"Change my entry" leads back to the form with what was typed, and the next save goes through', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'first-login#candidates');
    await login(page, WELCOME_ADDRESS);
    await toCandidates(page);
    await page.getByTestId('welcome-edit').click();
    await expect(page.getByTestId('welcome-candidates')).toHaveCount(0);
    await expect(page.getByTestId('welcome-name')).toHaveValue('Robin Newcomer');
    await expect(page.getByTestId('welcome-role').locator('option:checked')).toHaveText(
      'Developer',
    );
  });

  test('"None of these is me" creates a new entry', async ({ page, request }) => {
    await useScenario(request, 'first-login#candidates');
    await login(page, WELCOME_ADDRESS);
    await toCandidates(page);
    await clearActs(request);
    await page.getByRole('radio', { name: 'None of these is me: create a new entry' }).check();
    await page.getByTestId('welcome-continue').click();
    await expect(page).toHaveURL('/');
    const sent = sentTo(await acts(request), ME_PATH, 'PUT');
    expect(sent).toHaveLength(1);
    expect(sent[0].body.binding).toBe('new');
  });

  test('an entry that cannot be taken over is said, the candidates stay, and the next choice goes through', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'first-login#candidates-not-bindable');
    await login(page, WELCOME_ADDRESS);
    await toCandidates(page);
    await page.getByRole('radio', { name: CANDIDATES[0].label }).check();
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-candidates')).toContainText(
      'That entry cannot be taken over',
    );
    await expect(page.getByTestId('welcome-candidates')).toContainText(
      'Perhaps someone else took it over meanwhile. Choose again, or create a new entry.',
    );
    await expect(page).toHaveURL(WELCOME_ADDRESS);
    await expect(page.getByRole('radio')).toHaveCount(CANDIDATES.length + 1);
    // The refused choice is not kept: the person chooses again.
    await expect(page.getByRole('radio', { name: CANDIDATES[0].label })).not.toBeChecked();
    await expect(page.getByTestId('welcome-continue')).toBeDisabled();
    await expect(page.getByTestId('welcome-view')).not.toContainText(PSEUDONYM);
    await expectNoSeriousViolations(page, 'welcome not bindable');
    await page.getByRole('radio', { name: CANDIDATES[1].label }).check();
    await page.getByTestId('welcome-continue').click();
    await expect(page).toHaveURL('/');
  });

  test('the candidates and the refusal in German', async ({ page, request }) => {
    await useScenario(request, 'first-login#candidates-not-bindable');
    await login(page, WELCOME_ADDRESS);
    await useLanguage(page, 'de');
    await toCandidates(page);
    await expect(page.getByTestId('welcome-candidates')).toContainText(
      'Ist einer davon Ihr Eintrag?',
    );
    await expect(page.getByRole('radio', { name: CANDIDATES[0].label })).toBeVisible();
    await expect(page.getByTestId('welcome-continue')).toHaveText('Weiter');
    await expect(page.getByTestId('welcome-continue')).toBeDisabled();
    await page.getByRole('radio', { name: CANDIDATES[0].label }).check();
    await page.getByTestId('welcome-continue').click();
    await expect(page.getByTestId('welcome-candidates')).toContainText(
      'Dieser Eintrag lässt sich nicht übernehmen',
    );
    await expect(page.getByTestId('welcome-view')).not.toContainText(PSEUDONYM);
  });
});

test.describe('the own entry (UC-ACC-5)', () => {
  test('the settings lead to the entry, which shows the name, the team and role, and the date of the last confirmation', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/settings');
    await page.getByTestId('settings-profile').click();
    await expect(page).toHaveURL(PROFILE_ADDRESS);
    await expect(page.getByTestId('profile-view')).toBeVisible();
    await expect(page.getByTestId('profile-name')).toHaveValue('Alex Example');
    await expect(
      page.getByTestId('profile-membership-0-team').locator('option:checked'),
    ).toHaveText('Payments');
    await expect(
      page.getByTestId('profile-membership-0-role').locator('option:checked'),
    ).toHaveText('Security Champion');
    await expect(page.getByTestId('profile-information')).toContainText(
      'Information on data processing',
    );
    await expect(page.getByTestId('profile-last-confirmed')).toContainText('Last confirmed on');
    await expect(page.getByTestId('profile-last-confirmed')).toContainText('2026');
    // Not due: no question, and nothing to save yet.
    await expect(page.getByTestId('profile-confirm')).toHaveCount(0);
    await expect(page.getByTestId('profile-save')).toBeDisabled();
    await expect(page.getByTestId('profile-view')).toContainText(
      'Nothing changed since the last save.',
    );
    await expect(page.getByTestId('profile-view')).not.toContainText(PSEUDONYM);
    await expectNoSeriousViolations(page, 'profile');
  });

  test('a changed name and a second team are saved in one request, which confirms the entry', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    await clearActs(request);
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await expect(page.getByTestId('profile-save')).toBeEnabled();
    await page.getByTestId('profile-membership-add').click();
    await page
      .getByTestId('profile-membership-1-team')
      .selectOption({ label: 'Identity Platform' });
    await page.getByTestId('profile-membership-1-role').selectOption({ label: 'Developer' });
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-done')).toContainText(
      'Saved. Your entry counts as confirmed as of',
    );
    const sent = sentTo(await acts(request), ME_PATH, 'PUT');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      name: 'Alexandra Example',
      memberships: [
        { team: 'team:payments', role: 'role:security-champion' },
        { team: 'team:identity', role: 'role:developer' },
      ],
    });
    // What was saved is the new state: nothing to save, and no write for the confirmation.
    await expect(page.getByTestId('profile-save')).toBeDisabled();
    expect(sentTo(await acts(request), CONFIRM_PATH, 'POST')).toHaveLength(0);
    // A team can be taken away again, the last one cannot.
    await page.getByTestId('profile-membership-1-remove').click();
    await expect(page.getByTestId('profile-membership-1')).toHaveCount(0);
    await expect(page.getByTestId('profile-membership-0-remove')).toHaveCount(0);
    await expect(page.getByTestId('profile-save')).toBeEnabled();
  });

  test('a retired team is not offered', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    const team = page.getByTestId('profile-membership-0-team');
    await expect(team.locator('option', { hasText: 'Legacy Billing' })).toHaveCount(0);
    await expect(team.locator('option', { hasText: 'Mobile Apps' })).toHaveCount(1);
  });

  test("an empty name or team says which field and sends nothing; the server's refusal marks the team", async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#entry-invalid');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    await clearActs(request);
    await page.getByTestId('profile-name').fill('   ');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-view')).toContainText('Fill in this field.');
    await expect(page.getByTestId('profile-name')).toHaveAttribute('aria-invalid', 'true');
    expect(await writes(request)).toEqual([]);
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-view')).toContainText(
      'This reference leads nowhere. Check it or choose another.',
    );
    expect(sentTo(await acts(request), ME_PATH, 'PUT')).toHaveLength(1);
    // What was typed stays, and nothing is confirmed.
    await expect(page.getByTestId('profile-name')).toHaveValue('Alexandra Example');
    await expect(page.getByTestId('profile-save')).toBeEnabled();
    await expectNoSeriousViolations(page, 'profile refused');
  });

  test('a Git server that cannot be reached refuses the save and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#entry-git-unavailable');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-view')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('profile-name')).toHaveValue('Alexandra Example');
    await expect(page.getByTestId('profile-done')).toHaveText('');
  });

  test('without the right to write the own entry the refusal is shown, and nothing is lost', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    await expect(page.getByTestId('profile-name')).toHaveValue('Kim Reader');
    await page.getByTestId('profile-name').fill('Kim Reviewer');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-view')).toContainText(FORBIDDEN);
    await expect(page.getByTestId('profile-name')).toHaveValue('Kim Reviewer');
  });

  test('leaving with unsaved changes asks first; a saved or unchanged entry leaves without a question', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToDirectory(page, PROFILE_ADDRESS, 'profile-view');
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await page.getByTestId('nav-catalogs').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Leave this page?');
    await expectNoSeriousViolations(page, 'profile leave question');
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(PROFILE_ADDRESS);
    await expect(page.getByTestId('profile-name')).toHaveValue('Alexandra Example');
    await page.getByTestId('nav-catalogs').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL(/\/catalogs/);
    // Saved: nothing to lose.
    await page.goto(PROFILE_ADDRESS);
    await expect(page.getByTestId('profile-view')).toBeVisible();
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-done')).toContainText('Saved.');
    await page.getByTestId('nav-catalogs').click();
    await expect(page).toHaveURL(/\/catalogs/);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('"Is this still right?" (UC-ACC-5)', () => {
  test('a due confirmation shows a notice on every page of the shell that is no gate and leads to the entry', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#confirmation-due');
    await login(page, '/');
    const notice = page.getByTestId('confirmation-notice');
    await expect(notice).toContainText('Is your entry still right?');
    await expect(notice).toContainText('Check them once; nothing else is blocked.');
    await expect(notice.getByTestId('notice')).toHaveAttribute('data-tone', 'info');
    await expectNoSeriousViolations(page, 'confirmation notice');
    // Nothing is blocked: other lenses open, and the notice goes with the person.
    for (const [rail, view] of [
      ['nav-samm', 'samm-overview'],
      ['nav-catalogs', 'catalogs-view'],
    ]) {
      await page.getByTestId(rail).click();
      await expect(page.getByTestId(view)).toBeVisible();
      await expect(notice).toBeVisible();
    }
    await page.getByTestId('confirmation-link').click();
    await expect(page).toHaveURL(PROFILE_ADDRESS);
    await expect(page.getByTestId('profile-view')).toBeVisible();
    // The page asks the question itself, so the notice is not repeated there.
    await expect(notice).toHaveCount(0);
    await expect(page.getByTestId('profile-confirm')).toContainText('Is this still right?');
    await expect(page.getByTestId('profile-confirm')).toContainText(
      'You last confirmed your name, team and role on',
    );
    await expect(page.getByTestId('profile-last-confirmed')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'profile confirmation due');
  });

  test('no notice while nothing is due', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await expect(page.getByTestId('due-view')).toBeVisible();
    await expect(page.getByTestId('confirmation-notice')).toHaveCount(0);
  });

  test('"Yes, this is right" confirms without a change, and the notice is gone without a reload', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#confirmation-due');
    await login(page, PROFILE_ADDRESS);
    await expect(page.getByTestId('profile-confirm')).toBeVisible();
    // Confirming is the act of the page; saving has nothing to save.
    await expect(page.getByTestId('profile-confirm-act')).toHaveText('Yes, this is right');
    await expect(page.getByTestId('profile-save')).toBeDisabled();
    await clearActs(request);
    await page.getByTestId('profile-confirm-act').click();
    await expect(page.getByTestId('profile-done')).toContainText(
      'Thank you. Your entry is confirmed as of',
    );
    expect(sentTo(await acts(request), CONFIRM_PATH, 'POST')).toHaveLength(1);
    expect(sentTo(await acts(request), ME_PATH, 'PUT')).toHaveLength(0);
    await expect(page.getByTestId('profile-confirm')).toHaveCount(0);
    await expect(page.getByTestId('profile-last-confirmed')).toContainText('Last confirmed on');
    // The shell reads the session again: its notice is gone on the next page, with no reload.
    await page.getByTestId('nav-catalogs').click();
    await expect(page.getByTestId('catalogs-view')).toBeVisible();
    await expect(page.getByTestId('confirmation-notice')).toHaveCount(0);
  });

  test('a saved change counts as the confirmation: unsaved changes block the question, saving ends it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#confirmation-due');
    await login(page, PROFILE_ADDRESS);
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await expect(page.getByTestId('profile-confirm-act')).toBeDisabled();
    await expect(page.getByTestId('profile-confirm')).toContainText(
      'You have changes that are not saved. Save them, which confirms the entry as well.',
    );
    await clearActs(request);
    await page.getByTestId('profile-confirm-act').click({ force: true });
    expect(await writes(request)).toEqual([]);
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-done')).toContainText(
      'Saved. Your entry counts as confirmed as of',
    );
    expect(sentTo(await acts(request), ME_PATH, 'PUT')).toHaveLength(1);
    expect(sentTo(await acts(request), CONFIRM_PATH, 'POST')).toHaveLength(0);
    await expect(page.getByTestId('profile-confirm')).toHaveCount(0);
    await page.getByTestId('nav-catalogs').click();
    await expect(page.getByTestId('catalogs-view')).toBeVisible();
    await expect(page.getByTestId('confirmation-notice')).toHaveCount(0);
  });

  test('a Git server that cannot be reached refuses the confirmation, and the question stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#confirmation-due');
    await login(page, PROFILE_ADDRESS);
    await page.route(`**${CONFIRM_PATH}`, (route) =>
      route.fulfill({ status: 503, json: { outcome: 'GIT_UNAVAILABLE' } }),
    );
    await page.getByTestId('profile-confirm-act').click();
    await expect(page.getByTestId('profile-view')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('profile-confirm')).toBeVisible();
    await page.getByTestId('nav-catalogs').click();
    await expect(page.getByTestId('confirmation-notice')).toBeVisible();
  });

  test('the notice and the question in German', async ({ page, request }) => {
    await useScenario(request, 'workshop#confirmation-due');
    await login(page, '/');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('confirmation-notice')).toContainText('Stimmt Ihr Eintrag noch?');
    await expect(page.getByTestId('confirmation-link')).toHaveText('Meinen Eintrag prüfen');
    await page.getByTestId('confirmation-link').click();
    await expect(page.getByTestId('profile-confirm')).toContainText('Stimmt das noch?');
    await expect(page.getByTestId('profile-confirm-act')).toHaveText('Ja, das stimmt');
    await page.getByTestId('profile-name').fill('Alexandra Example');
    await expect(page.getByTestId('profile-confirm')).toContainText(
      'Sie haben Änderungen, die nicht gespeichert sind.',
    );
    await expect(page.getByTestId('profile-save')).toHaveText('Speichern');
    await page.getByTestId('profile-save').click();
    await expect(page.getByTestId('profile-done')).toContainText(
      'Gespeichert. Ihr Eintrag gilt seit',
    );
  });
});
