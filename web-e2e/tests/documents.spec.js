import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import {
  CREATE_PATH,
  NOTES,
  draftPath,
  field,
  noteAddress,
  savePath,
  sentTo,
  submitPath,
  useLanguage,
} from './helpers/documents.js';
import { acts, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';

/**
 * The documents lens (UC-DOC-1 to UC-DOC-4, UC-DOC-6; AUN-WEB-4, AUN-WEB-5): the generic lens of the category
 * `test-note` against the document lifecycle of the mock (web-mock/README.adoc, Document Lifecycle): find, read, the
 * form kit through the sheet, the draft and the save, the conflict, every refusal, the steps of the workflow, the
 * earlier states and the read-only paths. The release flow and the search are the later stage's.
 */
const LENS = '/categories/test-note';

/** @returns the line the sheet announces to a screen reader after a step */
function announcement(page) {
  return page.getByTestId('document-sheet').locator('p.sr-only[role="status"]');
}

test.describe('find the documents (UC-DOC-1)', () => {
  test('the lens lists the notes with their state, version and last change', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS);
    await expect(page.getByTestId('documents-view')).toBeVisible();
    const list = page.getByTestId('document-list');
    await expect(list.getByRole('link')).toHaveCount(9);
    const retention = page.getByTestId(`document-${NOTES.N2}`);
    await expect(retention).toContainText('Retention schedule for audit evidence');
    await expect(retention).toContainText('Draft');
    await expect(retention).toContainText('Version 1');
    await expect(retention).toContainText('Release requested');
    await expect(page.getByTestId(`document-${NOTES.N1}`)).toContainText('Released');
    await expect(page.getByTestId(`document-${NOTES.N4}`)).toContainText('In review');
    // The newest change is on top.
    await expect(list.getByRole('link').first()).toContainText('Retention schedule');
    await expect(page.getByTestId('new-document')).toHaveText('New document');
  });

  test('the state and the title filter the list, and an empty answer says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS);
    const list = page.getByTestId('document-list');
    await page.getByTestId('filter-state').selectOption('in-review');
    await expect(list.getByRole('link')).toHaveCount(2);
    await expect(list).toContainText('Supplier security questionnaire');
    await expect(list).toContainText('Access review cadence');
    await page.getByTestId('filter-title').fill('ACCESS');
    await expect(list.getByRole('link')).toHaveCount(1);
    await expect(list).toContainText('Access review cadence');
    await page.getByTestId('filter-title').fill('no such title');
    await expect(list).toHaveCount(0);
    await expect(page.getByText('No document matches')).toBeVisible();
    await page.getByTestId('filter-title').fill('');
    await page.getByTestId('filter-state').selectOption('');
    await expect(list.getByRole('link')).toHaveCount(9);
  });

  test('a selected note opens at its address, and a reload restores the same view', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS);
    await page.getByTestId(`document-${NOTES.N6}`).click();
    await expect(page).toHaveURL(noteAddress(NOTES.N6));
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vendor onboarding questions');
    await page.reload();
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Vendor onboarding questions');
    // The list stays beside the sheet, with the open note marked.
    await expect(page.getByTestId(`document-${NOTES.N6}`)).toHaveAttribute('aria-current', 'page');
  });

  test('a category the lens does not show is not found', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await page.goto('/categories/no-such-category');
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto('/categories/no-such-category/new');
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });

  test('an installation without a category says so in the lens', async ({ page, request }) => {
    await useScenario(request, 'empty');
    await login(page, '/');
    await page.goto('/categories');
    await expect(page.getByTestId('documents-view')).toBeVisible();
    await expect(page.getByText('No document categories')).toBeVisible();
    await expect(page.getByTestId('category-list')).toHaveCount(0);
  });

  test('the lens in German names the category, the states and the acts', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('new-document')).toHaveText('Neues Dokument');
    await expect(page.getByTestId(`document-${NOTES.N2}`)).toContainText('Entwurf');
    await expect(page.getByTestId(`document-${NOTES.N2}`)).toContainText('Version 1');
    await expect(page.getByTestId(`document-${NOTES.N4}`)).toContainText('In Prüfung');
    await expect(page.getByTestId('view-title')).toHaveText('Dokumente');
  });
});

