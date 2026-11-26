import { expect, test } from '@playwright/test';
import { useLanguage } from './helpers/documents.js';
import { acts, clearActs, useScenario } from './helpers/mock.js';
import { login } from './helpers/login.js';
import { choose, comparePath, patchRead } from './helpers/samm.js';
import {
  COMPARE_ADDRESS,
  DIFFER,
  FUNCTIONS,
  LATEST,
  MODELS,
  ORDERS,
  PAIR,
  PAYMENTS_ASSESSMENTS,
  REFUSED_AS_OF,
  REPORTS_ADDRESS,
  RISKS_ADDRESS,
  RISKS_AS_OF,
  RISKS_NOW,
  RISKS_PATH,
  SCOPES,
  SUMMARY,
  SUMMARY_PATH,
  TAGS,
  THREATS_ADDRESS,
  THREATS_PATH,
  TREND_ADDRESS,
  TREND_PATH,
  WITHOUT_ALL,
  WITHOUT_MODEL,
  compareAddress,
  expectLegibleText,
  loginToReports,
  risksAddress,
  rowsOf,
  tokenColour,
  trendAddress,
} from './helpers/reports.js';

/**
 * The lens Reports (UC-SAMM-5, UC-TM-4, UC-ISMS-3, rest-api.adoc, Reports Requests): the dashboard, the trend of the SAMM
 * scores of every scope and of one scope by business function, the comparison of two assessments, the threat evaluation
 * and the risk register as of a day or a tag. They run against the profiles `workshop`, `release`, `empty`, `degraded` and
 * `read-only` of the mock and its states `trend-mixed-models`, `no-threat-models`, `risk-register-git-unavailable`,
 * `risk-register-empty` and `model-versions-differ` (web-mock/README.adoc, Reports).
 *
 * A report only reads, so no test here expects a state-changing request. The figures, the scopes, the models, the risks and
 * the pair are static fixtures of `helpers/reports.js`; the first test compares them with what the mock answers.
 */

/** @returns the requests of the mock to one path, in the order they were sent */
async function requested(request, path) {
  return (await acts(request)).filter((act) => act.path.split('?')[0] === path);
}

/** @returns the figures of a section of the dashboard as [term, value] pairs */
async function figuresOf(section) {
  return section
    .locator('.figure')
    .evaluateAll((figures) =>
      figures.map((figure) => [
        figure.querySelector('dt').textContent.trim(),
        figure.querySelector('dd').textContent.trim(),
      ]),
    );
}

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

/** @returns the bounding box of every direct label of a chart, with the box of its figure */
async function labelBoxes(page, chart) {
  return page.getByTestId(chart).evaluate((figure) => {
    const svg = figure.querySelector('svg.chart__figure').getBoundingClientRect();
    const rect = (box) => ({ left: box.left, right: box.right, top: box.top, bottom: box.bottom });
    return {
      svg: rect(svg),
      labels: [...figure.querySelectorAll('.chart__value')].map((text) => ({
        text: text.textContent.trim(),
        ...rect(text.getBoundingClientRect()),
      })),
      ticks: [...figure.querySelectorAll('.chart__tick')].map((text) => ({
        text: text.textContent.trim(),
        ...rect(text.getBoundingClientRect()),
      })),
    };
  });
}

/** Fails when two direct labels of a chart overlap, or when a label or an axis label leaves the figure. */
async function expectLabelsClear(page, chart) {
  const { svg, labels, ticks } = await labelBoxes(page, chart);
  for (const label of [...labels, ...ticks]) {
    expect(label.left, `${label.text} inside on the left`).toBeGreaterThanOrEqual(svg.left - 1);
    expect(label.right, `${label.text} inside on the right`).toBeLessThanOrEqual(svg.right + 1);
  }
  // Two labels that stand over each other keep the distance of a line of figures (13 px in the chart, a digit is about 10).
  for (const [index, a] of labels.entries()) {
    for (const b of labels.slice(index + 1)) {
      const beside = a.right <= b.left || b.right <= a.left;
      const above = Math.abs((a.top + a.bottom) / 2 - (b.top + b.bottom) / 2);
      expect(beside || above >= 12, `the labels ${a.text} and ${b.text} stay apart`).toBe(true);
    }
  }
}

/** Opens the comparison of the pair of Payments and waits for its result. */
async function openPair(page) {
  await loginToReports(page, compareAddress(PAIR.scope, PAIR.from, PAIR.to), 'samm-compare-view');
  await expect(page.getByTestId('compare-result')).toBeVisible();
}

