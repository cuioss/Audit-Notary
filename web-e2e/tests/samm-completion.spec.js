import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { useLanguage } from './helpers/documents.js';
import { acts, broadcast, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';
import {
  CREATED,
  EVIDENCE,
  JORDAN,
  MODELS,
  MODELS_PATH,
  NEW_SCOPE_ADDRESS,
  OPEN,
  PAYMENTS_TARGETS,
  RELEASED,
  SCOPES_PATH,
  TARGET_STEPS,
  assessmentAddress,
  assessmentsPath,
  choose,
  comparePath,
  csrf,
  draftPath,
  fillNewAssessment,
  fillNewScope,
  loginToSamm,
  newAssessmentAddress,
  patchRead,
  releasePath,
  savePath,
  submitPath,
  trendPath,
} from './helpers/samm.js';

/**
 * The SAMM completion (UC-SAMM-1 to UC-SAMM-5, rest-api.adoc, SAMM Requests): a new scope, the targets of a scope, a new
 * assessment, the evidence links and the AsciiDoc comment of a practice, the frozen assessment, the refused comparison and
 * the trend of a scope. They run against the profiles `workshop`, `read-only`, `release`, `empty`, `degraded` and `local`
 * of the mock (web-mock/README.adoc, SAMM Completion).
 *
 * The mock stores nothing: a create answers fixed ids and the state it moves to shows what was created, so a flow types
 * the values the data file holds. The ids, the models, the evidence and the targets are static fixtures of
 * `helpers/samm.js`; the first test compares them with what the mock answers.
 */
const FORBIDDEN_NEW_SCOPE = 'Creating a scope needs the edit right.';
const GIT_UNAVAILABLE = 'The Git server cannot be reached.';

/** @returns the state-changing requests recorded since the last clear */
async function writes(request) {
  return (await acts(request)).filter((act) => act.method !== 'GET');
}

/** @returns the requests of the mock to one path with one method, in the order they were sent */
async function sent(request, path, method = 'POST') {
  return (await acts(request)).filter((act) => act.path === path && act.method === method);
}

/** @returns the state the mock is in */
async function stateOf(page) {
  return (await (await page.request.get('/mock/state')).json()).state;
}

test.describe('the fixtures of this spec', () => {
  test('the ids of the creates, the models, the evidence and the targets are what the mock answers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/samm');
    const headers = await csrf(page);
    const created = async (path, data) => {
      const answer = await page.request.post(path, { headers, data });
      expect(answer.ok(), path).toBe(true);
      const { id, document, address } = await answer.json();
      return { id, document, address };
    };
    expect(await created(SCOPES_PATH, { title: 'x', subject: 'organisation' })).toEqual(
      CREATED.scope,
    );
    await useScenario(request, 'workshop');
    expect(await created(assessmentsPath('shop'), { title: 'x' })).toEqual(CREATED.shop);
    await useScenario(request, 'workshop');
    expect(await created(assessmentsPath('organisation'), { title: 'x' })).toEqual(
      CREATED.organisation,
    );
    await useScenario(request, 'workshop');
    const models = await (await page.request.get(MODELS_PATH)).json();
    expect(
      models.models.map(({ version, default: isDefault }) => ({ version, default: isDefault })),
    ).toEqual(MODELS);
    const evidence = (
      await (await page.request.get(`/api/v1/documents/samm-assessments/${OPEN.document}`)).json()
    ).evidence.sb;
    expect(evidence).toEqual(EVIDENCE);
    const scope = await (await page.request.get(`${SCOPES_PATH}/payments`)).json();
    for (const [practice, target] of Object.entries(PAYMENTS_TARGETS)) {
      expect(scope.targets[practice], practice).toEqual(target);
    }
    await useScenario(request, 'empty');
    expect(await created(SCOPES_PATH, { title: 'x', subject: 'organisation' })).toEqual(
      CREATED.scope,
    );
    expect(await created(assessmentsPath('mobile'), { title: 'x' })).toEqual(CREATED.mobile);
  });

  test('the steps of a target are the ones the page offers', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, '/samm/payments');
    const options = page.getByTestId('targets-sm-target').locator('option');
    await expect(options).toHaveCount(TARGET_STEPS.length + 1);
    expect(await options.evaluateAll((all) => all.map((option) => option.value))).toEqual([
      '',
      ...TARGET_STEPS,
    ]);
  });
});