test.describe('read a document (UC-DOC-2)', () => {
  test('a released note shows its release and its values, and stays editable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N1));
    await expect(page.getByTestId('document-state')).toHaveText('Released as v1');
    await expect(page.getByTestId('release-block')).toContainText('notes/');
    await expect(page.getByTestId('document-history')).toBeVisible();
    await expect(field(page, '/title').getByRole('textbox')).toHaveValue(
      'Key rotation, decision of 24 November',
    );
    // A note released more than once is reopened by the next save: it says so, and stays editable.
    await expect(page.getByText('Your next save starts version 2')).toBeVisible();
    await expect(field(page, '/title').getByRole('textbox')).toBeEditable();
  });

  test('every mark of the form kit stands beside the value it belongs to', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N8));
    await expect(field(page, '/service')).toContainText('Retired');
    await expect(field(page, '/owner')).toContainText('Not yet bound');
    await expect(field(page, '/related')).toContainText('Not found');
    const actions = page.getByTestId('table--actions');
    await expect(actions).toContainText('Former member');
    await expect(actions).toContainText('Unknown person');
  });
});

test.describe('the earlier states of a document (UC-DOC-2)', () => {
  test('the picker lists the releases and the saves, and an earlier state reads only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N6));
    const select = page.getByTestId('revision-select');
    await expect(select).toHaveValue('');
    const options = await select.locator('option').allTextContents();
    expect(options.join('|')).toContain('Released as v2');
    expect(options.join('|')).toContain('Released as v1');
    await select.selectOption('v1');
    await expect(page).toHaveURL(noteAddress(NOTES.N6, '?at=v1'));
    await expect(page.getByTestId('revision-notice')).toContainText(
      'You are reading an earlier state',
    );
    await expect(page.getByTestId('revision-notice')).toContainText('Released as v1');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-state')).toContainText(
      'An earlier state can be read only.',
    );
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('transition-bar')).toHaveCount(0);
    await expect(page.getByTestId('document-form').getByRole('textbox')).toHaveCount(0);
    // Reading an earlier state writes nothing.
    expect((await acts(request)).filter((act) => act.method !== 'GET')).toEqual([]);
    await page.getByTestId('revision-back').click();
    await expect(page).toHaveURL(noteAddress(NOTES.N6));
    await expect(page.getByTestId('revision-notice')).toHaveCount(0);
    await expect(field(page, '/title').getByRole('textbox')).toBeEditable();
  });

  test('an earlier state is an address of its own, and one that does not exist is not found', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N6, '?at=a3d9f20'));
    await expect(page.getByTestId('revision-notice')).toBeVisible();
    await expect(page.getByTestId('revision-select')).toHaveValue('a3d9f20');
    await page.reload();
    await expect(page.getByTestId('revision-notice')).toBeVisible();
    await page.goto(noteAddress(NOTES.N6, '?at=deadbee'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });
});

/** The last draft the mock received for a note, as the fields of its single part. */
async function lastDraftFields(request, id) {
  const drafts = sentTo(await acts(request), draftPath(id), 'PUT');
  return drafts.length === 0 ? null : drafts.at(-1).body.parts.data.fields;
}

