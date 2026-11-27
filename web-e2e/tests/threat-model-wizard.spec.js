import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { sentTo, useLanguage } from './helpers/documents.js';
import { login } from './helpers/login.js';
import {
  acts,
  broadcast,
  clearActs,
  expectScenario,
  gotoState,
  useScenario,
} from './helpers/mock.js';
import {
  LENS_ADDRESS,
  loginToThreats,
  newAddress,
  serviceAddress,
  servicePath,
} from './helpers/threats.js';
import {
  CREATED,
  CREATE_PATH,
  DRAFT,
  EVALUATION_PATH,
  RECIPES,
  RECIPES_PATH,
  SERVICE,
  TODAY,
  addComponent,
  addRow,
  addThreat,
  addZone,
  expectStep,
  fieldsOf,
  fillName,
  goOn,
  loginToChoice,
  loginToWizard,
  recipeDraftPath,
  recipePath,
  routeCreate,
  stepField,
  stepForm,
  stepHeading,
  walkEmpty,
  walkQuickStart,
} from './helpers/wizard.js';

/**
 * The recipe wizard of a new threat model (UC-TM-1, rest-api.adoc, The Recipes, The Recipe Draft, A New Model): the choice of
 * a recipe at `/threat-models/{service}/new`, the steps of a recipe at `?recipe=`, the draft that is kept for the person
 * when they go on, the last page and the create. They run against the profiles `workshop` and `read-only` of the mock and
 * its states `recipe-draft-saved`, `threat-model-created`, `threat-model-create-invalid`, `threat-model-git-unavailable` and
 * `threat-model-recipes-none` (web-mock/README.adoc, Threat Models), for the Report scheduler: the only service with a
 * draft that moves (the mock holds recipe drafts for it and the Notification gateway only).
 *
 * The mock answers the draft with `null` until the state `recipe-draft-saved`: a draft the page keeps is proved by the
 * request the mock recorded, a draft the page continues by that state. The recipes, the draft and the create are static
 * fixtures of `helpers/wizard.js`; the first test compares them with what the mock answers.
 */

/** The label of the save state the person reads (`data-state` is the machine reading). */
const state = (page) => page.getByTestId('save-state');

/** The address of the page of the service the wizard belongs to. */
const SERVICE_ADDRESS = serviceAddress(SERVICE.id);

test.describe('the fixtures of this spec', () => {
  test('the recipes, their steps, the draft and the create are what the mock answers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await login(page, LENS_ADDRESS);
    const read = async (path) => {
      const answer = await page.request.get(path);
      expect(answer.status(), path).toBe(200);
      return answer.json();
    };

    for (const lang of ['en', 'de']) {
      const list = await read(`${RECIPES_PATH}?lang=${lang}`);
      expect(
        list.recipes.map((recipe) => ({
          id: recipe.id,
          title: recipe.title,
          steps: recipe.steps,
        })),
        `the list of the recipes in ${lang}`,
      ).toEqual(
        Object.entries(RECIPES).map(([id, recipe]) => ({
          id,
          title: recipe[lang].title,
          steps: recipe.steps.length,
        })),
      );
      for (const [id, recipe] of Object.entries(RECIPES)) {
        const body = await read(`${recipePath(id)}?lang=${lang}`);
        expect(
          body.steps.map((step) => ({ id: step.id, title: step.title, fills: step.fills })),
          `the steps of ${id} in ${lang}`,
        ).toEqual(
          recipe.steps.map((step) => ({
            id: step.id,
            title: lang === 'en' ? step.title : step.de,
            fills: step.fills,
          })),
        );
        for (const step of body.steps) expect(step.guidance, `${id}/${step.id}`).not.toBe('');
      }
    }
    expect((await page.request.get(recipePath('nope'))).status()).toBe(404);
    expect((await read(recipePath('quick-start'))).description).toBe(
      RECIPES['quick-start'].en.description,
    );

    // The draft the state keeps: the third step, the project and one zone; the other recipe has none.
    const draft = (await read(recipeDraftPath('quick-start'))).draft;
    expect(draft.step).toBe(DRAFT.step);
    expect(draft.at).toBe(DRAFT.at);
    expect(draft.parts.model.fields['/project']).toEqual({
      name: DRAFT.name,
      description: DRAFT.description,
    });
    expect(draft.parts.model.fields['/trustZones']).toEqual([
      { id: DRAFT.zone.id, name: DRAFT.zone.name, risk: { trustRating: DRAFT.zone.rating } },
    ]);
    expect((await read(recipeDraftPath('stride'))).draft).toBeNull();
    const service = await read(servicePath(SERVICE.id));
    expect(service.today).toBe(TODAY);
    expect(service.drafts).toEqual([{ recipe: 'quick-start', step: DRAFT.step, at: DRAFT.at }]);
    expect((await page.request.get(recipeDraftPath('nope'))).status()).toBe(404);

    // The model the create makes is the one the state reads after it.
    await useScenario(request, 'workshop#threat-model-created');
    const model = await read(`/api/v1/threat-models/${SERVICE.id}/${CREATED.model}`);
    expect(model.title).toBe(CREATED.name);
    expect(model.id).toBe(CREATED.document);
    expect(model.address).toBe(CREATED.address);
    expect(model.state).toBe('draft');
  });
});

