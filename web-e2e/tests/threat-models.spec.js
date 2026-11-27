import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { field, sentTo, useLanguage } from './helpers/documents.js';
import { login } from './helpers/login.js';
import { acts, broadcast, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { MODELS, WITHOUT_ALL, WITHOUT_MODEL, rowsOf } from './helpers/reports.js';
import {
  CHECKOUT,
  LENS_ADDRESS,
  MEASURES,
  REVIEW,
  SERVICES,
  THREATS,
  TODAY,
  changes,
  draftPath,
  editThreat,
  lastBody,
  loginToSheet,
  loginToThreats,
  modelAddress,
  modelPath,
  newAddress,
  releaseAddress,
  releasePath,
  savePath,
  serviceAddress,
  servicePath,
  submitPath,
  threatStatuses,
} from './helpers/threats.js';

/**
 * The lens Threat models (UC-TM-1 to UC-TM-4, rest-api.adoc, Threat Model Requests) as far as the lens is built: the
 * evaluation of the services as its first column, the page of a service, the sheet of a model with its countermeasure
 * editor, the review and the release, and the live refresh. They run against the profiles `workshop`, `read-only`,
 * `release`, `empty` and `degraded` of the mock and its `threat-model-*` states (web-mock/README.adoc, Threat Models).
 * The recipe wizard (`/threat-models/{service}/new`) has its own spec: only the way to it is tested here.
 *
 * The figures, the services, the threats and the review are static fixtures of `helpers/threats.js` (and the models of
 * the evaluation of `helpers/reports.js`); the first test compares them with what the mock answers.
 */

/** @returns the test ids of the rows of a table, without the prefix, in the order shown */
async function rowIds(page, table, prefix) {
  return page
    .getByTestId(table)
    .locator('tbody tr')
    .evaluateAll(
      (rows, start) => rows.map((row) => row.dataset.testid.slice(start.length)),
      prefix,
    );
}

test.describe('the fixtures of this spec', () => {
  test('the services, the threats, the countermeasures and the review are what the mock answers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS_ADDRESS);
    const read = async (path) => {
      const answer = await page.request.get(path);
      expect(answer.status(), path).toBe(200);
      return answer.json();
    };

    // The services of the lens are the ones this spec has words for: a service the mock gains or loses is named here, not
    // skipped by the loops below. The evaluation lists every service that is not retired, with a model or without.
    const listed = await read('/api/v1/reports/threat-evaluation');
    expect(
      SERVICES.filter((service) => service.retired !== true)
        .map((service) => service.id)
        .sort(),
      'the services of the fixtures against the evaluation of the mock',
    ).toEqual([...listed.models, ...listed.withoutModel].map((entry) => entry.service.id).sort());

    // The services of the lens, with their need and the models of each.
    for (const service of SERVICES) {
      const body = await read(servicePath(service.id));
      expect(body.service.name, service.id).toBe(service.name);
      expect(body.service.retired === true, service.id).toBe(service.retired === true);
      expect(
        body.models.map((entry) => entry.model),
        service.id,
      ).toEqual(service.models);
    }
    expect((await page.request.get(servicePath('no-such-service'))).status()).toBe(404);

    // The checkout flow: its threats in order with the status, the treatment and the transfer, and its countermeasures. The
    // lists are compared whole, so a threat or a countermeasure the mock gains or loses is named here.
    const model = await read(modelPath(CHECKOUT.service, CHECKOUT.model));
    expect(model.id).toBe(CHECKOUT.document);
    expect(model.title).toBe(CHECKOUT.title);
    expect(model.state).toBe('released');
    const threats = model.parts.model.value.threats;
    const mitigations = model.parts.model.value.mitigations;
    expect(
      threats.map((threat) => ({
        id: threat.id,
        status: threat.attributes.status,
        measure: mitigations.find((entry) => entry.attributes.threat === threat.id)?.id ?? null,
        risk: threat.attributes.transferred?.split('/').at(-1),
      })),
    ).toEqual(THREATS.map(({ id, status, measure, risk }) => ({ id, status, measure, risk })));
    expect(
      mitigations.map((entry) => ({
        id: entry.id,
        threat: entry.attributes.threat,
        status: entry.attributes.status,
        issues: entry.attributes.issues,
      })),
    ).toEqual(MEASURES.map(({ id, threat, status, issues }) => ({ id, threat, status, issues })));
    expect(model.review.today).toBe(TODAY);
    expect(model.review.lastReview).toBe('2026-06-01');
    expect(model.review.reviewDue).toBe('2026-12-01');
    expect(model.review.dueInDays).toBe(5);
    expect(model.review.reviewIntervals).toEqual({
      'very-high': 'P6M',
      high: 'P12M',
      normal: 'P24M',
    });
    expect(model.diagram.dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
    expect(model.diagram.width).toBeGreaterThan(0);

    // The evaluation: the models of the lens are the models of the report.
    const evaluation = await read('/api/v1/reports/threat-evaluation');
    expect(evaluation.models.map((entry) => `${entry.service.id}/${entry.model}`)).toEqual(
      MODELS.map((entry) => `${entry.service}/${entry.model}`),
    );
    expect(evaluation.withoutModel.map((entry) => entry.service.id)).toEqual(
      WITHOUT_MODEL.map((entry) => entry.service),
    );
    // An earlier state: v1 holds five threats; v9 and a word that is no revision are refused.
    const first = await read(`${modelPath(CHECKOUT.service, CHECKOUT.model)}?at=v1`);
    expect(first.frozen).toBe(true);
    expect(first.parts.model.value.threats.map((threat) => threat.id)).toEqual([
      'T-01',
      'T-02',
      'T-03',
      'T-04',
      'T-05',
    ]);
    expect(
      (await page.request.get(`${modelPath(CHECKOUT.service, CHECKOUT.model)}?at=v9`)).status(),
    ).toBe(404);
    expect(
      (await page.request.get(`${modelPath(CHECKOUT.service, CHECKOUT.model)}?at=zzz`)).status(),
    ).toBe(422);
  });
});

test.describe('the evaluation is the first column (UC-TM-4)', () => {
  test('lists every model with its review and its threats, and the services without one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page);
    const column = page.getByTestId('evaluation-column');
    await expect(column).toBeVisible();
    await expect(page.getByTestId('threat-evaluation-summary')).toHaveText(
      '6 threat models: 13 open threats, 10 untreated, 2 reviews overdue.',
    );
    // The lens reads the order of the server and offers no other: the control of the report is not here.
    await expect(page.getByTestId('threat-evaluation-sort')).toHaveCount(0);
    expect(await rowIds(page, 'threat-evaluation-table', 'threat-row-')).toEqual(
      MODELS.map((model) => `${model.service}-${model.model}`),
    );
    for (const model of MODELS) {
      const row = page.getByTestId(`threat-row-${model.service}-${model.model}`);
      await expect(row.getByRole('link')).toHaveAttribute('href', model.address);
      await expect(page.getByTestId(`threat-status-${model.service}-${model.model}`)).toContainText(
        model.status,
      );
      await expect(row).toContainText(model.need);
    }
    expect(await rowsOf(page, 'threat-evaluation-without-table')).toEqual(
      WITHOUT_MODEL.map((entry) => [
        entry.name,
        entry.owner,
        'Normal',
        entry.state,
        'New threat model',
      ]),
    );
    await expectNoSeriousViolations(page, 'threat models: the evaluation');
  });

  test('offers the way to a new model for a service without one to a person who may edit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToThreats(page);
    const act = page.getByTestId('threat-new-report-scheduler');
    // The name of the link says which service the act is for.
    await expect(act).toHaveAccessibleName('New threat model for Report scheduler');
    await act.click();
    await expect(page).toHaveURL(newAddress('report-scheduler'));
    // The address of a new model is the recipe wizard: without a recipe it offers the recipes.
    await expect(page.getByTestId('new-threat-model-sheet')).toBeVisible();
    await expect(page.getByTestId('new-threat-model-sheet')).toContainText(
      'A threat model of Report scheduler, step by step.',
    );
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
    // Going to the new model writes nothing.
    expect(changes(await acts(request))).toEqual([]);
  });

  test('offers no way to a new model to a person who may only read', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToThreats(page);
    await expect(page.getByTestId('threat-evaluation-table')).toBeVisible();
    expect(await rowsOf(page, 'threat-evaluation-without-table')).toEqual(
      WITHOUT_MODEL.map((entry) => [entry.name, entry.owner, 'Normal', entry.state]),
    );
    await expect(page.getByTestId('threat-new-report-scheduler')).toHaveCount(0);
    await expect(page.getByTestId('threat-new-notification-gateway')).toHaveCount(0);
  });

  test('a model opens from its row, and the service from the model', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page);
    await page.getByTestId('threat-row-payment-api-checkout-flow').getByRole('link').click();
    await expect(page).toHaveURL(CHECKOUT.address);
    await expect(page.getByTestId('threat-model-sheet')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 }).first()).toContainText(CHECKOUT.title);
  });

  test('without threat models every service is one that has none, each with the way to a new model', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#no-threat-models');
    await loginToThreats(page);
    await expect(page.getByTestId('threat-evaluation-none')).toHaveText(
      'No service has a threat model yet.',
    );
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    expect(await rowIds(page, 'threat-evaluation-without-table', 'threat-without-')).toEqual(
      WITHOUT_ALL,
    );
    for (const service of WITHOUT_ALL) {
      await expect(page.getByTestId(`threat-new-${service}`)).toHaveAttribute(
        'href',
        newAddress(service),
      );
    }
  });

  test('a person who may not read the threat models is told so and sees no table', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release');
    await loginToThreats(page);
    const notice = page.getByTestId('threat-forbidden');
    await expect(notice).toContainText('The threat models are not open to you');
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    await expect(page.getByTestId('threat-evaluation-without')).toHaveCount(0);
  });

  test('the empty installation has no service and says where to add them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await loginToThreats(page);
    await expect(page.getByTestId('evaluation-column')).toContainText('No service in the catalog');
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    await expect(page.getByTestId('threat-evaluation-without')).toHaveCount(0);
  });

  test('is read in German, the act for a new model included', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('threat-evaluation-summary')).toHaveText(
      '6 Bedrohungsmodelle: 13 offene Bedrohungen, 10 unbehandelt, 2 Überprüfungen überfällig.',
    );
    await expect(page.getByTestId('threat-status-customer-portal-portal')).toHaveText(
      'Seit 177 Tagen überfällig',
    );
    await expect(page.getByTestId('threat-new-report-scheduler')).toHaveText(
      'Neues Bedrohungsmodell',
    );
    await expect(page.getByTestId('threat-new-report-scheduler')).toHaveAccessibleName(
      'Neues Bedrohungsmodell für Report scheduler',
    );
  });
});