test.describe('the form kit through the sheet (AUN-WEB-4)', () => {
  // A date-time is entered in the time zone of the browser and stored as an instant in UTC.
  test.use({ timezoneId: 'UTC' });

  test('every kind of field takes its value, and the draft carries what was entered', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N3));
    await field(page, '/noted').locator('input').fill('2026-11-26T09:30:00');
    await field(page, '/status').getByRole('combobox').selectOption({ label: 'Agreed' });
    await field(page, '/pinned').getByRole('switch').click();
    await field(page, '/service').getByRole('combobox').selectOption({ label: 'Payment API' });
    await field(page, '/owner')
      .getByRole('combobox')
      .selectOption({ label: 'Jordan Weber, Payments' });
    await field(page, '/related').getByRole('textbox').fill('isms-register:risk/R-042');
    await field(page, '/summary').getByRole('textbox').fill('Restore twice, measure once.');
    await expect
      .poll(async () => (await lastDraftFields(request, NOTES.N3)) ?? {})
      .toMatchObject({
        '/noted': '2026-11-26T09:30:00Z',
        '/status': 'agreed',
        '/pinned': true,
        '/service': 'service:payment-api',
        '/owner': 'p-2b7f10',
        '/related': 'isms-register:risk/R-042',
        '/summary': 'Restore twice, measure once.',
      });
    // The control of each kind says what it is: a retired entry is not offered, a mandatory field is marked.
    await expect(field(page, '/service').getByRole('combobox')).not.toContainText('Ledger');
    await expect(field(page, '/title')).toContainText('required');
    await expect(field(page, '/summary')).toContainText('Do not write personal details');
    await expect(field(page, '/service')).toContainText('The service the note is about.');
    await expectNoSeriousViolations(page, 'document form kit');
  });

  test('a reference to a document names its target, or says that it leads nowhere', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N3));
    const related = field(page, '/related');
    await related.getByRole('textbox').fill('isms-register:risk/R-042');
    await expect(related.getByRole('link', { name: 'Unpatched build agents' })).toHaveAttribute(
      'href',
      '/isms/risks/r-042',
    );
    await related.getByRole('textbox').fill('isms-register:risk/R-999');
    await expect(related).toContainText('Not found');
    await expect(related.getByRole('link')).toHaveCount(0);
  });

  test('the AsciiDoc preview follows the source and is the server own rendering', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N3));
    const body = field(page, '/body');
    await body.getByRole('textbox').fill('== Findings\n\n* first *bold* point\n* second point');
    const preview = body.locator('[data-outcome]');
    await expect(preview).toHaveAttribute('data-outcome', 'shown');
    await expect(preview.getByRole('heading', { name: 'Findings' })).toBeVisible();
    await expect(preview.getByRole('listitem')).toHaveCount(2);
    await expect(preview.locator('strong')).toHaveText('bold');
  });

  test('a hostile preview is drawn inert: no script, no handler, no foreign link, no frame', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#preview-hostile');
    const dialogs = [];
    page.on('dialog', (dialog) => {
      dialogs.push(dialog.message());
      void dialog.dismiss();
    });
    await login(page, noteAddress(NOTES.N3));
    const body = field(page, '/body');
    await body.getByRole('textbox').fill('anything: the mock answers the hostile page');
    const preview = body.locator('[data-outcome]');
    await expect(preview).toHaveAttribute('data-outcome', 'shown');
    await expect(preview.locator('script, iframe, form, svg, style, object, embed')).toHaveCount(0);
    expect(await preview.locator('[onclick], [onerror], [onload], [onmouseover]').count()).toBe(0);
    const hrefs = await preview
      .locator('a')
      .evaluateAll((links) => links.map((link) => link.getAttribute('href') ?? ''));
    for (const href of hrefs) expect(href).not.toMatch(/^\s*(javascript|data|vbscript):/i);
    expect(await page.evaluate(() => window.hostile ?? null)).toBeNull();
    expect(dialogs).toEqual([]);
    await expectNoSeriousViolations(page, 'document hostile preview');
  });

  test('a preview that cannot be had costs the preview only', async ({ page, request }) => {
    await useScenario(request, 'workshop#preview-unavailable');
    await login(page, noteAddress(NOTES.N3));
    const body = field(page, '/body');
    await body.getByRole('textbox').fill('== Still editable');
    await expect(body).toContainText('No preview is shown');
    await expect(body.getByRole('textbox')).toHaveValue('== Still editable');
  });

  test('the table of actions adds, edits, moves and removes rows', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N2));
    const table = page.getByTestId('table--actions');
    await expect(table.getByRole('row')).toHaveCount(3);
    // Add a row with a text, a person, a date and a flag.
    await table.getByRole('button', { name: 'Add row' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toContainText('Actions: new row');
    await editor.getByRole('textbox', { name: 'What' }).fill('Archive the interview notes');
    await editor
      .getByRole('combobox', { name: 'Who' })
      .selectOption({ label: 'Sam Okafor, Payments' });
    await editor.getByLabel('Due on').fill('2026-12-31');
    await editor.getByRole('switch', { name: 'Done' }).click();
    await editor.getByRole('button', { name: 'Add to the list' }).click();
    await expect(table.getByRole('row')).toHaveCount(4);
    await expect(table).toContainText('Archive the interview notes');
    // Edit the first row.
    await table.getByRole('button', { name: 'Edit row 1' }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'What' }).fill('Check with legal');
    await page.getByRole('dialog').getByRole('button', { name: 'Apply changes' }).click();
    await expect(table.getByRole('row').nth(1)).toContainText('Check with legal');
    // Move the new row to the top.
    await table.getByRole('button', { name: 'Move up, row 3' }).click();
    await table.getByRole('button', { name: 'Move up, row 2' }).click();
    await expect(table.getByRole('row').nth(1)).toContainText('Archive the interview notes');
    // Remove a row after the question.
    await table.getByRole('button', { name: 'Remove row 2' }).click();
    await expect(page.getByRole('dialog')).toContainText('Remove row 2 of Actions?');
    await page.getByRole('dialog').getByRole('button', { name: 'Remove row' }).click();
    await expect(table.getByRole('row')).toHaveCount(3);
    await expect(table).not.toContainText('Check with legal');
    await expect
      .poll(async () => (await lastDraftFields(request, NOTES.N2))?.['/actions'])
      .toEqual([
        { what: 'Archive the interview notes', who: 'p-9e33a1', due: '2026-12-31', done: true },
        { what: 'Mark the archive folders', who: 'p-9e33a1', due: '2026-12-20', done: false },
      ]);
    await expectNoSeriousViolations(page, 'document table');
  });

  test('cancelling the row editor changes nothing', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    const table = page.getByTestId('table--actions');
    await table.getByRole('button', { name: 'Edit row 1' }).click();
    await page.getByRole('dialog').getByRole('textbox', { name: 'What' }).fill('Never applied');
    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
    await expect(table).not.toContainText('Never applied');
    await expect(table).toContainText('Check the schedule with the legal team');
  });

  test('the same form in German: the labels, the hints and the table', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    await useLanguage(page, 'de');
    await expect(field(page, '/title').getByRole('textbox')).toBeVisible();
    await expect(field(page, '/title')).toContainText('Titel');
    await expect(field(page, '/title')).toContainText('Pflichtfeld');
    await expect(field(page, '/status')).toContainText('Stand');
    await expect(field(page, '/summary')).toContainText('Zusammenfassung');
    await expect(field(page, '/summary')).toContainText('persönlichen Angaben');
    await expect(field(page, '/status').getByRole('combobox')).toContainText('Vereinbart');
    await expect(page.getByTestId('save-everyone')).toHaveText('Für alle speichern');
    await expect(page.getByTestId('transition-test-note.submit')).toHaveText(
      'Zur Prüfung einreichen',
    );
    const table = page.getByTestId('table--actions');
    await table.getByRole('button', { name: 'Zeile hinzufügen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Maßnahmen: neue Zeile');
    await page.getByRole('dialog').getByRole('button', { name: 'Abbrechen' }).click();
    await expect(table.getByRole('columnheader', { name: 'Fällig am' })).toBeVisible();
    await expectNoSeriousViolations(page, 'document form (de)');
  });
});