test.describe('a new scope', () => {
  test('is offered on the overview and below the list, and nothing is stored before it is created', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, '/samm');
    await expect(page.getByTestId('new-scope')).toHaveText('New scope');
    await expect(page.getByTestId('new-scope-link')).toBeVisible();
    await page.getByTestId('new-scope').click();
    await expect(page).toHaveURL(NEW_SCOPE_ADDRESS);
    await expect(page.getByTestId('new-scope-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New scope');
    await expect(page.getByTestId('save-state')).toContainText('Nothing is stored yet.');
    await expect(page.getByTestId('new-scope-sheet')).toContainText(
      'Its title and who is assessed cannot be changed afterwards; its targets can.',
    );
    expect(await writes(request)).toEqual([]);
  });

  test('asks for the title and for who is assessed, then creates the scope with its targets and opens it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    const create = page.getByTestId('create-scope');
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Enter a title first.')).toBeVisible();
    await page.getByTestId('new-scope-title').fill('Mobile Apps');
    await expect(page.getByText('Choose who is assessed first.')).toBeVisible();
    await expect(page.getByTestId('save-state')).toContainText('Not stored yet.');
    // The default version is chosen already, and its practices make the targets.
    await expect(page.getByTestId('new-scope-model')).toHaveValue('v2.2.0');
    await fillNewScope(page);
    await expect(create).not.toHaveAttribute('aria-disabled', 'true');
    await create.click();
    await expect(page).toHaveURL(CREATED.scope.address);
    await expect(page.getByTestId('scope-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Mobile Apps');
    // The page reads what the mock now shows: the data file of the created scope.
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('2.5');
    await expect(page.getByTestId('targets-ta-due')).toHaveValue('2027-03-31');
    const created = await sent(request, SCOPES_PATH);
    expect(created).toHaveLength(1);
    expect(created[0].body).toEqual({
      title: 'Mobile Apps',
      subject: 'team:mobile',
      modelVersion: 'v2.2.0',
      targets: { sm: { target: 2 }, ta: { target: 2.5, due: '2027-03-31' }, sb: { target: 1.5 } },
    });
    expect(await stateOf(page)).toBe('scope-created');
    // The created scope is in the list, and nothing asked before the page was left.
    await expect(page.getByTestId('scope-mobile')).toBeVisible();
  });

  test('takes a target back with "No target", and offers a due day only for a practice that has a target', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await page.getByTestId('new-scope-title').fill('Mobile Apps');
    await choose(page, 'new-scope-subject', 'Mobile Apps');
    const target = 'new-scope-targets-editor-ta-target';
    await expect(page.getByTestId('new-scope-targets-editor-ta-due')).toHaveCount(0);
    await choose(page, target, '2.5');
    await page.getByTestId('new-scope-targets-editor-ta-due').fill('2027-03-31');
    await choose(page, 'new-scope-targets-editor-rt-target', '1');
    await choose(page, target, 'No target');
    await expect(page.getByTestId('new-scope-targets-editor-ta-due')).toHaveCount(0);
    await page.getByTestId('create-scope').click();
    await expect(page).toHaveURL(CREATED.scope.address);
    const [create] = await sent(request, SCOPES_PATH);
    // The target that was removed leaves no entry and no due day behind.
    expect(create.body.targets).toEqual({ rt: { target: 1 } });
  });

  test('for the whole organisation needs no picker and sends no targets; a service replaces the team', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await page.getByTestId('new-scope-title').fill('Whole');
    await choose(page, 'new-scope-subject', 'Mobile Apps');
    await page.getByTestId('new-scope-kind-service').check({ force: true });
    await expect(page.getByTestId('new-scope-subject')).toHaveValue('');
    await expect(page.getByText('Choose who is assessed first.')).toBeVisible();
    await page.getByTestId('new-scope-kind-organisation').check({ force: true });
    await expect(page.getByTestId('new-scope-subject')).toHaveCount(0);
    await page.getByTestId('create-scope').click();
    await expect(page).toHaveURL(CREATED.scope.address);
    const [create] = await sent(request, SCOPES_PATH);
    expect(create.body).toEqual({
      title: 'Whole',
      subject: 'organisation',
      modelVersion: 'v2.2.0',
    });
  });

  test('with a model version that has no file is created without targets', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await choose(page, 'new-scope-model', 'OWASP SAMM v2.1.0');
    await expect(page.getByTestId('new-scope-sheet')).toContainText(
      'The practices of this model version cannot be shown.',
    );
    await expect(page.getByTestId('new-scope-targets-editor')).toHaveCount(0);
    await page.getByTestId('new-scope-title').fill('Old model');
    await page.getByTestId('new-scope-kind-organisation').check({ force: true });
    await page.getByTestId('create-scope').click();
    await expect(page).toHaveURL(CREATED.scope.address);
    const [create] = await sent(request, SCOPES_PATH);
    expect(create.body).toEqual({
      title: 'Old model',
      subject: 'organisation',
      modelVersion: 'v2.1.0',
    });
  });

  test('asks before it is left with what was typed, and not when nothing was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goBack();
    await expect(page.getByTestId('new-scope-sheet')).toBeVisible();
    await page.getByTestId('new-scope-title').fill('Not stored yet');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(NEW_SCOPE_ADDRESS);
    await expect(page.getByTestId('new-scope-title')).toHaveValue('Not stored yet');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('shows a refusal at the fields it names and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#scope-invalid');
    await clearActs(request);
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await page.getByTestId('new-scope-title').fill('Bad');
    await choose(page, 'new-scope-subject', 'Payments');
    await choose(page, 'new-scope-targets-editor-ta-target', '2.5');
    await page.getByTestId('new-scope-targets-editor-ta-due').fill('2027-03-31');
    await choose(page, 'new-scope-targets-editor-rt-target', '1');
    await page.getByTestId('create-scope').click();
    await expect(page.getByTestId('save-state')).toContainText(
      'Some entries need a correction. Nothing was created.',
    );
    await expect(page.getByTestId('notice').first()).toContainText(
      'Some entries are not valid. Correct the marked fields.',
    );
    await expect(page.getByText('Fill in this field.')).toBeVisible();
    await expect(page.getByText('This reference leads nowhere.').first()).toBeVisible();
    await expect(page.getByTestId('new-scope-subject')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('new-scope-title')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('new-scope-targets-editor-ta-target')).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expect(page.getByTestId('new-scope-targets-editor-ta-due')).toHaveValue('2027-03-31');
    await expect(page.getByTestId('new-scope-title')).toHaveValue('Bad');
    await expect(page).toHaveURL(NEW_SCOPE_ADDRESS);
    await expectNoSeriousViolations(page, 'new scope refused');
  });

  test('says that the Git server cannot be reached and keeps the form', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'degraded');
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await page.getByTestId('new-scope-title').fill('Mobile Apps');
    await page.getByTestId('new-scope-kind-organisation').check({ force: true });
    await page.getByTestId('create-scope').click();
    await expect(page.getByTestId('new-scope-sheet')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('save-state')).toContainText(
      'Nothing was created. What you entered stays on this page.',
    );
    await expect(page.getByTestId('new-scope-title')).toHaveValue('Mobile Apps');
    await expect(page).toHaveURL(NEW_SCOPE_ADDRESS);
  });

  test('says why a reader cannot create one, in the overview and at the address', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToSamm(page, '/samm');
    await expect(page.getByTestId('new-scope')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('samm-overview')).toContainText(FORBIDDEN_NEW_SCOPE);
    await expect(page.getByTestId('new-scope-link')).toHaveCount(0);
    await page.goto(NEW_SCOPE_ADDRESS);
    await expect(page.getByTestId('new-scope-no-right')).toContainText(FORBIDDEN_NEW_SCOPE);
    await page
      .getByTestId('new-scope-no-right')
      .getByRole('link', { name: 'Back to the scopes' })
      .click();
    await expect(page).toHaveURL('/samm');
  });

  test('says when no model version is pinned', async ({ page, request }) => {
    await useScenario(request, 'workshop#models-none');
    await loginToSamm(page, '/samm');
    await expect(page.getByTestId('new-scope')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('samm-overview')).toContainText(
      'No model version is pinned, so no scope can be created.',
    );
    await page.goto(NEW_SCOPE_ADDRESS);
    await expect(page.getByTestId('new-scope-no-model')).toContainText(
      'No model version is pinned',
    );
  });

  test('is the way of a first user: the scope, then its first assessment, with the user as its first assessor', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await clearActs(request);
    await loginToSamm(page, '/samm');
    await expect(page.getByTestId('samm-overview')).toContainText('0 scopes');
    await page.getByTestId('new-scope').click();
    await page.getByTestId('new-scope-title').fill('Mobile Apps');
    await choose(page, 'new-scope-subject', 'Mobile Apps');
    await page.getByTestId('create-scope').click();
    await expect(page).toHaveURL(CREATED.scope.address);
    await expect(page.getByTestId('scope-sheet')).toBeVisible();
    await page.getByTestId('start-assessment').click();
    await expect(page).toHaveURL(newAssessmentAddress('mobile'));
    const session = await (await page.request.get('/api/v1/session')).json();
    await expect(page.getByTestId('assessor-self')).toContainText(session.user.name);
    await fillNewAssessment(page, 'Mobile Apps 2026 Q4');
    await page.getByTestId('create-assessment').click();
    await expect(page).toHaveURL(CREATED.mobile.address);
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    expect(await stateOf(page)).toBe('assessment-created');
    const [create] = await sent(request, assessmentsPath('mobile'));
    expect(create.body).toEqual({
      title: 'Mobile Apps 2026 Q4',
      date: '2026-11-26',
      modelVersion: 'v2.2.0',
      assessors: [],
    });
  });

  test('says in German what it asks and what it refuses', async ({ page, request }) => {
    await useScenario(request, 'workshop#scope-invalid');
    await loginToSamm(page, NEW_SCOPE_ADDRESS);
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neuer Bereich');
    await expect(page.getByTestId('create-scope')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Geben Sie zuerst einen Titel ein.')).toBeVisible();
    await expect(page.getByTestId('save-state')).toContainText('Noch nichts gespeichert.');
    await page.getByTestId('new-scope-title').fill('Schlecht');
    await choose(page, 'new-scope-subject', 'Payments');
    await page.getByTestId('create-scope').click();
    await expect(page.getByTestId('save-state')).toContainText(
      'Einige Angaben müssen korrigiert werden. Es wurde nichts angelegt.',
    );
    await expect(page.getByTestId('new-scope-title')).toHaveValue('Schlecht');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Seite verlassen?');
  });
});

