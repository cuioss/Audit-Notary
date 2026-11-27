import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { field, sentTo, useLanguage } from './helpers/documents.js';
import {
  ARCHIVE,
  CARD_DATA,
  CREATED,
  CREDENTIAL_STUFFING,
  DUE_PATH,
  LENS_ADDRESS,
  NEWSLETTER,
  NOW,
  OUTAGE,
  PHISHING,
  RULES,
  SCHEMA_PATH,
  STAGES,
  STAGE_NAMES,
  STATUS_WORDS,
  SUSPICIOUS,
  WRONG_RECIPIENT,
  YEARS,
  YEARS_PATH,
  YEAR_2025,
  YEAR_2026,
  changes,
  chooseStage,
  clockRow,
  clockStates,
  completePath,
  draftPath,
  incidentAddress,
  lastBody,
  loginToIncidents,
  loginToSheet,
  pinClock,
  readPath,
  refuseRead,
  reopenPath,
  reportPath,
  savePath,
  statusesOf,
  submitPath,
  tab,
  tabIds,
  tabStatuses,
  yearAddress,
  yearPath,
} from './helpers/incidents.js';
import { acts, broadcast, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { patchRead } from './helpers/samm.js';

/**
 * The lens Incidents as far as it is built (UC-IR-1, UC-IR-2, UC-IR-3, rest-api.adoc, Incident Report Requests): the years,
 * the incidents of a year, and the sheet of an incident with its stages, its deadline clock, the notices sent, the steps of
 * the workflow and the generated report. They run against the profiles `workshop`, `read-only`, `release` and `empty` of the
 * mock and its `incident-*` states (web-mock/README.adoc, Incident Reports). Part B of the lens (`/incidents/{year}/new` and
 * the release) is not built: only the way to it is tested here.
 *
 * The incidents, their stages and their deadlines are static fixtures of `helpers/incidents.js`; the first test compares
 * them with what the mock answers. The deadline clock compares with the clock of the page, so every page of this spec is
 * pinned to the instant the mock reads at (`NOW`, 2026-11-26T10:00:00Z); the suite pins the zone to Europe/Berlin.
 */

/**
 * @returns the ids of the rows of a list under a prefix of their test ids, in the order shown; waits for the list, which a
 *   column draws only once its read has answered
 */
async function rowIds(page, list, prefix) {
  await expect(page.getByTestId(list)).toBeVisible();
  return page
    .getByTestId(list)
    .locator('> li > a')
    .evaluateAll(
      (rows, start) => rows.map((row) => row.dataset.testid.slice(start.length)),
      prefix,
    );
}

/** @returns the status of every stage of a row of the list of a year, in the order shown */
async function rowStatuses(page, incident) {
  return page
    .getByTestId(`incident-${incident.id}`)
    .locator('li[data-status]')
    .evaluateAll((items) => items.map((item) => item.dataset.status));
}

test.describe('the fixtures of this spec', () => {
  test('the years, the lists, the stages, the deadlines and the report are what the mock answers', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page);
    const read = async (path) => {
      const answer = await page.request.get(path);
      expect(answer.status(), path).toBe(200);
      return answer.json();
    };

    // The years: the figures of the first column.
    const years = await read(YEARS_PATH);
    expect(years.today).toBe(NOW.slice(0, 10));
    expect(
      years.years.map(({ year, current, incidents, open, withMissedDeadline, retentionEnd }) => ({
        year,
        current,
        incidents,
        open,
        withMissedDeadline,
        retentionEnd,
      })),
    ).toEqual(YEARS);

    // The lists of the two years: the rows in the order of the list, with the status of every stage.
    for (const [year, incidents] of [
      [2026, YEAR_2026],
      [2025, YEAR_2025],
    ]) {
      const list = await read(yearPath(year));
      expect(
        list.incidents.map((row) => row.id),
        `the incidents of ${year}`,
      ).toEqual(incidents.map((entry) => entry.id));
      for (const [index, row] of list.incidents.entries()) {
        expect(row.title, row.id).toBe(incidents[index].title);
        expect(
          row.stages.map((stage) => stage.id),
          row.id,
        ).toEqual(STAGES);
        expect(
          row.stages.map((stage) => stage.status),
          row.id,
        ).toEqual(statusesOf(incidents[index].stages));
      }
    }

    // Every incident: the stages with what blocks them and what is marked, and the deadlines with their status.
    for (const incident of [...YEAR_2026, ...YEAR_2025]) {
      const body = await read(readPath(incident));
      expect(body.id).toBe(incident.id);
      expect(body.title, incident.slug).toBe(incident.title);
      expect(
        body.stages.map((stage) => stage.status),
        incident.slug,
      ).toEqual(statusesOf(incident.stages));
      expect(
        body.stages.map((stage) => stage.predecessorReopened),
        incident.slug,
      ).toEqual(incident.stages.map((mark) => mark === '^'));
      expect(
        body.stages.map((stage) => stage.unanswered),
        incident.slug,
      ).toEqual(incident.stages.map((mark) => mark === 'N*'));
      expect(
        body.deadlines.map((deadline) => [
          deadline.rule,
          deadline.element,
          deadline.status,
          deadline.sentAt,
        ]),
        incident.slug,
      ).toEqual(incident.deadlines);
    }

    // The stages that wait for another, and the ones that ask for a confirmation of the identity.
    const card = await read(readPath(CARD_DATA));
    expect(card.stages.map((stage) => stage.blockedBy)).toEqual([[], [], [], [], ['response']]);
    expect(card.stages.map((stage) => stage.stepUp)).toEqual([false, false, false, false, true]);
    expect(card.stages.map((stage) => stage.missing.length)).toEqual([0, 4, 0, 0, 5]);
    const suspicious = await read(readPath(SUSPICIOUS));
    expect(suspicious.stages.map((stage) => stage.missing.length)).toEqual([3, 0, 2, 0, 5]);
    expect(suspicious.stages.map((stage) => stage.blockedBy)).toEqual([
      [],
      [],
      ['triage'],
      [],
      ['response'],
    ]);
    const credential = await read(readPath(CREDENTIAL_STUFFING));
    expect(credential.transitions.map((transition) => transition.id)).toEqual(['incident.submit']);

    // The released incident is frozen at its release; its release `v1` is an earlier state of its own, a state that does not
    // exist is not found and a word that is no state is refused.
    const outage = await read(readPath(OUTAGE));
    expect(outage.frozen).toBe(true);
    expect(outage.asOf).toBe('2026-11-18T10:00:00Z');
    expect(outage.transitions).toEqual([]);
    const first = await read(`${readPath(OUTAGE)}?at=v1`);
    expect(first.at.ref).toBe('v1');
    expect((await page.request.get(`${readPath(OUTAGE)}?at=v9`)).status()).toBe(404);
    expect((await page.request.get(`${readPath(OUTAGE)}?at=zzz`)).status()).toBe(422);

    // The report: generated from the saved state, in the order of the template.
    const report = await read(reportPath(CARD_DATA));
    expect(report.source).toBe('generated');
    expect(report.asOf).toBe(NOW);
    expect([...report.adoc.matchAll(/^== (.*)$/gm)].map((match) => match[1])).toEqual([
      'Summary',
      'Affected services',
      'Deadlines',
      'Notifications',
      'Triage',
      'Privacy assessment',
      'Response',
      'Review',
    ]);
    const released = await read(reportPath(OUTAGE));
    expect(released.source).toBe('committed');

    // The Due list: three deadlines, each with its rule and status, and the address of the notices.
    const due = (await read(DUE_PATH)).items.filter((item) => item.kind === 'deadline');
    expect(due.map((item) => [item.address, item.deadline.rule, item.deadline.status])).toEqual([
      [incidentAddress(CARD_DATA, { stage: 'notifications' }), 'gdpr-art33', 'MISSED'],
      [incidentAddress(PHISHING, { stage: 'notifications' }), 'gdpr-art33', 'OPEN'],
      [incidentAddress(CARD_DATA, { stage: 'notifications' }), 'nis2-final-report', 'OPEN'],
    ]);

    // The schema: one part for the title and one for each stage.
    const schema = await read(SCHEMA_PATH);
    expect(schema.kinds.map((kind) => kind.id)).toEqual(['incident']);
    expect(Object.keys(schema.kinds[0].schema.properties)).toEqual(['title', ...STAGES]);
  });
});