test.describe('the fixtures of this spec', () => {
  test('the figures, scopes, models, risks and the pair are what the mock answers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await login(page, REPORTS_ADDRESS);
    const read = async (path) => {
      const answer = await page.request.get(path);
      return { status: answer.status(), body: await answer.json() };
    };

    const { body: summary } = await read(SUMMARY_PATH);
    expect(
      [summary.samm.scopes, summary.samm.withoutRelease, summary.samm.open].map(String),
    ).toEqual(SUMMARY.samm.map(([, value]) => value));
    const threats = summary.threatModels;
    expect(
      [
        threats.services,
        threats.withModel,
        threats.withoutModel,
        threats.openThreats,
        threats.untreatedThreats,
        threats.overdue,
        threats.dueSoon,
      ].map(String),
    ).toEqual(SUMMARY.threatModels.map(([, value]) => value));
    const risks = summary.risks;
    expect(
      [
        risks.entries,
        risks.byRating.critical,
        risks.byRating.high,
        risks.byRating.medium,
        risks.byRating.low,
        risks.overdue,
        risks.dueSoon,
      ].map(String),
    ).toEqual(SUMMARY.risks.map(([, value]) => value));
    expect(summary.samm.latest.map((entry) => entry.scope)).toEqual(
      LATEST.map((entry) => entry.scope),
    );

    const { body: trend } = await read(TREND_PATH);
    const round = (value) => String(Math.round(value * 100) / 100);
    expect(
      trend.scopes.map((scope) => ({
        id: scope.scope,
        title: scope.title,
        version: scope.modelVersion,
        points: scope.points.map((point) => ({
          assessment: point.assessment,
          title: point.title,
          overall: round(point.overall),
        })),
      })),
    ).toEqual(SCOPES.map((scope) => ({ ...scope, slot: undefined })));
    const payments = trend.scopes[0].points.at(-1);
    expect(FUNCTIONS.map((fn) => round(payments.functions[fn.id]))).toEqual(
      FUNCTIONS.map((fn) => fn.end),
    );

    const { body: threat } = await read(THREATS_PATH);
    expect(
      threat.models.map((model) => ({
        service: model.service.id,
        model: model.model,
        name: model.service.name,
        address: model.address,
        counts: [model.threats.open, model.threats.untreated, model.threats.transferred].map(
          String,
        ),
      })),
    ).toEqual(
      MODELS.map(({ service, model, name, address, counts }) => ({
        service,
        model,
        name,
        address,
        counts,
      })),
    );
    expect(threat.models.map((model) => `${model.status}:${model.dueInDays}`)).toEqual([
      'overdue:-177',
      'overdue:-43',
      'due-soon:5',
      'ok:104',
      'ok:123',
      'unreleased:null',
    ]);
    expect(threat.withoutModel.map((entry) => entry.service.id)).toEqual(
      WITHOUT_MODEL.map((entry) => entry.service),
    );

    const { body: now } = await read(RISKS_PATH);
    expect(
      now.risks.map((risk) => ({
        entry: risk.entry,
        id: risk.id,
        version: risk.version,
        address: risk.address,
      })),
    ).toEqual(
      RISKS_NOW.map(({ entry, id, version, address }) => ({ entry, id, version, address })),
    );
    expect(now.tags.map((tag) => `${tag.tag}:${tag.commit}`)).toEqual(
      TAGS.map((tag) => `${tag.tag}:${tag.commit}`),
    );
    expect(now.risks.map((risk) => risk.reviewDue)).toEqual([
      '2027-04-21',
      '2026-11-18',
      '2027-02-11',
      '2026-12-15',
      '2027-01-02',
      '2027-04-05',
      '2027-11-12',
    ]);
    for (const [value, expected] of Object.entries(RISKS_AS_OF)) {
      const { body } = await read(`${RISKS_PATH}?as-of=${value}`);
      expect(body.asOf.commit, value).toBe(expected.commit);
      expect(body.asOf.tag, value).toBe(expected.tag);
      expect(
        body.risks.map((risk) => [risk.entry, risk.version]),
        value,
      ).toEqual(expected.risks.map(([entry, , version]) => [entry, version]));
      expect(
        body.risks.map((risk) => risk.address),
        value,
      ).toEqual(expected.risks.map(([entry, , version]) => `/isms/risks/${entry}?at=v${version}`));
    }
    for (const [code, value] of Object.entries(REFUSED_AS_OF)) {
      const { status, body } = await read(`${RISKS_PATH}?as-of=${value}`);
      expect(status, value).toBe(422);
      expect(body.errors, value).toEqual([{ pointer: '/as-of', code }]);
    }

    const { body: pair } = await read(comparePath(PAIR.scope) + `?from=${PAIR.from}&to=${PAIR.to}`);
    expect(pair.functions.map((fn) => fn.id)).toEqual(
      PAIR.functions.filter((row) => row.id !== 'overall').map((row) => row.id),
    );
    expect(pair.from).toBe(PAIR.from);
    expect(pair.to).toBe(PAIR.to);
    const scope = (await read('/api/v1/samm/scopes/payments')).body;
    expect(scope.assessments.map((entry) => entry.id).sort()).toEqual(
      PAYMENTS_ASSESSMENTS.map((entry) => entry.id),
    );
    await useScenario(request, 'workshop#model-versions-differ');
    const refused = await read(`${comparePath(PAIR.scope)}?from=${PAIR.from}&to=${PAIR.to}`);
    expect(refused.status).toBe(422);
    for (const side of ['from', 'to']) {
      expect(refused.body[side]).toEqual({
        assessment: DIFFER[side].assessment,
        modelVersion: DIFFER[side].modelVersion,
      });
      expect(scope.assessments.find((entry) => entry.id === DIFFER[side].assessment).title).toBe(
        DIFFER[side].title,
      );
    }
  });
});

test.describe('the dashboard', () => {
  test('shows the section of every register the person may read, with its figures', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Reports');
    await expect(page.getByTestId('reports-view')).toContainText(
      'The figures of the registers you may read, as of Nov 26, 2026.',
    );
    expect(await figuresOf(page.getByTestId('reports-samm'))).toEqual(SUMMARY.samm);
    expect(await figuresOf(page.getByTestId('reports-threats'))).toEqual(SUMMARY.threatModels);
    expect(await figuresOf(page.getByTestId('reports-risks'))).toEqual(SUMMARY.risks);
    await expect(page.getByTestId('reports-risks')).toContainText('Last release Nov 12, 2026');
    // A figure that needs the person is told in its colour and in its term: overdue and due soon, never a plain one.
    const threats = page.getByTestId('reports-threats');
    await expect(threats.locator('.figure--danger dt')).toHaveText('Reviews overdue');
    await expect(threats.locator('.figure--attention dt')).toHaveText('Reviews due soon');
    const risks = page.getByTestId('reports-risks');
    await expect(risks.locator('.figure--danger dt')).toHaveText('Risk reviews overdue');
    await expect(risks.locator('.figure--attention dt')).toHaveText('Risk reviews due soon');
    await expect(page.getByTestId('reports-samm').locator('.figure--danger')).toHaveCount(0);
  });

  test('lists the latest released assessment of every scope with its score and change', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    for (const entry of LATEST) {
      const row = page.getByTestId(`reports-latest-${entry.scope}`);
      await expect(row).toContainText(entry.name);
      await expect(row.getByRole('img')).toHaveAccessibleName(`${entry.score} of 3`);
      await expect(row).toContainText(entry.change);
    }
    await expect(page.getByTestId('reports-latest-identity')).toHaveCount(0);
  });

  test('every section and every row opens its report', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    const reached = [
      ['reports-open-trend', TREND_ADDRESS, 'samm-trend-view'],
      ['reports-open-compare', COMPARE_ADDRESS, 'samm-compare-view'],
      ['reports-open-threats', THREATS_ADDRESS, 'threat-evaluation-view'],
      ['reports-open-risks', RISKS_ADDRESS, 'risk-register-view'],
    ];
    for (const [link, address, view] of reached) {
      await page.getByTestId(link).click();
      await expect(page).toHaveURL(address);
      await expect(page.getByTestId(view)).toBeVisible();
      await page.goBack();
      await expect(page.getByTestId('reports-view')).toBeVisible();
    }
    for (const [section, address] of [
      ['reports-samm', TREND_ADDRESS],
      ['reports-threats', THREATS_ADDRESS],
      ['reports-risks', RISKS_ADDRESS],
    ]) {
      await page.getByTestId(section).getByRole('heading', { level: 2 }).getByRole('link').click();
      await expect(page).toHaveURL(address);
      await page.goBack();
      await expect(page.getByTestId('reports-view')).toBeVisible();
    }
    await page
      .getByTestId('reports-latest-payments')
      .getByRole('link', { name: 'Payments' })
      .click();
    await expect(page).toHaveURL(trendAddress('payments'));
    await expect(page.getByTestId('trend-functions-chart')).toBeVisible();
  });

  test('a person who may not read the threat models gets no section for them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    await expect(page.getByTestId('reports-samm')).toBeVisible();
    await expect(page.getByTestId('reports-risks')).toBeVisible();
    await expect(page.getByTestId('reports-threats')).toHaveCount(0);
    await expect(page.getByTestId('reports-open-threats')).toHaveCount(0);
    expect(await figuresOf(page.getByTestId('reports-risks'))).toEqual(SUMMARY.risks);
  });

  test('a person who may read no register is told so, in words', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    // The mock has no profile that reads no register and still has a session; the answer is cut down to its date.
    await patchRead(page, `**${SUMMARY_PATH}`, ({ today }) => ({ today }));
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    await expect(page.getByTestId('reports-view')).toContainText('No report to show');
    await expect(page.getByTestId('reports-samm')).toHaveCount(0);
    await expect(page.getByTestId('reports-threats')).toHaveCount(0);
    await expect(page.getByTestId('reports-risks')).toHaveCount(0);
  });

  test('the empty installation shows the sections with their zeros and says what is missing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    await expect(page.getByTestId('reports-samm')).toContainText(
      'No scope has a released assessment yet.',
    );
    await expect(page.getByTestId('reports-risks')).toContainText(
      'The register holds no released risk yet.',
    );
    expect((await figuresOf(page.getByTestId('reports-samm'))).map(([, value]) => value)).toEqual([
      '0',
      '0',
      '0',
    ]);
    await expect(page.locator('.figure--danger, .figure--attention')).toHaveCount(0);
  });

  test('without threat models the section counts the services that have none', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#no-threat-models');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    const figures = await figuresOf(page.getByTestId('reports-threats'));
    expect(figures.slice(0, 3)).toEqual([
      ['Services', '8'],
      ['With a threat model', '0'],
      ['Without a threat model', '8'],
    ]);
  });

  test('without risks the section says so and counts none', async ({ page, request }) => {
    await useScenario(request, 'workshop#risk-register-empty');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    expect((await figuresOf(page.getByTestId('reports-risks')))[0]).toEqual([
      'Released risks',
      '0',
    ]);
    await expect(page.getByTestId('reports-risks')).toContainText(
      'The register holds no released risk yet.',
    );
  });

  test('the read-only and the degraded profile answer the reports of workshop', async ({
    page,
    request,
  }) => {
    for (const profile of ['read-only', 'degraded']) {
      await useScenario(request, profile);
      await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
      expect(await figuresOf(page.getByTestId('reports-samm')), profile).toEqual(SUMMARY.samm);
      expect(await figuresOf(page.getByTestId('reports-risks')), profile).toEqual(SUMMARY.risks);
    }
  });

  test('is read in German with the German names of its figures', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, REPORTS_ADDRESS, 'reports-view');
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Berichte');
    await expect(page.getByTestId('reports-view')).toContainText(
      'Die Kennzahlen der Register, die Sie lesen dürfen, Stand 26.11.2026.',
    );
    expect(await figuresOf(page.getByTestId('reports-samm'))).toEqual([
      ['Bereiche', '4'],
      ['Ohne Freigabe', '1'],
      ['Mit offenem Assessment', '2'],
    ]);
    await expect(page.getByTestId('reports-threats')).toContainText('Überfällige Überprüfungen');
    await expect(page.getByTestId('reports-latest-payments')).toContainText(
      '+0,4 seit der Freigabe davor',
    );
    await expect(page.getByTestId('reports-latest-payments')).toContainText('16.06.2026');
  });
});