const SCOPE = '/samm/payments';

test.describe('the targets of a scope', () => {
  test('are changed on the page, kept there without a draft and saved for everyone as the part targets', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('2.5');
    await expect(page.getByTestId('targets-ta-due')).toHaveValue('2027-03-31');
    await expect(page.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('save-state')).toContainText('Everything is saved for everyone.');
    await clearActs(request);
    await choose(page, 'targets-ta-target', '3');
    await choose(page, 'targets-rt-target', '2');
    await page.getByTestId('targets-rt-due').fill('2027-09-30');
    await choose(page, 'targets-om-target', 'No target');
    await expect(page.getByTestId('save-state')).toContainText(
      'Changed. Not saved for everyone yet.',
    );
    // A scope has no draft: what is typed stays on the page.
    await page.waitForTimeout(1500);
    expect((await writes(request)).filter((act) => act.path.includes('/drafts/'))).toEqual([]);
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const saved = await sent(request, savePath('payments'));
    expect(saved).toHaveLength(1);
    expect(saved[0].body).toEqual({
      parts: {
        targets: {
          blob: '6c5fc54',
          fields: {
            '/ta': { target: 3, due: '2027-03-31' },
            '/rt': { target: 2, due: '2027-09-30' },
            '/om': null,
          },
        },
      },
    });
    expect(await stateOf(page)).toBe('targets-saved');
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('3');
    await expect(page.getByTestId('targets-om-target')).toHaveValue('');
    await expect(page.getByTestId('targets-om-due')).toHaveCount(0);
  });

  test('keep the due day with the target only: no target, no day, and a day typed and emptied is none', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-ta-target', 'No target');
    await expect(page.getByTestId('targets-ta-due')).toHaveCount(0);
    await choose(page, 'targets-ta-target', '1');
    await expect(page.getByTestId('targets-ta-due')).toHaveValue('');
    await page.getByTestId('targets-ta-due').fill('2027-05-01');
    await page.getByTestId('targets-ta-due').fill('');
    await expect(page.getByTestId('targets-ta-due')).toHaveValue('');
    await clearActs(request);
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const [save] = await sent(request, savePath('payments'));
    expect(save.body.parts.targets.fields).toEqual({ '/ta': { target: 1 } });
  });

  test('take a change back and have nothing to save again', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-sm-target', '3');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await choose(page, 'targets-sm-target', '2');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
  });

  test('show what the server refused at the practice and the field it names', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#targets-invalid');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-ta-target', '3');
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('save-state')).toContainText(
      'Some targets need a correction. Nothing was saved.',
    );
    await expect(page.getByTestId('targets-ta-target')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('targets-rt-due')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByText('Choose one of the offered values.')).toBeVisible();
    await expect(page.getByText('This does not have the expected form.')).toBeVisible();
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('3');
    await expectNoSeriousViolations(page, 'targets refused');
  });

  test('decide a conflict per practice with both entries, then save again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#targets-conflict');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-ta-target', '3');
    await page.getByTestId('save-targets').click();
    const conflict = page.getByTestId('conflict-target-ta');
    await expect(conflict).toContainText(
      'Jordan Weber saved the target of Threat Assessment: 2. Yours is 3, due by',
    );
    await expect(page.getByText('Someone else changed a target you changed')).toBeVisible();
    await expect(page.getByTestId('save-state')).toContainText(
      'One target was changed by someone else. Decide, then save again.',
    );
    await expect(page.getByTestId('save-targets')).toHaveAttribute('aria-disabled', 'true');
    await expectNoSeriousViolations(page, 'targets conflict');
    await conflict.getByRole('button', { name: 'Take the target of Jordan Weber' }).click();
    await expect(conflict).toHaveCount(0);
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('2');
    await clearActs(request);
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    expect(await stateOf(page)).toBe('targets-saved');
    expect(await sent(request, savePath('payments'))).toHaveLength(1);
  });

  test('keep their own value when the person keeps it in a conflict', async ({ page, request }) => {
    await useScenario(request, 'workshop#targets-conflict');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-ta-target', '3');
    await page.getByTestId('save-targets').click();
    await page.getByTestId('conflict-target-ta').getByRole('button', { name: 'Keep mine' }).click();
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('3');
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
  });

  test('say that the Git server cannot be reached and keep the changes', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'degraded');
    await loginToSamm(page, SCOPE);
    await choose(page, 'targets-sm-target', '3');
    await page.getByTestId('save-targets').click();
    await expect(page.getByTestId('targets-failure')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('save-state')).toContainText(
      'Not saved for everyone. Your changes stay on this page.',
    );
    await expect(page.getByTestId('targets-sm-target')).toHaveValue('3');
  });

  test('ask before the page is left with unsaved targets', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goBack();
    await expect(page.getByTestId('targets-sm-target')).toBeVisible();
    await choose(page, 'targets-sm-target', '3');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-stay').click();
    await expect(page.getByTestId('targets-sm-target')).toHaveValue('3');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('read what the person saved themselves, and what another assessor saved is told', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await expect(page.locator('.app-shell')).toHaveAttribute('data-stream', 'connected');
    await expect(page.getByTestId('targets-sm-target')).toHaveValue('2');
    // The state shows the roadmap saved by Alex, the person: the page reads it and says nothing about it.
    await gotoState(request, 'targets-saved');
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('3');
    await expect(page.getByTestId('targets-om-target')).toHaveValue('');
    await expect(page.getByText('saved the targets.')).toHaveCount(0);
    // The mock has no state for a save by someone else: the read of the scope is changed to show one.
    await patchRead(page, '**/api/v1/samm/scopes/payments', (scope) => ({
      ...scope,
      targets: { ...scope.targets, sm: { target: 3 } },
      parts: {
        ...scope.parts,
        targets: {
          ...scope.parts.targets,
          blob: 'ffffff0',
          savedBy: { pseudonym: JORDAN.pseudonym, name: JORDAN.name },
        },
      },
    }));
    await broadcast(request, 'document-saved', {
      repository: 'samm-assessments',
      id: 'payments',
      part: 'targets',
      fields: ['/sm'],
      by: { pseudonym: JORDAN.pseudonym, name: JORDAN.name },
    });
    await expect(page.getByTestId('targets-sm-target')).toHaveValue('3');
    await expect(page.getByRole('status').filter({ hasText: 'saved the targets.' })).toHaveText(
      'Jordan Weber saved the targets. Targets you did not change are up to date.',
    );
  });

  test('are read as text by a person with the right read only', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('scope-sheet')).toContainText(
      'You can read the targets. Changing them needs the edit right.',
    );
    await expect(page.getByTestId('targets')).toBeVisible();
    await expect(page.getByTestId('targets-ta-target')).toHaveCount(0);
    await expect(page.getByTestId('save-targets')).toHaveCount(0);
    await expect(page.getByTestId('targets').locator('[data-practice="ta"]')).toContainText('2.5');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
  });

  test('fit beside the list column on a tablet: nothing scrolls sideways and the trend keeps its labels inside', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await page.setViewportSize({ width: 1024, height: 800 });
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('targets-sm-target')).toBeVisible();
    await expect(page.getByRole('img', { name: /Overall score of the released/ })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // The assessments of the scope: the score of a row ends inside the sheet.
    const sheet = await page.getByTestId('scope-sheet').boundingBox();
    for (const score of await page.locator('.entry__score').all()) {
      const box = await score.boundingBox();
      if (box) expect(box.x + box.width).toBeLessThanOrEqual(sheet.x + sheet.width);
    }
    // The first and the last axis label stay inside the figure.
    const chart = await page.locator('.trend__chart').boundingBox();
    for (const label of await page.locator('.trend__axis').all()) {
      const box = await label.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(chart.x - 1);
      expect(box.x + box.width).toBeLessThanOrEqual(chart.x + chart.width + 1);
    }
  });

  test('read in German with the comma and the labels of the language', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('save-targets')).toHaveText('Für alle speichern');
    await expect(page.getByTestId('targets-ta-target')).toHaveValue('2.5');
    await expect(page.getByTestId('targets-ta-target').locator('option:checked')).toHaveText('2,5');
    await expect(page.getByTestId('targets-sm-target').locator('option').first()).toHaveText(
      'Kein Ziel',
    );
    await choose(page, 'targets-sm-target', '3');
    await expect(page.getByTestId('save-state')).toContainText(
      'Geändert. Noch nicht für alle gespeichert.',
    );
  });
});