test.describe('the choice of a recipe (UC-TM-1)', () => {
  test('lists the recipes with what they cover and the number of their steps, each with the act to start it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToChoice(page);
    const sheet = page.getByTestId('new-threat-model-sheet');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New threat model');
    await expect(sheet).toContainText('A threat model of Report scheduler, step by step.');
    await expect(page.getByRole('heading', { level: 2, name: 'Choose a recipe' })).toBeVisible();
    await expect(page.getByTestId('recipe-choice').getByRole('listitem')).toHaveCount(2);

    const quick = page.getByTestId('recipe-quick-start');
    await expect(quick).toContainText('Quick start');
    await expect(quick).toContainText(RECIPES['quick-start'].en.description);
    await expect(quick).toContainText('4 steps');
    const stride = page.getByTestId('recipe-stride');
    await expect(stride).toContainText('STRIDE, step by step');
    await expect(stride).toContainText('6 steps');

    // The act names the recipe for a screen reader and is the link to the wizard of it.
    const start = page.getByTestId('recipe-open-quick-start');
    await expect(start).toHaveText('Start');
    await expect(start).toHaveAccessibleName('Start Quick start');
    await expect(start).toHaveAttribute('href', newAddress(SERVICE.id, 'quick-start'));
    await expect(page.getByTestId('recipe-open-stride')).toHaveAccessibleName(
      'Start STRIDE, step by step',
    );
    await expect(page.getByTestId('recipe-started-quick-start')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'threat models: the choice of a recipe');

    await start.click();
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    await expectStep(page, 'The frame');
  });

  test('says where a recipe that was started stopped, and continues it instead of starting it again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToChoice(page);
    await expect(page.getByTestId('recipe-started-quick-start')).toHaveText('Started, step 3 of 4');
    await expect(page.getByTestId('recipe-started-stride')).toHaveCount(0);
    const open = page.getByTestId('recipe-open-quick-start');
    await expect(open).toHaveText('Continue');
    await expect(open).toHaveAccessibleName('Continue Quick start');
    await expect(page.getByTestId('recipe-open-stride')).toHaveText('Start');
    await expectNoSeriousViolations(page, 'threat models: a recipe that was started');
    await open.click();
    await expectStep(page, 'Components');
  });

  test('is read in German, the recipes and the draft included', async ({ page, request }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToChoice(page);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('recipe-choice')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neues Bedrohungsmodell');
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText(
      'Ein Bedrohungsmodell für Report scheduler, Schritt für Schritt.',
    );
    await expect(page.getByRole('heading', { level: 2, name: 'Anleitung wählen' })).toBeVisible();
    const quick = page.getByTestId('recipe-quick-start');
    await expect(quick).toContainText('Schnellstart');
    await expect(quick).toContainText('4 Schritte');
    await expect(page.getByTestId('recipe-started-quick-start')).toHaveText(
      'Begonnen, Schritt 3 von 4',
    );
    await expect(page.getByTestId('recipe-open-quick-start')).toHaveText('Fortsetzen');
    await expect(page.getByTestId('recipe-open-quick-start')).toHaveAccessibleName(
      'Schnellstart fortsetzen',
    );
    await expect(page.getByTestId('recipe-open-stride')).toHaveAccessibleName(
      'STRIDE, Schritt für Schritt beginnen',
    );
    await expect(page.getByTestId('recipe-stride')).toContainText('6 Schritte');
  });

  test('says that an installation without a recipe cannot start a model, and leads back to the service', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-recipes-none');
    await loginToThreats(page, newAddress(SERVICE.id));
    const sheet = page.getByTestId('new-threat-model-sheet');
    await expect(sheet).toContainText('No recipe is available');
    await expect(sheet).toContainText(
      'This installation ships no recipe, so a threat model cannot be started here.',
    );
    await expect(page.getByTestId('recipe-choice')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'threat models: no recipe');
    await sheet.getByRole('link', { name: SERVICE.name }).click();
    await expect(page).toHaveURL(SERVICE_ADDRESS);
  });

  test('says that a recipe that does not exist does not exist, and leads back to the choice', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, newAddress(SERVICE.id, 'nope'));
    const missing = page.getByTestId('recipe-missing');
    await expect(missing).toContainText('This recipe does not exist');
    await expect(missing).toContainText(
      'Choose one of the recipes that ship with the application.',
    );
    await expectNoSeriousViolations(page, 'threat models: a recipe that does not exist');
    await page.getByTestId('recipe-choose').click();
    await expect(page).toHaveURL(newAddress(SERVICE.id));
    await expect(page.getByTestId('recipe-choice')).toBeVisible();
  });

  test('tells a refused read of the recipes, and a refused read of the recipe', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS_ADDRESS);
    const refuse = (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
      });
    await page.route((url) => url.pathname === RECIPES_PATH, refuse);
    await page.goto(newAddress(SERVICE.id));
    await expect(page.getByTestId('new-threat-model-sheet').getByRole('alert')).toContainText(
      'Git server',
    );
    await expect(page.getByTestId('recipe-choice')).toHaveCount(0);
    await page.unroute((url) => url.pathname === RECIPES_PATH, refuse);

    await page.route((url) => url.pathname === recipePath('quick-start'), refuse);
    await page.goto(newAddress(SERVICE.id, 'quick-start'));
    await expect(page.getByTestId('recipe-failed')).toContainText('Git server');
    await expect(page.getByTestId('recipe-step')).toHaveCount(0);
  });
});

test.describe('who gets the wizard', () => {
  test('a person who may only read gets no wizard and no recipe, and is told why', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    for (const address of [newAddress(SERVICE.id), newAddress(SERVICE.id, 'quick-start')]) {
      await loginToThreats(page, address);
      const none = page.getByTestId('new-threat-model-no-right');
      await expect(none).toContainText(
        'Creating a threat model needs the right to edit threat models, and your account has none.',
      );
      await expect(page.getByTestId('recipe-choice')).toHaveCount(0);
      await expect(page.getByTestId('recipe-step')).toHaveCount(0);
      await expectNoSeriousViolations(page, 'threat models: no right to create');
      await none.getByRole('link', { name: 'Back to the service' }).click();
      await expect(page).toHaveURL(SERVICE_ADDRESS);
    }
  });

  test('a retired service gets no wizard, whether a recipe is named or not', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    for (const address of [newAddress('ledger'), newAddress('ledger', 'quick-start')]) {
      await loginToThreats(page, address);
      const retired = page.getByTestId('new-threat-model-retired');
      await expect(retired).toContainText('This service is retired');
      await expect(retired).toContainText(
        'Its threat models stay readable. A retired service gets no new one.',
      );
      await expect(page.getByTestId('recipe-choice')).toHaveCount(0);
      await expect(page.getByTestId('recipe-step')).toHaveCount(0);
      await expectNoSeriousViolations(page, 'threat models: a retired service has no wizard');
    }
    await page
      .getByTestId('new-threat-model-retired')
      .getByRole('link', { name: 'Back to the service' })
      .click();
    await expect(page).toHaveURL(serviceAddress('ledger'));
  });

  test('a service that is in no catalog is not found', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await page.goto(newAddress('no-such-service', 'quick-start'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });
});

