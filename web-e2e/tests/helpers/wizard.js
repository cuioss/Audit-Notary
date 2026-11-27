import { expect } from '@playwright/test';
import { acts } from './mock.js';
import { loginToThreats, newAddress, serviceAddress } from './threats.js';

/**
 * What the recipe wizard of the lens Threat models (`/threat-models/{service}/new`, UC-TM-1) needs of the page and of the
 * mock (web-mock/README.adoc, Threat Models): the paths of its requests, the static fixtures (the recipes, their steps,
 * the draft of the state `recipe-draft-saved`, the model the create makes) and the shared steps. The mock has recipe drafts
 * for the Report scheduler and the Notification gateway only: the spec uses the Report scheduler.
 * `threat-model-wizard.spec.js` has one test that compares the fixtures with what the mock answers.
 */

/** The service the wizard of the spec is for. */
export const SERVICE = { id: 'report-scheduler', name: 'Report scheduler' };

/** The path of the list of the recipes at the mock. */
export const RECIPES_PATH = '/api/v1/categories/threat-models/recipes';

/** @returns the path of a recipe at the mock */
export function recipePath(recipe) {
  return `${RECIPES_PATH}/${recipe}`;
}

/** @returns the path of the draft of the person's recipe of the Report scheduler */
export function recipeDraftPath(recipe) {
  return `/api/v1/threat-models/${SERVICE.id}/drafts/${recipe}`;
}

/** The path of the create of a model of the Report scheduler. */
export const CREATE_PATH = `/api/v1/threat-models/${SERVICE.id}`;

/** The path of the evaluation, which the lens reads again after a create. */
export const EVALUATION_PATH = '/api/v1/reports/threat-evaluation';

/** The day the review date of the last page starts as: today of the mock. */
export const TODAY = '2026-11-26';

/** The model the create of the Report scheduler makes in the mock (state `threat-model-created`). */
export const CREATED = {
  model: 'scheduler-overview',
  document: 'report-scheduler-scheduler-overview',
  name: 'Scheduler overview',
  address: `/threat-models/${SERVICE.id}/scheduler-overview`,
};

/**
 * The recipes of the mock in English and German: the id, the title, the count of the steps and, per step, the id, the title
 * and the pointer the step fills.
 */
export const RECIPES = {
  'quick-start': {
    en: {
      title: 'Quick start',
      description: 'Four steps: the frame, the zones, the parts, the threats.',
    },
    de: { title: 'Schnellstart' },
    steps: [
      { id: 'project', title: 'The frame', de: 'Der Rahmen', fills: '/project' },
      { id: 'zones', title: 'Trust zones', de: 'Vertrauenszonen', fills: '/trustZones' },
      { id: 'components', title: 'Components', de: 'Komponenten', fills: '/components' },
      { id: 'threats', title: 'Threats', de: 'Bedrohungen', fills: '/threats' },
    ],
  },
  stride: {
    en: {
      title: 'STRIDE, step by step',
      description: 'Every component, every data flow, six kinds of threat.',
    },
    de: { title: 'STRIDE, Schritt für Schritt' },
    steps: [
      { id: 'project', title: 'The service', de: 'Der Dienst', fills: '/project' },
      { id: 'zones', title: 'Trust zones', de: 'Vertrauenszonen', fills: '/trustZones' },
      { id: 'components', title: 'Components', de: 'Komponenten', fills: '/components' },
      { id: 'dataflows', title: 'Data flows', de: 'Datenflüsse', fills: '/dataflows' },
      { id: 'threats', title: 'Threats (STRIDE)', de: 'Bedrohungen (STRIDE)', fills: '/threats' },
      { id: 'mitigations', title: 'Countermeasures', de: 'Gegenmaßnahmen', fills: '/mitigations' },
    ],
  },
};

/** The draft of the state `recipe-draft-saved`: it stopped at the third step (position 2) of the quick start. */
export const DRAFT = {
  step: 2,
  at: '2026-11-26T09:20:00Z',
  name: 'Scheduler overview',
  description: 'How a report is scheduled and sent.',
  zone: { id: 'internal', name: 'Internal', rating: 80 },
};

/**
 * Answers the create of a model at the page, and nothing else at its path: the service page is read at the same path with
 * `GET`.
 *
 * @param page the page
 * @param respond what answers the request: it gets the route of the `POST`
 */
export async function routeCreate(page, respond) {
  await page.route(
    (url) => url.pathname === CREATE_PATH,
    (route) => (route.request().method() === 'POST' ? respond(route) : route.fallback()),
  );
}

/** @returns the state-changing requests of the mock to a path with a method, in the order they were sent */
export async function sentAt(request, path, method) {
  const sent = await acts(request);
  return sent.filter((act) => act.path === path && act.method === method);
}