/** @returns today as the date field takes it, in the zone the suite pins for the browser */
function today() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
}

test.describe('a new assessment', () => {
  test('starts from the scope sheet, prefills the date and the model version and names the person as first assessor', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, '/samm/shop');
    const start = page.getByTestId('start-assessment');
    await expect(start).toHaveAttribute('href', newAssessmentAddress('shop'));
    await start.click();
    await expect(page).toHaveURL(newAssessmentAddress('shop'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New assessment');
    await expect(page.getByTestId('new-assessment-sheet')).toContainText(
      'An assessment of Web shop',
    );
    // The model version is that of the newest assessment of the scope, and every pinned version is offered.
    await expect(page.getByTestId('new-assessment-model')).toHaveValue('v2.2.0');
    expect(
      await page
        .getByTestId('new-assessment-model')
        .locator('option')
        .evaluateAll((all) => all.map((option) => option.value)),
    ).toEqual(['', ...MODELS.map((pin) => pin.version)]);
    await expect(page.getByTestId('new-assessment-date')).toHaveValue(today());
    const session = await (await page.request.get('/api/v1/session')).json();
    await expect(page.getByTestId('assessor-self')).toContainText(session.user.name);
    await expect(page.getByTestId('assessor-self')).toContainText('You, the first assessor');
    await expect(page.getByTestId('create-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Enter a title first.')).toBeVisible();
    await expect(page.getByTestId('save-state')).toContainText('Nothing is stored yet.');
    expect(await writes(request)).toEqual([]);
  });

  test('is created with the further assessors and opens at the address the server names', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, newAssessmentAddress('shop'));
    await fillNewAssessment(page, 'Web shop 2026 Q4');
    await page.getByTestId('assessor-add').click();
    await page.getByTestId('assessor-0-person').selectOption(JORDAN.pseudonym);
    await expect(page.getByTestId('save-state')).toContainText('Not stored yet.');
    await page.getByTestId('create-assessment').click();
    await expect(page).toHaveURL(CREATED.shop.address);
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Web shop 2026 Q4');
    expect(await stateOf(page)).toBe('shop-assessment-created');
    const [create] = await sent(request, assessmentsPath('shop'));
    expect(create.body).toEqual({
      title: 'Web shop 2026 Q4',
      date: '2026-11-26',
      modelVersion: 'v2.2.0',
      assessors: [JORDAN.pseudonym],
    });
    // The scope now shows the draft as open: another assessment cannot be started.
    await page.goto('/samm/shop');
    await expect(page.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
  });

  test('adds and removes assessors, sends none for a row left empty and limits them to thirty', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, newAssessmentAddress('organisation'));
    await fillNewAssessment(page, 'Organisation 2026 H2');
    await page.getByTestId('assessor-add').click();
    await page.getByTestId('assessor-add').click();
    await expect(page.getByTestId('assessor-1')).toBeVisible();
    await page.getByTestId('assessor-1-remove').click();
    await expect(page.getByTestId('assessor-1')).toHaveCount(0);
    await page.getByTestId('create-assessment').click();
    await expect(page).toHaveURL(CREATED.organisation.address);
    const [create] = await sent(request, assessmentsPath('organisation'));
    expect(create.body.assessors).toEqual([]);
    await useScenario(request, 'workshop');
    await page.goto(newAssessmentAddress('organisation'));
    await expect(page.getByTestId('new-assessment-sheet')).toBeVisible();
    for (let row = 0; row < 30; row += 1) await page.getByTestId('assessor-add').click();
    await expect(page.getByTestId('assessor-add')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('At most 30 further assessors.')).toBeVisible();
  });

  test('is refused while one is open, with a notice that links to the open assessment', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('scope-sheet')).toContainText(
      'Payments 2026 Q4 is still open. Release it before you start another.',
    );
    await page.goto(newAssessmentAddress('payments'));
    const notice = page.getByTestId('open-notice');
    await expect(notice).toContainText('Payments 2026 Q4 is still open');
    await page.getByTestId('new-assessment-title').fill('Payments 2026 Q4 again');
    await expect(page.getByTestId('create-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('An assessment of this scope is open already.')).toBeVisible();
    await expectNoSeriousViolations(page, 'new assessment while one is open');
    // What was typed is lost with the page: the question comes first.
    await notice.getByRole('link', { name: 'Open the assessment' }).click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL(assessmentAddress('payments', '2026-q4'));
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    expect(await sent(request, assessmentsPath('payments'))).toEqual([]);
  });

  test('names the open assessment the server answers with, when it was started meanwhile', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    // The page reads the scope before another person opens an assessment: it shows none open, the server knows one.
    await patchRead(page, '**/api/v1/samm/scopes/payments', (scope) => ({
      ...scope,
      assessments: [],
    }));
    await loginToSamm(page, newAssessmentAddress('payments'));
    await expect(page.getByTestId('open-notice')).toHaveCount(0);
    await fillNewAssessment(page, 'Payments 2026 Q4 again');
    await page.getByTestId('create-assessment').click();
    const notice = page.getByTestId('open-notice');
    await expect(notice).toBeVisible();
    await expect(notice.getByRole('link', { name: 'Open the assessment' })).toHaveAttribute(
      'href',
      assessmentAddress('payments', '2026-q4'),
    );
    expect(await sent(request, assessmentsPath('payments'))).toHaveLength(1);
    await expect(page).toHaveURL(newAssessmentAddress('payments'));
    await expect(page.getByTestId('create-assessment')).toHaveAttribute('aria-disabled', 'true');
  });

  test('shows a refusal at the fields and at the assessor it names, and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#assessment-invalid');
    await loginToSamm(page, newAssessmentAddress('shop'));
    await fillNewAssessment(page, 'Web shop 2026 Q4');
    await page.getByTestId('assessor-add').click();
    await page.getByTestId('assessor-add').click();
    await page.getByTestId('assessor-0-person').selectOption(JORDAN.pseudonym);
    await page.getByTestId('assessor-1-person').selectOption('p-61c0d4');
    await page.getByTestId('create-assessment').click();
    await expect(page.getByTestId('save-state')).toContainText(
      'Some entries need a correction. Nothing was created.',
    );
    await expect(page.getByTestId('new-assessment-date')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('new-assessment-model')).toHaveAttribute('aria-invalid', 'true');
    // The server names the second further assessor by position; the page shows it at that person.
    await expect(page.getByTestId('assessor-1-person')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('assessor-0-person')).not.toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('assessor-1')).toContainText(
      'This person is not in the directory.',
    );
    await expect(page.getByTestId('new-assessment-title')).toHaveValue('Web shop 2026 Q4');
    await expect(page).toHaveURL(newAssessmentAddress('shop'));
    await expectNoSeriousViolations(page, 'new assessment refused');
  });

  test('says that the Git server cannot be reached and keeps the form', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'degraded');
    await loginToSamm(page, newAssessmentAddress('shop'));
    await fillNewAssessment(page, 'Web shop 2026 Q4');
    await page.getByTestId('create-assessment').click();
    await expect(page.getByTestId('new-assessment-sheet')).toContainText(GIT_UNAVAILABLE);
    await expect(page.getByTestId('new-assessment-title')).toHaveValue('Web shop 2026 Q4');
    await expect(page).toHaveURL(newAssessmentAddress('shop'));
  });

  test('asks before it is left with what was typed', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, newAssessmentAddress('shop'));
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goBack();
    await page.getByTestId('new-assessment-title').fill('Not stored yet');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-stay').click();
    await expect(page.getByTestId('new-assessment-title')).toHaveValue('Not stored yet');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('is not offered to a reader, and says why', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToSamm(page, '/samm/shop');
    await expect(page.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('scope-sheet')).toContainText(
      'Starting an assessment needs the edit right.',
    );
    await page.goto(newAssessmentAddress('shop'));
    await expect(page.getByTestId('new-assessment-no-right')).toContainText(
      'Starting an assessment needs the edit right.',
    );
  });

  test('says when no model version is pinned', async ({ page, request }) => {
    await useScenario(request, 'workshop#models-none');
    await loginToSamm(page, '/samm/shop');
    await expect(page.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('scope-sheet')).toContainText(
      'No model version is pinned, so no assessment can be started.',
    );
    await page.goto(newAssessmentAddress('shop'));
    await expect(page.getByTestId('new-assessment-no-model')).toContainText(
      'No model version is pinned',
    );
  });

  test('says in German what it asks and who the first assessor is', async ({ page, request }) => {
    await useScenario(request, 'workshop#shop-assessment-created');
    await loginToSamm(page, '/samm/shop');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('start-assessment')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('scope-sheet')).toContainText(
      'noch offen. Geben Sie es frei, bevor Sie ein weiteres beginnen.',
    );
    await useScenario(request, 'workshop');
    await page.goto(newAssessmentAddress('shop'));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neues Assessment');
    await expect(page.getByTestId('assessor-self')).toContainText('Sie, als Erste beteiligt');
    await expect(page.getByTestId('create-assessment')).toHaveText('Assessment beginnen');
    await expect(page.getByText('Geben Sie zuerst einen Titel ein.')).toBeVisible();
    await page.getByTestId('assessor-add').click();
    await expect(page.getByTestId('assessor-0')).toContainText('Beteiligte Person 2');
    await page.getByTestId('new-assessment-title').fill('Web-Shop 2026 Q4');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Seite verlassen?');
  });
});