test.describe('the page of a service (UC-TM-1, UC-TM-2)', () => {
  test('lists its models with the state, the review and the threats, and the review interval of its need', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, serviceAddress('payment-api'));
    const view = page.getByTestId('threat-models-view');
    await expect(view).toContainText('Payment API');
    await expect(view).toContainText('Protection need: Very high');
    await expect(view).toContainText('Every 6 months');
    const row = page.getByTestId('model-checkout-flow');
    await expect(row).toHaveAttribute('href', CHECKOUT.address);
    await expect(row).toContainText('Payment API, checkout flow');
    await expect(row).toContainText('Released as v3');
    await expect(row).toContainText('Due in 5 days');
    await expect(row).toContainText('3 open threats, 2 untreated');
    await expect(row).toContainText('Review due Dec 1, 2026');
    // The evaluation stays the first column: the chain is evaluation, service, model.
    await expect(page.getByTestId('evaluation-column')).toBeVisible();
    await expect(page.getByTestId('new-threat-model-link')).toHaveAttribute(
      'href',
      newAddress('payment-api'),
    );
    await expectNoSeriousViolations(page, 'threat models: a service');
    await row.click();
    await expect(page).toHaveURL(CHECKOUT.address);
    await expect(page.getByTestId('threat-model-sheet')).toBeVisible();
  });

  test('every service of the catalog has a page with the words of its need', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, LENS_ADDRESS);
    for (const service of SERVICES) {
      await page.goto(serviceAddress(service.id));
      const view = page.getByTestId('threat-models-view');
      await expect(view).toContainText(service.name);
      await expect(view).toContainText(`Protection need: ${service.need}`);
      await expect(view).toContainText(service.interval);
      await expect(page.getByTestId('model-list')).toHaveCount(service.models.length === 0 ? 0 : 1);
      if (service.models.length === 0) {
        await expect(page.getByTestId('service-no-models')).toHaveText(
          'This service has no threat model yet.',
        );
      } else {
        for (const model of service.models) {
          await expect(page.getByTestId(`model-${model}`)).toBeVisible();
        }
      }
    }
  });

  test('a model never released shows its state and no due date', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, serviceAddress('notification-service'));
    const row = page.getByTestId('model-notification-flows');
    await expect(row).toContainText('Draft');
    await expect(row).toContainText('Not released yet');
    await expect(row).toContainText('3 open threats, 3 untreated');
    await expect(row).not.toContainText('Review due');
  });

  test('a recipe that was started is offered as a link to continue it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToThreats(page, serviceAddress('report-scheduler'));
    const drafts = page.getByTestId('recipe-drafts');
    await expect(drafts).toBeVisible();
    await expect(page.getByTestId('continue-quick-start')).toHaveText(
      'Continue the recipe Quick start',
    );
    await expect(page.getByTestId('continue-quick-start')).toHaveAttribute(
      'href',
      newAddress('report-scheduler', 'quick-start'),
    );
    // Beside it the way to a new one, because the service has no model yet.
    await expect(page.getByTestId('service-no-models')).toBeVisible();
    await expect(page.getByTestId('new-threat-model-link')).toHaveText('New threat model');
    await expectNoSeriousViolations(page, 'threat models: a service with a recipe draft');
    await page.getByTestId('continue-quick-start').click();
    await expect(page).toHaveURL(newAddress('report-scheduler', 'quick-start'));
    await expect(page.getByTestId('new-threat-model-sheet')).toBeVisible();
  });

  test('without a recipe that was started the page offers no continue link', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, serviceAddress('report-scheduler'));
    await expect(page.getByTestId('service-no-models')).toBeVisible();
    await expect(page.getByTestId('recipe-drafts')).toHaveCount(0);
  });

  test('a retired service keeps its page, says so and gets no new model', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, serviceAddress('ledger'));
    const notice = page.getByTestId('service-retired');
    await expect(notice).toContainText('This service is retired');
    await expect(notice).toContainText(
      'Its threat models stay readable. A retired service gets no new one.',
    );
    await expect(page.getByTestId('new-threat-model-link')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'threat models: a retired service');
  });

  test('a person who may only read gets no way to a new model', async ({ page, request }) => {
    await useScenario(request, 'read-only');
    await loginToThreats(page, serviceAddress('report-scheduler'));
    await expect(page.getByTestId('service-no-models')).toBeVisible();
    await expect(page.getByTestId('new-threat-model-link')).toHaveCount(0);
  });

  test('a service that is in no catalog is not found', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await page.goto(serviceAddress('no-such-service'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });

  test('the Payment API lists no model when no service has one', async ({ page, request }) => {
    await useScenario(request, 'workshop#no-threat-models');
    await loginToThreats(page, serviceAddress('payment-api'));
    await expect(page.getByTestId('service-no-models')).toBeVisible();
    await expect(page.getByTestId('model-checkout-flow')).toHaveCount(0);
  });

  test('is read in German', async ({ page, request }) => {
    await useScenario(request, 'workshop#recipe-draft-saved');
    await loginToThreats(page, serviceAddress('report-scheduler'));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('continue-quick-start')).toHaveText(
      'Anleitung Quick start fortsetzen',
    );
    await expect(page.getByTestId('new-threat-model-link')).toHaveText('Neues Bedrohungsmodell');
    await expect(page.getByTestId('service-no-models')).toContainText('noch kein Bedrohungsmodell');
  });
});