test.describe('the draft and the save (UC-DOC-3, UC-DOC-4)', () => {
  test('a change is kept as a draft for the person, then saved for everyone', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N3));
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await field(page, '/summary').getByRole('textbox').fill('Restore the nightly backup twice.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await expect(page.getByTestId('save-state')).toContainText('Saved for you at');
    const drafts = sentTo(await acts(request), draftPath(NOTES.N3), 'PUT');
    expect(drafts.at(-1).body.parts.data).toMatchObject({
      blob: 'c4d5e6f',
      fields: { '/summary': 'Restore the nightly backup twice.' },
    });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const saves = sentTo(await acts(request), savePath(NOTES.N3), 'POST');
    expect(saves).toHaveLength(1);
    expect(saves[0].body.parts.data).toMatchObject({
      blob: 'c4d5e6f',
      fields: { '/summary': 'Restore the nightly backup twice.' },
    });
    await expectNoSeriousViolations(page, 'document saved');
  });

  test('the first save after a release starts the next version and says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N1));
    await field(page, '/pinned').getByRole('switch').click();
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('reopened-notice')).toContainText('Version 2 has begun');
  });

  test('the own draft of an earlier visit comes back and is marked as the person own', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    await expect(page.getByTestId('restored-notice')).toContainText('Your own draft from');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await expect(field(page, '/summary').getByRole('textbox')).toHaveValue(
      'Keep audit evidence for ten years; review it every year.',
    );
    await expect(field(page, '/pinned').getByRole('switch')).toBeChecked();
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('a save by another person is shown in place and keeps what was typed here', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
    await field(page, '/title').getByRole('textbox').fill('Retention schedule, second reading');
    await gotoState(request, 'note-saved-by-other');
    await expect(page.getByTestId('remote-notice')).toContainText(
      'Jordan Weber saved this document',
    );
    await expect(page.getByTestId('document-history')).toContainText('Jordan Weber');
    // The page is not reloaded: what the person typed stays, and so does their own draft.
    await expect(field(page, '/title').getByRole('textbox')).toHaveValue(
      'Retention schedule, second reading',
    );
    await expect(page.getByTestId('document-sheet')).toBeVisible();
  });

  test('invalid entries show at their fields and the text stays on the page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-invalid');
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('save-state')).toContainText('Some entries need a correction');
    await expect(field(page, '/related')).toContainText('This reference leads nowhere');
    await expect(field(page, '/owner')).toContainText('This person is not in the directory');
    await expect(page.getByTestId('failure-notice')).toContainText('Some entries are not valid');
    await expect(field(page, '/summary').getByRole('textbox')).toHaveValue(
      'Keep audit evidence for ten years; review it every year.',
    );
    // The error of a field goes when the field changes.
    await field(page, '/related').getByRole('textbox').fill('isms-register:risk/R-042');
    await expect(field(page, '/related')).not.toContainText('This reference leads nowhere');
    await expectNoSeriousViolations(page, 'document invalid');
  });

  test('a note released meanwhile keeps the changes and says what to do', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-released-meanwhile');
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'This document was released while you were working. Your changes are kept',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(field(page, '/summary').getByRole('textbox')).toHaveValue(
      'Keep audit evidence for ten years; review it every year.',
    );
  });

  test('a push the Git server refuses keeps the work and says so', async ({ page, request }) => {
    await useScenario(request, 'workshop#note-rejected');
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'The Git server refused the change',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(field(page, '/pinned').getByRole('switch')).toBeChecked();
  });

  test('an unreachable Git server keeps the work, and the draft still goes through', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-git-unavailable');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N2));
    await expect(page.getByText('Git server unreachable')).toBeVisible();
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'The Git server cannot be reached',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    // The work is kept: reading is served, the draft is written again.
    await field(page, '/title').getByRole('textbox').fill('Retention schedule, kept');
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    await expect
      .poll(async () => sentTo(await acts(request), draftPath(NOTES.N2), 'PUT').length)
      .toBeGreaterThan(0);
  });
});