const SB = assessmentAddress(OPEN.scope, OPEN.assessment, 'sb');
const SB_FILE = '/api/v1/documents/samm-assessments/payments-2026-q4';

test.describe('the evidence links and the comment of a practice', () => {
  test('are listed with the address as a link only when it is https, and each says what it belongs to', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    const table = page.getByTestId('evidence-editor-table');
    await expect(table.locator('tbody tr')).toHaveCount(2);
    const link = table.getByRole('link', { name: EVIDENCE[0].url });
    await expect(link).toHaveAttribute('href', EVIDENCE[0].url);
    await expect(link).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(table.getByText(EVIDENCE[1].title)).toBeVisible();
    await expect(table.getByText('The practice as a whole')).toBeVisible();
    await expect(page.getByTestId('evidence')).toContainText(
      'Links to where the answers can be checked, each with a title. Only secure web addresses, no files.',
    );
    await expectNoSeriousViolations(page, 'practice with evidence');
  });

  test('show an address that is no https address as text, never as a link', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await patchRead(page, `**${SB_FILE}`, (assessment) => ({
      ...assessment,
      evidence: {
        sb: [
          { question: null, title: 'Hostile', url: 'javascript:alert(1)' },
          { question: null, title: 'Plain', url: 'http://wiki.example/plain' },
        ],
      },
    }));
    await loginToSamm(page, SB);
    const table = page.getByTestId('evidence-editor-table');
    await expect(table.getByText('javascript:alert(1)')).toBeVisible();
    await expect(table.getByText('http://wiki.example/plain')).toBeVisible();
    await expect(table.getByRole('link')).toHaveCount(0);
  });

  test('are added in the editor, which takes only https, and saved with the whole list', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    await clearActs(request);
    await page.getByRole('button', { name: 'Add row' }).click();
    const editor = page.getByRole('dialog');
    await expect(editor).toContainText('Add an evidence link');
    // Nothing invalid is kept: the editor says what is wrong and applies nothing.
    await page.getByTestId('evidence-editor-apply').click();
    await expect(editor.getByText('Fill in this field.')).toHaveCount(2);
    await page.getByTestId('evidence-editor-field-title').fill('Policy');
    await page.getByTestId('evidence-editor-field-url').fill('http://wiki.example/policy');
    await expect(editor.getByText('Use an address that starts with https://.')).toBeVisible();
    await expect(editor).toContainText('Starts with https://, at most');
    await page.getByTestId('evidence-editor-apply').click();
    await expect(editor).toBeVisible();
    await page.getByTestId('evidence-editor-field-url').fill('https://wiki.example/policy');
    await page.getByTestId('evidence-editor-field-question').selectOption('sb-b-2');
    await page.getByTestId('evidence-editor-apply').click();
    await expect(editor).toHaveCount(0);
    await expect(page.getByTestId('evidence-editor-table').locator('tbody tr')).toHaveCount(3);
    await expect(page.getByTestId('save-state')).toContainText('Changed. Keeping it for you');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const [save] = await sent(request, savePath(OPEN.document));
    expect(save.body.parts.sb.fields.evidence).toEqual([
      ...EVIDENCE,
      { question: 'sb-b-2', title: 'Policy', url: 'https://wiki.example/policy' },
    ]);
  });

  test('are edited, moved and removed, and a removal asks first', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    await clearActs(request);
    await page.getByRole('button', { name: 'Edit row 2' }).click();
    await page.getByTestId('evidence-editor-field-title').fill('Dependency policy, renamed');
    await page.getByTestId('evidence-editor-apply').click();
    await page.getByRole('button', { name: 'Move up, row 2' }).click();
    await expect(
      page.getByTestId('evidence-editor-table').locator('tbody tr').first(),
    ).toContainText('Dependency policy, renamed');
    // Cancelling the question removes nothing.
    await page.getByRole('button', { name: 'Remove row 2' }).click();
    await expect(page.getByRole('dialog')).toContainText('Remove this link?');
    await expect(page.getByRole('dialog')).toContainText(
      `The link "${EVIDENCE[0].title}" leaves the evidence of this practice.`,
    );
    await page.getByTestId('evidence-editor-remove-cancel').click();
    await expect(page.getByTestId('evidence-editor-table').locator('tbody tr')).toHaveCount(2);
    await page.getByRole('button', { name: 'Remove row 2' }).click();
    await page.getByTestId('evidence-editor-remove-confirm').click();
    await expect(page.getByTestId('evidence-editor-table').locator('tbody tr')).toHaveCount(1);
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const [save] = await sent(request, savePath(OPEN.document));
    expect(save.body.parts.sb.fields.evidence).toEqual([
      { question: null, title: 'Dependency policy, renamed', url: EVIDENCE[1].url },
    ]);
  });

  test('keep a change of the editor off the list until it is applied', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    await page.getByRole('button', { name: 'Edit row 1' }).click();
    await page.getByTestId('evidence-editor-field-title').fill('Never applied');
    await page.getByTestId('evidence-editor-cancel').click();
    await expect(page.getByTestId('evidence-editor-table')).toContainText(EVIDENCE[0].title);
    await expect(page.getByTestId('evidence-editor-table')).not.toContainText('Never applied');
    await expect(page.getByTestId('save-state')).not.toContainText('Changed.');
  });

  test('are at most fifty per practice, and the limit is explained where the act would be', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await patchRead(page, `**${SB_FILE}`, (assessment) => ({
      ...assessment,
      evidence: {
        sb: Array.from({ length: 50 }, (_, index) => ({
          question: null,
          title: `Link ${index + 1}`,
          url: `https://wiki.example/${index + 1}`,
        })),
      },
    }));
    await loginToSamm(page, SB);
    await expect(page.getByTestId('evidence-editor-table').locator('tbody tr')).toHaveCount(50);
    await expect(page.getByRole('button', { name: 'Add row' })).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByTestId('evidence')).toContainText('At most 50 links per practice.');
  });

  test('show a refusal of the server at the link and the member it names', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#evidence-invalid');
    await loginToSamm(page, SB);
    await page.getByTestId('comment-sb-b-1').fill('x');
    await page.getByTestId('save-everyone').click();
    const errors = page.getByTestId('evidence-editor-errors');
    await expect(errors).toContainText('Link 2: Use an address that starts with https://.');
    await expect(errors).toContainText('Link 1: Fill in this field.');
    await expect(page.getByTestId('save-state')).toContainText('Some entries need a correction.');
    await expect(page.getByTestId('comment-sb-b-1')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('row-error-0')).toBeVisible();
    await expect(page.getByTestId('row-error-1')).toBeVisible();
    await expectNoSeriousViolations(page, 'practice evidence refused');
    // The editor shows the verdict of the server for the link it opens.
    await page.getByRole('button', { name: 'Edit row 2' }).click();
    await expect(
      page.getByRole('dialog').getByText('Use an address that starts with https://.'),
    ).toBeVisible();
  });

  test('keep the comment as AsciiDoc and preview how it reads', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    const field = page.getByTestId('comment-sb-b-1');
    await expect(field).toHaveValue(/Dependency scanning runs in \*every\* pipeline\./);
    const preview = page.getByTestId('comment-sb-b-1-preview');
    await expect(preview).toHaveAttribute('data-outcome', 'shown');
    await expect(preview.locator('strong')).toHaveText('every');
    await expect(preview.locator('ul li').first()).toBeVisible();
    await expect(
      page
        .getByText('You can format the comment; the preview shows how it reads.')
        .locator('visible=true')
        .first(),
    ).toBeVisible();
    await clearActs(request);
    await field.fill('Reviewed with *the whole team*.');
    await expect(preview.locator('strong')).toHaveText('the whole team');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toContainText('Saved for everyone at');
    const [save] = await sent(request, savePath(OPEN.document));
    expect(save.body.parts.sb.fields['sb-b-1/comment']).toBe('Reviewed with *the whole team*.');
  });

  test('read in German with the labels of the language', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SB);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('evidence')).toContainText('Nachweise');
    await expect(page.getByTestId('evidence')).toContainText(
      'Links dorthin, wo sich die Antworten prüfen lassen',
    );
    await expect(page.getByTestId('evidence-editor-table')).toContainText('Die Praxis als Ganzes');
    await page.getByRole('button', { name: 'Zeile hinzufügen' }).click();
    await page.getByTestId('evidence-editor-field-title').fill('Richtlinie');
    await page.getByTestId('evidence-editor-field-url').fill('http://wiki.example/richtlinie');
    await page.getByTestId('evidence-editor-apply').click();
    await expect(
      page.getByRole('dialog').getByText('Verwenden Sie eine Adresse, die mit https:// beginnt.'),
    ).toBeVisible();
    await page.getByTestId('evidence-editor-cancel').click();
    await page.getByRole('button', { name: 'Entfernen, Zeile 1' }).click();
    await expect(page.getByRole('dialog')).toContainText('Diesen Link entfernen?');
    await expect(page.getByRole('dialog')).toContainText(
      'Der Link „Pipeline of the payment service“',
    );
  });
});