/** @returns the last draft of the model the mock received: the fields by part, `null` while there is none */
async function lastDraft(request) {
  const body = lastBody(await acts(request), draftPath(), 'PUT');
  return body === null ? null : body.parts;
}

/** Waits for the draft of the model and returns the fields of one part. */
async function draftFields(request, part) {
  await expect
    .poll(async () => (await lastDraft(request))?.[part] ?? null, {
      message: `the draft of ${part}`,
    })
    .not.toBeNull();
  return (await lastDraft(request))[part].fields;
}

/** @returns the threat of a list with an id */
function entry(list, id) {
  return list.find((item) => item.id === id);
}

/** Opens the dialog that adds a countermeasure and waits for it. */
async function addMeasure(page) {
  await page.getByRole('button', { name: 'Add a countermeasure' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}

test.describe('the sheet of a model (UC-TM-2, AUN-TM-4)', () => {
  test('shows the model with its review, its diagram, its threats and its countermeasures', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await expect(page.getByRole('heading', { level: 1 }).first()).toHaveText(CHECKOUT.title);
    await expect(page.getByTestId('document-state')).toHaveText('Released as v3');
    await expect(page.getByTestId('released-notice')).toContainText(
      'Your next save starts version 4. The released version stays as it was.',
    );
    // The review: the last release, the due date of the interval of the need, what the need is.
    const review = page.getByTestId('review-facts');
    for (const text of [
      REVIEW.last,
      REVIEW.ago,
      REVIEW.due,
      REVIEW.status,
      REVIEW.interval,
      REVIEW.need,
    ]) {
      await expect(review).toContainText(text);
    }
    await expect(field(page, '/owner').getByRole('combobox')).toHaveValue('role:service-owner');
    await expect(field(page, '/last-review').locator('input')).toHaveValue('2026-06-01');
    // The diagram is the data URL of the read, drawn as an image that loaded.
    const image = page.getByTestId('diagram-image');
    expect(await image.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    await expect
      .poll(() => image.evaluate((element) => element.complete && element.naturalWidth), {
        message: 'the diagram has loaded',
      })
      .toBe(760);
    await expect(image).toHaveAccessibleName(
      'Diagram of Payment API, checkout flow with the components Customer browser, Payment API, Payment database, Payment provider.',
    );
    // The threats in order, each with its status; the ones nothing treats carry the box.
    await expect(page.getByTestId('threat-counts')).toHaveText(
      '9 threats: 3 open, 2 untreated, 1 transferred.',
    );
    expect(await threatStatuses(page)).toEqual(THREATS.map((threat) => threat.status));
    for (const threat of THREATS) {
      await expect(page.getByTestId(`threat-untreated-${threat.id}`)).toHaveCount(
        threat.untreated ? 1 : 0,
      );
      await expect(page.getByTestId(`threat-${threat.id}`)).toContainText(threat.id);
    }
    // The countermeasures in order with the threat each one treats and its issue ids.
    for (const [index, measure] of MEASURES.entries()) {
      const cell = page.getByTestId(`mitigation-${measure.id}`);
      await expect(cell).toContainText(measure.id);
      const row = page.getByTestId('mitigations-table').locator('tbody tr').nth(index);
      await expect(row).toContainText(measure.threat);
      for (const issue of measure.issues) await expect(row).toContainText(issue);
    }
    // The margin: who released it, the revisions, the history.
    await expect(page.getByTestId('release-block')).toContainText('Noor Haddad');
    await expect(page.getByTestId('release-block')).toContainText(
      'models/payment-api-checkout-flow/v3',
    );
    await expect(page.getByTestId('revision-picker')).toBeVisible();
    await expect(page.getByTestId('document-history')).toContainText('Released it as v3');
    await expectNoSeriousViolations(page, 'threat model sheet');
  });

  test('shows a threat that was transferred with a link to its risk that nothing here changes', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    const mark = page.getByTestId('threat-transferred-T-07');
    await expect(mark).toHaveText('Transferred to risk R-009');
    await expect(mark.getByRole('link', { name: 'R-009' })).toHaveAttribute(
      'href',
      '/isms/risks/r-009',
    );
    // Only T-07 carries it, and the dialog that changes a threat has no field for it.
    await expect(page.locator('[data-testid^="threat-transferred-"]')).toHaveCount(1);
    await editThreat(page, 'T-07');
    await expect(page.getByRole('dialog')).not.toContainText(/transfer|risk register|R-009/i);
    await page
      .getByTestId('threats-field-name')
      .fill('Replay of a payment authorisation (checked)');
    await page.getByTestId('threats-apply').click();
    // The change goes on with the stored transfer: the sheet writes it back as it read it.
    const fields = await draftFields(request, 'model');
    expect(entry(fields['/threats'], 'T-07')).toMatchObject({
      name: 'Replay of a payment authorisation (checked)',
      attributes: { status: 'accepted', transferred: 'isms-register:risk/R-009' },
    });
    await expect(mark).toHaveText('Transferred to risk R-009');
  });

  test('changes the status of a threat in its row, keeps a draft and saves the whole list for everyone', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Accepted' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    const fields = await draftFields(request, 'model');
    // The list is sent as a whole, in order: nine threats, and nothing else of the model.
    expect(Object.keys(fields)).toEqual(['/threats']);
    expect(fields['/threats'].map((threat) => threat.id)).toEqual(
      THREATS.map((threat) => threat.id),
    );
    expect(entry(fields['/threats'], 'T-01').attributes.status).toBe('accepted');
    expect(entry(fields['/threats'], 'T-02').attributes.status).toBe('open');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(), 'POST');
    expect(saves).toHaveLength(1);
    expect(Object.keys(saves[0].body.parts)).toEqual(['model']);
    expect(saves[0].body.parts.model.blob).toBe('19888ed');
    expect(saves[0].body.parts.model.fields['/threats']).toEqual(fields['/threats']);
    // The first save after a release starts the next version, in the first state of the workflow.
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await expect(page.getByTestId('transition-threat-model.submit')).toBeVisible();
    await expect(page.getByTestId('released-notice')).toHaveCount(0);
  });

  test('adds a threat in a dialog that names every field that is wrong, and keeps the ids ordered', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await page.getByRole('button', { name: 'Add a threat' }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await page.getByTestId('threats-field-likelihood').fill('150');
    await page.getByTestId('threats-apply').click();
    // Nothing is added while a field is wrong, and each field says what is wrong with it.
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('Fill in this field.');
    await expect(dialog).toContainText('Enter a whole number from 0 to 100.');
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(9);
    await page.getByTestId('threats-field-name').fill('Log injection');
    await page
      .getByTestId('threats-field-description')
      .fill('A crafted value forges a line of the log.');
    await page.getByTestId('threats-category-tampering').check();
    await page.getByTestId('threats-field-likelihood').fill('40');
    await page.getByTestId('threats-field-impact').fill('60');
    await page.getByTestId('threats-apply').click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(10);
    // The id is the next free number after the highest taken.
    await expect(page.getByTestId('threat-T-10')).toContainText('Log injection');
    await expect(page.getByTestId('threat-T-10')).toContainText('Tampering');
    const fields = await draftFields(request, 'model');
    expect(entry(fields['/threats'], 'T-10')).toEqual({
      id: 'T-10',
      name: 'Log injection',
      description: 'A crafted value forges a line of the log.',
      categories: ['Tampering'],
      risk: { likelihood: 40, impact: 60 },
      attributes: { status: 'open' },
    });
    // The new threat has nothing that treats it, so it is the one that needs the person.
    await expect(page.getByTestId('threat-untreated-T-10')).toBeVisible();
  });

  test('changing a threat can be cancelled, and cancelling changes nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    await editThreat(page, 'T-02');
    await expect(page.getByTestId('threats-field-name')).toHaveValue(
      'Account takeover by credential stuffing at checkout',
    );
    await page.getByTestId('threats-field-name').fill('Something else');
    await page.getByTestId('threats-cancel').click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(page.getByTestId('threat-T-02')).toContainText(
      'Account takeover by credential stuffing',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
    expect(changes(await acts(request))).toEqual([]);
  });

  test('removing a threat removes its countermeasures in the same change, and says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await page.getByRole('button', { name: 'Remove T-03', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Remove the threat?');
    await expect(dialog).toContainText(
      'T-03, Card data in the application log, leaves this model.',
    );
    await expect(page.getByTestId('threats-remove-treatments')).toHaveText(
      'Its countermeasure goes with it.',
    );
    // Cancelling keeps both.
    await page.getByTestId('threats-remove-cancel').click();
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(9);
    await expect(page.getByTestId('mitigation-M-03')).toBeVisible();
    await page.getByRole('button', { name: 'Remove T-03', exact: true }).click();
    await page.getByTestId('threats-remove-confirm').click();
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(8);
    await expect(page.getByTestId('threat-T-03')).toHaveCount(0);
    await expect(page.getByTestId('mitigation-M-03')).toHaveCount(0);
    // Both lists are sent as wholes: the file never holds a countermeasure of a threat that is gone.
    const fields = await draftFields(request, 'model');
    expect(fields['/threats'].map((threat) => threat.id)).toEqual(
      THREATS.filter((threat) => threat.id !== 'T-03').map((threat) => threat.id),
    );
    expect(fields['/mitigations'].map((measure) => measure.id)).toEqual(
      MEASURES.filter((measure) => measure.id !== 'M-03').map((measure) => measure.id),
    );
    // A threat nothing treats goes without the line about countermeasures.
    await page.getByRole('button', { name: 'Remove T-01', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('T-01, Tampering with the amount');
    await expect(page.getByTestId('threats-remove-treatments')).toHaveCount(0);
    await page.getByTestId('threats-remove-cancel').click();
  });

  test('adds a countermeasure with its issue ids typed as one list separated by commas', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await addMeasure(page);
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      'The ids of the issues that carry out the work, separated by commas.',
    );
    await page.getByTestId('mitigations-apply').click();
    await expect(dialog).toContainText('Fill in this field.');
    await page.getByTestId('mitigations-field-name').fill('Validate the amount on the server');
    await page.getByTestId('mitigations-field-threat').selectOption({ value: 'T-01' });
    await page.getByTestId('mitigations-field-status').selectOption({ label: 'Planned' });
    await page.getByTestId('mitigations-field-reduction').fill('80');
    // Commas, semicolons and spaces separate; an id named twice is one issue.
    await page
      .getByTestId('mitigations-field-issues')
      .fill('PAY-2000, PAY-2001; PAY-2000 PAY-2002');
    await page.getByTestId('mitigations-apply').click();
    await expect(dialog).toHaveCount(0);
    const cell = page.getByTestId('mitigation-M-09');
    await expect(cell).toContainText('Validate the amount on the server');
    const row = page.getByTestId('mitigations-table').locator('tbody tr').nth(MEASURES.length);
    await expect(row).toContainText('T-01');
    await expect(row).toContainText('PAY-2000');
    await expect(row).toContainText('PAY-2002');
    // The threat it treats is no longer untreated.
    await expect(page.getByTestId('threat-untreated-T-01')).toHaveCount(0);
    const fields = await draftFields(request, 'model');
    // The countermeasure list is the whole list: the five of the file and the new one, nothing of the threats.
    expect(Object.keys(fields)).toEqual(['/mitigations']);
    expect(fields['/mitigations'].map((measure) => measure.id)).toEqual([
      ...MEASURES.map((measure) => measure.id),
      'M-09',
    ]);
    expect(entry(fields['/mitigations'], 'M-09')).toEqual({
      id: 'M-09',
      name: 'Validate the amount on the server',
      riskReduction: 80,
      attributes: {
        threat: 'T-01',
        status: 'planned',
        issues: ['PAY-2000', 'PAY-2001', 'PAY-2002'],
      },
    });
    expect(entry(fields['/mitigations'], 'M-03').attributes.issues).toEqual(['PAY-1423']);
  });

  test('changes the issues of a countermeasure and refuses a list that is too long or an id that is too long', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await page.getByRole('button', { name: 'Edit M-03', exact: true }).click();
    const issues = page.getByTestId('mitigations-field-issues');
    await expect(issues).toHaveValue('PAY-1423');
    const dialog = page.getByRole('dialog');
    await issues.fill(Array.from({ length: 21 }, (_, index) => `PAY-${index + 1}`).join(', '));
    await expect(dialog).toContainText('At most 20 issues.');
    await page.getByTestId('mitigations-apply').click();
    await expect(dialog).toBeVisible();
    await issues.fill('X'.repeat(65));
    await expect(dialog.getByText('At most 20 issues.')).toHaveCount(0);
    await page.getByTestId('mitigations-apply').click();
    await expect(dialog).toBeVisible();
    await issues.fill('PAY-1423, PAY-1500');
    await expect(dialog.locator('.error, [role="alert"]')).toHaveCount(0);
    await page.getByTestId('mitigations-apply').click();
    await expect(dialog).toHaveCount(0);
    const fields = await draftFields(request, 'model');
    expect(entry(fields['/mitigations'], 'M-03').attributes).toEqual({
      threat: 'T-03',
      status: 'planned',
      issues: ['PAY-1423', 'PAY-1500'],
    });
  });

  test('removes a countermeasure after asking, and the threat it treated is open again for the person', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await page.getByRole('button', { name: 'Remove M-03', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Remove the countermeasure?');
    await page.getByTestId('mitigations-remove-cancel').click();
    await expect(page.getByTestId('mitigation-M-03')).toBeVisible();
    await page.getByRole('button', { name: 'Remove M-03', exact: true }).click();
    await page.getByTestId('mitigations-remove-confirm').click();
    await expect(page.getByTestId('mitigation-M-03')).toHaveCount(0);
    // T-03 is open and nothing treats it now.
    await expect(page.getByTestId('threat-untreated-T-03')).toBeVisible();
    const fields = await draftFields(request, 'model');
    expect(fields['/mitigations'].map((measure) => measure.id)).toEqual([
      'M-04',
      'M-05',
      'M-06',
      'M-08',
    ]);
    expect(Object.keys(fields)).toEqual(['/mitigations']);
  });
});