test.describe('a conflict is decided per field (UC-DOC-4)', () => {
  /** Opens the retention schedule and presses save: the mock answers the conflict of /summary and /status. */
  async function conflict(page, request) {
    await useScenario(request, 'workshop#note-conflict');
    await login(page, noteAddress(NOTES.N2));
    await field(page, '/status').getByRole('combobox').selectOption({ label: 'Agreed' });
    await field(page, '/summary').getByRole('textbox').fill('Rotate every 90 days.');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('conflict-panel')).toBeVisible();
  }

  test('both versions stand side by side, and nothing is saved until each field is decided', async ({
    page,
    request,
  }) => {
    await conflict(page, request);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
    const summary = page.getByTestId('conflict-/summary');
    await expect(summary).toContainText('Rotate every 90 days.');
    await expect(summary).toContainText('Rotate every 60 days.');
    await expect(summary).toContainText('Version of Jordan Weber');
    const status = page.getByTestId('conflict-/status');
    await expect(status).toContainText('Agreed');
    await expect(status).toContainText('Dropped');
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('save-everyone')).toContainText('Save for everyone');
    await expectNoSeriousViolations(page, 'document conflict');
  });

  test('keeping the own summary and taking the other status saves the decided values', async ({
    page,
    request,
  }) => {
    await conflict(page, request);
    await clearActs(request);
    await page.getByTestId('keep-own-/summary').click();
    await expect(page.getByTestId('conflict-/summary')).toHaveCount(0);
    await expect(page.getByTestId('conflict-/status')).toBeVisible();
    await page.getByTestId('take-other-/status').click();
    await expect(page.getByTestId('conflict-panel')).toHaveCount(0);
    await expect(field(page, '/summary').getByRole('textbox')).toHaveValue('Rotate every 90 days.');
    await expect(field(page, '/status').getByRole('combobox')).toHaveValue('2');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(NOTES.N2), 'POST');
    expect(saves).toHaveLength(1);
    expect(saves[0].body.parts.data).toMatchObject({
      blob: '5d1e9a0',
      fields: { '/summary': 'Rotate every 90 days.', '/status': 'dropped' },
    });
  });

  test('taking the other summary and keeping the own status saves the other decision', async ({
    page,
    request,
  }) => {
    await conflict(page, request);
    await clearActs(request);
    await page.getByTestId('take-other-/summary').click();
    await page.getByTestId('keep-own-/status').click();
    await expect(page.getByTestId('conflict-panel')).toHaveCount(0);
    await expect(field(page, '/summary').getByRole('textbox')).toHaveValue('Rotate every 60 days.');
    await expect(field(page, '/status').getByRole('combobox')).toHaveValue('1');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(NOTES.N2), 'POST');
    expect(saves[0].body.parts.data).toMatchObject({
      fields: { '/summary': 'Rotate every 60 days.', '/status': 'agreed' },
    });
  });
});