test.describe('the years and the incidents of a year (UC-IR-1, UC-IR-2)', () => {
  test('lists the years the person may read, newest first, with their figures', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page);
    expect(await rowIds(page, 'year-list', 'year-')).toEqual(['2026', '2025']);
    const current = page.getByTestId('year-2026');
    await expect(current).toContainText('Current year');
    await expect(current).toContainText('One incident with a missed deadline');
    await expect(current).toContainText('7 incidents, 6 not released');
    await expect(current).toContainText('Kept until Dec 31, 2031');
    await expect(current).toHaveAttribute('href', yearAddress(2026));
    const earlier = page.getByTestId('year-2025');
    await expect(earlier).not.toContainText('Current year');
    await expect(earlier).toContainText('2 incidents, 0 not released');
    await expect(earlier).toContainText('Kept until Dec 31, 2030');
    // The year with the missed deadline and an incident that is not released is a box; the year whose incidents are all
    // released has the fact as a plain word.
    await expect(current.getByText('One incident with a missed deadline')).toBeVisible();
    await expect(page.getByTestId('year-missing')).toHaveCount(0);
    await expect(page.getByTestId('years-none')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incidents: the years');
  });

  test('a year lists its incidents newest awareness first, each with its stages and its deadlines', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    expect(await rowIds(page, 'incident-list', 'incident-')).toEqual(
      YEAR_2026.map((incident) => incident.id),
    );
    for (const incident of YEAR_2026) {
      const row = page.getByTestId(`incident-${incident.id}`);
      await expect(row).toContainText(incident.title);
      await expect(row).toHaveAttribute('href', incidentAddress(incident));
      expect(await rowStatuses(page, incident), incident.slug).toEqual(statusesOf(incident.stages));
    }
    // The words of a row: the state, the severity, the stages and the deadlines in figures.
    const card = page.getByTestId(`incident-${CARD_DATA.id}`);
    await expect(card).toContainText('Draft');
    await expect(card).toContainText('Severity: High');
    await expect(card).toContainText('2 deadlines missed');
    await expect(card).toContainText('1 open, 1 met');
    await expect(card).toContainText('Next: NIS2 final report, Dec 22, 2026');
    await expect(card).toContainText('Aware since Nov 19, 2026');
    const phishing = page.getByTestId(`incident-${PHISHING.id}`);
    await expect(phishing).toContainText('1 open, 0 met');
    await expect(phishing).toContainText('Next: Notice to the supervisory authority, Nov 27, 2026');
    const credential = page.getByTestId(`incident-${CREDENTIAL_STUFFING.id}`);
    await expect(credential).toContainText('No deadline applies');
    // A stage says its status in a word as well as in its mark.
    await expect(credential.getByRole('list', { name: 'Stages' })).toContainText('Does not apply');
    const outage = page.getByTestId(`incident-${OUTAGE.id}`);
    await expect(outage).toContainText('Released as v1');
    await expect(outage).toContainText('0 open, 4 met');
    await expect(page.getByTestId('year-2026')).toHaveAttribute('aria-current', 'page');
    await expectNoSeriousViolations(page, 'incidents: a year');
  });

  test('the year of the past lists its released incidents and has no way to a new one', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2025));
    expect(await rowIds(page, 'incident-list', 'incident-')).toEqual(
      YEAR_2025.map((incident) => incident.id),
    );
    await expect(page.getByTestId(`incident-${NEWSLETTER.id}`)).toContainText('Released as v1');
    await expect(page.getByTestId(`incident-${NEWSLETTER.id}`)).toContainText(
      'One deadline missed',
    );
    // The person edits the year of today only: a new incident belongs to the current year.
    await expect(page.getByTestId('new-incident-link')).toHaveCount(0);
  });

  test('the current year offers a new incident to a person who may edit, and the way leads to the page of part B', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    const link = page.getByTestId('new-incident-link');
    await expect(link).toHaveText('New incident');
    await expect(link).toHaveAttribute('href', '/incidents/2026/new');
    await link.click();
    // Part B of the lens is not built: the address shows the placeholder of the lens.
    await expect(page).toHaveURL('/incidents/2026/new');
    await expect(page.getByTestId('lens-view')).toBeVisible();
  });

  test('a row opens the sheet of its incident, and the way up leads back to the list of the year', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    await page.getByTestId(`incident-${CREDENTIAL_STUFFING.id}`).click();
    await expect(page).toHaveURL(incidentAddress(CREDENTIAL_STUFFING));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    // The sheet keeps the room it needs: the list of the year gives way to a way up to it.
    await page.getByRole('link', { name: 'Up to Incidents of 2026' }).click();
    await expect(page).toHaveURL(yearAddress(2026));
    await expect(page.getByTestId('incident-list')).toBeVisible();
  });

  test('a person who may only read gets the lists and no way to a new incident', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToIncidents(page, yearAddress(2026));
    expect(await rowIds(page, 'incident-list', 'incident-')).toEqual(
      YEAR_2026.map((incident) => incident.id),
    );
    await expect(page.getByTestId('new-incident-link')).toHaveCount(0);
    await expect(page.getByTestId('year-2025')).toBeVisible();
  });

  test('a person without a right on the incident repositories sees no year, and a year is not found', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'release');
    await loginToIncidents(page);
    await expect(page.getByTestId('years-none')).toContainText(
      'No incident reports are open to you',
    );
    await expect(page.getByTestId('year-list')).toHaveCount(0);
    // A year, or an incident, that the person may not read is not found: the lens does not say that it exists.
    await page.goto(yearAddress(2026));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(incidentAddress(CARD_DATA));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await expectNoSeriousViolations(page, 'incidents: no right');
  });

  test('the empty installation has no repository for incident reports and says where to ask', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'empty');
    await loginToIncidents(page);
    await expect(page.getByTestId('years-none')).toContainText(
      'No repository for incident reports is open to you yet.',
    );
    await expectNoSeriousViolations(page, 'incidents: empty');
  });

  test('a year that the server refuses to the person is told as a notice and not as an empty year', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await refuseRead(page, `**${yearPath(2026)}`, 403, {
      outcome: 'FORBIDDEN',
      message: 'No right on this year.',
    });
    await loginToIncidents(page, yearAddress(2026));
    await expect(page.getByTestId('incidents-forbidden')).toContainText(
      'This year is not open to you',
    );
    await expect(page.getByTestId('incident-list')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incidents: forbidden');
  });

  test('a year without a repository is told, and the earlier years stay readable', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-year-missing');
    await loginToIncidents(page);
    await expect(page.getByTestId('year-missing')).toContainText(
      'The repository of 2026 is not set up',
    );
    expect(await rowIds(page, 'year-list', 'year-')).toEqual(['2025']);
    await page.getByTestId('year-2025').click();
    await expect(page.getByTestId('incident-list')).toBeVisible();
    // The year of the address that has no repository is not found.
    await page.goto(yearAddress(2026));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await expectNoSeriousViolations(page, 'incidents: year missing');
  });

  test('a year without an incident says so', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await refuseRead(page, `**${yearPath(2026)}`, 200, {
      today: '2026-11-26',
      asOf: NOW,
      year: 2026,
      repository: 'isms-incidents-2026',
      truncated: false,
      incidents: [],
    });
    await loginToIncidents(page, yearAddress(2026));
    await expect(page.getByTestId('year-no-incidents')).toHaveText(
      'No incident was reported in 2026.',
    );
    await expect(page.getByTestId('new-incident-link')).toBeVisible();
  });

  test('an incident that does not exist, an unknown year and an earlier state that does not exist are not found', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The mock has no route for an incident it does not know, so the 404 of the contract is answered here.
    await refuseRead(page, `**${readPath(CARD_DATA)}`, 404, {
      outcome: 'NOT_FOUND',
      message: 'No such incident.',
    });
    await loginToIncidents(page, LENS_ADDRESS);
    await page.goto(incidentAddress(CARD_DATA));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto('/incidents/2024');
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await page.goto(incidentAddress(OUTAGE, { at: 'v9' }));
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });
});

test.describe('the stages as tabs (UC-IR-1)', () => {
  test('shows one tab for every stage in the order of the declaration, each with its status in words', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA);
    const tabs = page.getByTestId('stage-tabs');
    await expect(tabs).toHaveAttribute('role', 'tablist');
    await expect(tabs).toHaveAccessibleName('Stages of the incident');
    await expect(tabs.getByRole('tab')).toHaveCount(STAGES.length);
    // The tabs stand in the order of the declaration: on this incident two of them are open, so the statuses alone would
    // not show two that changed places.
    expect(await tabIds(page)).toEqual(STAGES);
    expect(await tabStatuses(page)).toEqual(statusesOf(CARD_DATA.stages));
    for (const [index, stage] of STAGES.entries()) {
      await expect(tab(page, stage)).toContainText(STAGE_NAMES[stage].en);
      await expect(tab(page, stage)).toContainText(
        STATUS_WORDS[statusesOf(CARD_DATA.stages)[index]],
      );
    }
    // The stage that is ready to be worked on is the one the sheet opens: the first that is open and waits for none.
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByTestId('stage-panel')).toHaveAttribute(
      'data-stage',
      'privacy-assessment',
    );
    await expect(tab(page, 'triage')).toHaveAttribute('aria-selected', 'false');
    await expectNoSeriousViolations(page, 'incident: the stages');
  });

  test('choosing a tab opens its panel and puts the stage in the address, without a new entry of the history', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA);
    const before = await page.evaluate(() => window.history.length);
    await tab(page, 'notifications').click();
    await expect(page).toHaveURL(incidentAddress(CARD_DATA, { stage: 'notifications' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'notifications');
    await expect(page.getByRole('tabpanel')).toHaveAccessibleName(/Notifications/);
    expect(await page.evaluate(() => window.history.length)).toBe(before);
    // The address chooses the tab as well: a deep link opens the stage.
    await page.goto(incidentAddress(CARD_DATA, { stage: 'review' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'review');
    await expect(tab(page, 'review')).toHaveAttribute('aria-selected', 'true');
    // A stage the incident does not have is no tab: the sheet opens its default one.
    await page.goto(incidentAddress(CARD_DATA, { stage: 'nope' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute(
      'data-stage',
      'privacy-assessment',
    );
  });

  test('moves along the tabs with the arrow keys and chooses with Enter', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA);
    await tab(page, 'privacy-assessment').focus();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'response')).toBeFocused();
    await page.keyboard.press('End');
    await expect(tab(page, 'review')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(tab(page, 'triage')).toBeFocused();
    // The focus moves; the selection stays until the person chooses.
    await expect(page.getByTestId('stage-panel')).toHaveAttribute(
      'data-stage',
      'privacy-assessment',
    );
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'triage');
  });

  test('a stage that does not apply stays a tab, greyed, with the condition under which it applies', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    expect(await tabStatuses(page)).toEqual(statusesOf(CREDENTIAL_STUFFING.stages));
    const privacy = tab(page, 'privacy-assessment');
    await expect(privacy).toHaveAttribute('data-status', 'not-applicable');
    await expect(privacy).toHaveClass(/stage-tab--na/);
    await expect(privacy).toContainText('Does not apply');
    await expect(privacy).toContainText('Applies when personal data is affected');
    await expect(tab(page, 'notifications')).toContainText(
      'Applies when personal data is affected or the incident is significant under NIS2',
    );
    // The tab opens: what was entered there stays in the record, and nothing is offered to complete.
    await privacy.click();
    const notice = page.getByTestId('stage-not-applicable');
    await expect(notice).toContainText('Does not apply: it applies when personal data is affected');
    await expect(notice).toContainText('What was entered here stays in the record.');
    await expect(page.getByTestId('stage-complete')).toHaveCount(0);
    await expect(page.getByTestId('stage-reopen')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: a stage that does not apply');
  });

  test('a stage that does not apply only because its question is not answered says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, SUSPICIOUS);
    expect(await tabStatuses(page)).toEqual(statusesOf(SUSPICIOUS.stages));
    await expect(tab(page, 'privacy-assessment')).toContainText(
      'Not answered yet: applies when personal data is affected',
    );
    await expect(tab(page, 'notifications')).toContainText('Not answered yet: applies when');
    await tab(page, 'notifications').click();
    await expect(page.getByTestId('stage-not-applicable')).toContainText(
      'Not answered yet: applies when personal data is affected or the incident is significant under NIS2',
    );
  });

  test('a stage that was signed off before an earlier stage was reopened carries a marker, in its tab and in its panel', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, WRONG_RECIPIENT);
    expect(await tabStatuses(page)).toEqual(statusesOf(WRONG_RECIPIENT.stages));
    const marker = 'Signed off before an earlier stage was reopened';
    for (const stage of ['privacy-assessment', 'response', 'notifications']) {
      await expect(tab(page, stage), stage).toContainText(marker);
      await expect(tab(page, stage), stage).toHaveAttribute('data-status', 'completed');
    }
    // The stage that was reopened, and the one that never was signed off, carry none.
    await expect(tab(page, 'triage')).not.toContainText(marker);
    await expect(tab(page, 'review')).not.toContainText(marker);
    await chooseStage(page, 'response');
    const notice = page.getByTestId('stage-predecessor-reopened');
    await expect(notice).toContainText('Check this stage again');
    await expect(notice).toContainText(
      'Check that this stage still holds, then complete it again if you want to sign it off again.',
    );
    await chooseStage(page, 'review');
    await expect(page.getByTestId('stage-predecessor-reopened')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: predecessor reopened');
  });
});