test.describe('the steps (UC-TM-1)', () => {
  test('the first step has its guidance, its form, the list of the steps and nothing to go back to', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New threat model');
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText('Quick start');
    await expectStep(page, 'The frame');
    // The guidance is the text of the recipe, with its list.
    const guidance = page.getByTestId('step-guidance');
    await expect(guidance).toContainText('Name the model and say in a sentence or two');
    await expect(guidance.getByRole('listitem')).toHaveCount(2);
    await expect(guidance).toContainText('Use a name that people will find again.');
    // The form of the part the step fills: the name and the description, and nothing the server writes.
    await expect(stepField(page, 'Name')).toBeVisible();
    await expect(stepField(page, 'Name')).toBeEmpty();
    await expect(stepField(page, 'Description')).toBeVisible();
    await expect(stepForm(page).getByLabel(/address/i)).toHaveCount(0);

    // The steps: one more than the recipe has, the first current, the count of the phone.
    const stepper = page.getByRole('navigation', { name: 'Steps of the recipe Quick start' });
    await expect(stepper.getByRole('listitem')).toHaveCount(5);
    await expect(page.getByTestId('recipe-stepper-0')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('recipe-stepper-1')).not.toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('recipe-stepper-4')).toContainText('Review and create');
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Step 1 of 5');
    await expect(page.getByTestId('step-announce')).toHaveText('Step 1 of 5: The frame');
    // Nothing of the steps ahead is an act, and there is no step before the first.
    await expect(stepper.getByRole('button')).toHaveCount(0);
    await expect(page.getByTestId('step-back')).toHaveCount(0);
    await expect(page.getByTestId('step-next')).toHaveText('Next step');
    await expect(page.getByTestId('step-next')).toBeEnabled();
    await expect(state(page)).toHaveAttribute('data-state', 'clean');
    await expect(state(page)).toHaveText('Nothing is kept yet.');
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText(
      'What you enter is kept for you when you go on to the next step, and for nobody else.',
    );
    await expectNoSeriousViolations(page, 'threat models: the first step of a recipe');
  });

  test('keeps the draft for the person when they go on, and writes nothing when they go back', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await stepField(page, 'Name').fill(CREATED.name);
    await stepField(page, 'Description').fill(DRAFT.description);
    await expect(state(page)).toHaveAttribute('data-state', 'changed');
    await expect(state(page)).toHaveText('Changed. It is kept for you when you go on.');
    // Nothing is sent while the person types.
    expect(sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT')).toHaveLength(0);

    await goOn(page, 'Trust zones');
    // The whole draft goes out, with the position of the step the person goes on to, and nothing of the others.
    const sent = sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT');
    expect(sent).toHaveLength(1);
    expect(sent[0].body).toEqual({
      step: 1,
      parts: {
        model: { fields: { '/project': { name: CREATED.name, description: DRAFT.description } } },
      },
    });
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
    await expect(state(page)).toContainText('Saved for you at');
    await expect(state(page)).toContainText('Others do not see it yet.');
    // The step is announced politely and takes the focus on its heading; the first step is now a step that was reached.
    await expect(page.getByTestId('step-announce')).toHaveText('Step 2 of 5: Trust zones');
    await expect(stepHeading(page)).toBeFocused();
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Step 2 of 5');
    await expect(page.getByTestId('recipe-stepper-1')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('recipe-stepper-0').getByRole('button')).toHaveAccessibleName(
      'The frame (done)',
    );
    await expect(page.getByTestId('step-back')).toBeVisible();
    await expect(guidanceOf(page)).toContainText('Name the areas that trust each other');

    // Back goes to the step with what was typed, and sends nothing.
    await page.getByTestId('step-back').click();
    await expectStep(page, 'The frame');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await expect(stepField(page, 'Description')).toHaveValue(DRAFT.description);
    await expect(page.getByTestId('step-back')).toHaveCount(0);
    expect(sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT')).toHaveLength(1);
    await expectScenario(request, 'workshop');
  });

  test('goes back to a step that was reached from the list of the steps, and not forward to one that was not', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await fillName(page);
    await goOn(page, 'Trust zones');
    await goOn(page, 'Components');
    const stepper = page.getByTestId('recipe-stepper');
    await expect(stepper.getByRole('button')).toHaveCount(2);
    await stepper.getByRole('button', { name: 'The frame (done)' }).click();
    await expectStep(page, 'The frame');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    // The steps up to the furthest one reached are acts, the one after it is text.
    await expect(page.getByTestId('recipe-stepper-0')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('recipe-stepper-1').getByRole('button')).toBeVisible();
    await expect(page.getByTestId('recipe-stepper-2').getByRole('button')).toBeVisible();
    await expect(page.getByTestId('recipe-stepper-3').getByRole('button')).toHaveCount(0);
    await page.getByTestId('recipe-stepper-2').getByRole('button').click();
    await expectStep(page, 'Components');
  });

  test('draws the step of a list as the table of the form kit, and a row is added, changed and removed in its dialog', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await fillName(page);
    await goOn(page, 'Trust zones');
    await expect(stepForm(page)).toContainText('No rows yet.');
    await expect(page.getByRole('table')).toHaveCount(0);
    await addZone(page);
    const table = page.getByRole('table', { name: 'Trust zones' });
    await expect(table.getByRole('row', { name: /internal/ })).toContainText('Internal');
    await expectNoSeriousViolations(page, 'threat models: a step with a table');

    // A row is changed in the same dialog; cancelling changes nothing.
    await page.getByRole('button', { name: 'Edit row 1' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Not kept');
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(table.getByRole('row', { name: /internal/ })).toContainText('Internal');
    await page.getByRole('button', { name: 'Edit row 1' }).click();
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Internal network');
    await dialog.getByRole('button', { name: 'Apply changes' }).click();
    await expect(table.getByRole('row', { name: /internal/ })).toContainText('Internal network');

    await goOn(page, 'Components');
    const sent = sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT');
    expect(sent.at(-1).body.step).toBe(2);
    expect(fieldsOf(sent.at(-1).body)['/trustZones']).toEqual([
      { id: DRAFT.zone.id, name: 'Internal network', risk: { trustRating: DRAFT.zone.rating } },
    ]);
    await page.getByTestId('step-back').click();
    await page.getByRole('button', { name: 'Remove row 1' }).click();
    await expect(page.getByRole('dialog')).toContainText('Remove row 1 of Trust zones?');
    await page.getByRole('button', { name: 'Remove row', exact: true }).click();
    await expect(page.getByRole('table', { name: 'Trust zones' })).toHaveCount(0);
    await expect(stepForm(page)).toContainText('No rows yet.');
  });

  test('draws the threats of a recipe as the table of the sheet of a model, with its dialog and its marks', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await fillName(page);
    await goOn(page, 'Trust zones');
    await goOn(page, 'Components');
    await goOn(page, 'Threats');
    await expect(page.getByTestId('wizard-threats')).toContainText(
      'No threat yet. Add the first one.',
    );
    await page.getByRole('button', { name: 'Add a threat' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    // A threat that is not complete is not added, and each field says what is wrong with it.
    await page.getByTestId('wizard-threats-field-likelihood').fill('150');
    await page.getByTestId('wizard-threats-apply').click();
    await expect(dialog).toContainText('Fill in this field.');
    await expect(dialog).toContainText('Enter a whole number from 0 to 100.');
    await expectNoSeriousViolations(page, 'threat models: the dialog of a threat in the wizard');
    await page.getByTestId('wizard-threats-cancel').click();
    await expect(dialog).toHaveCount(0);

    await addThreat(page);
    await expect(page.getByTestId('wizard-threats-table').locator('tbody tr')).toHaveCount(1);
    await expect(page.getByTestId('threat-T-01')).toContainText('Report sent to the wrong person');
    await expect(page.getByTestId('threat-T-01')).toContainText('Information disclosure');
    // Nothing treats it yet: the mark of the sheet of a model.
    await expect(page.getByTestId('threat-untreated-T-01')).toBeVisible();
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Accepted' });
    await expect(page.getByTestId('threat-untreated-T-01')).toHaveCount(0);
    await goOn(page, 'Review and create');
    const sent = sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT');
    expect(sent.at(-1).body.step).toBe(4);
    expect(fieldsOf(sent.at(-1).body)['/threats']).toEqual([
      {
        id: 'T-01',
        name: 'Report sent to the wrong person',
        description: 'A report that is addressed to the wrong list leaves the company.',
        categories: ['Information Disclosure'],
        risk: { likelihood: 30, impact: 70 },
        attributes: { status: 'accepted' },
      },
    ]);
  });

  test('walks the six steps of STRIDE, with the data flows as a form and the countermeasures as the editor of the sheet', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page, 'stride');
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Step 1 of 7');
    await expect(page.getByTestId('recipe-stepper').getByRole('listitem')).toHaveCount(7);
    await expectStep(page, 'The service');
    await expect(stepField(page, 'Name')).toBeVisible();
    await fillName(page);
    await goOn(page, 'Trust zones');
    await addZone(page);
    await goOn(page, 'Components');
    await addComponent(page);
    await goOn(page, 'Data flows');
    await addRow(page);
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('textbox', { name: /^Id/ }).fill('report');
    await dialog.getByRole('textbox', { name: /^Name/ }).fill('Report to the mailer');
    await dialog.getByRole('textbox', { name: /^From/ }).fill('scheduler');
    await dialog.getByRole('textbox', { name: /^To/ }).fill('mailer');
    await dialog.getByRole('button', { name: 'Add to the list' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Data flows' })).toContainText(
      'Report to the mailer',
    );
    await goOn(page, 'Threats (STRIDE)');
    await expect(guidanceOf(page)).toContainText('Spoofing');

    // Without a threat there is nothing a countermeasure could belong to.
    await goOn(page, 'Countermeasures');
    await expect(page.getByRole('button', { name: 'Add a countermeasure' })).toBeDisabled();
    await expect(page.getByTestId('wizard-mitigations')).toContainText(
      'Add a threat first: a countermeasure belongs to one threat.',
    );
    await page.getByTestId('step-back').click();
    await addThreat(page);
    await goOn(page, 'Countermeasures');
    await page.getByRole('button', { name: 'Add a countermeasure' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByTestId('wizard-mitigations-field-name')
      .fill('Check the list of the addressees');
    await page.getByTestId('wizard-mitigations-field-threat').selectOption({ value: 'T-01' });
    await page.getByTestId('wizard-mitigations-field-status').selectOption({ label: 'Planned' });
    await page.getByTestId('wizard-mitigations-field-reduction').fill('60');
    await page.getByTestId('wizard-mitigations-field-issues').fill('SCH-12, SCH-13');
    await page.getByTestId('wizard-mitigations-apply').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('mitigation-M-01')).toContainText(
      'Check the list of the addressees',
    );
    await expect(page.getByTestId('threat-untreated-T-01')).toHaveCount(0);
    await goOn(page, 'Review and create');
    const sent = sentTo(await acts(request), recipeDraftPath('stride'), 'PUT');
    expect(sent.map((act) => act.body.step)).toEqual([1, 2, 3, 4, 5, 5, 6]);
    expect(fieldsOf(sent.at(-1).body)['/mitigations']).toEqual([
      {
        id: 'M-01',
        name: 'Check the list of the addressees',
        riskReduction: 60,
        attributes: { threat: 'T-01', status: 'planned', issues: ['SCH-12', 'SCH-13'] },
      },
    ]);
    await expect(page.getByTestId('summary-dataflows')).toContainText('One entry');
    await expect(page.getByTestId('summary-threats')).toContainText('One entry');
    await expect(page.getByTestId('summary-mitigations')).toContainText('One entry');
  });

  test('does not go on while a field of the step is marked, and says why', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    // The name of a project has a length: a longer text is marked at its field and does not go on.
    await stepField(page, 'Name').fill('x'.repeat(201));
    const next = page.getByTestId('step-next');
    await expect(next).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Correct the marked fields first.')).toBeVisible();
    await expect(stepForm(page).getByRole('textbox', { name: /^Name/ })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    await expectNoSeriousViolations(page, 'threat models: a field of a step that is marked');
    await next.click({ force: true });
    await expect(stepHeading(page)).toHaveText('The frame');
    expect(sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT')).toHaveLength(0);
    // The correction frees the step.
    await stepField(page, 'Name').fill('Scheduler');
    await expect(next).not.toHaveAttribute('aria-disabled', 'true');
    await goOn(page, 'Trust zones');
  });

  test('stays on the step and says so when the server refuses the draft, and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await page.route(
      (url) => url.pathname === recipeDraftPath('quick-start'),
      (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill({
              status: 422,
              contentType: 'application/json',
              body: JSON.stringify({
                outcome: 'VALIDATION',
                errors: [{ part: 'model', pointer: '/project/name', code: 'MAX_LENGTH' }],
              }),
            })
          : route.continue(),
    );
    await fillName(page);
    await page.getByTestId('step-next').click();
    await expect(state(page)).toHaveAttribute('data-state', 'failed');
    await expect(state(page)).toHaveText('Some entries need a correction. Nothing was kept.');
    await expect(stepHeading(page)).toHaveText('The frame');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await expect(page.getByTestId('recipe-stepper-1')).not.toHaveAttribute('aria-current', 'step');
    await expectNoSeriousViolations(page, 'threat models: a refused draft');
  });

  test('says that the draft could not be kept when the Git server cannot be reached, and stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-git-unavailable');
    await loginToWizard(page);
    await page.route(
      (url) => url.pathname === recipeDraftPath('quick-start'),
      (route) =>
        route.request().method() === 'PUT'
          ? route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
            })
          : route.continue(),
    );
    await fillName(page);
    await page.getByTestId('step-next').click();
    await expect(state(page)).toHaveAttribute('data-state', 'failed');
    await expect(state(page)).toHaveText('Not kept. What you entered stays on this page.');
    await expect(page.getByTestId('new-threat-model-sheet').getByRole('alert')).toContainText(
      'Git server',
    );
    await expect(stepHeading(page)).toHaveText('The frame');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await expectNoSeriousViolations(page, 'threat models: a draft that could not be kept');
  });
});