test.describe('the steps of the workflow (UC-DOC-6)', () => {
  test('a submit with empty mandatory fields lists them and leads back to editing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N3));
    await page.getByTestId('transition-test-note.submit').click();
    const missing = page.getByTestId('missing-fields');
    await expect(missing).toBeVisible();
    await expect(missing.getByRole('button')).toHaveCount(2);
    await expect(missing).toContainText('Go to Noted at');
    await expect(missing).toContainText('Go to Status');
    await expect(field(page, '/status')).toContainText('Fill in this field before you go on.');
    await expect(field(page, '/noted')).toContainText('Fill in this field before you go on.');
    await missing.getByRole('button', { name: 'Go to Status' }).click();
    await expect(field(page, '/status').getByRole('combobox')).toBeFocused();
    await page.getByTestId('back-to-editing').click();
    await expect(page.getByTestId('missing-fields')).toHaveCount(0);
    await expect(field(page, '/noted').locator('input')).toBeFocused();
    await expectNoSeriousViolations(page, 'document missing fields');
  });

  test('changes are saved first, then the step is taken', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByText('Save your changes first')).toBeVisible();
    await expect(page.getByTestId('save-first')).toContainText(
      'Save for everyone, then Submit for review',
    );
    expect(sentTo(await acts(request), submitPath(NOTES.N2))).toHaveLength(0);
    await page.getByTestId('save-first').click();
    await expect(announcement(page)).toContainText('is now In review');
    const sent = await acts(request);
    expect(sentTo(sent, savePath(NOTES.N2), 'POST')).toHaveLength(1);
    expect(sentTo(sent, submitPath(NOTES.N2), 'POST')).toHaveLength(1);
    await expect(page.getByTestId('save-first')).toHaveCount(0);
  });

  test('a note without changes is submitted at once', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N7));
    await page.getByTestId('transition-test-note.submit').click();
    await expect(announcement(page)).toContainText('is now In review');
    expect(sentTo(await acts(request), submitPath(NOTES.N7), 'POST')).toHaveLength(1);
  });

  test('a refused push of a submit keeps the note as it was', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    // Saved first, so that the step has nothing to wait for.
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await gotoState(request, 'note-rejected');
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'The Git server refused the change',
    );
  });

  test('an unreachable Git server stops a submit and says so', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await gotoState(request, 'note-git-unavailable');
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'The Git server cannot be reached',
    );
  });

  test('a submit that needs a fresh login leaves for it, and the work comes back as the draft', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await gotoState(request, 'note-submit-step-up');
    const back = page.waitForURL(/\/api\/v1\/auth\/login\?.*step-up=mfa/);
    await page.getByTestId('transition-test-note.submit').click();
    await back;
    await expect(page).toHaveURL(noteAddress(NOTES.N2));
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    // The mock keeps its own draft of the note, which the page restores: the step asks to save it first.
    await page.getByTestId('transition-test-note.submit').click();
    await page.getByTestId('save-first').click();
    await expect(announcement(page)).toContainText('is now In review');
  });

  test('a local user confirms a save and a submit with the password', async ({ page, request }) => {
    await useScenario(request, 'workshop#note-release-password');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N2));
    await page.getByTestId('save-everyone').click();
    await expect(page.getByRole('dialog')).toContainText('Enter your password to save');
    await page.getByTestId('document-password').fill('local-password');
    await page.getByTestId('document-confirm').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByRole('dialog')).toContainText('Enter your password to confirm');
    await page.getByTestId('document-password').fill('local-password');
    await page.getByTestId('document-confirm').click();
    await expect(announcement(page)).toContainText('is now In review');
    expect(JSON.stringify(await acts(request))).not.toContain('local-password');
  });
});