/** The four writes a released assessment refuses, with the request each is. */
const FROZEN_WRITES = [
  ['draft', 'PUT', draftPath(RELEASED.document), { parts: { sm: { fields: {} } } }],
  ['save', 'POST', savePath(RELEASED.document), { parts: { sm: { blob: 'x', fields: {} } } }],
  ['submit', 'POST', submitPath(RELEASED.document), {}],
  ['release', 'POST', releasePath(RELEASED.document), {}],
];

test.describe('a frozen assessment', () => {
  for (const [name, method, path, data] of FROZEN_WRITES) {
    test(`answers DOCUMENT_RELEASED with its tag to the ${name}`, async ({ page, request }) => {
      await useScenario(request, 'workshop');
      await login(page, '/samm');
      const answer = await page.request.fetch(path, {
        method,
        data,
        headers: await csrf(page),
      });
      expect(answer.status()).toBe(409);
      expect(await answer.json()).toEqual({ outcome: 'DOCUMENT_RELEASED', tag: RELEASED.tag });
    });
  }

  test('offers "Start a new assessment" in the head of the assessment and in the frozen practice sheet', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, assessmentAddress(RELEASED.scope, RELEASED.assessment));
    const start = page.getByTestId('start-new-assessment');
    await expect(start).toHaveText('Start a new assessment');
    await expect(start).toHaveAttribute('href', newAssessmentAddress(RELEASED.scope));
    await expect(page.getByTestId('assessment-submit')).toHaveCount(0);
    await page.goto(assessmentAddress(RELEASED.scope, RELEASED.assessment, 'sb'));
    await expect(page.getByTestId('practice-sheet')).toBeVisible();
    await expect(page.getByTestId('save-state')).toContainText(
      'Released assessments are frozen. Nothing here can change.',
    );
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);
    // The evidence of the frozen practice is read, without an act.
    await expect(page.getByTestId('evidence-editor-table')).toContainText('Pipeline');
    await expect(page.getByRole('button', { name: /^Edit row/ })).toHaveCount(0);
    await expectNoSeriousViolations(page, 'frozen practice');
    await page.getByTestId('start-new-assessment').click();
    await expect(page).toHaveURL(newAssessmentAddress(RELEASED.scope));
    await expect(page.getByTestId('new-assessment-sheet')).toBeVisible();
    // Payments has an assessment that is still open, which the form says, so this one needs it released first.
    await expect(page.getByTestId('open-notice')).toBeVisible();
  });

  test('reads the comment as formatted text, with no field to type in', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#assessment-released-meanwhile');
    await loginToSamm(page, SB);
    const comment = page.getByTestId('comment-sb-b-1');
    await expect(comment.locator('strong')).toHaveText('every');
    await expect(page.getByTestId('comment-sb-b-1-preview')).toHaveCount(0);
    await expect(page.locator('textarea')).toHaveCount(0);
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
  });

  test('offers the way on only to a person with the right edit', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToSamm(page, assessmentAddress(RELEASED.scope, RELEASED.assessment));
    await expect(page.getByTestId('assessment-sheet')).toBeVisible();
    await expect(page.getByTestId('start-new-assessment')).toHaveCount(0);
    await page.goto(assessmentAddress(RELEASED.scope, RELEASED.assessment, 'sb'));
    await expect(page.getByTestId('practice-sheet')).toBeVisible();
    await expect(page.getByTestId('start-new-assessment')).toHaveCount(0);
    await expect(page.getByTestId('evidence-editor-table')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Edit row/ })).toHaveCount(0);
  });

  test('is what an open sheet learns when another person releases it: the frozen sheet and the way on', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, assessmentAddress(OPEN.scope, OPEN.assessment, 'sm'));
    await page.getByTestId('answer-sm-a-1-3').check({ force: true });
    await expect(page.getByTestId('save-state')).toContainText('Changed.');
    await expect(page.getByTestId('start-new-assessment')).toHaveCount(0);
    // Another person releases the assessment while this one works on it: the event of the transition is all the page
    // hears of it, and it reads the assessment, the scope and the list again.
    await gotoState(request, 'assessment-released-meanwhile');
    // The page is released and frozen, and offers the new assessment instead of the save.
    await expect(page.getByTestId('start-new-assessment')).toHaveAttribute(
      'href',
      newAssessmentAddress(OPEN.scope),
    );
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await page.getByTestId('start-new-assessment').click();
    // The scope has no open assessment any more: nothing stands in the way.
    await expect(page.getByTestId('new-assessment-sheet')).toBeVisible();
    await expect(page.getByTestId('open-notice')).toHaveCount(0);
    await expect(page.getByTestId('new-assessment-model')).toHaveValue('v2.2.0');
  });

  test('is told in German the same way', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, assessmentAddress(OPEN.scope, OPEN.assessment, 'sm'));
    await useLanguage(page, 'de');
    await page.getByTestId('answer-sm-a-1-3').check({ force: true });
    await gotoState(request, 'assessment-released-meanwhile');
    await expect(page.getByTestId('start-new-assessment')).toHaveText('Neues Assessment beginnen');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
  });
});