/** @returns the guidance of the step */
function guidanceOf(page) {
  return page.getByTestId('step-guidance');
}

test.describe('the draft is continued where the person left it', () => {
  test('the service page offers the way on, and the wizard opens at the step of the draft with what was entered', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToThreats(page, SERVICE_ADDRESS);
    await expect(page.getByTestId('continue-quick-start')).toHaveText(
      'Continue the recipe Quick start',
    );
    await page.getByTestId('continue-quick-start').click();
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    await expectStep(page, 'Components');
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Step 3 of 5');
    await expect(page.getByTestId('recipe-stepper-2')).toHaveAttribute('aria-current', 'step');
    // The steps before it were reached; the steps after it were not.
    await expect(page.getByTestId('recipe-stepper-0').getByRole('button')).toBeVisible();
    await expect(page.getByTestId('recipe-stepper-1').getByRole('button')).toBeVisible();
    await expect(page.getByTestId('recipe-stepper-3').getByRole('button')).toHaveCount(0);
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
    await expect(state(page)).toContainText('Saved for you at');
    await expect(page.getByTestId('step-announce')).toHaveText('Step 3 of 5: Components');
    await expectNoSeriousViolations(page, 'threat models: a draft that is continued');

    await page.getByTestId('step-back').click();
    await expectStep(page, 'Trust zones');
    await expect(page.getByRole('table', { name: 'Trust zones' })).toContainText(DRAFT.zone.name);
    await page.getByTestId('step-back').click();
    await expect(stepField(page, 'Name')).toHaveValue(DRAFT.name);
    await expect(stepField(page, 'Description')).toHaveValue(DRAFT.description);
    // Going back after the continue changes nothing that is kept.
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
  });

  test('a draft that was kept on the last page is continued on the last page, and the choice says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await walkEmpty(page);
    const sent = sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT');
    expect(sent.at(-1).body.step).toBe(4);
    // The mock stores no draft: what the page sent is what the server would answer, so the read answers it (the draft the
    // mock has for this step is `recipe-draft-saved`, which stops at the third step) and the service lists it.
    const kept = sent.at(-1).body;
    await page.route(
      (url) => url.pathname === recipeDraftPath('quick-start'),
      (route) =>
        route.request().method() === 'GET'
          ? route.fulfill({
              json: {
                service: SERVICE.id,
                recipe: 'quick-start',
                draft: { ...kept, at: DRAFT.at },
              },
            })
          : route.fallback(),
    );
    await page.route(
      (url) => url.pathname === servicePath(SERVICE.id),
      async (route) => {
        const response = await route.fetch();
        const body = await response.json();
        body.drafts = [{ recipe: 'quick-start', step: kept.step, at: DRAFT.at }];
        await route.fulfill({ response, json: body });
      },
    );
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goto(newAddress(SERVICE.id));
    await expect(page.getByTestId('recipe-started-quick-start')).toHaveText(
      'Started, at the last page',
    );
    await expect(page.getByTestId('recipe-open-quick-start')).toHaveText('Continue');
    await page.getByTestId('recipe-open-quick-start').click();
    await expectStep(page, 'Review and create');
    await expect(page.getByTestId('summary-project')).toContainText(CREATED.name);
    await expect(page.getByTestId('recipe-stepper-4')).toHaveAttribute('aria-current', 'step');
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
    // Every step before the last page was reached: each is an act.
    await expect(page.getByTestId('recipe-stepper').getByRole('button')).toHaveCount(4);
  });

  test('a wizard that is opened in German reads the texts of the recipe in German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await useLanguage(page, 'de');
    await expectStep(page, 'Der Rahmen');
    await expect(page.getByTestId('step-guidance')).toContainText(
      'Geben Sie dem Modell einen Namen',
    );
  });
});