test.describe('the review (UC-TM-2)', () => {
  test('starts the review with today, shows when the next one falls due and saves only the data of the document', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    const start = page.getByTestId('start-review');
    const date = field(page, '/last-review').locator('input');
    await expect(date).toHaveValue('2026-06-01');
    await expect(page.getByTestId('review-next-due')).toHaveCount(0);
    await start.click();
    // The date of the day, and the day one interval later: 6 months for the very high need of the Payment API.
    await expect(date).toHaveValue(TODAY);
    await expect(page.getByTestId('review-next-due')).toHaveText(
      'With this review date the next review is due on May 26, 2027.',
    );
    await expect(start).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('review-section')).toContainText(
      'The review date is already today.',
    );
    // What the review states is the last release's: the facts of the review do not move before a release.
    await expect(page.getByTestId('review-facts')).toContainText('Jun 1, 2026');
    const fields = await draftFields(request, 'data');
    expect(fields).toEqual({ '/last-review': TODAY });
    expect(Object.keys((await lastDraft(request)) ?? {})).toEqual(['data']);
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(), 'POST');
    expect(saves).toHaveLength(1);
    expect(Object.keys(saves[0].body.parts)).toEqual(['data']);
    expect(saves[0].body.parts.data.fields).toEqual({ '/last-review': TODAY });
  });

  test('a review date that is typed shows its own due date', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await field(page, '/last-review').locator('input').fill('2026-10-01');
    await expect(page.getByTestId('review-next-due')).toHaveText(
      'With this review date the next review is due on Apr 1, 2027.',
    );
    // The date of the day is still there to take.
    await expect(page.getByTestId('start-review')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('saves the model and the data of the document each as its own change, the model first', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-02').selectOption({ label: 'Accepted' });
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(), 'POST');
    expect(saves.map((save) => Object.keys(save.body.parts))).toEqual([['model'], ['data']]);
    expect(entry(saves[0].body.parts.model.fields['/threats'], 'T-02').attributes.status).toBe(
      'accepted',
    );
    expect(saves[1].body.parts.data.fields).toEqual({ '/last-review': TODAY });
  });

  test('names the rows and the fields the server found wrong, each at its place, and keeps the text', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-invalid');
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Mitigated' });
    await page.getByTestId('start-review').click();
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'Some entries are not valid. Correct the marked fields.',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('save-state')).toContainText('is not kept as a draft');
    // A list says which row, in the words of the problem.
    await expect(page.getByTestId('threats-errors')).toHaveText('Row 1: This number is too large.');
    await expect(page.getByTestId('mitigations-errors')).toHaveText(
      'Row 1: This reference leads nowhere. Check it or choose another.',
    );
    await expect(page.getByTestId('threats-table').getByTestId('row-error-0')).toHaveText(
      'Check this row',
    );
    await expect(page.getByTestId('mitigations-table').getByTestId('row-error-0')).toHaveText(
      'Check this row',
    );
    // The field of the other part has its own error, and a refusal of one part keeps the changes of the other.
    await expect(field(page, '/owner')).toContainText('This reference leads nowhere.');
    await expect(page.getByTestId('threat-status-T-01')).toHaveValue('mitigated');
    await expect(field(page, '/last-review').locator('input')).toHaveValue(TODAY);
    expect((await lastDraft(request)) ?? null).toBeNull();
    await expectNoSeriousViolations(page, 'threat model sheet with errors');
  });

  test('a conflict is decided per list, and what is not decided stays for the person', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-saved-by-other');
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Mitigated' });
    await page.getByTestId('save-everyone').click();
    const panel = page.getByTestId('conflict-panel');
    await expect(panel).toBeVisible();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
    // One entry for the list: both versions are told as lists, with the other person's name.
    await expect(panel.getByTestId('conflict-/threats')).toHaveCount(1);
    await expect(panel.getByTestId('conflict-/threats')).toContainText('Your version');
    await expect(panel.getByTestId('conflict-/threats')).toContainText('Version of Jordan Weber');
    await expect(panel.getByTestId('conflict-/threats')).toContainText(
      '9 entries: T-01: Tampering with the amount in the checkout request (Mitigated);',
    );
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    // The other model of the list is not touched by the conflict: no other entry.
    await expect(panel.locator('[data-testid^="conflict-/"]')).toHaveCount(1);
    await expectNoSeriousViolations(page, 'threat model sheet with a conflict');
    await page.getByTestId('keep-own-/threats').click();
    await expect(page.getByTestId('conflict-/threats')).toHaveCount(0);
    await expect(page.getByTestId('threat-status-T-01')).toHaveValue('mitigated');
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
  });

  test('says that the Git server cannot be reached and keeps what the person changed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-git-unavailable');
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Mitigated' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('failure-notice')).toContainText(
      'The Git server cannot be reached. Your work is kept; save again later.',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('threat-status-T-01')).toHaveValue('mitigated');
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
    await expectNoSeriousViolations(page, 'threat model sheet, Git server down');
  });

  test('a person who may only read gets the model without a way to change it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToSheet(page);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-state')).toContainText('Editing needs the edit right.');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('start-review')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Edit|Remove|Add|Move)/ })).toHaveCount(0);
    await expect(page.getByTestId('released-notice')).toHaveCount(0);
    // A status is a word and no control; the transfer is a link all the same.
    await expect(page.getByTestId('threat-status-T-01')).toHaveText('Open');
    await expect(page.getByTestId('threat-status-T-07')).toHaveText('Accepted');
    await expect(page.getByTestId('threats-table').locator('select')).toHaveCount(0);
    await expect(page.getByTestId('threat-transferred-T-07').getByRole('link')).toBeVisible();
    await expect(field(page, '/last-review').locator('input')).toHaveCount(0);
    await expect(field(page, '/last-review')).toContainText('Jun 1, 2026');
    await expect(page.getByTestId('transition-bar')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'threat model sheet, read only');
  });
});