test.describe('the panel of a stage and its form (UC-IR-1)', () => {
  test('shows the guidance of the stage and, in the triage, the form of the title and the derived protection needs', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, SUSPICIOUS, 'triage');
    await expect(page.getByTestId('stage-panel').getByRole('heading', { level: 2 })).toHaveText(
      'Triage',
    );
    await expect(page.getByTestId('stage-guidance')).toContainText(
      'Record when the incident happened, was found and became known',
    );
    // The title is a part of its own, edited in the triage; the form of the stage follows it.
    const title = page.getByTestId('title-form');
    await expect(field(title, '/title').getByRole('textbox')).toHaveValue(SUSPICIOUS.title);
    const form = page.getByTestId('stage-form');
    for (const pointer of [
      '/categories',
      '/severity',
      '/occurred-at',
      '/detected-at',
      '/aware-at',
      '/personal-data-affected',
      '/nis2-significant',
      '/affected-services',
      '/tickets',
    ]) {
      await expect(field(form, pointer), pointer).toBeVisible();
    }
    await expect(field(form, '/severity')).toContainText('required');
    await expect(field(form, '/aware-at')).toContainText(
      'The first deadlines start from this time',
    );
    // The protection needs are derived by the server: they are read here and cannot be typed.
    const needs = page.getByTestId('protection-needs');
    await expect(needs).toContainText('It is derived and cannot be changed here.');
    await expect(page.getByTestId('protection-confidentiality')).toContainText('Very high');
    // One service decides all three, which is said once.
    await expect(page.getByTestId('protection-sole')).toHaveText(
      'All three are decided by Identity Provider.',
    );
    await expect(page.getByTestId('protection-availability')).toContainText('High');
    await expect(needs.locator('input, select, textarea')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: the triage');
  });

  test('a stage that is completed is read only, says who completed it, and offers to reopen it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA, 'triage');
    await expect(page.getByTestId('stage-completion')).toContainText(
      'Completed by Alex Example, Nov 19, 2026, 10:30 AM',
    );
    await expect(page.getByTestId('stage-form').locator('input, select, textarea')).toHaveCount(0);
    // The title is a part of its own and never a stage: completing the triage does not lock it.
    await expect(
      field(page.getByTestId('title-form'), '/title').getByRole('textbox'),
    ).toBeEditable();
    await expect(page.getByTestId('stage-reopen')).toHaveText('Reopen stage');
    await expect(page.getByTestId('stage-complete')).toHaveCount(0);
    // A stage that is open has its form as fields.
    await chooseStage(page, 'privacy-assessment');
    await expect(
      field(page.getByTestId('stage-form'), '/risk').getByRole('combobox'),
    ).toBeEnabled();
    await expect(page.getByTestId('stage-complete')).toHaveText('Complete stage');
  });

  test('a person who may only read gets the stages without a way to complete, reopen or save', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToSheet(page, CARD_DATA, 'privacy-assessment');
    await expect(page.getByTestId('stage-complete')).toHaveCount(0);
    await expect(page.getByTestId('stage-reopen')).toHaveCount(0);
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('stage-form').locator('input, select, textarea')).toHaveCount(0);
    await expect(page.getByTestId('transition-incident.submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await chooseStage(page, 'triage');
    await expect(page.getByTestId('stage-reopen')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: read only');
  });
});

test.describe('the notices sent (UC-IR-2)', () => {
  test('lists every notice with its time, recipient and channel, and says for each whether its deadline was met', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA, 'notifications');
    const table = page.getByTestId('notifications-table');
    await expect(table.getByRole('columnheader')).toHaveText([
      'Notice',
      'Sent',
      'Recipient',
      'Channel',
      'Deadline',
    ]);
    await expect(table.getByRole('row')).toHaveCount(3);
    const early = page.getByTestId('notification-nis2-early-warning');
    await expect(early).toContainText('NIS2 early warning');
    await expect(early).toContainText('Nov 20, 2026, 7:55 AM');
    await expect(early).toContainText('Reference BSI-2026-4417');
    await expect(early).toContainText('Joint reporting office BSI and BBK');
    await expect(early).toContainText('Reporting portal');
    await expect(early).toContainText('Met');
    // A notice that was sent after its deadline is told as such, as the clock tells it: a dot and its words, no box, for the
    // deadline is a fact of the record and nothing is left to do.
    const late = page.getByTestId('notification-nis2-notification');
    await expect(late).toContainText('Nov 22, 2026, 11:20 AM');
    await expect(late).toContainText('Sent late');
    await expect(late.locator('.reason')).toHaveCount(0);
    await expect(late.locator('[data-tone="danger"]')).toHaveCount(1);
    await expect(early.locator('.reason')).toHaveCount(0);
    await expect(page.getByTestId('notifications-none')).toHaveCount(0);
    // The way to record a notice is the form under the table, with its words.
    await expect(
      page.getByTestId('stage-form-section').getByRole('heading', { level: 3 }),
    ).toHaveText('Record a notice');
    await expect(page.getByTestId('stage-form-section')).toContainText(
      'Name an office or an organisation as the recipient, never a person.',
    );
    await expectNoSeriousViolations(page, 'incident: the notices');
  });

  test('a notice of a list is a row of its own, and a notice that meets no deadline says so', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, OUTAGE, 'notifications');
    const rows = page.getByTestId('notifications-table').locator('tbody tr');
    await expect(rows).toHaveCount(5);
    const intermediate = page.getByTestId('notification-nis2-intermediate-reports-0');
    await expect(intermediate).toContainText('NIS2 intermediate reports');
    await expect(intermediate).toContainText('No. 1');
    await expect(intermediate).toContainText('Email');
    await expect(intermediate).toContainText('Met');
    const other = page.getByTestId('notification-others-0');
    await expect(other).toContainText("Affected customers' administrators");
    await expect(other).toContainText('Service status and the expected time of recovery.');
    await expect(other).toContainText('No deadline');
  });

  test('a progress report meets the final report, and the final report after handling is not met by anything yet', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, ARCHIVE, 'notifications');
    const progress = page.getByTestId('notification-nis2-progress-report');
    await expect(progress).toContainText('NIS2 progress report');
    await expect(progress).toContainText('Reference BSI-2026-3055-P');
    await expect(progress).toContainText('Met');
    await expect(page.getByTestId('notification-nis2-final-report')).toHaveCount(0);
  });

  test('a stage without a notice says that nothing was sent', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING, 'notifications');
    await expect(page.getByTestId('notifications-none')).toHaveText('Nothing has been sent yet.');
    await expect(page.getByTestId('notifications-table')).toHaveCount(0);
  });

  test('records a notice of the phishing mail: its deadline is met and the table, the clock and the Due list follow', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, PHISHING, 'notifications');
    await expect(page.getByTestId('notifications-none')).toBeVisible();
    await expect(clockRow(page, 'gdpr-art33')).toHaveAttribute('data-status', 'OPEN');
    const authority = field(page.getByTestId('stage-form'), '/supervisory-authority');
    await authority.getByLabel('Sent at').fill('2026-11-26T10:45');
    await authority.getByLabel('Recipient').fill('State data protection authority');
    await authority.getByLabel('Channel').selectOption({ label: 'Reporting portal' });
    await authority.getByLabel('Reference').fill('2026-1126-02');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    // The table reads what the person typed before it is saved; nothing is sent to the mock but the draft.
    await expect(page.getByTestId('notification-supervisory-authority')).toContainText(
      'State data protection authority',
    );
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(PHISHING), 'POST');
    expect(saves).toHaveLength(1);
    // The whole entry goes as one change of the part, with the time as the instant the person typed in their zone.
    expect(Object.keys(saves[0].body.parts)).toEqual(['notifications']);
    expect(saves[0].body.parts.notifications.fields).toEqual({
      '/supervisory-authority': {
        'sent-at': '2026-11-26T09:45:00Z',
        recipient: 'State data protection authority',
        channel: 'reporting-portal',
        reference: '2026-1126-02',
      },
    });
    // The mock is now in `incident-notification-recorded`: the save changed the clock.
    await expect(clockRow(page, 'gdpr-art33')).toHaveAttribute('data-status', 'MET');
    await expect(clockRow(page, 'gdpr-art33')).toContainText('Sent Nov 26, 2026, 10:45 AM');
    const row = page.getByTestId('notification-supervisory-authority');
    await expect(row).toContainText('Nov 26, 2026, 10:45 AM');
    await expect(row).toContainText('Reference 2026-1126-02');
    await expect(row).toContainText('Met');
    await expect(page.getByTestId('notifications-none')).toHaveCount(0);
    // The stage stays open: recording a notice does not sign anything off.
    await expect(tab(page, 'notifications')).toHaveAttribute('data-status', 'open');
    await expect(page.getByTestId('stage-complete')).toBeVisible();
    // The Due list has no deadline of the phishing mail any more.
    await page.goto('/');
    await expect(page.getByTestId('due-list')).toBeVisible();
    await expect(page.getByTestId('due-list')).not.toContainText(PHISHING.title);
    await expect(page.getByTestId('due-list')).toContainText(CARD_DATA.title);
  });
});