test.describe('leaving the wizard', () => {
  test('asks before a page that holds what is kept nowhere is left, and staying keeps the text', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await fillName(page);
    await page.getByTestId('nav-settings').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Leave this page?');
    await expectNoSeriousViolations(page, 'threat models: the question before leaving the wizard');
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('a wizard nobody typed in, and a step that was kept, are left without a question', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');

    await page.goto(newAddress(SERVICE.id, 'quick-start'));
    await expect(page.getByTestId('recipe-step')).toBeVisible();
    await fillName(page);
    await goOn(page, 'Trust zones');
    // What was typed is kept for the person: leaving loses nothing.
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
  });

  test('a change after the step was kept is asked about again', async ({ page, request }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToWizard(page);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goBack();
    await expectStep(page, 'Components');
    await addComponent(page);
    await expect(state(page)).toHaveAttribute('data-state', 'changed');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await page.getByTestId('leave-stay').click();
    await expect(page.getByRole('table', { name: 'Components' })).toContainText('Scheduler');
  });
});

test.describe('the last page and the create (UC-TM-1)', () => {
  test('shows what was filled in step by step, asks for the owner and the review date, and changes a step from the summary', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await walkQuickStart(page);
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Step 5 of 5');
    await expect(page.getByTestId('recipe-stepper-4')).toHaveAttribute('aria-current', 'step');
    await expect(page.getByTestId('step-announce')).toHaveText('Step 5 of 5: Review and create');
    await expect(page.getByTestId('recipe-step')).toContainText('Check what you filled in.');
    await expect(page.getByTestId('summary-project')).toContainText(CREATED.name);
    await expect(page.getByTestId('summary-zones')).toContainText('One entry');
    await expect(page.getByTestId('summary-components')).toContainText('One entry');
    await expect(page.getByTestId('summary-threats')).toContainText('One entry');
    // The owner and the review date: the review starts as today, the owner is asked for.
    const data = page.getByTestId('review-data');
    await expect(data).toContainText('Owner and review date');
    await expect(data.getByLabel(/^Review date/)).toHaveValue(TODAY);
    await expect(data.getByRole('combobox', { name: /^Owner/ })).toHaveValue('');
    await expect(page.getByTestId('create-model')).toHaveText('Create threat model');
    await expect(page.getByTestId('step-next')).toHaveCount(0);
    await expect(state(page)).toHaveAttribute('data-state', 'draft');
    await expectNoSeriousViolations(page, 'threat models: the last page of the wizard');

    // Each part of the summary leads to its step, which is the step of the form that fills it.
    await page.getByRole('button', { name: 'Change Trust zones' }).click();
    await expectStep(page, 'Trust zones');
    await expect(page.getByRole('table', { name: 'Trust zones' })).toContainText('Internal');
    await expect(page.getByTestId('recipe-stepper-4').getByRole('button')).toBeVisible();
    await page.getByTestId('recipe-stepper-4').getByRole('button').click();
    await expectStep(page, 'Review and create');
    await page.getByRole('button', { name: 'Change The frame' }).click();
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
  });

  test('needs a name, says in which step it is given, and can be created when it has one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await goOn(page, 'Trust zones');
    await goOn(page, 'Components');
    await goOn(page, 'Threats');
    await goOn(page, 'Review and create');
    await expect(page.getByTestId('summary-project')).toContainText('Nothing yet');
    const create = page.getByTestId('create-model');
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(
      page.getByText('The model needs a name. You give it in the step "The frame".'),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'threat models: a model without a name');
    await page.getByRole('button', { name: 'Change The frame' }).click();
    await expectStep(page, 'The frame');
    await fillName(page);
    await page.getByTestId('recipe-stepper-4').getByRole('button').click();
    await expect(create).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('creates the model with what was filled in, ends on its sheet, and reads the evaluation and the service again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await walkQuickStart(page);
    const reads = { evaluation: 0, service: 0 };
    page.on('request', (sent) => {
      const path = new URL(sent.url()).pathname;
      if (sent.method() !== 'GET') return;
      if (path === EVALUATION_PATH) reads.evaluation += 1;
      if (path === servicePath(SERVICE.id)) reads.service += 1;
    });
    await page
      .getByTestId('review-data')
      .getByRole('combobox', { name: /^Owner/ })
      .selectOption({ label: 'Security Champion' });
    await expect(state(page)).toHaveAttribute('data-state', 'changed');
    await expect(state(page)).toHaveText(
      'Nothing is created yet. Creating saves the model for everyone as a draft.',
    );
    await page.getByTestId('create-model').click();

    // The page moves to the sheet of the model the server named, and the wizard is gone.
    await expect(page).toHaveURL(CREATED.address);
    await expect(page.getByTestId('threat-model-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(CREATED.name);
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await expect(page.getByTestId('recipe-step')).toHaveCount(0);
    await expect
      .poll(() => reads.evaluation, { message: 'the read of the evaluation' })
      .toBeGreaterThan(0);
    await expect
      .poll(() => reads.service, { message: 'the read of the service' })
      .toBeGreaterThan(0);

    // One create, with the recipe, the owner, the review date of today and every field of the model.
    const posts = sentTo(await acts(request), CREATE_PATH, 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].body).toEqual({
      recipe: 'quick-start',
      parts: {
        data: { fields: { '/owner': 'role:security-champion', '/last-review': TODAY } },
        model: {
          fields: {
            '/project': { name: CREATED.name },
            '/trustZones': [
              {
                id: DRAFT.zone.id,
                name: DRAFT.zone.name,
                risk: { trustRating: DRAFT.zone.rating },
              },
            ],
            '/components': [
              {
                id: 'scheduler',
                name: 'Scheduler',
                type: 'process',
                parent: { trustZone: DRAFT.zone.id },
              },
            ],
            '/threats': [
              expect.objectContaining({ id: 'T-01', name: 'Report sent to the wrong person' }),
            ],
          },
        },
      },
    });
    await expectScenario(request, 'workshop#threat-model-created');

    // The wizard took the place of the page in the history: back does not lead into a wizard that has created.
    await page.goBack();
    await expect(page).not.toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    // The service lists the model, and the lens no longer offers the way to a first one.
    await page.goto(SERVICE_ADDRESS);
    await expect(page.getByTestId(`model-${CREATED.model}`)).toBeVisible();
    await expect(page.getByTestId('recipe-drafts')).toHaveCount(0);
  });

  test('shows the refusal of the create at the field, in the step that holds it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-create-invalid');
    await loginToWizard(page);
    // The model has a name here, but the server finds none: the field is marked in the step of the frame.
    await walkEmpty(page);
    await page.getByTestId('create-model').click();
    await expectStep(page, 'The frame');
    await expect(state(page)).toHaveAttribute('data-state', 'failed');
    await expect(state(page)).toHaveText('Some entries need a correction. Nothing was created.');
    await expect(page.getByTestId('recipe-stepper-0')).toHaveAttribute('aria-current', 'step');
    const name = stepForm(page).locator('[data-pointer="/project/name"]');
    await expect(name).toContainText('Fill in this field.');
    await expect(stepField(page, 'Name')).toHaveAttribute('aria-invalid', 'true');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    await expectNoSeriousViolations(page, 'threat models: the create is refused at a field');

    // The way back to the last page is the list of the steps; what was entered there is still the person's.
    await page.getByTestId('recipe-stepper-4').getByRole('button').click();
    await expectStep(page, 'Review and create');
    await expect(page.getByTestId('summary-project')).toContainText(CREATED.name);
  });

  test('says that nothing was created when the Git server cannot be reached, and stays on the last page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-git-unavailable');
    await clearActs(request);
    await loginToWizard(page);
    await walkEmpty(page);
    await page.getByTestId('create-model').click();
    await expect(state(page)).toHaveAttribute('data-state', 'failed');
    await expect(state(page)).toHaveText(
      'Nothing was created. What you entered stays on this page.',
    );
    await expect(page.getByTestId('new-threat-model-sheet').getByRole('alert')).toContainText(
      'Git server',
    );
    await expectStep(page, 'Review and create');
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
    expect(sentTo(await acts(request), CREATE_PATH, 'POST')).toHaveLength(1);
    await expect(page.getByTestId('create-model')).toBeEnabled();
    await expectNoSeriousViolations(page, 'threat models: the Git server cannot be reached');
  });

  test('shows the refusal of the owner at the owner and stays on the last page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await walkEmpty(page);
    await routeCreate(page, (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({
          outcome: 'VALIDATION',
          errors: [{ part: 'data', pointer: '/owner', code: 'REFERENCE_NOT_FOUND' }],
        }),
      }),
    );
    await page.getByTestId('create-model').click();
    await expect(state(page)).toHaveText('Some entries need a correction. Nothing was created.');
    await expectStep(page, 'Review and create');
    await expect(page.getByTestId('review-data')).toContainText('This reference leads nowhere');
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
  });

  test('a service that was retired meanwhile answers the create with the reason, and nothing is created', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await walkEmpty(page);
    await routeCreate(page, (route) =>
      route.fulfill({
        status: 409,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'SERVICE_RETIRED' }),
      }),
    );
    await page.getByTestId('create-model').click();
    await expect(state(page)).toHaveAttribute('data-state', 'failed');
    await expect(state(page)).toHaveText(
      'Nothing was created. What you entered stays on this page.',
    );
    await expect(page.getByTestId('new-threat-model-sheet').getByRole('alert')).toBeVisible();
    await expectStep(page, 'Review and create');
  });
});