test.describe('the earlier states of a model (UC-DOC-2)', () => {
  test('a revision is chosen by the picker, read as it was, and read only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    await page.getByTestId('revision-select').selectOption('v2');
    await expect(page).toHaveURL(modelAddress(CHECKOUT.service, CHECKOUT.model, 'v2'));
    await expect(page.getByTestId('revision-notice')).toContainText('Released as v2');
    await expect(page.getByTestId('revision-notice')).toContainText('Noor Haddad');
    // v2 held T-01 to T-08, each as a word; nothing offers a change.
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(8);
    await expect(page.getByTestId('threat-T-09')).toHaveCount(0);
    await expect(page.getByTestId('threat-status-T-01')).toHaveText('Open');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('start-review')).toHaveCount(0);
    await expect(page.getByRole('button', { name: /^(Edit|Remove|Add)/ })).toHaveCount(0);
    await expect(page.getByTestId('transition-bar')).toHaveCount(0);
    await expect(page.getByTestId('revision-select')).toHaveValue('v2');
    // Reading an earlier state writes nothing, and the way back is the current state.
    expect(changes(await acts(request))).toEqual([]);
    await page.getByTestId('revision-back').click();
    await expect(page).toHaveURL(CHECKOUT.address);
    await expect(page.getByTestId('revision-notice')).toHaveCount(0);
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(9);
  });

  test('an earlier state is an address of its own, and one that does not exist is not found', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, '/');
    await page.goto(modelAddress(CHECKOUT.service, CHECKOUT.model, 'v1'));
    await expect(page.getByTestId('revision-notice')).toContainText('Released as v1');
    await expect(page.getByTestId('threats-table').locator('tbody tr')).toHaveCount(5);
    await expect(page.getByTestId('revision-select')).toHaveValue('v1');
    await page.goto(modelAddress(CHECKOUT.service, CHECKOUT.model, 'v9'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(modelAddress(CHECKOUT.service, CHECKOUT.model, 'zzz'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(modelAddress(CHECKOUT.service, 'no-such-model'));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });
});