/**
 * Signs in and waits for the choice of the recipes of the Report scheduler.
 *
 * @param page the page
 */
export async function loginToChoice(page) {
  await loginToThreats(page, newAddress(SERVICE.id));
  await expect(page.getByTestId('recipe-choice')).toBeVisible();
}

/**
 * Signs in and waits for the first step the wizard of a recipe shows: the form of the step or its table drawn.
 *
 * @param page the page
 * @param recipe the recipe's id
 */
export async function loginToWizard(page, recipe = 'quick-start') {
  await loginToThreats(page, newAddress(SERVICE.id, recipe));
  await expect(page.getByTestId('recipe-step')).toBeVisible();
  await expect(page.getByTestId('step-guidance')).toBeVisible();
}

/** @returns the title of the step the wizard shows (the second-level heading of the step) */
export function stepHeading(page) {
  return page.getByTestId('recipe-step').getByRole('heading', { level: 2 });
}

/** Waits until the wizard shows a step or the last page by its title. */
export async function expectStep(page, title) {
  await expect(stepHeading(page)).toHaveText(title);
}

/** @returns the form of the step of the wizard */
export function stepForm(page) {
  return page.getByTestId('step-form');
}

/** @returns the text field of the form of the step by a word of its label */
export function stepField(page, label) {
  return stepForm(page).getByRole('textbox', { name: label });
}

/**
 * Presses `Next step` and waits for the next step by its title.
 *
 * @param page the page
 * @param title the title of the step the wizard goes on to
 */
export async function goOn(page, title) {
  await page.getByTestId('step-next').click();
  await expectStep(page, title);
}

/**
 * Names the model in the first step.
 *
 * @param page the page
 * @param name the name
 */
export async function fillName(page, name = CREATED.name) {
  await stepField(page, 'Name').fill(name);
}

/** Opens the dialog of a new row of the table of the step and waits for it. */
export async function addRow(page) {
  await page.getByRole('button', { name: 'Add row' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

/** Adds the zone `internal` (trust rating 80) in the dialog of a new row, and waits for it to close. */
export async function addZone(page, zone = DRAFT.zone) {
  await addRow(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Id/ }).fill(zone.id);
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(zone.name);
  await dialog.getByRole('spinbutton').fill(String(zone.rating));
  await dialog.getByRole('button', { name: 'Add to the list' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Adds a component of the kind process in the zone `internal`. */
export async function addComponent(page, id = 'scheduler', name = 'Scheduler') {
  await addRow(page);
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: /^Id/ }).fill(id);
  await dialog.getByRole('textbox', { name: /^Name/ }).fill(name);
  await dialog.getByRole('combobox', { name: /^Kind/ }).selectOption({ label: 'Process' });
  await dialog.getByRole('textbox', { name: /^Trust zone/ }).fill(DRAFT.zone.id);
  await dialog.getByRole('button', { name: 'Add to the list' }).click();
  await expect(dialog).toHaveCount(0);
}

/** Adds a threat in the dialog of the table of the threats of the wizard. */
export async function addThreat(page, name = 'Report sent to the wrong person') {
  await page.getByRole('button', { name: 'Add a threat' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByTestId('wizard-threats-field-name').fill(name);
  await page
    .getByTestId('wizard-threats-field-description')
    .fill('A report that is addressed to the wrong list leaves the company.');
  await page.getByTestId('wizard-threats-category-information-disclosure').check();
  await page.getByTestId('wizard-threats-field-likelihood').fill('30');
  await page.getByTestId('wizard-threats-field-impact').fill('70');
  await page.getByTestId('wizard-threats-apply').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}

/**
 * Walks the four steps of the quick start from the first to the last page, with a name, one zone, one component and one
 * threat, each step left with `Next step`.
 *
 * @param page the page
 */
export async function walkQuickStart(page) {
  await fillName(page);
  await goOn(page, 'Trust zones');
  await addZone(page);
  await goOn(page, 'Components');
  await addComponent(page);
  await goOn(page, 'Threats');
  await addThreat(page);
  await goOn(page, 'Review and create');
}

/**
 * Walks the steps of the quick start from the first to the last page with nothing but the name: every step is left empty.
 *
 * @param page the page
 */
export async function walkEmpty(page, name = CREATED.name) {
  await fillName(page, name);
  await goOn(page, 'Trust zones');
  await goOn(page, 'Components');
  await goOn(page, 'Threats');
  await goOn(page, 'Review and create');
}

/** @returns the address of the service page the wizard comes from */
export function serviceOf() {
  return serviceAddress(SERVICE.id);
}

/**
 * The fields of the draft or of the create a request of the mock carried, by part and pointer.
 *
 * @param body the body of a recorded request
 * @param part `model` or `data`
 * @returns the fields of the part
 */
export function fieldsOf(body, part = 'model') {
  return body.parts?.[part]?.fields ?? {};
}