test.describe('the trend of every scope', () => {
  test('draws one line for each scope that has a released assessment, in the colour of its place in the list', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SAMM maturity over time');
    const chart = page.getByTestId('trend-chart');
    await expect(chart).toBeVisible();
    const legend = chart.getByRole('list', { name: 'Scopes' }).getByRole('listitem');
    const drawn = SCOPES.filter((scope) => scope.points.length > 0);
    await expect(legend).toHaveText(drawn.map((scope) => scope.title));
    await expect(
      chart.getByRole('img', { name: 'Overall score of the scopes over time' }),
    ).toBeVisible();
    for (const scope of drawn) {
      const series = chart.locator(`[data-series="${scope.id}"]`);
      await expect(chart.locator(`[data-series="${scope.id}"].series--${scope.slot}`)).toHaveCount(
        1,
      );
      // The colour is the one of the slot, and the slot is the place in the list: Identity Platform keeps its slot.
      const slot = await tokenColour(page, `--color-series-${scope.slot}`);
      const mark = series.locator('.chart__mark').first();
      if (scope.points.length > 1) {
        await expect(series.locator('.chart__line')).toHaveCSS('stroke', slot);
      } else {
        await expect(mark).toHaveCSS('fill', slot);
      }
      await expect(series.locator('.chart__value')).toHaveText(scope.points.at(-1).overall);
    }
    await expect(chart.locator('[data-series="identity"]')).toHaveCount(0);
  });

  test('gives every series a shape of its own besides its colour', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    const chart = page.getByTestId('trend-chart');
    const shapes = await chart.evaluate((figure) =>
      [...figure.querySelectorAll('svg.chart__figure [data-series]')].map((series) => {
        const mark = series.querySelector('.chart__mark > *');
        return `${mark.tagName}:${mark.tagName === 'path' ? mark.getAttribute('d').replace(/[-\d. ]+/g, '#') : ''}`;
      }),
    );
    // Payments a circle, Web shop a diamond, Organisation a triangle.
    expect(shapes).toHaveLength(3);
    expect(new Set(shapes).size).toBe(3);
    expect(shapes[0]).toBe('circle:');
    // The legend swatch repeats the shape of its series.
    const swatches = await chart
      .locator('.chart__legend .chart__mark > *')
      .evaluateAll((marks) => marks.map((mark) => mark.tagName));
    expect(swatches).toEqual(['circle', 'path', 'path']);
  });

  test('writes the end value of each line and keeps every label inside the figure and clear of the others', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    const { labels } = await labelBoxes(page, 'trend-chart');
    expect(labels.map((label) => label.text).sort()).toEqual(['1.21', '1.23', '1.36']);
    await expectLabelsClear(page, 'trend-chart');
    await expectLegibleText(page, 'trend-chart');
  });

  test('states every figure again in a table that names its rows, and a scope without a release in a row of its own', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    const table = page.getByRole('table', { name: 'Released assessments of every scope' });
    await expect(table).toBeVisible();
    await expect(table.getByRole('columnheader')).toHaveText([
      'Assessment',
      'Scope',
      'Date',
      'Overall score',
      'Model version',
    ]);
    expect(await rowsOf(page, 'trend-table')).toEqual([
      ['Payments 2025 Q4', 'Payments', 'Dec 8, 2025', '0.96', 'v2.2.0'],
      ['Payments 2026 Q2', 'Payments', 'Jun 16, 2026', '1.36', 'v2.2.0'],
      ['No released assessment yet', 'Identity Platform', 'None', 'None', 'None'],
      ['Web shop 2026 Q3', 'Web shop', 'Sep 22, 2026', '1.23', 'v2.2.0'],
      ['Organisation 2026 H1', 'Organisation', 'May 4, 2026', '1.21', 'v2.2.0'],
    ]);
    // Each row head is the assessment, which opens it.
    await table.getByRole('link', { name: 'Payments 2026 Q2' }).click();
    await expect(page).toHaveURL('/samm/payments/2026-q2');
  });

  test('opens one scope by business function from the picker, from the table and from the dashboard', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    await choose(page, 'trend-scope', 'Payments');
    await expect(page).toHaveURL(trendAddress('payments'));
    await expect(page.getByTestId('trend-functions-chart')).toBeVisible();
    await expect(page.getByTestId('trend-scope')).toHaveValue('payments');
    await page.getByTestId('trend-all').click();
    await expect(page).toHaveURL(TREND_ADDRESS);
    await expect(page.getByTestId('trend-chart')).toBeVisible();
    await page
      .getByTestId('trend-table')
      .getByRole('link', { name: 'Web shop', exact: true })
      .click();
    await expect(page).toHaveURL(trendAddress('shop'));
    await expect(page.getByTestId('trend-functions-chart')).toBeVisible();
  });

  test('says in a notice which model versions the scopes were assessed with, and which assessments are left out', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#trend-mixed-models');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    const versions = page.getByTestId('trend-versions');
    await expect(versions).toContainText(
      'The scopes were assessed with different versions of the model',
    );
    await expect(versions).toContainText('v2.2.0: Payments, Organisation');
    await expect(versions).toContainText('v2.1.0: Web shop');
    // Payments has one assessment of another version: counted, never drawn.
    const omitted = page.getByTestId('trend-omitted');
    await expect(omitted.getByRole('listitem')).toHaveCount(1);
    await expect(omitted).toContainText(
      'Payments: one released assessment taken with another model version is not shown; only v2.2.0 is drawn.',
    );
    // Both versions stay on one scale, in the one chart.
    await expect(page.getByTestId('trend-chart').locator('[data-series]')).toHaveCount(3);
    expect((await rowsOf(page, 'trend-table')).map((row) => row[4])).toEqual([
      'v2.2.0',
      'None',
      'v2.1.0',
      'v2.2.0',
    ]);
  });

  test('draws five scopes and leaves the sixth to the table, which says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The mock has four scopes; the answer is extended by two copies of Web shop, so that a sixth line would be drawn.
    await patchRead(page, `**${TREND_PATH}`, (trend) => {
      const shop = trend.scopes.find((scope) => scope.scope === 'shop');
      const copy = (id, title) => ({
        ...shop,
        scope: id,
        title,
        points: shop.points.map((point) => ({ ...point, assessment: `${id}-1`, title })),
      });
      return {
        ...trend,
        scopes: [...trend.scopes, copy('extra-a', 'Extra A'), copy('extra-b', 'Extra B')],
      };
    });
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    const chart = page.getByTestId('trend-chart');
    await expect(chart.getByRole('list', { name: 'Scopes' }).getByRole('listitem')).toHaveText([
      'Payments',
      'Web shop',
      'Organisation',
      'Extra A',
    ]);
    // Extra A is the fifth scope of the list (Identity Platform keeps the second place): the fifth colour, the cross.
    await expect(chart.locator('[data-series="extra-a"].series--5')).toHaveCount(1);
    await expect(chart.locator('[data-series="extra-b"]')).toHaveCount(0);
    await expect(chart.locator('[class*="series--6"]')).toHaveCount(0);
    await expect(page.getByTestId('trend-beyond')).toHaveText(
      'Extra B is in the table only: the chart draws the first five scopes.',
    );
    await expect(page.getByTestId('trend-row-extra-b-extra-b-1')).toBeVisible();
    await expectLabelsClear(page, 'trend-chart');
  });

  test('an unknown scope is a notice, and every scope is shown instead', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('nope'), 'samm-trend-view');
    const notice = page.getByTestId('trend-scope-unknown');
    await expect(notice).toContainText('No scope of this name');
    await expect(notice).toContainText('All scopes are shown instead.');
    await expect(page.getByTestId('trend-chart')).toBeVisible();
    await expect(page.getByTestId('trend-scope')).toHaveValue('');
  });

  test('the empty installation has no scope and says so', async ({ page, request }) => {
    await useScenario(request, 'empty');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    await expect(page.getByTestId('samm-trend-view')).toContainText('No scope yet');
    await expect(page.getByTestId('trend-chart')).toHaveCount(0);
  });

  test('a person with the right to read the assessments reads the trend in release, too', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    await expect(page.getByTestId('trend-chart')).toBeVisible();
  });

  test('is read in German, with the decimal comma and the German dates', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, TREND_ADDRESS, 'samm-trend-view');
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('SAMM-Reifegrad im Verlauf');
    const chart = page.getByTestId('trend-chart');
    await expect(chart.getByRole('list', { name: 'Bereiche' })).toBeVisible();
    await expect(chart.locator('[data-series="payments"] .chart__value')).toHaveText('1,36');
    expect(await rowsOf(page, 'trend-table')).toContainEqual([
      'Payments 2026 Q2',
      'Payments',
      '16.06.2026',
      '1,36',
      'v2.2.0',
    ]);
    await expect(page.getByTestId('trend-table').getByRole('columnheader')).toHaveText([
      'Assessment',
      'Bereich',
      'Datum',
      'Gesamtwert',
      'Modellversion',
    ]);
    await expectLabelsClear(page, 'trend-chart');
  });
});