test.describe('in German (AUN-WEB-7)', () => {
  test('the conflict, the empty mandatory fields and the earlier state speak German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-conflict');
    await login(page, noteAddress(NOTES.N2));
    await useLanguage(page, 'de');
    await field(page, '/status').getByRole('combobox').selectOption({ label: 'Vereinbart' });
    await field(page, '/summary').getByRole('textbox').fill('Rotate every 90 days.');
    await page.getByTestId('save-everyone').click();
    const panel = page.getByTestId('conflict-panel');
    await expect(panel).toContainText('2 Felder wurden von jemand anderem geändert');
    await expect(page.getByTestId('conflict-/summary')).toContainText('Ihre Fassung');
    await expect(page.getByTestId('take-other-/summary')).toHaveText(
      'Fassung von Jordan Weber übernehmen',
    );
    await expect(page.getByTestId('keep-own-/status')).toHaveText('Meine Fassung behalten');
    await expect(page.getByTestId('conflict-/status')).toContainText('Verworfen');
    await expectNoSeriousViolations(page, 'document conflict (de)');
    await useScenario(request, 'workshop');
    await page.goto(noteAddress(NOTES.N3));
    await page.getByTestId('transition-test-note.submit').click();
    await expect(page.getByTestId('missing-fields')).toContainText('Zu Festgehalten am');
    await expect(page.getByTestId('back-to-editing')).toHaveText('Zurück zum Bearbeiten');
    await page.goto(noteAddress(NOTES.N6, '?at=v1'));
    await expect(page.getByTestId('revision-notice')).toContainText(
      'Sie lesen einen früheren Stand',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
  });

  test('the password question of a save is German, and cancelling sends nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-release-password');
    await clearActs(request);
    await login(page, noteAddress(NOTES.N2));
    await useLanguage(page, 'de');
    await page.getByTestId('save-everyone').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Identität bestätigen');
    await dialog.locator('form').getByRole('button', { name: 'Abbrechen' }).click();
    await expect(dialog).toHaveCount(0);
    expect(sentTo(await acts(request), savePath(NOTES.N2), 'POST')).toEqual([]);
    // The changes are still the person's.
    await expect(field(page, '/pinned').getByRole('switch')).toBeChecked();
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
  });
});