test.describe('the comparison of two model versions', () => {
  test('is refused by the server with MODEL_VERSIONS_DIFFER', async ({ page, request }) => {
    await useScenario(request, 'workshop#model-versions-differ');
    await login(page, '/samm');
    const answer = await page.request.get(comparePath('payments'));
    expect(answer.status()).toBe(422);
    expect((await answer.json()).outcome).toBe('MODEL_VERSIONS_DIFFER');
  });

  test('is named on the assessment, with both assessments and both versions, and its scores stay readable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#model-versions-differ');
    await loginToSamm(page, assessmentAddress(RELEASED.scope, RELEASED.assessment));
    const notice = page.getByTestId('versions-differ');
    await expect(notice).toContainText('These assessments are not compared');
    await expect(notice).toContainText(
      'Payments 2025 Q4 was taken with model version v2.1.0, Payments 2026 Q2 with v2.2.0.',
    );
    await expect(page.getByTestId('maturity-seal')).toBeVisible();
    await expect(page.getByTestId('since-list')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'model versions differ');
  });

  test('names nothing when the versions are the same, and shows the changes instead', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, assessmentAddress(RELEASED.scope, RELEASED.assessment));
    await expect(page.getByTestId('since-list')).toBeVisible();
    await expect(page.getByTestId('versions-differ')).toHaveCount(0);
  });

  test('is named in German', async ({ page, request }) => {
    await useScenario(request, 'workshop#model-versions-differ');
    await loginToSamm(page, assessmentAddress(RELEASED.scope, RELEASED.assessment));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('versions-differ')).toContainText(
      'Diese Assessments werden nicht verglichen',
    );
    await expect(page.getByTestId('versions-differ')).toContainText(
      'wurde mit der Modellversion v2.1.0 erhoben',
    );
  });
});