test.describe('the create asks the person to confirm again', () => {
  test('a local user is asked for the password when the server requires it, and the same create goes out with it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-release-password');
    await clearActs(request);
    await loginToWizard(page);
    await walkEmpty(page);
    // The mock has no state that demands the confirmation of a create: the first one is answered here.
    const bodies = [];
    let demanded = false;
    await routeCreate(page, async (route) => {
      bodies.push(route.request().postDataJSON());
      if (demanded) return route.continue();
      demanded = true;
      return route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'STEP_UP_REQUIRED' }),
      });
    });
    await page.getByTestId('create-model').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm your identity');
    await expect(dialog).toContainText(
      `Enter your password to confirm “Create threat model” for ${CREATED.name}.`,
    );
    await expectNoSeriousViolations(page, 'threat models: the password before a create');
    // An empty password is not sent.
    await page.getByTestId('create-confirm').click();
    await expect(dialog).toContainText('Fill in this field.');
    expect(bodies).toHaveLength(1);
    await page.getByTestId('create-password').fill('local-password');
    await page.getByTestId('create-confirm').click();
    await expect(page).toHaveURL(CREATED.address);
    expect(bodies).toHaveLength(2);
    expect(bodies[0].password).toBeUndefined();
    expect(bodies[1].password).toBe('local-password');
    expect(JSON.stringify(await acts(request))).not.toContain('local-password');
  });

  test('cancelling the question creates nothing and leaves the last page as it was', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-release-password');
    await loginToWizard(page);
    await walkEmpty(page);
    await routeCreate(page, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'STEP_UP_REQUIRED' }),
      }),
    );
    await page.getByTestId('create-model').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByRole('dialog').locator('form').getByRole('button', { name: 'Cancel' }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expectStep(page, 'Review and create');
    await expect(page.getByTestId('create-model')).toBeEnabled();
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'quick-start'));
  });

  test('a person who confirms with the identity provider leaves for it, and the draft they kept is still theirs', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToWizard(page);
    await walkEmpty(page);
    await routeCreate(page, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({
          outcome: 'STEP_UP_REQUIRED',
          stepUp: '/api/v1/auth/login?step-up=mfa',
        }),
      }),
    );
    // The mock's login would sign the person in and return to the app: the request to it is what is proved here.
    const left = page.waitForRequest((sent) =>
      sent.url().includes('/api/v1/auth/login?step-up=mfa'),
    );
    await page.getByTestId('create-model').click();
    await left;
    // Going on to the last page kept the draft for the person: it is the draft they continue from after the return.
    const sent = sentTo(await acts(request), recipeDraftPath('quick-start'), 'PUT');
    expect(sent.at(-1).body.step).toBe(4);
    expect(fieldsOf(sent.at(-1).body)['/project']).toEqual({ name: CREATED.name });
  });
});