test.describe('the deadline clock (UC-IR-1, UC-IR-2, AUN-IR-2)', () => {
  test('tells every deadline of the card data with its legal basis, its due time and where it stands', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA);
    const clock = page.getByTestId('deadline-clock');
    await expect(clock).toHaveAccessibleName('Notification deadlines');
    expect(await clockStates(page)).toEqual([
      ['gdpr-art33-', 'MISSED'],
      ['nis2-early-warning-', 'MET'],
      ['nis2-notification-', 'MISSED'],
      ['nis2-final-report-', 'OPEN'],
    ]);
    const missed = clockRow(page, 'gdpr-art33');
    await expect(missed).toContainText(RULES['gdpr-art33']);
    await expect(missed).toContainText('GDPR Art. 33: 72 hours after becoming aware');
    await expect(missed).toContainText('Missed');
    await expect(missed).toContainText('Nov 22, 2026, 8:40 AM');
    await expect(missed).toContainText('Overdue by 4 days');
    // Missed and never sent is a duty: a box. A deadline that was sent late is missed as well, and stays visible.
    await expect(missed.locator('.reason')).toHaveCount(1);
    const late = clockRow(page, 'nis2-notification');
    await expect(late).toContainText('Missed');
    await expect(late).toContainText('Sent Nov 22, 2026, 11:20 AM, 3 hours late');
    await expect(late.locator('.reason')).toHaveCount(0);
    const met = clockRow(page, 'nis2-early-warning');
    await expect(met).toContainText('NIS2, § 32 BSIG: 24 hours after becoming aware');
    await expect(met).toContainText('Met');
    await expect(met).toContainText('Sent Nov 20, 2026, 7:55 AM');
    const open = clockRow(page, 'nis2-final-report');
    await expect(open).toContainText('Open');
    await expect(open).toContainText('Dec 22, 2026, 11:20 AM');
    await expect(open).toContainText('Due in 26 days');
    // The state is never told by the colour alone: every row has the word.
    await expect(page.getByTestId('clock-none')).toHaveCount(0);
    await expect(page.getByTestId('clock-stopped')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: the deadline clock');
  });

  test('an open deadline counts down in hours and then in minutes', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, PHISHING);
    await expect(clockRow(page, 'gdpr-art33')).toContainText('Due in 23 hours');
    await expect(clockRow(page, 'gdpr-art33')).toContainText('Nov 27, 2026, 10:10 AM');
    // Fifty minutes before the due time.
    await pinClock(page, '2026-11-27T08:20:00Z');
    await page.reload();
    await expect(clockRow(page, 'gdpr-art33')).toContainText('Due in 50 minutes');
    await expect(clockRow(page, 'gdpr-art33').locator('.reason')).toHaveCount(0);
  });

  test('a deadline the clock of the page has overtaken is already a duty, before the server says it is missed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, incidentAddress(PHISHING));
    await expect(clockRow(page, 'gdpr-art33')).toHaveAttribute('data-status', 'OPEN');
    // The mock still answers OPEN; the page reads the due time against its own clock.
    await pinClock(page, '2026-11-27T10:00:00Z');
    await page.reload();
    const row = clockRow(page, 'gdpr-art33');
    await expect(row).toHaveAttribute('data-status', 'MISSED');
    await expect(row).toContainText('Missed');
    await expect(row).toContainText('Overdue by 50 minutes');
    await expect(row.locator('.reason')).toHaveCount(1);
  });

  test('the clock of the next day: the server says missed, and the page tells the same', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-clock-advanced');
    await loginToIncidents(page, incidentAddress(PHISHING));
    await pinClock(page, '2026-11-27T10:00:00Z');
    await page.reload();
    const row = clockRow(page, 'gdpr-art33');
    await expect(row).toHaveAttribute('data-status', 'MISSED');
    await expect(row).toContainText('Overdue by 50 minutes');
    // The year has two incidents with a missed deadline now, and the Due list says it.
    await page.goto(yearAddress(2026));
    await expect(page.getByTestId(`incident-${PHISHING.id}`)).toContainText('One deadline missed');
    await expect(page.getByTestId(`incident-${CARD_DATA.id}`)).toContainText('2 deadlines missed');
    await expect(page.getByTestId('year-2026')).toContainText('2 incidents with a missed deadline');
    await page.goto('/');
    await expect(page.getByTestId('due-list')).toContainText(PHISHING.title);
    await expect(page.getByTestId('due-overdue').first()).toBeVisible();
  });

  test('a deadline without a date waits for the time it depends on, and a progress report meets the final report', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, ARCHIVE);
    expect(await clockStates(page)).toEqual([
      ['nis2-early-warning-', 'MET'],
      ['nis2-notification-', 'MET'],
      ['nis2-final-report-', 'MET'],
      ['nis2-final-report-after-handling-', 'OPEN'],
    ]);
    const waiting = clockRow(page, 'nis2-final-report-after-handling');
    await expect(waiting).toContainText(RULES['nis2-final-report-after-handling']);
    await expect(waiting).toContainText(
      'The clock starts when the time it depends on is recorded.',
    );
    await expect(waiting.locator('time')).toHaveCount(0);
    await expect(waiting.locator('.reason')).toHaveCount(0);
    await expect(clockRow(page, 'nis2-final-report')).toContainText('Sent Nov 6, 2026, 11:00 AM');
  });

  test('an incident without a deadline says so, and one whose questions are not answered says what decides them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('clock-none')).toHaveText('No notification deadline applies.');
    await expect(page.getByTestId('deadline-clock')).toHaveCount(0);
    await page.goto(incidentAddress(SUSPICIOUS));
    await expect(page.getByTestId('clock-none')).toHaveText(
      'Answer the questions about personal data and NIS2 in the triage; the deadlines follow from the answers.',
    );
  });

  test('a released incident has a frozen clock: every deadline as it stood at the release, and the clock stopped', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // A year later the open deadlines of the page would all read as overdue; the released incident reads at its release.
    await loginToIncidents(page, incidentAddress(OUTAGE));
    await pinClock(page, '2027-12-01T00:00:00Z');
    await page.reload();
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    expect(await clockStates(page)).toEqual([
      ['nis2-early-warning-', 'MET'],
      ['nis2-notification-', 'MET'],
      ['nis2-intermediate-report-0', 'MET'],
      ['nis2-final-report-', 'MET'],
    ]);
    await expect(clockRow(page, 'nis2-intermediate-report', 0)).toContainText(
      'NIS2 intermediate report, no. 1',
    );
    await expect(page.getByTestId('clock-stopped')).toHaveText(
      'The clock stopped at Nov 18, 2026, 11:00 AM. Open deadlines can no longer be met in this incident.',
    );
    await expect(page.getByTestId('released-notice')).toContainText('Released as v1');
    await expect(page.getByTestId('released-notice')).toContainText(
      'A change is a new incident that names this one.',
    );
  });

  test('a released incident keeps a deadline that was open at the release as open, though the page clock is past its time', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The mock holds no released incident with an open deadline: the final report is read as not yet sent, due before the
    // release. With the clock of the page (a year later) it would read as missed; at the release it was open.
    await patchRead(page, `**${readPath(OUTAGE)}`, (body) => ({
      ...body,
      deadlines: body.deadlines.map((deadline) =>
        deadline.rule === 'nis2-final-report'
          ? { ...deadline, status: 'OPEN', sentAt: null, due: '2026-11-19T16:00:00Z' }
          : deadline,
      ),
    }));
    await loginToIncidents(page, incidentAddress(OUTAGE));
    await pinClock(page, '2027-12-01T00:00:00Z');
    await page.reload();
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    expect(await clockStates(page)).toEqual([
      ['nis2-early-warning-', 'MET'],
      ['nis2-notification-', 'MET'],
      ['nis2-intermediate-report-0', 'MET'],
      ['nis2-final-report-', 'OPEN'],
    ]);
    await expect(page.getByTestId('clock-stopped')).toBeVisible();
  });

  test('an earlier state of the incident has a stopped clock as well', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, OUTAGE);
    await page.goto(incidentAddress(OUTAGE, { at: 'v1' }));
    await expect(page.getByTestId('clock-stopped')).toBeVisible();
    await expect(page.getByTestId('revision-notice')).toBeVisible();
  });
});