test.describe('the trend of a scope', () => {
  test('is drawn from the released assessments, oldest first, with the same values as a table', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, SCOPE);
    const chart = page.getByRole('img', {
      name: 'Overall score of the released assessments of Payments',
    });
    await expect(chart).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overall score over time' })).toBeVisible();
    await expect(chart.locator('.trend__marker')).toHaveCount(2);
    const points = await (await page.request.get(trendPath('payments'))).json();
    expect(points.omitted).toBe(0);
    expect(points.points.map((point) => point.title)).toEqual([
      'Payments 2025 Q4',
      'Payments 2026 Q2',
    ]);
    await expect(chart.locator('.trend__axis')).toHaveText([
      'Payments 2025 Q4',
      'Payments 2026 Q2',
    ]);
    await expect(page.getByTestId('trend-omitted')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'scope trend');
  });

  test('has a third point once the open assessment is released', async ({ page, request }) => {
    await useScenario(request, 'release#released');
    await loginToSamm(page, SCOPE);
    await expect(
      page.getByRole('img', { name: /Overall score of the released/ }).locator('.trend__marker'),
    ).toHaveCount(3);
  });

  test('says how many released assessments of another model version it leaves out', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await patchRead(page, `**${trendPath('payments')}`, (trend) => ({ ...trend, omitted: 2 }));
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('trend-omitted')).toHaveText(
      '2 released assessments taken with another model version are not shown; the trend shows v2.2.0 only.',
    );
    await useLanguage(page, 'de');
    await expect(page.getByTestId('trend-omitted')).toHaveText(
      '2 freigegebene Assessments, erhoben mit einer anderen Modellversion, werden nicht gezeigt; der Verlauf zeigt nur v2.2.0.',
    );
  });

  test('says "One released assessment" for a single one that is left out', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await patchRead(page, `**${trendPath('payments')}`, (trend) => ({ ...trend, omitted: 1 }));
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('trend-omitted')).toHaveText(
      'One released assessment taken with another model version is not shown; the trend shows v2.2.0 only.',
    );
  });

  test('is not drawn for a scope with one released assessment, and is empty for a created one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSamm(page, '/samm/shop');
    await expect(page.getByTestId('scope-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overall score over time' })).toHaveCount(0);
    const trend = await (await page.request.get(trendPath('shop'))).json();
    expect(trend.points).toHaveLength(1);
    await useScenario(request, 'workshop#scope-created');
    const created = await (await page.request.get(trendPath('mobile'))).json();
    expect(created.points).toEqual([]);
    await loginToSamm(page, '/samm/mobile');
    await expect(page.getByTestId('assessments-none')).toHaveText(
      'No assessment has been started for this scope yet.',
    );
  });

  test('is read by a person who may only read, and in the degraded installation', async ({
    page,
    request,
  }) => {
    for (const scenario of ['read-only', 'degraded']) {
      await useScenario(request, scenario);
      await loginToSamm(page, SCOPE);
      await expect(page.getByRole('img', { name: /Overall score of the released/ })).toBeVisible();
    }
  });

  test('is left out of the sheet when it cannot be read, and the rest stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await page.route(`**${trendPath('payments')}`, (route) =>
      route.fulfill({ status: 503, json: { outcome: 'GIT_UNAVAILABLE' } }),
    );
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('targets-sm-target')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overall score over time' })).toHaveCount(0);
  });
});

test.describe('the profile read-only and the degraded installation', () => {
  test('read every page of the completion and write nothing', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await clearActs(request);
    await loginToSamm(page, SCOPE);
    await expect(page.getByTestId('targets')).toBeVisible();
    await page.goto(newAssessmentAddress('shop'));
    await expect(page.getByTestId('new-assessment-no-right')).toBeVisible();
    await page.goto(SB);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByRole('button', { name: 'Add row' })).toHaveCount(0);
    await expect(page.getByTestId('comment-sb-b-1')).not.toHaveJSProperty('tagName', 'TEXTAREA');
    // The preview of the comment is a POST to the renderer; it changes nothing.
    expect((await writes(request)).filter((act) => act.path !== '/api/v1/render/asciidoc')).toEqual(
      [],
    );
  });

  test('refuse the creates of a reader at the server with FORBIDDEN', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await login(page, '/samm');
    const headers = await csrf(page);
    for (const [path, data] of [
      [SCOPES_PATH, { title: 'x', subject: 'organisation' }],
      [assessmentsPath('shop'), { title: 'x' }],
      [savePath('payments'), { parts: { targets: { blob: 'x', fields: {} } } }],
    ]) {
      const answer = await page.request.post(path, { headers, data });
      expect(answer.status(), path).toBe(403);
      expect((await answer.json()).outcome, path).toBe('FORBIDDEN');
    }
  });

  test('answer 503 GIT_UNAVAILABLE to every create and to the save of the targets, and read the rest', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'degraded');
    await login(page, '/samm');
    const headers = await csrf(page);
    for (const [path, data] of [
      [SCOPES_PATH, { title: 'x', subject: 'organisation' }],
      [assessmentsPath('shop'), { title: 'x' }],
      [savePath('payments'), { parts: { targets: { blob: 'x', fields: {} } } }],
    ]) {
      const answer = await page.request.post(path, { headers, data });
      expect(answer.status(), path).toBe(503);
      expect((await answer.json()).outcome, path).toBe('GIT_UNAVAILABLE');
    }
    expect((await page.request.get(MODELS_PATH)).ok()).toBe(true);
    expect((await page.request.get(trendPath('payments'))).ok()).toBe(true);
  });

  test('keep the models and the trends readable in the local installation', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'local');
    await page.goto('/login?return=%2Fsamm');
    await page.getByTestId('login-username').fill('alex');
    await page.getByTestId('login-password').fill('local-password');
    await page.getByTestId('login-submit').click();
    await expect(page).toHaveURL('/samm');
    expect((await page.request.get(MODELS_PATH)).ok()).toBe(true);
    expect((await page.request.get(trendPath('payments'))).ok()).toBe(true);
    await expect(page.getByTestId('new-scope')).toBeVisible();
  });
});