test.describe('the wizard follows the stream (AUN-WEB-5)', () => {
  test('keeps what the person typed when a model of the service is created by someone else, and reads the service again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await fillName(page);
    const reads = { service: 0, evaluation: 0, recipe: 0 };
    page.on('request', (sent) => {
      const path = new URL(sent.url()).pathname;
      if (sent.method() !== 'GET') return;
      if (path === servicePath(SERVICE.id)) reads.service += 1;
      if (path === EVALUATION_PATH) reads.evaluation += 1;
      if (path === recipePath('quick-start')) reads.recipe += 1;
    });
    await gotoState(request, 'threat-model-created');
    await expect
      .poll(() => reads.service, { message: 'the read of the service' })
      .toBeGreaterThan(0);
    await expect
      .poll(() => reads.evaluation, { message: 'the read of the evaluation' })
      .toBeGreaterThan(0);
    // The person is where they were, with what they typed; the recipe is not read again for a model.
    await expectStep(page, 'The frame');
    await expect(stepField(page, 'Name')).toHaveValue(CREATED.name);
    await expect(state(page)).toHaveAttribute('data-state', 'changed');
    expect(reads.recipe).toBe(0);
    await goOn(page, 'Trust zones');
  });

  test('ignores an event of another repository, and reads the service for one of the threat models only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    const reads = { service: 0 };
    page.on('request', (sent) => {
      if (sent.method() === 'GET' && new URL(sent.url()).pathname === servicePath(SERVICE.id)) {
        reads.service += 1;
      }
    });
    const by = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };
    await broadcast(request, 'document-saved', {
      repository: 'samm-assessments',
      id: 'payments-2026-q4',
      fields: ['/answers/sb-b-1'],
      part: 'data',
      by,
    });
    await broadcast(request, 'document-saved', {
      repository: 'threat-models',
      id: 'payment-api-checkout-flow',
      fields: ['/threats'],
      part: 'model',
      by,
    });
    await expect
      .poll(() => reads.service, { message: 'the read of the service' })
      .toBeGreaterThan(0);
    expect(reads.service).toBe(1);
    await expectStep(page, 'The frame');
  });

  test('reads the service again when a step is kept, so that the service page lists the draft', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToWizard(page);
    await fillName(page);
    const read = page.waitForRequest(
      (sent) => sent.method() === 'GET' && new URL(sent.url()).pathname === servicePath(SERVICE.id),
    );
    await goOn(page, 'Trust zones');
    await read;
  });
});