/** @returns the line of the release page that a refusal or a success is announced in */
function notices(page) {
  return page.getByTestId('release-view').getByTestId('notice');
}

test.describe('submit and release (UC-TM-2, UC-DOC-6, UC-DOC-7)', () => {
  test('walks the model from the first save of a review to its release as v4', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page);
    // The review: the date of the day, a threat changed, saved for everyone.
    await page.getByTestId('start-review').click();
    await page.getByTestId('threat-status-T-03').selectOption({ label: 'Mitigated' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    // Submitted for review: a step without a confirmation of identity.
    const submit = page.getByTestId('transition-threat-model.submit');
    await expect(submit).toHaveText('Submit for review');
    await submit.click();
    await expect(page.getByTestId('document-state')).toHaveText('In review');
    expect(sentTo(await acts(request), submitPath(), 'POST')).toHaveLength(1);
    // The release is a page of its own, reached by the step that the sheet offers.
    const release = page.getByTestId('transition-threat-model.release');
    await expect(release).toHaveText('Release');
    await expect(release).toHaveAttribute('href', releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('step-up-note')).toHaveText(
      'You confirm your identity once more before the release.',
    );
    await release.click();
    await expect(page).toHaveURL(releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Release Payment API, checkout flow',
    );
    // What the approver reads: the facts, the changes by the entry they concern, the checks.
    await expect(page.getByTestId('release-facts')).toContainText('Payment API');
    await expect(page.getByTestId('release-facts')).toContainText('2 open threats, 2 untreated');
    await expect(page.getByText('Changes since v3.')).toBeVisible();
    await expect(page.getByTestId('record-data:last-review')).toContainText('Nov 26, 2026');
    const threats = page.getByTestId('record-model:threats');
    await expect(threats).toContainText('T-03');
    await expect(threats).toContainText('Card data in the application log');
    await expect(threats.getByTestId('diff-entry')).toHaveCount(2);
    const measures = page.getByTestId('record-model:mitigations');
    await expect(measures).toContainText('M-03');
    await expect(measures).toContainText('Issues: PAY-1423');
    await expect(page.getByText('Reviewed on Nov 26, 2026')).toBeVisible();
    await expect(page.getByText('Every mandatory field is filled in')).toBeVisible();
    await expect(
      page.getByText('You confirm your identity once more before the release.'),
    ).toBeVisible();
    // The act names the act and nothing of how it is confirmed.
    await expect(page.getByTestId('release-act')).toHaveText('Release');
    await expect(page.getByTestId('release-act')).not.toContainText(/password|step|MFA|token/i);
    await expectNoSeriousViolations(page, 'threat model release review');
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v4');
    await expect(page.getByTestId('release-seal')).toHaveAttribute('data-sealed', 'v4');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Payment API, checkout flow is released',
    );
    await expect(page.getByTestId('release-tag')).toContainText(
      'models/payment-api-checkout-flow/v4',
    );
    expect(sentTo(await acts(request), releasePath(), 'POST')).toHaveLength(1);
    await expectNoSeriousViolations(page, 'threat model release done');
    // The released model: its review is the one that was released, and it falls due again one interval later.
    await page.getByTestId('release-open').click();
    await expect(page).toHaveURL(CHECKOUT.address);
    await expect(page.getByTestId('document-state')).toHaveText('Released as v4');
    await expect(page.getByTestId('release-block')).toContainText(
      'models/payment-api-checkout-flow/v4',
    );
    const review = page.getByTestId('review-facts');
    await expect(review).toContainText('Nov 26, 2026');
    await expect(review).toContainText('In date');
    await expect(review).toContainText('May 26, 2027');
    await expect(page.getByTestId('released-notice')).toContainText(
      'Your next save starts version 5.',
    );
    // Frozen at the release: v4 is an address of its own.
    await page.goto(modelAddress(CHECKOUT.service, CHECKOUT.model, 'v4'));
    await expect(page.getByTestId('revision-notice')).toContainText('Released as v4');
  });

  test('says which fields are missing when the model is submitted incomplete, and goes back to them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-submit-incomplete');
    await loginToSheet(page);
    await page.getByTestId('transition-threat-model.submit').click();
    const missing = page.getByTestId('missing-fields');
    await expect(missing).toBeVisible();
    await expect(missing).toContainText('Name');
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await expectNoSeriousViolations(page, 'threat model sheet, fields missing');
    await page.getByTestId('back-to-editing').click();
    await expect(page.getByTestId('missing-fields')).toHaveCount(0);
  });

  test('offers no release of a model that is released already or not yet in review', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('This document is released already.')).toBeVisible();
    await gotoState(request, 'threat-model-reopened');
    await page.reload();
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Submit the document for review first.')).toBeVisible();
  });

  test('a release that needs the person to confirm again is made on the second choice of the act', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-release-step-up');
    await clearActs(request);
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/api/v1/releases/') && response.status() === 403,
    );
    await page.getByTestId('release-act').click();
    await demanded;
    await expect(page).toHaveURL(releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('release-act')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v4');
    expect(sentTo(await acts(request), releasePath(), 'POST').length).toBeGreaterThan(1);
  });

  test('reads the new changes when someone saved meanwhile, then releases what was shown', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-release-changed');
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('record-model:threats')).toBeVisible();
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/api/v1/releases/') && response.status() === 409,
    );
    await page.getByTestId('release-act').click();
    await demanded;
    await expect(notices(page).first()).toContainText(
      'Someone saved after you opened the release. Check the changes again.',
    );
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toBeVisible();
  });

  test('tells that someone released the model meanwhile', async ({ page, request }) => {
    await useScenario(request, 'workshop#threat-model-in-review');
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await gotoState(request, 'threat-model-release-released-meanwhile');
    await page.getByTestId('release-act').click();
    await expect(notices(page).first()).toContainText(
      'Someone released this document while you were reviewing it. Nothing was changed.',
    );
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
  });

  test('says that the Git server cannot be reached when the model is released', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-in-review');
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await gotoState(request, 'threat-model-git-unavailable');
    await page.getByTestId('release-act').click();
    await expect(page.getByRole('alert')).toContainText('The Git server cannot be reached.');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
  });

  test('the release is written in German with the word of the act only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-in-review');
    await login(page, releaseAddress(CHECKOUT.service, CHECKOUT.model));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('release-act')).toHaveText('Freigeben');
    await expect(page.getByTestId('release-act')).not.toContainText(/Passwort|Schritt|MFA|Token/i);
    await expect(page.getByTestId('release-back')).toHaveText('Zurück zum Bedrohungsmodell');
    await expect(page.getByText('Überprüft am 26.11.2026')).toBeVisible();
    await expect(page.getByTestId('record-data:last-review')).toContainText('26.11.2026');
    await expect(
      page.getByText('Vor der Freigabe bestätigen Sie noch einmal Ihre Identität.'),
    ).toBeVisible();
  });
});