test.describe('the trend of one scope', () => {
  test('draws the five business functions in the order and the names of the model, one colour each', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('payments'), 'samm-trend-view');
    await expect(page.getByTestId('samm-trend-view')).toContainText(
      'The five business functions of Payments over its released assessments.',
    );
    const chart = page.getByTestId('trend-functions-chart');
    await expect(chart).toBeVisible();
    await expect(
      chart.getByRole('list', { name: 'Business functions' }).getByRole('listitem'),
    ).toHaveText(FUNCTIONS.map((fn) => fn.name));
    await expect(
      chart.getByRole('img', { name: 'Scores of the business functions of Payments' }),
    ).toBeVisible();
    for (const [index, fn] of FUNCTIONS.entries()) {
      const series = chart.locator(`[data-series="${fn.id}"]`);
      await expect(chart.locator(`[data-series="${fn.id}"].series--${index + 1}`)).toHaveCount(1);
      await expect(series.locator('.chart__line')).toHaveCSS(
        'stroke',
        await tokenColour(page, `--color-series-${index + 1}`),
      );
      await expect(series.locator('.chart__value')).toHaveText(fn.end);
    }
    await expectLabelsClear(page, 'trend-functions-chart');
    await expectLegibleText(page, 'trend-functions-chart');
  });

  test('states every point again in a table with a column for each business function', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('payments'), 'samm-trend-view');
    const table = page.getByRole('table', { name: 'Assessments of Payments' });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Assessment',
      'Date',
      'Overall score',
      ...FUNCTIONS.map((fn) => fn.name),
    ]);
    expect(await rowsOf(page, 'trend-functions-table')).toEqual([
      ['Payments 2025 Q4', 'Dec 8, 2025', '0.96', '0.96', '1', '1.25', '0.83', '0.75'],
      ['Payments 2026 Q2', 'Jun 16, 2026', '1.36', '1.42', '1.67', '1.54', '0.96', '1.21'],
    ]);
  });

  test('leads on to every scope, to the comparison of this scope and to the scope in SAMM', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('payments'), 'samm-trend-view');
    await page.getByTestId('trend-compare').click();
    await expect(page).toHaveURL(compareAddress('payments'));
    await expect(page.getByTestId('samm-compare-view')).toBeVisible();
    await page.goBack();
    await page.getByRole('link', { name: 'Open the scope in SAMM' }).click();
    await expect(page).toHaveURL('/samm/payments');
    await page.goBack();
    await page.getByTestId('trend-point-2025-q4').getByRole('link').click();
    await expect(page).toHaveURL('/samm/payments/2025-q4');
  });

  test('draws a scope with one released assessment, and says there is nothing to draw for one with none', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('shop'), 'samm-trend-view');
    await expect(page.getByTestId('trend-functions-chart')).toBeVisible();
    await expect(page.getByTestId('trend-point-2026-q3')).toBeVisible();
    await expectLabelsClear(page, 'trend-functions-chart');
    await page.goto(trendAddress('identity'));
    await expect(page.getByTestId('trend-scope-section')).toContainText(
      'Identity Platform has no released assessment, so there is no trend to draw.',
    );
    await expect(page.getByTestId('trend-functions-chart')).toHaveCount(0);
  });

  test('names the assessments of another model version it leaves out', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#trend-mixed-models');
    await loginToReports(page, trendAddress('payments'), 'samm-trend-view');
    await expect(page.getByTestId('trend-omitted')).toHaveText(
      'Payments: one released assessment taken with another model version is not shown; only v2.2.0 is drawn.',
    );
    await expect(page.getByTestId('trend-functions-table').locator('tbody tr')).toHaveCount(1);
  });

  test('is read in German', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, trendAddress('payments'), 'samm-trend-view');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('samm-trend-view')).toContainText(
      'Die fünf Geschäftsfunktionen von Payments über seine freigegebenen Assessments.',
    );
    await expect(
      page.getByTestId('trend-functions-chart').getByRole('list', { name: 'Geschäftsfunktionen' }),
    ).toBeVisible();
    await expect(
      page.getByTestId('trend-functions-chart').locator('[data-series="governance"] .chart__value'),
    ).toHaveText('1,42');
  });
});