test.describe('completing a stage (UC-IR-1, UC-IR-3)', () => {
  test('lists the mandatory fields that are empty, each as a way to its field, and changes nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, SUSPICIOUS);
    // The stage that is ready is the triage; the stage after it waits for it.
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'triage');
    await page.getByTestId('stage-complete').click();
    const refusal = page.getByTestId('stage-refusal');
    await expect(refusal).toBeVisible();
    await expect(page.getByText('Triage cannot be completed yet')).toBeVisible();
    await expect(page.getByText('Nothing was changed.', { exact: false })).toBeVisible();
    const missing = page.getByTestId('missing-fields');
    await expect(missing.getByRole('button')).toHaveText([
      'Go to Severity',
      'Go to Personal data affected',
      'Go to Significant under NIS2',
    ]);
    await expect(page.getByTestId('stage-open-before')).toHaveCount(0);
    expect(changes(await acts(request))).toEqual([`POST ${completePath(SUSPICIOUS, 'triage')}`]);
    // A field in the list is the way to it: the focus goes there.
    await missing.getByRole('button', { name: 'Go to Severity' }).click();
    await expect(
      field(page.getByTestId('stage-form'), '/severity').getByRole('combobox'),
    ).toBeFocused();
    // The fields that are empty and mandatory are marked in the form while the refusal is open.
    await expectNoSeriousViolations(page, 'incident: the refusal of a completion');
    await page.getByTestId('back-to-editing').click();
    await expect(page.getByTestId('stage-refusal')).toHaveCount(0);
    await expect(page.getByTestId('stage-complete')).toBeVisible();
  });

  test('a stage that waits for another is disabled with its reason and sends nothing', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, CARD_DATA, 'review');
    const complete = page.getByTestId('stage-complete');
    await expect(complete).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('stage-bar')).toContainText('Complete Response first.');
    await complete.click({ force: true });
    await expect(page.getByTestId('stage-refusal')).toHaveCount(0);
    expect(changes(await acts(request))).toEqual([]);
    // The stage with two predecessors names both.
    await page.goto(incidentAddress(SUSPICIOUS, { stage: 'response' }));
    await expect(page.getByTestId('stage-bar')).toContainText('Complete Triage first.');
  });

  test('the privacy assessment of the card data is refused with its four mandatory fields', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA, 'privacy-assessment');
    await page.getByTestId('stage-complete').click();
    await expect(page.getByTestId('missing-fields').getByRole('button')).toHaveText([
      'Go to Risk to the data subjects',
      'Go to Risk assessment',
      'Go to Notify the supervisory authority',
      'Go to Inform the data subjects',
    ]);
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'open');
  });

  test('names the stages that are still open before the stage, each as a link to it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The page does not know the stage is blocked (a stage completed or reopened elsewhere); the server refuses it, and
    // says which stage comes first.
    await patchRead(page, `**${readPath(SUSPICIOUS)}`, (body) => ({
      ...body,
      stages: body.stages.map((stage) =>
        stage.id === 'response' ? { ...stage, blockedBy: [] } : stage,
      ),
    }));
    await loginToSheet(page, SUSPICIOUS, 'response');
    await page.getByTestId('stage-complete').click();
    const before = page.getByTestId('stage-open-before');
    await expect(before.getByRole('link')).toHaveText(['Complete Triage first']);
    await expect(page.getByTestId('missing-fields').getByRole('button')).toHaveText([
      'Go to Actions',
      'Go to Resolved at',
    ]);
    await before.getByRole('link', { name: 'Complete Triage first' }).click();
    await expect(page).toHaveURL(incidentAddress(SUSPICIOUS, { stage: 'triage' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'triage');
  });

  test('a stage that does not apply, or is in the state asked for already, is told and the incident is read again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The page reads the stage as open; the server knows that it does not apply. Only the first read is stale: the read
    // after the refusal is the mock's own, so the tab shows the server's answer only when the page read again.
    await patchRead(
      page,
      `**${readPath(SUSPICIOUS)}`,
      (body) => ({
        ...body,
        stages: body.stages.map((stage) =>
          stage.id === 'privacy-assessment'
            ? { ...stage, status: 'open', unanswered: false }
            : stage,
        ),
      }),
      { times: 1 },
    );
    await loginToSheet(page, SUSPICIOUS, 'privacy-assessment');
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'open');
    await page.getByTestId('stage-complete').click();
    await expect(page.getByTestId('stage-failure')).toHaveText(
      'This stage does not apply to the incident. The incident is read again.',
    );
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'not-applicable');
  });

  test('a stage that was completed elsewhere is told as it is', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    // Only the first read is stale; the read after the refusal brings the stage as the server holds it.
    await patchRead(
      page,
      `**${readPath(PHISHING)}`,
      (body) => ({
        ...body,
        stages: body.stages.map((stage) =>
          stage.id === 'triage' ? { ...stage, status: 'open', completion: null } : stage,
        ),
      }),
      { times: 1 },
    );
    await loginToSheet(page, PHISHING, 'triage');
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'open');
    await page.getByTestId('stage-complete').click();
    await expect(page.getByTestId('stage-failure')).toHaveText(
      'The stage was already in that state. The incident is read again.',
    );
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'completed');
  });

  test('completes the privacy assessment of the phishing mail: the stage is signed off, the next ones are ready', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, PHISHING, 'privacy-assessment');
    await expect(page.getByTestId('stage-step-up-note')).toHaveCount(0);
    expect(await tabStatuses(page)).toEqual(statusesOf(PHISHING.stages));
    await page.getByTestId('stage-complete').click();
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'completed');
    expect(await tabStatuses(page)).toEqual(['completed', 'completed', 'open', 'open', 'open']);
    const sent = sentTo(await acts(request), completePath(PHISHING, 'privacy-assessment'), 'POST');
    expect(sent).toHaveLength(1);
    // The completion names the part as it was read, so nobody signs off what they did not see.
    expect(typeof sent[0].body.blob).toBe('string');
    await expect(page.getByTestId('stage-completion')).toContainText(
      'Completed by Alex Example, Nov 26, 2026, 11:20 AM',
    );
    await expect(page.getByTestId('stage-reopen')).toBeVisible();
    await expect(page.getByTestId('stage-complete')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Stage Privacy assessment is completed.' }),
    ).toHaveCount(1);
    // The response is ready and the review waits for it.
    await chooseStage(page, 'response');
    await expect(page.getByTestId('stage-bar')).not.toContainText('Complete Response first.');
    await chooseStage(page, 'review');
    await expect(page.getByTestId('stage-bar')).toContainText('Complete Response first.');
    await expectNoSeriousViolations(page, 'incident: a stage completed');
  });

  test('changes that only the person has are saved first, then the stage is completed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, CARD_DATA, 'privacy-assessment');
    await field(page.getByTestId('stage-form'), '/risk')
      .getByRole('combobox')
      .selectOption({ label: 'Risk' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await page.getByTestId('stage-complete').click();
    // A completion acts on the saved part: the bar asks to save first and sends nothing.
    await expect(page.getByTestId('stage-save-first')).toHaveText(
      'Save for everyone, then Complete stage',
    );
    expect(changes(await acts(request)).filter((entry) => entry.includes('/complete'))).toEqual([]);
    await page.getByTestId('stage-save-first').click();
    // The mock refuses the completion (the stage still misses fields); the save went first.
    await expect(page.getByTestId('stage-refusal')).toBeVisible();
    // The drafts the page keeps while the person types are no step of this order.
    expect(changes(await acts(request)).filter((entry) => !entry.startsWith('PUT'))).toEqual([
      `POST ${savePath(CARD_DATA)}`,
      `POST ${completePath(CARD_DATA, 'privacy-assessment')}`,
    ]);
    const body = lastBody(await acts(request), savePath(CARD_DATA), 'POST');
    expect(body.parts['privacy-assessment'].fields).toEqual({ '/risk': 'risk' });
  });

  test('a completion that the server finds changed since the person read the stage is read again, not signed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-complete-changed');
    await loginToSheet(page, PHISHING, 'privacy-assessment');
    await page.getByTestId('stage-complete').click();
    await expect(page.getByTestId('stage-failure')).toHaveText(
      'Someone saved this stage since you opened it. It is read again; check it, then complete it.',
    );
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'open');
    await expectNoSeriousViolations(page, 'incident: a completion changed since review');
  });

  test('completing the triage again takes the markers of the stages after it away', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, WRONG_RECIPIENT, 'triage');
    await expect(tab(page, 'response')).toContainText(
      'Signed off before an earlier stage was reopened',
    );
    await page.getByTestId('stage-complete').click();
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'completed');
    await expect(page.locator('.stage-tab__marker')).toHaveCount(0);
    expect(await tabStatuses(page)).toEqual([
      'completed',
      'completed',
      'completed',
      'completed',
      'open',
    ]);
  });
});

test.describe('reopening a stage (UC-IR-1)', () => {
  test('reopens the triage of the credential stuffing: the stages after it keep their sign-off and say it was before', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, CREDENTIAL_STUFFING, 'triage');
    await page.getByTestId('stage-reopen').click();
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'open');
    expect(await tabStatuses(page)).toEqual([
      'open',
      'not-applicable',
      'completed',
      'not-applicable',
      'open',
    ]);
    expect(
      sentTo(await acts(request), reopenPath(CREDENTIAL_STUFFING, 'triage'), 'POST'),
    ).toHaveLength(1);
    // The response stays completed and says it was signed off before; the review is open and no longer waits.
    await expect(tab(page, 'response')).toContainText(
      'Signed off before an earlier stage was reopened',
    );
    await expect(tab(page, 'response')).toHaveAttribute('data-status', 'completed');
    await expect(page.getByTestId('stage-complete')).toHaveText('Complete stage');
    await expect(page.getByTestId('stage-reopen')).toHaveCount(0);
    await expect(
      page.getByRole('status').filter({ hasText: 'Stage Triage is open again.' }),
    ).toHaveCount(1);
    // Its completion stays in the signed history, before the reopening.
    const history = page.getByTestId('document-history');
    await expect(history).toContainText('Reopened the stage Triage');
    await expect(history).toContainText('Completed the stage Triage');
    await expectNoSeriousViolations(page, 'incident: a stage reopened');
  });

  test('a stage of a released incident cannot be reopened, and says why', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, OUTAGE, 'triage');
    await expect(page.getByTestId('stage-reopen')).toHaveCount(0);
    await expect(page.getByTestId('stage-complete')).toHaveCount(0);
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('save-state')).toContainText(
      'Released and frozen. Nothing here can change.',
    );
    await expect(page.getByTestId('stage-form').locator('input, select, textarea')).toHaveCount(0);
  });
});

test.describe('the review asks the person to confirm again (UC-IR-3)', () => {
  test('says beside the act that the identity is confirmed once more, and only for the stage that asks', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    await expect(page.getByTestId('stage-step-up-note')).toHaveText(
      'You confirm your identity once more before this stage is completed.',
    );
    // The act names the act and nothing of how it is confirmed.
    await expect(page.getByTestId('stage-complete')).toHaveText('Complete stage');
    await expect(page.getByTestId('stage-complete')).not.toContainText(/password|step|MFA|token/i);
    await chooseStage(page, 'response');
    await expect(page.getByTestId('stage-step-up-note')).toHaveCount(0);
  });

  test('with the identity provider: the step-up first, then the same completion goes through', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-review-step-up');
    await clearActs(request);
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/stages/review/complete') && response.status() === 403,
    );
    await page.getByTestId('stage-complete').click();
    await demanded;
    // The step-up address returns to the sheet; the act is chosen again.
    await expect(page).toHaveURL(incidentAddress(CREDENTIAL_STUFFING, { stage: 'review' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'review');
    await expect(page.getByTestId('stage-complete')).not.toHaveAttribute('aria-busy', 'true');
    await expect(tab(page, 'review')).toHaveAttribute('data-status', 'open');
    await page.getByTestId('stage-complete').click();
    await expect(tab(page, 'review')).toHaveAttribute('data-status', 'completed');
    expect(
      sentTo(await acts(request), completePath(CREDENTIAL_STUFFING, 'review'), 'POST').length,
    ).toBeGreaterThan(1);
    await expect(page.getByTestId('stage-completion')).toContainText('Completed by Alex Example');
  });

  test('with the password of a local user: the question comes before anything is sent, and the password goes with the completion', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-review-stepped-up');
    await clearActs(request);
    await patchRead(page, '**/api/v1/status', (body) => ({
      ...body,
      loginProvider: 'local',
      stepUp: 'password',
    }));
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    await page.getByTestId('stage-complete').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm your identity');
    await expect(dialog).toContainText(
      'Enter your password to complete the stage Review of Credential stuffing against the login form.',
    );
    expect(changes(await acts(request))).toEqual([]);
    // Cancelling sends nothing and leaves the stage open.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(changes(await acts(request))).toEqual([]);
    await expect(tab(page, 'review')).toHaveAttribute('data-status', 'open');
    await page.getByTestId('stage-complete').click();
    await expectNoSeriousViolations(page, 'incident: the confirmation of the review');
    await page.getByTestId('document-password').fill('local-password');
    // The mock answers a completion whatever it carries, so the transport is read from the request itself.
    const completing = page.waitForRequest(
      (sentRequest) =>
        sentRequest.method() === 'POST' &&
        sentRequest.url().endsWith(completePath(CREDENTIAL_STUFFING, 'review')),
    );
    await page.getByTestId('document-confirm').click();
    expect((await completing).postDataJSON()).toMatchObject({ password: 'local-password' });
    await expect(tab(page, 'review')).toHaveAttribute('data-status', 'completed');
    const sent = sentTo(await acts(request), completePath(CREDENTIAL_STUFFING, 'review'), 'POST');
    expect(sent).toHaveLength(1);
    // The password is sent with the request and never kept by the mock's record of it.
    expect(JSON.stringify(await acts(request))).not.toContain('local-password');
  });

  test('a stage that asks for nothing is completed without a question, whatever the login', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await patchRead(page, '**/api/v1/status', (body) => ({
      ...body,
      loginProvider: 'local',
      stepUp: 'password',
    }));
    await loginToSheet(page, WRONG_RECIPIENT, 'triage');
    await page.getByTestId('stage-complete').click();
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'completed');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });
});