test.describe('a new document (UC-DOC-3)', () => {
  test('the form of the document type creates the note and opens it', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await login(page, LENS);
    await page.getByTestId('new-document').click();
    await expect(page).toHaveURL(`${LENS}/new`);
    await expect(page.getByTestId('new-document-sheet')).toBeVisible();
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('save-state')).toContainText('Not saved yet');
    await field(page, '/title').getByRole('textbox').fill('Phishing drill notes');
    await field(page, '/noted').locator('input').fill('2026-11-26T09:30:00');
    await field(page, '/status').getByRole('combobox').selectOption({ label: 'Open' });
    await expect(page.getByTestId('save-state')).toContainText('Your text stays on this page');
    await page.getByTestId('save-everyone').click();
    await expect(page).toHaveURL(noteAddress(NOTES.N10));
    await expect(page.getByTestId('document-sheet')).toBeVisible();
    const created = sentTo(await acts(request), CREATE_PATH, 'POST');
    expect(created).toHaveLength(1);
    expect(created[0].body).toMatchObject({
      kind: 'note',
      parts: { data: { fields: { '/title': 'Phishing drill notes', '/status': 'open' } } },
    });
  });

  test('leaving a form with typed text asks first, and staying keeps the text', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, `${LENS}/new`);
    await field(page, '/title').getByRole('textbox').fill('Not saved yet');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(`${LENS}/new`);
    await expect(field(page, '/title').getByRole('textbox')).toHaveValue('Not saved yet');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('a form nobody typed in is left without a question', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, `${LENS}/new`);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
  });

  test('the server verdict shows at the fields and the text stays', async ({ page, request }) => {
    await useScenario(request, 'workshop#note-invalid');
    await login(page, `${LENS}/new`);
    await field(page, '/title').getByRole('textbox').fill('A note with a bad reference');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toContainText('Some entries need a correction');
    await expect(field(page, '/related')).toContainText('This reference leads nowhere');
    await expect(field(page, '/title').getByRole('textbox')).toHaveValue(
      'A note with a bad reference',
    );
  });

  test('a refused push and an unreachable Git server keep the text', async ({ page, request }) => {
    await useScenario(request, 'workshop#note-rejected');
    await login(page, `${LENS}/new`);
    await field(page, '/title').getByRole('textbox').fill('Kept text');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toContainText('Not saved. Your text stays');
    await expect(page.getByText('The Git server refused the change')).toBeVisible();
    await gotoState(request, 'note-git-unavailable');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByText('The Git server cannot be reached')).toBeVisible();
    await expect(field(page, '/title').getByRole('textbox')).toHaveValue('Kept text');
  });
});

test.describe('a person with the right read only (UC-DOC-2)', () => {
  test('the note is read, the steps say why they are out of reach, nothing can be changed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await login(page, noteAddress(NOTES.N2));
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-state')).toContainText('Editing needs the edit right');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('document-form').getByRole('textbox')).toHaveCount(0);
    await expect(page.getByTestId('restored-notice')).toHaveCount(0);
    await expect(page.getByTestId('transition-test-note.submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByTestId('transition-bar')).toContainText('needs the edit right');
    await expectNoSeriousViolations(page, 'document read only');
  });

  test('a new document cannot be started, by the list or by the address', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await login(page, LENS);
    await expect(page.getByTestId('document-new')).toContainText(
      'Creating a document needs the edit right',
    );
    await expect(page.getByTestId('new-document')).toHaveCount(0);
    await page.goto(`${LENS}/new`);
    await expect(page.getByTestId('new-document-sheet')).toContainText('needs the edit right');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
  });
});