test.describe('the comparison of two assessments', () => {
  test('starts with the scope, then offers the pairs of released assessments and the two pickers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, COMPARE_ADDRESS, 'samm-compare-view');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Compare two assessments');
    await expect(page.getByTestId('compare-from')).toHaveCount(0);
    await choose(page, 'compare-scope', 'Payments');
    await expect(page).toHaveURL(compareAddress('payments'));
    // The pairs are the neighbouring released assessments: the draft of 2026 Q4 is none of them.
    const pairs = page.getByTestId('compare-pairs').getByRole('link');
    await expect(pairs).toHaveText(['Payments 2025 Q4 and Payments 2026 Q2']);
    // The pickers offer every assessment of the scope, the earliest first, with its day and state.
    for (const picker of ['compare-from', 'compare-to']) {
      expect(await page.getByTestId(picker).locator('option').allTextContents(), picker).toEqual([
        'Choose an assessment',
        ...PAYMENTS_ASSESSMENTS.map((entry) => entry.option),
      ]);
    }
  });

  test('says why two assessments cannot be compared yet, and compares them once they are chosen', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, compareAddress('payments'), 'samm-compare-view');
    const show = page.getByTestId('compare-show');
    await expect(show).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('samm-compare-view')).toContainText(
      'Choose the two assessments first.',
    );
    await choose(page, 'compare-from', PAYMENTS_ASSESSMENTS[1].option);
    await choose(page, 'compare-to', PAYMENTS_ASSESSMENTS[1].option);
    await expect(show).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('samm-compare-view')).toContainText(
      'Choose two different assessments.',
    );
    await choose(page, 'compare-from', PAYMENTS_ASSESSMENTS[0].option);
    await expect(show).toHaveAttribute('href', compareAddress('payments', '2025-q4', '2026-q2'));
    await show.click();
    await expect(page).toHaveURL(compareAddress('payments', '2025-q4', '2026-q2'));
    await expect(page.getByTestId('compare-result')).toBeVisible();
    // The pickers follow the address.
    await expect(page.getByTestId('compare-from')).toHaveValue('2025-q4');
    await expect(page.getByTestId('compare-to')).toHaveValue('2026-q2');
  });

  test('a pair opens its comparison', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, compareAddress('payments'), 'samm-compare-view');
    await page.getByTestId('compare-pairs').getByRole('link').click();
    await expect(page).toHaveURL(compareAddress('payments', '2025-q4', '2026-q2'));
    await expect(page.getByTestId('compare-result')).toBeVisible();
  });

  test('offers a pair for every two neighbouring released assessments, in the order of their days', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The mock has two released assessments of Payments; a third, released between the draft and the second, is added.
    await patchRead(page, '**/api/v1/samm/scopes/payments', (scope) => {
      const released = scope.assessments.find((entry) => entry.id === '2026-q2');
      return {
        ...scope,
        assessments: [
          ...scope.assessments,
          { ...released, id: '2026-q3', title: 'Payments 2026 Q3', date: '2026-09-01' },
        ],
      };
    });
    await loginToReports(page, compareAddress('payments'), 'samm-compare-view');
    await expect(page.getByTestId('compare-pairs').getByRole('link')).toHaveText([
      'Payments 2025 Q4 and Payments 2026 Q2',
      'Payments 2026 Q2 and Payments 2026 Q3',
    ]);
    await page.getByTestId('compare-pairs').getByRole('link').nth(1).click();
    await expect(page).toHaveURL(compareAddress('payments', '2026-q2', '2026-q3'));
  });

  test('shows the overall score and each business function as a dumbbell, and states them again in a table', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await openPair(page);
    const chart = page.getByTestId('compare-chart');
    await expect(
      chart.getByRole('list', {
        name: /^Scores of Payments 2025 Q4 and Payments 2026 Q2 by business function$/,
      }),
    ).toBeVisible();
    // The legend names the ring (the earlier assessment) and the dot (the later one).
    await expect(chart.locator('.dumbbell__legend')).toContainText(PAIR.fromTitle);
    await expect(chart.locator('.dumbbell__legend')).toContainText(PAIR.toTitle);
    for (const row of PAIR.functions) {
      const line = page.getByTestId(`dumbbell-${row.id}`);
      await expect(line.locator('.dumbbell__values')).toHaveText(`${row.from} to ${row.to}`);
      await expect(line.locator('.dumbbell__change')).toHaveText(row.change);
    }
    const table = page.getByRole('table', {
      name: 'Scores of both assessments by business function',
    });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Business function',
      'Earlier',
      'Later',
      'Change',
    ]);
    expect(await rowsOf(page, 'compare-table')).toEqual([
      ['Overall score', '0.96', '1.36', '+0.4'],
      ['Governance', '0.96', '1.42', '+0.46'],
      ['Design', '1', '1.67', '+0.67'],
      ['Implementation', '1.25', '1.54', '+0.29'],
      ['Verification', '0.83', '0.96', '+0.13'],
      ['Operations', '0.75', '1.21', '+0.46'],
    ]);
  });

  test('draws the ring and the dot in different forms, the colour of the function and no colour for the overall score', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await openPair(page);
    const governance = page.getByTestId('dumbbell-governance');
    const slot = await tokenColour(page, '--color-series-1');
    await expect(governance.locator('.dumbbell__bar')).toHaveCSS('background-color', slot);
    // The dot is filled with the colour; the ring is the colour on the sheet: a form, not only a colour, tells them apart.
    await expect(governance.locator('.dumbbell__dot--at')).toHaveCSS('background-color', slot);
    await expect(governance.locator('.dumbbell__ring--at')).not.toHaveCSS('background-color', slot);
    const operations = page.getByTestId('dumbbell-operations');
    await expect(operations.locator('.dumbbell__bar')).toHaveCSS(
      'background-color',
      await tokenColour(page, '--color-series-5'),
    );
    // The overall score is in the ink of the app, not in a series colour.
    await expect(page.getByTestId('dumbbell-overall').locator('.dumbbell__bar')).toHaveCSS(
      'background-color',
      await tokenColour(page, '--color-brand'),
    );
    await expectLegibleText(page, 'compare-chart', 12);
  });

  test('opens the practices of a business function with their streams, closed until asked', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await openPair(page);
    const disclosure = page.getByTestId('compare-practices-governance');
    await expect(disclosure).not.toHaveAttribute('open', '');
    await expect(page.getByTestId('dumbbell-governance-sm')).toBeHidden();
    await disclosure.getByText('Practices of Governance').click();
    const practice = page.getByTestId(`dumbbell-governance-${PAIR.practice.id}`);
    await expect(practice).toBeVisible();
    await expect(practice.locator('.dumbbell__values')).toHaveText(
      `${PAIR.practice.from} to ${PAIR.practice.to}`,
    );
    await expect(practice.locator('.dumbbell__change')).toHaveText(PAIR.practice.change);
    for (const stream of PAIR.streams) {
      const row = page.getByTestId(`dumbbell-governance-sm-${stream.letter}`);
      await expect(row).toContainText(`Stream ${stream.letter}`);
      await expect(row.locator('.dumbbell__values')).toHaveText(`${stream.from} to ${stream.to}`);
      await expect(row.locator('.dumbbell__change')).toHaveText(stream.change);
    }
    // The practices are named as the model names them, not by their ids.
    await expect(practice.locator('.dumbbell__name')).toHaveText('Strategy and Metrics');
    await expect(page.getByTestId('compare-trend')).toHaveAttribute(
      'href',
      trendAddress('payments'),
    );
  });

  test('refuses to compare two model versions, naming both assessments and both versions', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#model-versions-differ');
    await loginToReports(page, compareAddress(PAIR.scope, PAIR.from, PAIR.to), 'samm-compare-view');
    const notice = page.getByTestId('compare-differ');
    await expect(notice).toContainText('These assessments are not compared');
    // The refusal names the assessments and versions the server compared; the page names them by their titles where it knows them.
    await expect(notice).toContainText(
      `${DIFFER.from.title} was taken with model version ${DIFFER.from.modelVersion}`,
    );
    await expect(notice).toContainText(`${DIFFER.to.title} with ${DIFFER.to.modelVersion}`);
    await expect(notice).toContainText('The scores of each assessment stay readable.');
    await expect(page.getByTestId('compare-result')).toHaveCount(0);
    await expect(page.getByTestId('compare-chart')).toHaveCount(0);
  });

  test('an assessment that is none of the scope is a notice, and the pickers stay', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, compareAddress(PAIR.scope, 'nope', PAIR.to), 'samm-compare-view');
    const notice = page.getByTestId('compare-missing');
    await expect(notice).toContainText('An assessment is missing');
    await expect(notice).toContainText('is no assessment of this scope');
    await expect(page.getByTestId('compare-to')).toHaveValue('2026-q2');
    await expect(page.getByTestId('compare-result')).toHaveCount(0);
  });

  test('an unknown scope is the page that is not found', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    // The mock answers a scope it does not know with MOCK_NO_ROUTE; the server answers NOT_FOUND, as here.
    await page.route('**/api/v1/samm/scopes/nope', (route) =>
      route.fulfill({ status: 404, json: { outcome: 'NOT_FOUND' } }),
    );
    await loginToReports(page, compareAddress('nope'), 'not-found-view');
  });

  test('a scope with fewer than two assessments has nothing to compare', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, compareAddress('shop'), 'samm-compare-view');
    await expect(page.getByTestId('compare-too-few')).toHaveText(
      'This scope has fewer than two assessments, so there is nothing to compare yet.',
    );
    await expect(page.getByTestId('compare-pairs')).toHaveCount(0);
  });

  test('the empty installation has no scope to compare', async ({ page, request }) => {
    await useScenario(request, 'empty');
    await loginToReports(page, COMPARE_ADDRESS, 'samm-compare-view');
    await expect(page.getByTestId('samm-compare-view')).toContainText('No scope yet');
  });

  test('is read in German, the refusal included', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await openPair(page);
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Zwei Assessments vergleichen',
    );
    await expect(page.getByTestId('dumbbell-governance').locator('.dumbbell__values')).toHaveText(
      '0,96 bis 1,42',
    );
    await expect(page.getByTestId('compare-table').getByRole('columnheader')).toHaveText([
      'Geschäftsfunktion',
      'Früher',
      'Später',
      'Änderung',
    ]);
    await useScenario(request, 'workshop#model-versions-differ');
    await page.reload();
    await expect(page.getByTestId('compare-differ')).toContainText(
      'Diese Assessments werden nicht verglichen',
    );
    await expect(page.getByTestId('compare-differ')).toContainText(
      'Werte verschiedener Modellversionen werden nicht verglichen.',
    );
  });
});