test.describe('submit (UC-IR-1, UC-DOC-6)', () => {
  test('is disabled while a stage is open, and says which stages come first', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, CREDENTIAL_STUFFING);
    const submit = page.getByTestId('transition-incident.submit');
    await expect(submit).toHaveText('Submit for review');
    await expect(submit).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('transition-bar')).toContainText(
      'Complete these stages first: Review.',
    );
    await submit.click({ force: true });
    expect(changes(await acts(request))).toEqual([]);
    await page.goto(incidentAddress(CARD_DATA));
    await expect(page.getByTestId('transition-bar')).toContainText(
      'Complete these stages first: Privacy assessment, Response, Notifications, Review.',
    );
    // A stage that does not apply never keeps the incident from being submitted.
    await page.goto(incidentAddress(CREDENTIAL_STUFFING));
    await expect(page.getByTestId('transition-bar')).not.toContainText('Privacy assessment');
    await expectNoSeriousViolations(page, 'incident: submit disabled');
  });

  test('a person who may only read is told that the step needs the right to edit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('transition-incident.submit')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    await expect(page.getByTestId('transition-bar')).toContainText('edit');
  });

  test('walks the credential stuffing from the review to the submit, and the release is the step that follows', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    // The review is the last stage that applies. Its completion asks for a confirmation of the identity: the mock lets it
    // through here, and the submit is offered at once.
    await page.getByTestId('stage-complete').click();
    await expect(tab(page, 'review')).toHaveAttribute('data-status', 'completed');
    const submit = page.getByTestId('transition-incident.submit');
    await expect(submit).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('transition-bar')).not.toContainText(
      'Complete these stages first',
    );
    await submit.click();
    await expect(page.getByTestId('document-state')).toHaveText('In review');
    expect(sentTo(await acts(request), submitPath(CREDENTIAL_STUFFING), 'POST')).toHaveLength(1);
    // The release is a page of its own, reached by the step the sheet offers; part B of the lens builds that page.
    const release = page.getByTestId('transition-incident.release');
    await expect(release).toHaveText('Release');
    await expect(release).toHaveAttribute(
      'href',
      `/incidents/2026/${CREDENTIAL_STUFFING.id}/release`,
    );
    await expect(page.getByTestId('step-up-note')).toHaveText(
      'You confirm your identity once more before the release.',
    );
    await expect(page.getByTestId('transition-incident.submit')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident: in review');
    await release.click();
    await expect(page).toHaveURL(`/incidents/2026/${CREDENTIAL_STUFFING.id}/release`);
    await expect(page.getByTestId('lens-view')).toBeVisible();
  });

  test('the incident whose review was completed is offered for submit when it is opened', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-review-completed');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    expect(await tabStatuses(page)).toEqual([
      'completed',
      'not-applicable',
      'completed',
      'not-applicable',
      'completed',
    ]);
    await expect(page.getByTestId('transition-incident.submit')).not.toHaveAttribute(
      'aria-disabled',
      'true',
    );
  });

  test('a submit that the server refuses because a stage is open is told, and the incident is read again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The page reads the review as completed; the server knows it is not.
    await patchRead(page, `**${readPath(CREDENTIAL_STUFFING)}`, (body) => ({
      ...body,
      stages: body.stages.map((stage) =>
        stage.id === 'review' ? { ...stage, status: 'completed' } : stage,
      ),
    }));
    await loginToSheet(page, CREDENTIAL_STUFFING);
    await page.getByTestId('transition-incident.submit').click();
    await expect(page.getByTestId('failure-notice')).toHaveText(
      'A stage is not completed yet, so the incident cannot be submitted. The incident is read again.',
    );
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
  });
});

test.describe('saving the parts of an incident (UC-IR-1, AUN-WEB-4)', () => {
  test('saves the title and a stage as two parts, each as its own signed change, and keeps the draft while the person types', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToSheet(page, SUSPICIOUS, 'triage');
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('save-state')).toContainText('Everything is saved for everyone.');
    await field(page.getByTestId('title-form'), '/title')
      .getByRole('textbox')
      .fill('Suspicious logins from an unknown network, second wave');
    await field(page.getByTestId('stage-form'), '/severity')
      .getByRole('combobox')
      .selectOption({ label: 'High' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
    await expect
      .poll(async () => sentTo(await acts(request), draftPath(SUSPICIOUS), 'PUT').length)
      .toBeGreaterThan(0);
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'saved');
    const saves = sentTo(await acts(request), savePath(SUSPICIOUS), 'POST');
    // One request for each part that changed; the part of the title is `data`.
    expect(saves.map((save) => Object.keys(save.body.parts))).toEqual([['data'], ['triage']]);
    expect(saves[0].body.parts.data.fields).toEqual({
      '/title': 'Suspicious logins from an unknown network, second wave',
    });
    expect(saves[1].body.parts.triage.fields).toEqual({ '/severity': 'high' });
  });

  test('a change that another person made to the same field is decided per field, with both versions told', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-saved-by-other');
    await loginToSheet(page, CARD_DATA, 'notifications');
    const authority = field(page.getByTestId('stage-form'), '/supervisory-authority');
    await authority.getByLabel('Sent at').fill('2026-11-26T10:45');
    await authority.getByLabel('Recipient').fill('State data protection authority');
    await authority.getByLabel('Channel').selectOption({ label: 'Reporting portal' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'conflict');
    // The tab of the stage says that it holds a conflict, so the person finds it from another tab.
    await expect(tab(page, 'notifications')).toContainText('Conflict');
    const panel = page.getByTestId('stage-panel').getByTestId('conflict-panel');
    await expect(panel).toBeVisible();
    await expect(panel.locator('[data-testid^="conflict-/"]')).toHaveCount(1);
    await expect(panel.getByTestId('conflict-/supervisory-authority')).toContainText(
      'Your version',
    );
    await expect(panel.getByTestId('conflict-/supervisory-authority')).toContainText(
      'Version of Jordan Weber',
    );
    // A stage with a conflict cannot be completed before the person decides.
    await expect(page.getByTestId('stage-complete')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('stage-bar')).toContainText(
      'Decide the conflicts of this stage first.',
    );
    await expect(page.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await expectNoSeriousViolations(page, 'incident: a conflict');
    await page.getByTestId('keep-own-/supervisory-authority').click();
    await expect(page.getByTestId('conflict-/supervisory-authority')).toHaveCount(0);
    await expect(tab(page, 'notifications')).not.toContainText('Conflict');
    await expect(page.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(
      field(page.getByTestId('stage-form'), '/supervisory-authority').getByLabel('Recipient'),
    ).toHaveValue('State data protection authority');
  });

  test('taking the other version puts it in the form', async ({ page, request }) => {
    await useScenario(request, 'workshop#incident-saved-by-other');
    await loginToSheet(page, CARD_DATA, 'notifications');
    const authority = field(page.getByTestId('stage-form'), '/supervisory-authority');
    await authority.getByLabel('Sent at').fill('2026-11-26T10:45');
    await authority.getByLabel('Recipient').fill('State data protection authority');
    await authority.getByLabel('Channel').selectOption({ label: 'Reporting portal' });
    await page.getByTestId('save-everyone').click();
    await page.getByTestId('take-other-/supervisory-authority').click();
    await expect(page.getByTestId('conflict-/supervisory-authority')).toHaveCount(0);
    await expect(authority.getByLabel('Channel').locator('option:checked')).toHaveText('Email');
  });

  test('a stage that was completed meanwhile keeps the changes of the person on the page and says how to save them', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-stage-locked');
    await loginToSheet(page, CARD_DATA, 'privacy-assessment');
    await field(page.getByTestId('stage-form'), '/risk')
      .getByRole('combobox')
      .selectOption({ label: 'Risk' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('stage-failure')).toHaveText(
      'A stage you changed was completed meanwhile. Your changes stay on this page; reopen the stage to save them.',
    );
    await expect(
      field(page.getByTestId('stage-form'), '/risk').locator('option:checked'),
    ).toHaveText('Risk');
    await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-state', 'saved');
    await expectNoSeriousViolations(page, 'incident: a stage locked');
  });

  test('every field the server finds wrong is told at its field, and what the person typed stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-invalid');
    await loginToSheet(page, CARD_DATA, 'notifications');
    const authority = field(page.getByTestId('stage-form'), '/supervisory-authority');
    await authority.getByLabel('Sent at').fill('2026-11-26T10:45');
    await authority.getByLabel('Recipient').fill('State data protection authority');
    await authority.getByLabel('Channel').selectOption({ label: 'Reporting portal' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(
      field(page.getByTestId('stage-form'), '/supervisory-authority/sent-at'),
    ).toContainText('format');
    await expect(authority.getByLabel('Recipient')).toHaveValue('State data protection authority');
    await expectNoSeriousViolations(page, 'incident: invalid');
  });

  test('says that the Git server cannot be reached, keeps what the person changed, and refuses a completion the same way', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-git-unavailable');
    await loginToSheet(page, CARD_DATA, 'privacy-assessment');
    await field(page.getByTestId('stage-form'), '/risk')
      .getByRole('combobox')
      .selectOption({ label: 'Risk' });
    await page.getByTestId('save-everyone').click();
    await expect(page.getByTestId('stage-failure')).toContainText(
      'The Git server cannot be reached. Your work is kept; save again later.',
    );
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(tab(page, 'privacy-assessment')).toContainText('Not saved');
    await expect(
      field(page.getByTestId('stage-form'), '/risk').locator('option:checked'),
    ).toHaveText('Risk');
    await expectNoSeriousViolations(page, 'incident: Git server down');
    // A stage that is completed without a change of the person goes to the server and is refused the same way.
    await page.goto(incidentAddress(PHISHING, { stage: 'privacy-assessment' }));
    await page.getByTestId('stage-complete').click();
    await expect(page.getByTestId('stage-failure')).toContainText(
      'The Git server cannot be reached.',
    );
  });
});