test.describe('the wizard is written in German', () => {
  test('the choice, the steps, the last page and the refusals are German, with the words of the recipe in German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-create-invalid');
    await loginToWizard(page);
    await useLanguage(page, 'de');
    await expectStep(page, 'Der Rahmen');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neues Bedrohungsmodell');
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText('Schnellstart');
    await expect(page.getByTestId('step-guidance')).toContainText(
      'Geben Sie dem Modell einen Namen',
    );
    await expect(
      page.getByRole('navigation', { name: 'Schritte der Anleitung Schnellstart' }),
    ).toBeVisible();
    await expect(page.getByTestId('recipe-stepper-count')).toHaveText('Schritt 1 von 5');
    await expect(page.getByTestId('recipe-stepper-4')).toContainText('Prüfen und anlegen');
    await expect(state(page)).toHaveText('Noch nichts aufbewahrt.');
    await expect(page.getByTestId('step-next')).toHaveText('Nächster Schritt');
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText(
      'Was Sie eingeben, wird beim Weitergehen für Sie aufbewahrt und für niemanden sonst.',
    );
    await stepField(page, 'Name').fill(CREATED.name);
    await expect(state(page)).toHaveText('Geändert. Beim Weitergehen wird es für Sie aufbewahrt.');
    await page.getByTestId('step-next').click();
    await expect(stepHeading(page)).toHaveText('Vertrauenszonen');
    await expect(page.getByTestId('step-announce')).toHaveText('Schritt 2 von 5: Vertrauenszonen');
    await expect(state(page)).toContainText('für Sie gespeichert');
    await expect(page.getByTestId('step-back')).toHaveText('Zurück');
    await expect(page.getByRole('button', { name: 'Zeile hinzufügen' })).toBeVisible();
    await expectNoSeriousViolations(page, 'threat models: a step in German');

    await page.getByTestId('step-next').click();
    await page.getByTestId('step-next').click();
    await expect(stepHeading(page)).toHaveText('Bedrohungen');
    await expect(page.getByRole('button', { name: 'Bedrohung hinzufügen' })).toBeVisible();
    await page.getByTestId('step-next').click();
    await expect(stepHeading(page)).toHaveText('Prüfen und anlegen');
    await expect(page.getByTestId('recipe-step')).toContainText(
      'Prüfen Sie, was Sie eingetragen haben.',
    );
    await expect(page.getByTestId('summary-project')).toContainText(CREATED.name);
    await expect(page.getByTestId('summary-zones')).toContainText('Noch nichts');
    await expect(page.getByTestId('review-data')).toContainText(
      'Verantwortliche Rolle und Prüfdatum',
    );
    await expect(page.getByRole('button', { name: 'Der Rahmen ändern' })).toBeVisible();
    await expect(state(page)).toContainText('für Sie gespeichert');
    await expect(page.getByTestId('create-model')).toHaveText('Bedrohungsmodell anlegen');
    await expectNoSeriousViolations(page, 'threat models: the last page in German');

    // The refusal of the create is German, at the field, in the step.
    await page.getByTestId('create-model').click();
    await expect(stepHeading(page)).toHaveText('Der Rahmen');
    await expect(state(page)).toHaveText(
      'Einige Angaben müssen korrigiert werden. Es wurde nichts angelegt.',
    );
    await expect(stepForm(page).locator('[data-pointer="/project/name"]')).toContainText(
      'Füllen Sie dieses Feld aus.',
    );
  });

  test('the model without a name is told in German, and the create is written with the word of the act only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#note-release-password');
    await loginToWizard(page);
    await useLanguage(page, 'de');
    for (const title of ['Vertrauenszonen', 'Komponenten', 'Bedrohungen', 'Prüfen und anlegen']) {
      await page.getByTestId('step-next').click();
      await expect(stepHeading(page)).toHaveText(title);
    }
    await expect(
      page.getByText('Das Modell braucht einen Namen. Sie geben ihn im Schritt „Der Rahmen“ an.'),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Der Rahmen ändern' }).click();
    await fillName(page);
    await page.getByTestId('recipe-stepper-4').getByRole('button').click();
    await routeCreate(page, (route) =>
      route.fulfill({
        status: 403,
        contentType: 'application/json',
        body: JSON.stringify({ outcome: 'STEP_UP_REQUIRED' }),
      }),
    );
    await page.getByTestId('create-model').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Identität bestätigen');
    await expect(dialog).toContainText(
      `Geben Sie Ihr Passwort ein, um „Bedrohungsmodell anlegen“ für ${CREATED.name} zu bestätigen.`,
    );
    await expect(dialog.getByRole('button', { name: 'Bedrohungsmodell anlegen' })).toBeVisible();
  });

  test('a recipe that does not exist, a service that is retired and a person who may only read are told in German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, newAddress(SERVICE.id, 'nope'));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('recipe-missing')).toContainText('Diese Anleitung gibt es nicht');
    await expect(page.getByTestId('recipe-choose')).toHaveText('Anleitung wählen');
    await page.goto(newAddress('ledger'));
    await expect(page.getByTestId('new-threat-model-retired')).toContainText(
      'Dieser Dienst ist stillgelegt',
    );
    await useScenario(request, 'read-only');
    await page.goto(newAddress(SERVICE.id));
    await expect(page.getByTestId('new-threat-model-no-right')).toContainText(
      'Ein Bedrohungsmodell anzulegen setzt das Recht zum Bearbeiten von Bedrohungsmodellen voraus',
    );
    await useScenario(request, 'workshop#threat-model-recipes-none');
    await page.goto(newAddress(SERVICE.id));
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText(
      'Keine Anleitung verfügbar',
    );
  });
});

test.describe('the way from the evaluation to the wizard and back', () => {
  test('the act of a service without a model leads to the choice, a recipe to its wizard, and the service to its page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, LENS_ADDRESS);
    await page.getByTestId(`threat-new-${SERVICE.id}`).click();
    await expect(page).toHaveURL(newAddress(SERVICE.id));
    await page.getByTestId('recipe-open-stride').click();
    await expect(page).toHaveURL(newAddress(SERVICE.id, 'stride'));
    await expectStep(page, 'The service');
    await page.goBack();
    await expect(page.getByTestId('recipe-choice')).toBeVisible();
  });
});