test.describe('the sheet follows the stream (AUN-WEB-5)', () => {
  test('reads the model again when someone saved it, without the person doing anything', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await expect(page.getByTestId('document-state')).toHaveText('Released as v3');
    await expect(page.getByTestId('threat-status-T-03')).toHaveValue('open');
    // The state of the mock where Alex saved the model after its release plays the event `document-saved`.
    await gotoState(request, 'threat-model-reopened');
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await expect(page.getByTestId('threat-status-T-03')).toHaveValue('mitigated');
    await expect(page.getByTestId('released-notice')).toHaveCount(0);
  });

  test('a model that is being edited keeps what the person changed when someone else saved', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await page.getByTestId('threat-status-T-01').selectOption({ label: 'Accepted' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await gotoState(request, 'threat-model-reopened');
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    // The person's change is still the person's.
    await expect(page.getByTestId('threat-status-T-01')).toHaveValue('accepted');
  });

  test('reads the model again for an event of a document of the threat models only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    const reads = { model: 0, service: 0 };
    page.on('request', (sent) => {
      const path = new URL(sent.url()).pathname;
      if (sent.method() !== 'GET') return;
      if (path === modelPath(CHECKOUT.service, CHECKOUT.model)) reads.model += 1;
      if (path === servicePath(CHECKOUT.service)) reads.service += 1;
    });
    const by = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };
    // The events arrive in the order they were sent: a document of another repository comes first. The page shows no
    // delivery, so this test cannot tell a refresh that the first event started from one that the second started; that
    // the repository filter reads nothing for another repository is the test "ignores a save of another repository" of
    // `sheet.test.ts`. Here the totals prove that the event of the threat models reads each endpoint once, not twice.
    await broadcast(request, 'document-saved', {
      repository: 'samm-assessments',
      id: 'payments-2026-q4',
      fields: ['/answers/sb-b-1'],
      part: 'data',
      by,
    });
    await broadcast(request, 'document-saved', {
      repository: 'threat-models',
      id: CHECKOUT.document,
      fields: ['/threats'],
      part: 'model',
      by,
    });
    await expect.poll(() => reads.model, { message: 'the read of the model' }).toBeGreaterThan(0);
    await expect
      .poll(() => reads.service, { message: 'the read of the service' })
      .toBeGreaterThan(0);
    expect(reads).toEqual({ model: 1, service: 1 });
  });

  test('the step of the workflow of someone else is read as it happens', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#threat-model-reopened');
    await loginToSheet(page);
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await gotoState(request, 'threat-model-in-review');
    await expect(page.getByTestId('document-state')).toHaveText('In review');
    await expect(page.getByTestId('transition-threat-model.release')).toBeVisible();
    await gotoState(request, 'threat-model-released');
    await expect(page.getByTestId('document-state')).toHaveText('Released as v4');
  });

  test('the evaluation and the page of the service follow the same stream', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page, serviceAddress('payment-api'));
    const status = page.getByTestId('threat-status-payment-api-checkout-flow');
    await expect(status).toHaveText('Due in 5 days');
    await expect(page.getByTestId('threat-evaluation-summary')).toContainText('2 reviews overdue');
    await expect(page.getByTestId('model-checkout-flow')).toContainText('Released as v3');
    await gotoState(request, 'threat-model-released');
    await expect(status).toHaveText('In date');
    await expect(page.getByTestId('threat-evaluation-summary')).toHaveText(
      '6 threat models: 12 open threats, 10 untreated, 2 reviews overdue.',
    );
    await expect(page.getByTestId('model-checkout-flow')).toContainText('Released as v4');
    await expect(page.getByTestId('model-checkout-flow')).toContainText('In date');
  });

  test('a model that was created elsewhere shows in the evaluation', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToThreats(page);
    await expect(page.getByTestId('threat-row-report-scheduler-scheduler-overview')).toHaveCount(0);
    await expect(page.getByTestId('threat-new-report-scheduler')).toBeVisible();
    await gotoState(request, 'threat-model-created');
    await expect(page.getByTestId('threat-row-report-scheduler-scheduler-overview')).toBeVisible();
    await expect(page.getByTestId('threat-new-report-scheduler')).toHaveCount(0);
    await expect(page.getByTestId('threat-new-notification-gateway')).toBeVisible();
  });
});