test.describe('the earlier states of an incident (UC-DOC-2)', () => {
  test('lists the revisions of the notification outage, newest first, and reads the release as it was', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, OUTAGE);
    const picker = page.getByRole('combobox', { name: 'Show the document as it was' });
    await expect(picker.locator('option').first()).toHaveText('Current state');
    await expect(picker.locator('option').nth(1)).toContainText('Released as v1');
    await picker.selectOption({ index: 1 });
    await expect(page).toHaveURL(incidentAddress(OUTAGE, { stage: 'triage', at: 'v1' }));
    await expect(page.getByTestId('revision-notice')).toContainText('Released as v1');
    await expect(page.getByTestId('revision-notice')).toContainText('Noor Haddad');
    // A revision is read only, has no steps and no save, and its clock is stopped.
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    await expect(page.getByTestId('save-everyone')).toHaveCount(0);
    await expect(page.getByTestId('transition-bar')).toHaveCount(0);
    await expect(page.getByTestId('clock-stopped')).toBeVisible();
    await expect(page.getByTestId('stage-form').locator('input, select, textarea')).toHaveCount(0);
    await page.getByTestId('revision-back').click();
    await expect(page).toHaveURL(incidentAddress(OUTAGE, { stage: 'triage' }));
    await expectNoSeriousViolations(page, 'incident: a revision');
  });

  test('the release v1 is an address of its own, and the stage of the address stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, incidentAddress(OUTAGE, { at: 'v1', stage: 'notifications' }));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'notifications');
    await expect(page.getByTestId('revision-notice')).toBeVisible();
    await expect(page.getByTestId('notification-nis2-early-warning')).toBeVisible();
  });
});

test.describe('the report preview (UC-IR-3, AUN-IR-1)', () => {
  test('is read on the page, in English, rendered by section, and says that it is a preview', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    const renders = [];
    page.on('request', (sent) => {
      if (sent.method() === 'POST' && sent.url().endsWith('/api/v1/render/asciidoc')) {
        renders.push(sent.postDataJSON().source);
      }
    });
    await loginToSheet(page, CARD_DATA);
    const block = page.getByTestId('report-block');
    await expect(block).toContainText('The report is read here, not downloaded.');
    await expect(page.getByTestId('report-preview')).toHaveCount(0);
    await page.getByTestId('report-toggle').click();
    const preview = page.getByTestId('report-preview');
    await expect(preview).toBeVisible();
    await expect(page.getByTestId('report-source')).toHaveText(
      'A preview generated from the saved state as of Nov 26, 2026, 11:00 AM. It is not committed and may be incomplete.',
    );
    await expect(page.getByTestId('report-english')).toHaveText(
      'The report is written in English, whatever language the app shows.',
    );
    // One block for each section of the report, each rendered on its own. The title is the heading of the sheet; the
    // headings of the report go one level down, under the heading of the section of the report.
    const sections = page.getByTestId('report-section');
    await expect(sections).toHaveCount(8);
    await expect(preview.getByRole('heading', { level: 1 })).toHaveCount(0);
    await expect(preview.getByRole('heading', { level: 3 })).toHaveText([
      'Summary',
      'Affected services',
      'Deadlines',
      'Notifications',
      'Triage',
      'Privacy assessment',
      'Response',
      'Review',
    ]);
    // The section of the deadlines says that one was missed; what the mock renders of the source is its own.
    await expect(sections.nth(2)).toContainText('MISSED');
    // Each section went to the render request on its own, one level down, far below the limit of the request.
    expect(renders).toHaveLength(8);
    for (const source of renders) {
      expect(source.startsWith('=== ')).toBe(true);
      expect(new TextEncoder().encode(source).length).toBeLessThan(65_536);
    }
    // The read of the report is one request; the render is the server's, and nothing is downloaded.
    expect(
      sentTo(await acts(request), reportPath(CARD_DATA)).filter((act) => act.method !== 'GET'),
    ).toEqual([]);
    await expectNoSeriousViolations(page, 'incident: the report');
    await page.getByTestId('report-toggle').click();
    await expect(page.getByTestId('report-preview')).toHaveCount(0);
  });

  test('the report of a released incident is the one the release committed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, OUTAGE);
    await page.getByTestId('report-toggle').click();
    await expect(page.getByTestId('report-source')).toContainText(
      'The report that the release committed, as of Nov 18, 2026, 11:00 AM.',
    );
  });

  test('a report that cannot be read is told as an error, and the sheet stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await refuseRead(page, `**${reportPath(CARD_DATA)}`, 503, {
      outcome: 'GIT_UNAVAILABLE',
      message: 'The Git server cannot be reached.',
    });
    await loginToSheet(page, CARD_DATA);
    await page.getByTestId('report-toggle').click();
    await expect(page.getByTestId('report-preview')).toContainText(
      'The Git server cannot be reached.',
    );
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
  });
});

test.describe('the deadlines in the Due list (UC-IR-2, UC-DOC-9)', () => {
  test('lists the deadlines of the incidents that wait, each with its rule, and leads to the notices of the incident', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await pinClock(page);
    await page.goto('/api/v1/auth/login?return=%2F');
    const list = page.getByTestId('due-list');
    await expect(list).toBeVisible();
    const deadlines = list.locator('li[data-kind="deadline"]');
    await expect(deadlines).toHaveCount(3);
    expect(await deadlines.evaluateAll((items) => items.map((item) => item.dataset.lens))).toEqual([
      'incidents',
      'incidents',
      'incidents',
    ]);
    const links = deadlines.getByRole('link');
    await expect(links).toHaveText([
      'Card data exposed in the checkout log: Notice to the supervisory authority',
      'Phishing mail with a forged payment link: Notice to the supervisory authority',
      'Card data exposed in the checkout log: NIS2 final report',
    ]);
    expect(
      await links.evaluateAll((anchors) => anchors.map((anchor) => anchor.getAttribute('href'))),
    ).toEqual([
      incidentAddress(CARD_DATA, { stage: 'notifications' }),
      incidentAddress(PHISHING, { stage: 'notifications' }),
      incidentAddress(CARD_DATA, { stage: 'notifications' }),
    ]);
    // The missed deadline is overdue, in a box; the open ones are dates. The kind is told with the lens.
    await expect(deadlines.first()).toContainText('Deadline in Incidents');
    await expect(deadlines.first().getByTestId('due-overdue')).toHaveText('4 days overdue');
    await expect(deadlines.nth(1)).toContainText('Due tomorrow');
    await expect(deadlines.nth(1).getByTestId('due-overdue')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'due: the deadlines of incidents');
    // The link opens the incident at its notices, where the deadline is met.
    await links.nth(1).click();
    await expect(page).toHaveURL(incidentAddress(PHISHING, { stage: 'notifications' }));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'notifications');
    await expect(tab(page, 'notifications')).toHaveAttribute('aria-selected', 'true');
  });
});

test.describe('the sheet and the lists follow the stream (AUN-WEB-5)', () => {
  test('reads the incident again when a stage was reopened by someone else, without the person doing anything', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    expect(await tabStatuses(page)).toEqual(statusesOf(CREDENTIAL_STUFFING.stages));
    // The state where Alex reopened the triage plays the event `document-saved`.
    await gotoState(request, 'incident-triage-reopened');
    await expect(tab(page, 'triage')).toHaveAttribute('data-status', 'open');
    expect(await tabStatuses(page)).toEqual([
      'open',
      'not-applicable',
      'completed',
      'not-applicable',
      'open',
    ]);
    await expect(tab(page, 'response')).toContainText(
      'Signed off before an earlier stage was reopened',
    );
    await expect(page.getByTestId('stage-bar')).not.toContainText('Complete Response first.');
  });

  test('an incident that is being edited keeps what the person typed when someone else saved', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, PHISHING, 'privacy-assessment');
    await field(page.getByTestId('stage-form'), '/risk')
      .getByRole('combobox')
      .selectOption({ label: 'High risk' });
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'draft');
    await gotoState(request, 'incident-privacy-completed');
    // The stage is signed off by the other person; what was typed is still on the page.
    await expect(tab(page, 'privacy-assessment')).toHaveAttribute('data-status', 'completed');
    await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-state', 'saved');
    await expect(page.getByTestId('save-state')).not.toHaveAttribute('data-state', 'clean');
    // The refresh did not replace the choice by the saved value: it is still the one shown for the stage.
    await expect(page.getByTestId('stage-form')).toContainText('High risk');
  });

  test('the year follows: a stage that was completed shows in the row', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    expect(await rowStatuses(page, CREDENTIAL_STUFFING)).toEqual(
      statusesOf(CREDENTIAL_STUFFING.stages),
    );
    await gotoState(request, 'incident-review-completed');
    await expect
      .poll(() => rowStatuses(page, CREDENTIAL_STUFFING))
      .toEqual(['completed', 'not-applicable', 'completed', 'not-applicable', 'completed']);
  });

  test('a new incident heads the list of the year and the figures of the years', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    await expect(page.getByTestId(`incident-${CREATED.id}`)).toHaveCount(0);
    await gotoState(request, 'incident-created');
    await expect(page.getByTestId(`incident-${CREATED.id}`)).toBeVisible();
    expect(await rowIds(page, 'incident-list', 'incident-')).toEqual([
      CREATED.id,
      ...YEAR_2026.map((incident) => incident.id),
    ]);
    await expect(page.getByTestId('year-2026')).toContainText('8 incidents, 7 not released');
    await expect(page.getByTestId(`incident-${CREATED.id}`)).toContainText(CREATED.title);
  });

  test('the step of the workflow of someone else is read as it happens, up to the release as a step', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-review-completed');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    await gotoState(request, 'incident-submitted');
    await expect(page.getByTestId('document-state')).toHaveText('In review');
    await expect(page.getByTestId('transition-incident.release')).toBeVisible();
    await gotoState(request, 'incident-released');
    await expect(page.getByTestId('document-state')).toHaveText('Released as v1');
    await expect(page.getByTestId('released-notice')).toBeVisible();
    await expect(page.getByTestId('clock-stopped')).toBeVisible();
    await expect(page.getByTestId('transition-bar')).toHaveCount(0);
    await expect(page.getByTestId('release-block')).toContainText(CREDENTIAL_STUFFING.id);
  });

  test('reads again for an event of an incident repository only', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CREDENTIAL_STUFFING);
    const reads = { incident: 0, year: 0, years: 0 };
    page.on('request', (sent) => {
      if (sent.method() !== 'GET') return;
      const path = new URL(sent.url()).pathname;
      if (path === readPath(CREDENTIAL_STUFFING)) reads.incident += 1;
      if (path === yearPath(2026)) reads.year += 1;
      if (path === YEARS_PATH) reads.years += 1;
    });
    const by = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };
    // The events arrive in the order they were sent: a document of another repository comes first, and no read follows it.
    await broadcast(request, 'document-saved', {
      repository: 'samm-assessments',
      id: 'payments-2026-q4',
      fields: ['/answers/sb-b-1'],
      part: 'data',
      by,
    });
    await broadcast(request, 'document-saved', {
      repository: 'isms-incidents-2026',
      id: CREDENTIAL_STUFFING.id,
      fields: ['/lessons'],
      part: 'review',
      by,
    });
    await expect
      .poll(() => reads.incident, { message: 'the read of the incident' })
      .toBeGreaterThan(0);
    await expect.poll(() => reads.years, { message: 'the read of the years' }).toBeGreaterThan(0);
    expect(reads.incident).toBe(1);
    expect(reads.years).toBe(1);
  });
});