test.describe('the threat evaluation', () => {
  test('lists the models in the order of their review, with the need, the last review and the threats', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Threat evaluation');
    await expect(page.getByTestId('threat-evaluation-summary')).toHaveText(
      '6 threat models: 13 open threats, 10 untreated, 2 reviews overdue.',
    );
    const table = page.getByRole('table', {
      name: 'Threat models with their review and their threats',
    });
    await expect(table.getByRole('columnheader')).toHaveText([
      'Service',
      'Protection need',
      'Last review',
      'Review due',
      'Open',
      'Untreated',
      'Transferred',
    ]);
    expect(await rowIds(page, 'threat-evaluation-table', 'threat-row-')).toEqual(
      MODELS.map((model) => `${model.service}-${model.model}`),
    );
    for (const model of MODELS) {
      const row = page.getByTestId(`threat-row-${model.service}-${model.model}`);
      await expect(row.locator('th a')).toHaveText(model.name);
      await expect(row.locator('th')).toContainText(`Model ${model.model}`);
      const cells = await row.locator('td').allTextContents();
      expect(cells[0].trim(), model.service).toBe(model.need);
      expect(
        cells.slice(3).map((cell) => cell.trim()),
        model.service,
      ).toEqual(model.counts);
    }
    const portal = page.getByTestId('threat-row-customer-portal-portal');
    await expect(portal).toContainText('Dec 2, 2025');
    await expect(portal).toContainText('359 days ago');
    await expect(portal).toContainText('Jun 2, 2026');
    await expect(portal).toContainText('Every 6 months');
    await expect(portal).toContainText('Release 2');
    await expect(
      page.getByTestId('threat-row-notification-service-notification-flows'),
    ).toContainText('No review yet');
    await expect(
      page.getByTestId('threat-row-notification-service-notification-flows'),
    ).toContainText('Draft');
  });

  test('tells the state of every review in words, and a box only for the two that need the person', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    const tones = {
      'Overdue by 177 days': 'danger',
      'Overdue by 43 days': 'danger',
      'Due in 5 days': 'attention',
      'In date': 'success',
      'Not released yet': 'neutral',
    };
    for (const model of MODELS) {
      const status = page.getByTestId(`threat-status-${model.service}-${model.model}`);
      await expect(status).toHaveText(model.status);
      await expect(status).toHaveAttribute('data-tone', tones[model.status]);
      // A box (the reason badge) is for overdue and due soon; the others are a dot with their words.
      await expect(status.locator('xpath=self::*[contains(@class, "reason")]')).toHaveCount(
        model.badge ? 1 : 0,
      );
    }
  });

  test('changes the order with the control and keeps the order of the server as the first one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    const sort = page.getByTestId('threat-evaluation-sort');
    await expect(sort).toHaveValue('');
    for (const [label, services] of Object.entries(ORDERS)) {
      await choose(page, 'threat-evaluation-sort', label);
      const ids = await rowIds(page, 'threat-evaluation-table', 'threat-row-');
      expect(
        ids.map((id) => MODELS.find((model) => id === `${model.service}-${model.model}`).service),
        label,
      ).toEqual(services);
    }
    await choose(page, 'threat-evaluation-sort', 'Review due first');
    expect(await rowIds(page, 'threat-evaluation-table', 'threat-row-')).toEqual(
      MODELS.map((model) => `${model.service}-${model.model}`),
    );
  });

  test('lists the services without a model under the table', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    const without = page.getByTestId('threat-evaluation-without');
    await expect(without.getByRole('heading', { level: 2 })).toHaveText(
      'Services without a threat model',
    );
    expect(await rowsOf(page, 'threat-evaluation-without-table')).toEqual(
      WITHOUT_MODEL.map((entry) => [entry.name, entry.owner, 'Normal', entry.state]),
    );
    await page.getByTestId('threat-without-report-scheduler').getByRole('link').click();
    await expect(page).toHaveURL('/threat-models/report-scheduler');
  });

  test('a model opens its sheet in the lens Threat models', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    await page.getByTestId('threat-row-payment-api-checkout-flow').getByRole('link').click();
    await expect(page).toHaveURL('/threat-models/payment-api/checkout-flow');
  });

  test('a person without the right to read the threat models is told so and sees no table', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    const notice = page.getByTestId('threat-forbidden');
    await expect(notice).toContainText('The threat models are not open to you');
    await expect(notice).toContainText('Reading the threat models needs the right to read them');
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    await expect(page.getByTestId('threat-evaluation-without')).toHaveCount(0);
  });

  test('without threat models every service is one that has none, the very high ones first', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#no-threat-models');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    await expect(page.getByTestId('threat-evaluation-none')).toHaveText(
      'No service has a threat model yet.',
    );
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    expect(await rowIds(page, 'threat-evaluation-without-table', 'threat-without-')).toEqual(
      WITHOUT_ALL,
    );
  });

  test('the empty installation has no service and says where to add them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    await expect(page.getByTestId('threat-evaluation-view')).toContainText(
      'No service in the catalog',
    );
    await expect(page.getByTestId('threat-evaluation-table')).toHaveCount(0);
    // No service: nothing is said about services without a model, least of all that every one has one.
    await expect(page.getByTestId('threat-evaluation-without')).toHaveCount(0);
  });

  test('is read in German, the words of the reviews included', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, THREATS_ADDRESS, 'threat-evaluation-view');
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Bedrohungsauswertung');
    await expect(page.getByTestId('threat-evaluation-summary')).toHaveText(
      '6 Bedrohungsmodelle: 13 offene Bedrohungen, 10 unbehandelt, 2 Überprüfungen überfällig.',
    );
    await expect(page.getByTestId('threat-status-customer-portal-portal')).toHaveText(
      'Seit 177 Tagen überfällig',
    );
    await expect(page.getByTestId('threat-status-payment-api-checkout-flow')).toHaveText(
      'In 5 Tagen fällig',
    );
    await expect(page.getByTestId('threat-status-reporting-report-generation')).toHaveText(
      'Fristgerecht',
    );
    await expect(page.getByTestId('threat-row-customer-portal-portal')).toContainText('02.12.2025');
    await expect(page.getByTestId('threat-row-customer-portal-portal')).toContainText(
      'Alle 6 Monate',
    );
  });
});