test.describe('the sheet is written in German', () => {
  test('the words of the sheet, its dialogs and the review are German, the technical terms of OTM left out', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page);
    await useLanguage(page, 'de');
    const sheet = page.getByTestId('threat-model-sheet');
    for (const text of ['Überprüfung', 'Bedrohungen', 'Gegenmaßnahmen', 'Diagramm']) {
      await expect(sheet.getByRole('heading', { name: text, exact: true })).toBeVisible();
    }
    await expect(page.getByTestId('threat-counts')).toContainText('9 Bedrohungen');
    await expect(page.getByTestId('threat-untreated-T-01')).toHaveText('Unbehandelt');
    await expect(page.getByTestId('threat-transferred-T-07')).toContainText(
      'Ins Risikoregister übernommen als',
    );
    await expect(page.getByTestId('start-review')).toHaveText('Überprüfung beginnen');
    await page.getByTestId('start-review').click();
    await expect(page.getByTestId('review-next-due')).toHaveText(
      'Mit diesem Überprüfungsdatum ist die nächste Überprüfung am 26.05.2027 fällig.',
    );
    await page.getByRole('button', { name: 'Bearbeiten, T-02', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Bedrohung');
    await page.getByTestId('threats-cancel').click();
    await page.getByRole('button', { name: 'Entfernen, T-03', exact: true }).click();
    await expect(page.getByRole('dialog')).toContainText('Bedrohung entfernen?');
    await expect(page.getByTestId('threats-remove-treatments')).toHaveText(
      'Die zugehörige Gegenmaßnahme wird mit entfernt.',
    );
    await page.getByTestId('threats-remove-cancel').click();
    await page.getByRole('button', { name: 'Gegenmaßnahme hinzufügen' }).click();
    await expect(page.getByRole('dialog')).toContainText('Die Nummern der Vorgänge');
    await page.getByTestId('mitigations-cancel').click();
    await expectNoSeriousViolations(page, 'threat model sheet (German)');
  });
});