test.describe('the lens is written in German', () => {
  test('the years, the rows of a year and the way to a new incident are German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, yearAddress(2026));
    await useLanguage(page, 'de');
    const current = page.getByTestId('year-2026');
    await expect(current).toContainText('Laufendes Jahr');
    await expect(current).toContainText('Ein Vorfall mit versäumter Frist');
    await expect(current).toContainText('7 Vorfälle, 6 nicht freigegeben');
    await expect(current).toContainText('Aufbewahrt bis 31.12.2031');
    await expect(page.getByTestId('new-incident-link')).toHaveText('Neuer Vorfall');
    const card = page.getByTestId(`incident-${CARD_DATA.id}`);
    await expect(card).toContainText('Entwurf');
    await expect(card).toContainText('Schweregrad: Hoch');
    await expect(card).toContainText('2 Fristen versäumt');
    await expect(card).toContainText('1 offen, 1 eingehalten');
    await expect(card).toContainText('Als Nächstes: NIS2-Abschlussbericht, 22.12.2026');
    await expect(card).toContainText('Bekannt seit 19.11.2026');
    await expect(page.getByTestId(`incident-${CREDENTIAL_STUFFING.id}`)).toContainText(
      'Keine Frist gilt',
    );
    await expect(page.getByTestId(`incident-${OUTAGE.id}`)).toContainText('Freigegeben als v1');
    await expectNoSeriousViolations(page, 'incidents: a year in German');
  });

  test('the tabs, the clock and the notices of the card data are German, the amounts of time in the right case', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, CARD_DATA, 'notifications');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('stage-tabs')).toHaveAccessibleName('Phasen des Vorfalls');
    for (const [index, stage] of STAGES.entries()) {
      await expect(tab(page, stage)).toContainText(STAGE_NAMES[stage].de);
      await expect(tab(page, stage)).toContainText(
        ['Abgeschlossen', 'Offen', 'Entfällt'][
          ['completed', 'open', 'not-applicable'].indexOf(statusesOf(CARD_DATA.stages)[index])
        ],
      );
    }
    await expect(page.getByTestId('deadline-clock')).toHaveAccessibleName('Meldefristen');
    const missed = clockRow(page, 'gdpr-art33');
    await expect(missed).toContainText('Meldung an die Aufsichtsbehörde');
    await expect(missed).toContainText('DSGVO Art. 33: 72 Stunden nach Kenntnis');
    await expect(missed).toContainText('Versäumt');
    await expect(missed).toContainText('22.11.2026, 08:40');
    // An amount of time stands in the case the sentence asks for: "4 Tage überfällig", "Noch 26 Tage bis zur Fälligkeit".
    await expect(missed).toContainText('4 Tage überfällig');
    await expect(clockRow(page, 'nis2-final-report')).toContainText(
      'Noch 26 Tage bis zur Fälligkeit',
    );
    await expect(clockRow(page, 'nis2-notification')).toContainText(
      'Gesendet am 22.11.2026, 11:20, 3 Stunden zu spät',
    );
    const table = page.getByTestId('notifications-table');
    await expect(table.getByRole('columnheader')).toHaveText([
      'Meldung',
      'Gesendet',
      'Empfänger',
      'Kanal',
      'Frist',
    ]);
    await expect(page.getByTestId('notification-nis2-early-warning')).toContainText(
      'Aktenzeichen BSI-2026-4417',
    );
    await expect(page.getByTestId('notification-nis2-early-warning')).toContainText('Meldeportal');
    await expect(page.getByTestId('notification-nis2-notification')).toContainText(
      'Zu spät gesendet',
    );
    await expect(page.getByTestId('stage-form-section')).toContainText('Meldung erfassen');
    await expect(page.getByTestId('transition-bar')).toContainText(
      'Schließen Sie zuerst diese Phasen ab: Datenschutzbewertung, Reaktion, Meldungen, Auswertung.',
    );
    await expectNoSeriousViolations(page, 'incident: the notices in German');
  });

  test('the conditions of a stage that does not apply, the marker and the refusal are German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToSheet(page, SUSPICIOUS, 'triage');
    await useLanguage(page, 'de');
    await expect(tab(page, 'privacy-assessment')).toContainText(
      'Noch nicht beantwortet: gilt, wenn personenbezogene Daten betroffen sind',
    );
    await expect(page.getByTestId('stage-complete')).toHaveText('Phase abschließen');
    await expect(page.getByTestId('stage-step-up-note')).toHaveCount(0);
    await page.getByTestId('stage-complete').click();
    await expect(
      page.getByText('Ersteinschätzung lässt sich noch nicht abschließen'),
    ).toBeVisible();
    await expect(page.getByTestId('missing-fields').getByRole('button')).toHaveText([
      'Zu Schweregrad',
      'Zu Personenbezogene Daten betroffen',
      'Zu Erheblich nach NIS2',
    ]);
    await expectNoSeriousViolations(page, 'incident: the refusal in German');
    await page.goto(incidentAddress(CREDENTIAL_STUFFING, { stage: 'privacy-assessment' }));
    await expect(page.getByTestId('stage-not-applicable')).toContainText(
      'Entfällt: gilt, wenn personenbezogene Daten betroffen sind',
    );
    await expect(page.getByTestId('stage-not-applicable')).toContainText(
      'Was hier eingetragen wurde, bleibt im Bericht erhalten.',
    );
    await page.goto(incidentAddress(WRONG_RECIPIENT, { stage: 'response' }));
    await expect(page.getByTestId('stage-predecessor-reopened')).toContainText(
      'Diese Phase erneut prüfen',
    );
  });

  test('the confirmation of the review, the report and the release are German, the release with the word of the act only', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('document-state')).toHaveText('In Prüfung');
    const release = page.getByTestId('transition-incident.release');
    await expect(release).toHaveText('Freigeben');
    await expect(release).not.toContainText(/Passwort|Schritt|MFA|Token/i);
    await expect(page.getByTestId('step-up-note')).toHaveText(
      'Vor der Freigabe bestätigen Sie noch einmal Ihre Identität.',
    );
    await page.getByTestId('report-toggle').click();
    await expect(page.getByTestId('report-english')).toHaveText(
      'Der Bericht ist auf Englisch verfasst, in welcher Sprache die App auch angezeigt wird.',
    );
    await expect(page.getByTestId('report-source')).toContainText('Eine Vorschau');
    await expect(page.getByTestId('report-toggle')).toHaveText('Bericht ausblenden');
    await expectNoSeriousViolations(page, 'incident: in review in German');
  });

  test('the step of the review asks for the password in German', async ({ page, request }) => {
    await useScenario(request, 'workshop#incident-review-stepped-up');
    await patchRead(page, '**/api/v1/status', (body) => ({
      ...body,
      loginProvider: 'local',
      stepUp: 'password',
    }));
    await loginToSheet(page, CREDENTIAL_STUFFING, 'review');
    await useLanguage(page, 'de');
    await expect(page.getByTestId('stage-step-up-note')).toHaveText(
      'Vor dem Abschluss dieser Phase bestätigen Sie noch einmal Ihre Identität.',
    );
    await page.getByTestId('stage-complete').click();
    await expect(page.getByRole('dialog')).toContainText('Identität bestätigen');
    await expect(page.getByRole('dialog')).toContainText(
      'Geben Sie Ihr Passwort ein, um die Phase Auswertung von Credential stuffing against the login form abzuschließen.',
    );
  });

  test('the earlier state, the released incident and the stopped clock are German', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, incidentAddress(OUTAGE, { at: 'v1' }));
    await useLanguage(page, 'de');
    await expect(page.getByTestId('revision-notice')).toContainText('Freigegeben als v1');
    await expect(page.getByTestId('clock-stopped')).toHaveText(
      'Die Uhr wurde am 18.11.2026, 11:00 angehalten. Offene Fristen können in diesem Vorfall nicht mehr eingehalten werden.',
    );
    await expect(page.getByTestId('save-state')).toContainText(
      'Ein früherer Stand kann nur gelesen werden.',
    );
    await page.goto(incidentAddress(OUTAGE));
    await expect(page.getByTestId('released-notice')).toContainText(
      'Eine Änderung ist ein neuer Vorfall, der diesen nennt.',
    );
    await expect(page.getByTestId('save-state')).toContainText(
      'Freigegeben und eingefroren. Hier kann sich nichts mehr ändern.',
    );
  });

  test('the deadlines of the Due list carry the German name of the rule', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await pinClock(page);
    await page.goto('/api/v1/auth/login?return=%2F');
    await expect(page.getByTestId('due-list')).toBeVisible();
    await useLanguage(page, 'de');
    const deadlines = page.getByTestId('due-list').locator('li[data-kind="deadline"]');
    await expect(deadlines.getByRole('link')).toHaveText([
      'Card data exposed in the checkout log: Meldung an die Aufsichtsbehörde',
      'Phishing mail with a forged payment link: Meldung an die Aufsichtsbehörde',
      'Card data exposed in the checkout log: NIS2-Abschlussbericht',
    ]);
    await expect(deadlines.first()).toContainText('Frist in Vorfälle');
  });
});