test.describe('the risk register', () => {
  test('shows the register as it is now, with the reviews that are overdue or due soon flagged', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Risk register as of a day');
    await expect(page.getByTestId('risk-result')).toContainText(
      'The released risks as they are now.',
    );
    await expect(page.getByTestId('risk-count')).toHaveText('7 released risks');
    await expect(page.getByTestId('risk-now')).toHaveCount(0);
    expect(await rowIds(page, 'risk-table', 'risk-row-')).toEqual(
      RISKS_NOW.map((risk) => risk.entry),
    );
    for (const risk of RISKS_NOW) {
      const row = page.getByTestId(`risk-row-${risk.entry}`);
      await expect(row).toContainText(risk.id);
      await expect(row).toContainText(risk.rating);
      await expect(row).toContainText(`Version ${risk.version}`);
      await expect(page.getByTestId(`risk-link-${risk.entry}`)).toHaveAttribute(
        'href',
        risk.address,
      );
      if (risk.review)
        await expect(page.getByTestId(`risk-review-${risk.entry}`)).toHaveText(risk.review);
      else await expect(page.getByTestId(`risk-review-${risk.entry}`)).toHaveCount(0);
    }
    await expect(page.getByTestId('risk-review-r-007')).toHaveAttribute('data-tone', 'danger');
    await expect(page.getByTestId('risk-review-r-012')).toHaveAttribute('data-tone', 'attention');
    await expect(page.getByTestId('risk-row-r-009')).toContainText(
      'Payment API, checkout flow: T-07',
    );
    // The tags of the register are offered to choose from.
    expect(await page.getByTestId('risk-tag').locator('option').allTextContents()).toEqual([
      'No tag chosen',
      ...TAGS.map((tag) => tag.option),
    ]);
  });

  test('shows the register as of a day: the entries as they were at the commit read, each opening as it was', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await page.getByTestId('risk-asof').fill('2026-03-01');
    await page.getByTestId('risk-show').click();
    await expect(page).toHaveURL(risksAddress('2026-03-01'));
    const expected = RISKS_AS_OF['2026-03-01'];
    await expect(page.getByTestId('risk-result')).toContainText(
      'The released risks at the end of Mar 1, 2026.',
    );
    await expect(page.getByTestId('risk-result')).toContainText(expected.commit);
    await expect(page.getByTestId('risk-count')).toHaveText('3 released risks');
    expect(await rowIds(page, 'risk-table', 'risk-row-')).toEqual(
      expected.risks.map(([entry]) => entry),
    );
    for (const [entry, rating, version] of expected.risks) {
      await expect(page.getByTestId(`risk-row-${entry}`)).toContainText(rating);
      await expect(page.getByTestId(`risk-link-${entry}`)).toHaveAttribute(
        'href',
        `/isms/risks/${entry}?at=v${version}`,
      );
    }
    // The commit read is the last one before the day: the page says so, and keeps the value in the field.
    await expect(page.getByTestId('risk-earlier-commit')).toHaveText(
      'No commit was made on this day itself: the last one before it is shown.',
    );
    await expect(page.getByTestId('risk-asof')).toHaveValue('2026-03-01');
    // A risk of that day opens as it was then.
    await page.getByTestId('risk-link-r-004').click();
    await expect(page).toHaveURL('/isms/risks/r-004?at=v1');
  });

  test('the register of a day is only read: no review is flagged', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    for (const value of [
      '2026-03-01',
      '2026-06-30',
      'audit-2026-03',
      'management-review-2026-06',
    ]) {
      await loginToReports(page, risksAddress(value), 'risk-register-view');
      await expect(page.getByTestId('risk-table')).toBeVisible();
      await expect(page.locator('[data-testid^="risk-review-"]'), value).toHaveCount(0);
    }
  });

  test('shows the register as of a tag, with the day the tag marks and the commit it points to', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await choose(page, 'risk-tag', TAGS[0].option);
    await expect(page.getByTestId('risk-asof')).toHaveValue(TAGS[0].tag);
    await page.getByTestId('risk-show').click();
    await expect(page).toHaveURL(risksAddress(TAGS[0].tag));
    await expect(page.getByTestId('risk-result')).toContainText(
      `The released risks at the tag ${TAGS[0].tag}, which marks Jun 18, 2026.`,
    );
    await expect(page.getByTestId('risk-result')).toContainText(TAGS[0].commit);
    await expect(page.getByTestId('risk-tag')).toHaveValue(TAGS[0].tag);
    // A tag names its commit: there is no "last commit before" to explain.
    await expect(page.getByTestId('risk-earlier-commit')).toHaveCount(0);
    expect(await rowIds(page, 'risk-table', 'risk-row-')).toEqual(
      RISKS_AS_OF[TAGS[0].tag].risks.map(([entry]) => entry),
    );
    await page.getByTestId('risk-now').click();
    await expect(page).toHaveURL(RISKS_ADDRESS);
    await expect(page.getByTestId('risk-count')).toHaveText('7 released risks');
  });

  test('a day before the first commit says the register had none, and lists no risk', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, risksAddress('2025-06-01'), 'risk-register-view');
    await expect(page.getByTestId('risk-before-first')).toHaveText(
      'The register had no commit yet on this day.',
    );
    await expect(page.getByTestId('risk-result')).toContainText(
      'The register held no released risk at the end of Jun 1, 2025.',
    );
    await expect(page.getByTestId('risk-table')).toHaveCount(0);
  });

  test('refuses what the server refuses beside the field, keeps the value, and shows no register for it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    const refused = {
      FUTURE: 'This day has not come yet. Choose today or an earlier day.',
      PATTERN: 'Use a day such as 2026-03-01 or the name of a tag.',
      UNKNOWN_TAG: 'No tag of the register has this name.',
    };
    for (const [code, value] of Object.entries(REFUSED_AS_OF)) {
      await page.getByTestId('risk-asof').fill(value);
      await page.getByTestId('risk-show').click();
      await expect(page).toHaveURL(risksAddress(value));
      await expect(page.getByTestId('risk-asof-form'), code).toContainText(refused[code]);
      await expect(page.getByTestId('risk-asof'), code).toHaveValue(value);
      await expect(page.getByTestId('risk-asof'), code).toHaveAttribute('aria-invalid', 'true');
      await expect(page.getByTestId('risk-refused'), code).toContainText(
        'Nothing is shown for this value',
      );
      await expect(page.getByTestId('risk-table'), code).toHaveCount(0);
      // The tags stay to choose from although the value was refused.
      await expect(page.getByTestId('risk-tag').locator('option')).toHaveCount(TAGS.length + 1);
    }
    await page.getByTestId('risk-now').click();
    await expect(page.getByTestId('risk-table')).toBeVisible();
    await expect(page.getByTestId('risk-refused')).toHaveCount(0);
  });

  test('a value the address does not admit is refused by the page, without a request', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await clearActs(request);
    await page.getByTestId('risk-asof').fill('not a day!');
    await page.getByTestId('risk-show').click();
    await expect(page.getByTestId('risk-asof-form')).toContainText(
      'Use a day such as 2026-03-01 or the name of a tag.',
    );
    await expect(page).toHaveURL(RISKS_ADDRESS);
    expect(
      (await requested(request, RISKS_PATH)).filter((act) => act.path.includes('as-of')),
    ).toEqual([]);
  });

  test('says that the Git server cannot be reached for a past register, and leaves the register as it is now', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#risk-register-git-unavailable');
    await loginToReports(page, risksAddress('2026-03-01'), 'risk-register-view');
    const notice = page.getByTestId('risk-git-unavailable');
    await expect(notice).toContainText('The register of this day cannot be read now');
    await expect(notice).toContainText('The register as it is now stays available.');
    await expect(page.getByTestId('risk-table')).toHaveCount(0);
    await expect(page.getByTestId('risk-asof')).toHaveValue('2026-03-01');
    await page.getByTestId('risk-now').click();
    await expect(page.getByTestId('risk-table')).toBeVisible();
    await expect(page.getByTestId('risk-git-unavailable')).toHaveCount(0);
    // A day before the first commit needs no commit, and a value the server refuses is refused as ever.
    await page.goto(risksAddress('2025-06-01'));
    await expect(page.getByTestId('risk-before-first')).toBeVisible();
    await page.goto(risksAddress('2027-01-01'));
    await expect(page.getByTestId('risk-refused')).toBeVisible();
  });

  test('a register without a release says so, as of now and as of a day, and has no tag to name', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#risk-register-empty');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await expect(page.getByTestId('risk-result')).toContainText('No released risk');
    await expect(page.getByTestId('risk-result')).toContainText(
      'The register holds no released risk yet.',
    );
    await expect(page.getByTestId('risk-table')).toHaveCount(0);
    await expect(page.getByTestId('risk-tag')).toHaveCount(0);
    await page.goto(risksAddress('2026-03-01'));
    await expect(page.getByTestId('risk-result')).toContainText(
      'The register held no released risk at the end of Mar 1, 2026.',
    );
    // There is no tag at all: a tag name is refused as unknown.
    await page.goto(risksAddress('audit-2026-03'));
    await expect(page.getByTestId('risk-asof-form')).toContainText(
      'No tag of the register has this name.',
    );
  });

  test('a person without the right to read the register is told so', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    // The mock has no profile that reads the reports and not the register; the register answers as the server does.
    await page.route(`**${RISKS_PATH}**`, (route) =>
      route.fulfill({ status: 403, json: { outcome: 'FORBIDDEN' } }),
    );
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await expect(page.getByTestId('risk-forbidden')).toContainText(
      'The risk register is not open to you',
    );
    await expect(page.getByTestId('risk-table')).toHaveCount(0);
  });

  test('is read in German: the day, the tag, the refusal and the flags of the reviews', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToReports(page, RISKS_ADDRESS, 'risk-register-view');
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Risikoregister zu einem Stichtag',
    );
    await expect(page.getByTestId('risk-count')).toHaveText('7 freigegebene Risiken');
    await expect(page.getByTestId('risk-review-r-007')).toHaveText('Seit 8 Tagen überfällig');
    await expect(page.getByTestId('risk-review-r-012')).toHaveText('In 19 Tagen fällig');
    await page.goto(risksAddress('audit-2026-03'));
    await expect(page.getByTestId('risk-result')).toContainText(
      'Die freigegebenen Risiken bei der Marke audit-2026-03 vom 27.02.2026.',
    );
    await page.goto(risksAddress('2027-01-01'));
    await expect(page.getByTestId('risk-asof-form')).toContainText(
      'Dieser Tag ist noch nicht gekommen. Wählen Sie heute oder einen früheren Tag.',
    );
    await expect(page.getByTestId('risk-asof')).toHaveValue('2027-01-01');
  });
});

test.describe('the reports are read-only', () => {
  test('no page of the lens sends a request that changes anything', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    for (const [address, view] of [
      [REPORTS_ADDRESS, 'reports-view'],
      [TREND_ADDRESS, 'samm-trend-view'],
      [trendAddress('payments'), 'samm-trend-view'],
      [compareAddress(PAIR.scope, PAIR.from, PAIR.to), 'samm-compare-view'],
      [THREATS_ADDRESS, 'threat-evaluation-view'],
      [risksAddress('2026-03-01'), 'risk-register-view'],
    ]) {
      await loginToReports(page, address, view);
    }
    const writes = (await acts(request)).filter(
      (act) => act.method !== 'GET' && !act.path.startsWith('/api/v1/auth/'),
    );
    expect(writes).toEqual([]);
  });
});
