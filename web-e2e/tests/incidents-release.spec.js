import { expect, test } from '@playwright/test';
import { expectNoSeriousViolations } from './helpers/a11y.js';
import { field, sentTo, useLanguage } from './helpers/documents.js';
import {
  CREATED,
  CREDENTIAL_STUFFING,
  OUTAGE,
  YEAR_2026,
  changes,
  createPath,
  diffPath,
  incidentAddress,
  loginToIncidents,
  loginToNew,
  loginToRelease,
  newIncidentAddress,
  pinClock,
  readPath,
  releaseAddress,
  releasePath,
  withOpenDeadlines,
  yearAddress,
} from './helpers/incidents.js';
import { acts, clearActs, gotoState, useScenario } from './helpers/mock.js';
import { patchRead } from './helpers/samm.js';

/**
 * The review and release of an incident and the form of a new incident (UC-IR-1, UC-IR-3, AUN-WEB-6, rest-api.adoc, Incident
 * Report Requests): the diff by stage, the deadlines still open, the refusals, the confirmation, the seal and the stopped
 * clock; the sheet of a new incident with its refusals. They run against the profiles `workshop` and `read-only` of the mock
 * and its `incident-*` states (web-mock/README.adoc, Incident Reports). Every page is pinned to the instant the mock reads at
 * (`NOW`), and the suite pins the zone to Europe/Berlin.
 */

/** The title the incident of the release carries. */
const TITLE = CREDENTIAL_STUFFING.title;

/** @returns the line of the release page that a refusal or a success is announced in */
function notices(page) {
  return page.getByTestId('release-view').getByTestId('notice');
}

/** Makes the status of the page say that a local user confirms with the password. */
async function confirmWithPassword(page) {
  await patchRead(page, '**/api/v1/status', (body) => ({
    ...body,
    loginProvider: 'local',
    stepUp: 'password',
  }));
}

/**
 * Fails when a control of the release page names how a person is confirmed: the act reads "Release" or "Freigeben" and
 * nothing else on a button or a link carries a mechanism.
 */
async function expectNoMechanismOnControls(page, pattern) {
  const controls = page.getByTestId('release-view').locator('button, a[href]');
  const texts = await controls.allInnerTexts();
  expect(texts.length).toBeGreaterThan(0);
  for (const text of texts) expect(text).not.toMatch(pattern);
}

/** @returns the parts of the record in the order shown, by the test ids of its groups */
async function recordGroups(page) {
  return page
    .getByTestId('release-record')
    .locator('[data-testid^="record-"]')
    .evaluateAll((groups) =>
      groups
        .map((group) => group.dataset.testid)
        .filter((id) => /^record-[a-z-]+$/.test(id))
        .map((id) => id.replace('record-', '')),
    );
}

test.describe('the review of an incident before it is released (UC-IR-3, AUN-WEB-6)', () => {
  test('shows what is released: the facts, the diff by stage and by field, and the checks, in the words of the domain', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Release ${TITLE}`);
    // The facts: the incident, its year, when the organisation became aware, how far the stages are, the deadlines.
    const facts = page.getByTestId('release-facts');
    await expect(facts).toContainText(TITLE);
    await expect(facts).toContainText('2026');
    await expect(facts).toContainText('Nov 10, 2026');
    await expect(facts).toContainText('3 of 3 completed');
    await expect(facts).toContainText('No deadline applies');
    // The record: the title first, then every stage that changed, a stage that did not apply is not drawn.
    expect(await recordGroups(page)).toEqual(['data', 'triage', 'response', 'review']);
    await expect(page.getByText('The first release: everything in the document')).toBeVisible();
    const data = page.getByTestId('record-data');
    await expect(data).toContainText('Title');
    await expect(data).toContainText(TITLE);
    // A group is named by the stage and counts its changes.
    const triage = page.getByTestId('record-triage');
    await expect(triage).toContainText('Triage');
    await expect(triage).toContainText('Severity');
    await expect(triage).toContainText('Medium');
    await expect(triage).toContainText('Classification');
    await expect(triage).toContainText('Security incident');
    await expect(page.getByTestId('record-response')).toContainText('Resolved at');
    await expect(page.getByTestId('record-review')).toContainText('Root-cause analysis');
    // The sign-off of a stage is a row of its own: who signed it off, and when.
    const signed = page.getByTestId('release-completion');
    await expect(signed).toHaveCount(3);
    await expect(signed.first()).toContainText('Alex Example');
    await expect(page.getByTestId('record-triage')).toContainText('Stage signed off');
    // The checks in the margin.
    await expect(page.getByText('Every stage that applies is completed')).toBeVisible();
    await expect(page.getByText('Submitted for review by Alex Example')).toBeVisible();
    await expect(page.getByText('No deadline is open')).toHaveCount(0);
    await expect(
      page.getByText('You confirm your identity once more before the release.'),
    ).toBeVisible();
    // The act is the word of the act only; no control names how the person is confirmed.
    const act = page.getByTestId('release-act');
    await expect(act).toHaveText('Release');
    await expect(act).not.toHaveAttribute('aria-disabled', 'true');
    await expectNoMechanismOnControls(page, /password|step|MFA|token|tag|sign/i);
    await expect(page.getByTestId('release-back')).toHaveText('Back to the incident');
    // Looking writes nothing.
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident release: review');
  });

  test('is written in German: the act is "Freigeben" and no mechanism stands on a control', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('release-record')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${TITLE} freigeben`);
    await expect(page.getByTestId('release-act')).toHaveText('Freigeben');
    await expectNoMechanismOnControls(page, /Passwort|Schritt|MFA|Token|Tag|signier/i);
    await expect(page.getByTestId('release-back')).toHaveText('Zurück zum Vorfall');
    await expect(page.getByTestId('release-facts')).toContainText('3 von 3 abgeschlossen');
    await expect(page.getByTestId('release-facts')).toContainText('10.11.2026');
    await expect(page.getByTestId('record-data')).toContainText('Titel');
    await expect(page.getByTestId('record-triage')).toContainText('Ersteinschätzung');
    await expect(page.getByTestId('record-triage')).toContainText('Phase bestätigt');
    await expect(page.getByTestId('record-triage')).toContainText('Schweregrad');
    await expect(page.getByText('Jede Phase, die gilt, ist abgeschlossen')).toBeVisible();
    await expect(
      page.getByText('Vor der Freigabe bestätigen Sie noch einmal Ihre Identität.'),
    ).toBeVisible();
    await expectNoSeriousViolations(page, 'incident release: review in German');
  });

  test('lists the deadlines that are still open before the person confirms, and they never block the release', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await clearActs(request);
    // The mock has no incident in review with a deadline still open: the read of the page is patched (a deadline that is
    // open, one that is missed and was never sent, one that was met, one that was sent late), not what the mock holds.
    await withOpenDeadlines(page, CREDENTIAL_STUFFING);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await expect(page.getByRole('heading', { name: 'Deadlines still open' })).toBeVisible();
    const open = page.getByTestId('release-deadlines');
    await expect(open.locator('li')).toHaveCount(2);
    await expect(open.getByTestId('release-deadlines-gdpr-art33-')).toContainText(
      'Notice to the supervisory authority',
    );
    await expect(open.getByTestId('release-deadlines-gdpr-art33-')).toContainText('Overdue by');
    await expect(open.getByTestId('release-deadlines-nis2-final-report-')).toContainText(
      'NIS2 final report',
    );
    // A deadline that was met, or sent late, is a fact and no duty.
    await expect(open.getByTestId('release-deadlines-nis2-early-warning-')).toHaveCount(0);
    await expect(open.getByTestId('release-deadlines-nis2-notification-')).toHaveCount(0);
    await expect(page.getByText('The clock stops with the release.')).toBeVisible();
    await expect(page.getByTestId('release-facts')).toContainText('1 open, 1 met, 2 missed');
    await expect(page.getByText('2 deadlines are still open')).toBeVisible();
    // The way to record the notice that was sent leads to the stage of the notices.
    const record = page.getByTestId('release-record-notice');
    await expect(record).toHaveText('Record a notice');
    await expect(record).toHaveAttribute(
      'href',
      incidentAddress(CREDENTIAL_STUFFING, { stage: 'notifications' }),
    );
    // The deadlines tell and do not block: the act stays enabled.
    await expect(page.getByTestId('release-act')).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('release-act')).toHaveText('Release');
    await expectNoMechanismOnControls(page, /password|step|MFA|token|tag|sign/i);
    await expectNoSeriousViolations(page, 'incident release: open deadlines');
    // The release is made with the deadlines open, and the clock stops with it.
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    await expect(page.getByTestId('release-seal')).toHaveAttribute('data-sealed', 'v1');
    await expect(page.getByTestId('release-clock-stopped')).toContainText(
      'The clock stopped at Nov 26, 2026',
    );
    await expect(page.getByRole('heading', { name: 'Deadlines at the release' })).toBeVisible();
    await expect(page.getByTestId('release-record-notice')).toHaveCount(0);
    expect(sentTo(await acts(request), releasePath(CREDENTIAL_STUFFING), 'POST')).toHaveLength(1);
    await expectNoSeriousViolations(page, 'incident release: open deadlines, released');
  });

  test('the open deadlines are German in the page, in the margin and after the release', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await withOpenDeadlines(page, CREDENTIAL_STUFFING);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await useLanguage(page, 'de');
    await expect(page.getByRole('heading', { name: 'Noch offene Fristen' })).toBeVisible();
    await expect(page.getByTestId('release-deadlines-gdpr-art33-')).toContainText(
      'Meldung an die Aufsichtsbehörde',
    );
    await expect(page.getByText('2 Fristen sind noch offen')).toBeVisible();
    await expect(page.getByTestId('release-facts')).toContainText(
      '1 offen, 1 eingehalten, 2 versäumt',
    );
    await expect(page.getByTestId('release-record-notice')).toHaveText('Meldung erfassen');
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Freigegeben als v1');
    await expect(page.getByTestId('release-clock-stopped')).toContainText(
      'Die Uhr wurde am 26.11.2026, 11:05 angehalten.',
    );
    await expect(page.getByRole('heading', { name: 'Fristen bei der Freigabe' })).toBeVisible();
    await expect(page.getByTestId('release-seal')).toHaveAttribute('data-sealed', 'v1');
  });
});

test.describe('the release (UC-IR-3, AUN-WEB-6)', () => {
  test('signs and tags the incident: the seal, the tag, one request, and the sheet of the incident is released', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    await expect(page.getByTestId('release-seal')).toHaveAttribute('data-sealed', 'v1');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`${TITLE} is released`);
    await expect(page.getByTestId('release-tag')).toContainText(
      `incidents/${CREDENTIAL_STUFFING.id}/v1`,
    );
    // Without a deadline open the clock has nothing to show: the page does not say it stopped.
    await expect(page.getByTestId('release-clock-stopped')).toHaveCount(0);
    // The notary stands beside the seal of a document, never of an incident, whose deadlines weigh on the page.
    await expect(page.locator('.mascot')).toHaveCount(0);
    await expect(page.getByTestId('release-act')).toHaveCount(0);
    const sent = sentTo(await acts(request), releasePath(CREDENTIAL_STUFFING), 'POST');
    expect(sent).toHaveLength(1);
    expect(changes(await acts(request))).toEqual([`POST ${releasePath(CREDENTIAL_STUFFING)}`]);
    await expectNoSeriousViolations(page, 'incident release: done');
    // The way on leads to the incident as it is released now.
    await page.getByTestId('release-open').click();
    await expect(page).toHaveURL(incidentAddress(CREDENTIAL_STUFFING));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    await expect(page.getByTestId('document-state')).toContainText('Released as v1');
  });

  test('goes back to the incident without writing anything', async ({ page, request }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await page.getByTestId('release-back').click();
    await expect(page).toHaveURL(incidentAddress(CREDENTIAL_STUFFING));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    expect(changes(await acts(request))).toEqual([]);
  });

  test('with the identity provider: the step-up first, then the same release goes through', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-release-step-up');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/api/v1/releases/') && response.status() === 403,
    );
    await page.getByTestId('release-act').click();
    await demanded;
    // The step-up address returns to the release page; the act is chosen again.
    await expect(page).toHaveURL(releaseAddress(CREDENTIAL_STUFFING));
    await expect(page.getByTestId('release-record')).toBeVisible();
    await expect(page.getByTestId('release-act')).not.toHaveAttribute('aria-busy', 'true');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    expect(
      sentTo(await acts(request), releasePath(CREDENTIAL_STUFFING), 'POST').length,
    ).toBeGreaterThan(1);
  });

  test('with the password of a local user: the question comes before anything is sent, and the password goes with the release', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-release-stepped-up');
    await clearActs(request);
    await confirmWithPassword(page);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await page.getByTestId('release-act').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm your identity');
    await expect(dialog).toContainText(`Enter your password to release ${TITLE}.`);
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident release: the password question');
    // Cancelling sends nothing and leaves the act to be chosen again.
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    expect(changes(await acts(request))).toEqual([]);
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await page.getByTestId('release-act').click();
    await page.getByTestId('release-password').fill('local-password');
    // The mock answers a release whatever it carries, so the transport is read from the request itself.
    const releasing = page.waitForRequest(
      (sentRequest) =>
        sentRequest.method() === 'POST' &&
        sentRequest.url().endsWith(releasePath(CREDENTIAL_STUFFING)),
    );
    await page.getByTestId('release-confirm').click();
    expect((await releasing).postDataJSON()).toMatchObject({ password: 'local-password' });
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    // The password is sent with the request and never kept by the mock's record of it.
    expect(JSON.stringify(await acts(request))).not.toContain('local-password');
  });

  test('reads the changes again when someone saved meanwhile, is refused, and releases what was shown after it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-release-changed');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    let diffReads = 0;
    page.on('request', (sent) => {
      if (
        sent.method() === 'GET' &&
        new URL(sent.url()).pathname === diffPath(CREDENTIAL_STUFFING)
      ) {
        diffReads += 1;
      }
    });
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/api/v1/releases/') && response.status() === 409,
    );
    await page.getByTestId('release-act').click();
    await demanded;
    await expect(notices(page).first()).toContainText(
      'Someone saved after you opened the release. Check the changes again.',
    );
    await expect.poll(() => diffReads).toBeGreaterThan(0);
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident release: changed since the review');
    // The record that was read again is the one the release goes through with.
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-done')).toContainText('Released as v1');
    expect(sentTo(await acts(request), releasePath(CREDENTIAL_STUFFING), 'POST')).toHaveLength(2);
  });

  test('tells that someone released the incident meanwhile, and the act is disabled with its reason', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await gotoState(request, 'incident-release-released-meanwhile');
    await page.getByTestId('release-act').click();
    await expect(notices(page).first()).toContainText(
      'Someone released this document while you were reviewing it. Nothing was changed.',
    );
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
  });

  test('a stage that is not completed refuses the release and names each stage as a way to it, and the record is read again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-release-stages-open');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    let reads = 0;
    page.on('request', (sent) => {
      if (
        sent.method() === 'GET' &&
        new URL(sent.url()).pathname === readPath(CREDENTIAL_STUFFING)
      ) {
        reads += 1;
      }
    });
    const demanded = page.waitForResponse(
      (response) => response.url().includes('/api/v1/releases/') && response.status() === 422,
    );
    await page.getByTestId('release-act').click();
    await demanded;
    const refusal = page.getByTestId('release-refusal');
    await expect(refusal).toContainText('The incident cannot be released yet');
    await expect(refusal).toContainText(
      'Nothing was released. Complete these stages, then release again.',
    );
    await expect(page.getByTestId('release-refusal-links').locator('li')).toHaveCount(1);
    const link = page.getByTestId('release-refusal-review');
    await expect(link).toHaveText('Open Review');
    await expect(link).toHaveAttribute(
      'href',
      incidentAddress(CREDENTIAL_STUFFING, { stage: 'review' }),
    );
    await expect.poll(() => reads).toBeGreaterThan(0);
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident release: stages open');
    // The link leads to the stage to complete.
    await link.click();
    await expect(page).toHaveURL(incidentAddress(CREDENTIAL_STUFFING, { stage: 'review' }));
    await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', 'review');
  });

  test('the refusal of a stage that is open is German, with the name of the stage in the link', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-release-stages-open');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await useLanguage(page, 'de');
    await page.getByTestId('release-act').click();
    await expect(page.getByTestId('release-refusal')).toContainText(
      'Der Vorfall lässt sich noch nicht freigeben',
    );
    await expect(page.getByTestId('release-refusal-review')).toHaveText('Auswertung öffnen');
    await expect(page.getByTestId('release-refusal')).toContainText(
      'Es wurde nichts freigegeben. Schließen Sie diese Phasen ab und geben Sie dann erneut frei.',
    );
  });

  test('says that the Git server cannot be reached, keeps the review, and the act can be chosen again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await gotoState(request, 'incident-git-unavailable');
    await page.getByTestId('release-act').click();
    await expect(page.getByRole('alert')).toContainText('The Git server cannot be reached.');
    await expect(page.getByTestId('release-done')).toHaveCount(0);
    await expect(page.getByTestId('release-record')).toBeVisible();
    await expect(page.getByTestId('release-act')).toBeEnabled();
    await expectNoSeriousViolations(page, 'incident release: the Git server is down');
  });
});

test.describe('where the release is not offered (UC-IR-3)', () => {
  test('a person without the approve right is told why, and nothing is sent', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    const act = page.getByTestId('release-act');
    await expect(act).toHaveAttribute('aria-disabled', 'true');
    await expect(act).toHaveText('Release');
    await expect(page.getByText('Releasing needs the approve right.')).toBeVisible();
    await act.click({ force: true });
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident release: no approve right');
  });

  test('an incident that is released already is disabled with its reason, and its record is the release unchanged', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToRelease(page, OUTAGE);
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('This document is released already.')).toBeVisible();
    await expect(page.getByText('Nothing changed since v1.')).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Release ${OUTAGE.title}`);
    // The clock of a released incident has stopped, as the sheet says.
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident release: released already');
  });

  test('a draft asks for the submit first', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Submit the document for review first.')).toBeVisible();
    // The check that the tag is made is not offered where nothing can be released.
    await expect(page.getByText('The release is signed in your name and tagged.')).toHaveCount(0);
    expect(changes(await acts(request))).toEqual([]);
  });

  test('says in German why the act is disabled', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToRelease(page, CREDENTIAL_STUFFING);
    await useLanguage(page, 'de');
    await expect(page.getByTestId('release-act')).toHaveText('Freigeben');
    await expect(page.getByTestId('release-act')).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByText('Reichen Sie das Dokument zuerst zur Prüfung ein.')).toBeVisible();
  });

  test('an incident that does not exist, and a year that does not exist, are not found', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await pinClock(page);
    await page.goto(`/api/v1/auth/login?return=${encodeURIComponent('/incidents')}`);
    await expect(page.getByTestId('incidents-view')).toBeVisible();
    // The mock has no route for an incident it does not know, so the 404 of the contract is answered here.
    await page.route(`**/api/v1/incidents/2026/01JZZZZZZZZZZZZZZZZZZZZZZZ`, (route) =>
      route.fulfill({ status: 404, json: { outcome: 'NOT_FOUND' } }),
    );
    await page.goto('/incidents/2026/01JZZZZZZZZZZZZZZZZZZZZZZZ/release');
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await expect(page.getByTestId('release-view')).toHaveCount(0);
    await page.route(`**/api/v1/incidents/2024/${CREDENTIAL_STUFFING.id}`, (route) =>
      route.fulfill({ status: 404, json: { outcome: 'NOT_FOUND' } }),
    );
    await page.goto(`/incidents/2024/${CREDENTIAL_STUFFING.id}/release`);
    await expect(page.getByTestId('not-found-view')).toBeVisible();
  });

  test('an incident that cannot be read is told as an error, not as a missing page', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-submitted');
    await pinClock(page);
    await page.route(`**${readPath(CREDENTIAL_STUFFING)}`, (route) =>
      route.fulfill({ status: 503, json: { outcome: 'GIT_UNAVAILABLE' } }),
    );
    await page.goto(
      `/api/v1/auth/login?return=${encodeURIComponent(releaseAddress(CREDENTIAL_STUFFING))}`,
    );
    await expect(page.getByTestId('release-view')).toBeVisible();
    await expect(page.getByRole('alert')).toContainText('The Git server cannot be reached.');
    await expect(page.getByTestId('release-act')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident release: read failed');
  });
});

test.describe('a new incident (UC-IR-1, AUN-WEB-4)', () => {
  test('the form asks for the title, and the act says what is missing until it is typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToNew(page);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('New incident');
    await expect(page.getByTestId('new-incident-sheet')).toContainText('An incident of 2026.');
    await expect(page.getByTestId('new-incident-sheet').getByLabel('Title')).toBeVisible();
    await expect(
      page.getByTestId('new-incident-sheet').getByLabel('Became aware at'),
    ).toBeVisible();
    const create = page.getByTestId('create-incident');
    await expect(create).toHaveText('Create incident');
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('new-incident-sheet')).toContainText('Enter a title first.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
    await expect(page.getByTestId('save-state')).toContainText('Not saved yet');
    // Only the title is mandatory: nothing else of the stages is asked for here.
    await expect(page.getByTestId('new-incident-sheet').getByLabel('Severity')).toHaveCount(0);
    await create.click({ force: true });
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident new: empty');
    await page.getByTestId('new-incident-sheet').getByLabel('Title').fill('  ');
    await expect(create).toHaveAttribute('aria-disabled', 'true');
    await page.getByTestId('new-incident-sheet').getByLabel('Title').fill(CREATED.title);
    await expect(create).not.toHaveAttribute('aria-disabled', 'true');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'changed');
    await expect(page.getByTestId('new-incident-sheet')).not.toContainText('Enter a title first.');
    await expectNoSeriousViolations(page, 'incident new: typed');
  });

  test('is created: the incident is opened, in the place of the form, and the year and the years are read again', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToIncidents(page, yearAddress(2026));
    await expect(page.getByTestId('year-2026')).toContainText('7 incidents, 6 not released');
    await page.getByTestId('new-incident-link').click();
    await expect(page.getByTestId('new-incident-sheet')).toBeVisible();
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Title').fill(CREATED.title);
    await sheet.getByLabel('Became aware at').fill('2026-11-26T09:30');
    await page.getByTestId('create-incident').click();
    await expect(page).toHaveURL(incidentAddress(CREATED));
    await expect(page.getByTestId('incident-sheet')).toBeVisible();
    await expect(page.getByTestId('document-state')).toHaveText('Draft');
    // One create, with the title and the awareness (the zone of the browser is Europe/Berlin).
    const created = sentTo(await acts(request), createPath(2026), 'POST');
    expect(created).toHaveLength(1);
    expect(created[0].body).toEqual({
      kind: 'incident',
      parts: {
        data: { fields: { '/title': CREATED.title } },
        triage: { fields: { '/aware-at': '2026-11-26T08:30:00Z' } },
      },
    });
    expect(changes(await acts(request))).toEqual([`POST ${createPath(2026)}`]);
    // The form took its own place in the history: back leads to the list the person came from, not to the empty form.
    await page.goBack();
    await expect(page).toHaveURL(yearAddress(2026));
    await expect(page.getByTestId('new-incident-sheet')).toHaveCount(0);
    // The year and the years were read again: the new incident heads the list, the figures count it.
    await expect(page.getByTestId(`incident-${CREATED.id}`)).toBeVisible();
    await expect(page.getByTestId('incident-list').locator('> li > a').first()).toHaveAttribute(
      'data-testid',
      `incident-${CREATED.id}`,
    );
    await expect(page.getByTestId('incident-list').locator('> li')).toHaveCount(
      YEAR_2026.length + 1,
    );
    await expect(page.getByTestId('year-2026')).toContainText('8 incidents, 7 not released');
  });

  test('a title alone is enough: the awareness is not sent when it is not typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToNew(page);
    await page.getByTestId('new-incident-sheet').getByLabel('Title').fill(`  ${CREATED.title}  `);
    await page.getByTestId('create-incident').click();
    await expect(page).toHaveURL(incidentAddress(CREATED));
    const created = sentTo(await acts(request), createPath(2026), 'POST');
    expect(created[0].body).toEqual({
      kind: 'incident',
      parts: { data: { fields: { '/title': CREATED.title } } },
    });
  });

  test('the server finds the title missing: it is told at the field and what was typed stays', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-create-invalid');
    await loginToNew(page);
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Became aware at').fill('2026-11-26T09:30');
    await sheet.getByLabel('Title').fill(CREATED.title);
    await page.getByTestId('create-incident').click();
    await expect(field(sheet, '/title')).toContainText('Fill in this field.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(page.getByTestId('save-state')).toContainText(
      'Some entries need a correction. Your text stays on this page.',
    );
    await expect(sheet.getByLabel('Title')).toHaveValue(CREATED.title);
    await expect(sheet.getByLabel('Became aware at')).toHaveValue('2026-11-26T09:30');
    await expect(page).toHaveURL(newIncidentAddress(2026));
    await expectNoSeriousViolations(page, 'incident new: the title is refused');
    // Typing again and trying again sends the request again: the form is not stuck.
    await page.getByTestId('create-incident').click();
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
  });

  test('an awareness outside the year is told at its field, in the words of the incident', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToNew(page);
    // The mock has no state that refuses a create for the year: only the create is answered here, once, and the
    // request never reaches the mock.
    let refused = 0;
    await page.route(`**${createPath(2026)}`, (route) => {
      if (route.request().method() !== 'POST' || refused > 0) return route.continue();
      refused += 1;
      return route.fulfill({
        status: 422,
        json: {
          outcome: 'VALIDATION',
          errors: [{ part: 'triage', pointer: '/aware-at', code: 'OUT_OF_YEAR' }],
        },
      });
    });
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Title').fill(CREATED.title);
    await sheet.getByLabel('Became aware at').fill('2025-12-31T23:30');
    await page.getByTestId('create-incident').click();
    await expect(field(sheet, '/aware-at')).toContainText(
      'This time is not in the year of the incident. Choose a time within that year.',
    );
    // The error stands at the awareness and not at the title.
    await expect(field(sheet, '/title')).not.toContainText('year of the incident');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(sheet.getByLabel('Became aware at')).toHaveValue('2025-12-31T23:30');
    expect(changes(await acts(request))).toEqual([]);
    await expectNoSeriousViolations(page, 'incident new: the awareness is out of the year');
    // A time in the year goes through the same request.
    await sheet.getByLabel('Became aware at').fill('2026-01-02T08:00');
    await page.getByTestId('create-incident').click();
    await expect(page).toHaveURL(incidentAddress(CREATED));
  });

  test('a create that needs the person to confirm again leaves for the identity provider, and nothing is kept', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await loginToNew(page);
    // The mock has no state that asks for a fresh login on a create: the first create is answered here, with the address of
    // the step-up the mock serves, and never reaches the mock.
    let demanded = 0;
    await page.route(`**${createPath(2026)}`, (route) => {
      if (route.request().method() !== 'POST' || demanded > 0) return route.continue();
      demanded += 1;
      return route.fulfill({
        status: 403,
        json: { outcome: 'STEP_UP_REQUIRED', stepUp: '/api/v1/auth/login?step-up=mfa' },
      });
    });
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Title').fill(CREATED.title);
    const left = page.waitForURL(/\/api\/v1\/auth\/login\?.*step-up=mfa/);
    await page.getByTestId('create-incident').click();
    await left;
    // The identity provider returns to the form; the app keeps nothing across the redirect, so the form is empty again and
    // nothing was created.
    await expect(page).toHaveURL(newIncidentAddress(2026));
    await expect(page.getByTestId('new-incident-sheet')).toBeVisible();
    await expect(page.getByTestId('new-incident-sheet').getByLabel('Title')).toHaveValue('');
    expect(changes(await acts(request))).toEqual([]);
  });

  test('a local user is asked for the password when the server requires it, and the same create goes out with it', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await clearActs(request);
    await confirmWithPassword(page);
    await loginToNew(page);
    // The mock has no state that asks a local user for the password on a create: the first create is answered here, and
    // the second goes to the mock.
    const bodies = [];
    await page.route(`**${createPath(2026)}`, (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      bodies.push(route.request().postDataJSON());
      if (bodies.length > 1) return route.continue();
      return route.fulfill({ status: 403, json: { outcome: 'STEP_UP_REQUIRED' } });
    });
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Title').fill(CREATED.title);
    await page.getByTestId('create-incident').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText('Confirm your identity');
    await expect(dialog).toContainText(
      `Enter your password to confirm “Create incident” for ${CREATED.title}.`,
    );
    await expectNoSeriousViolations(page, 'incident new: the password question');
    await page.getByTestId('create-password').fill('local-password');
    await page.getByTestId('create-confirm').click();
    await expect(page).toHaveURL(incidentAddress(CREATED));
    expect(bodies).toHaveLength(2);
    expect(bodies[0].password).toBeUndefined();
    expect(bodies[1].password).toBe('local-password');
    expect(JSON.stringify(await acts(request))).not.toContain('local-password');
  });

  test('says that the Git server cannot be reached, and keeps what was typed', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-git-unavailable');
    await loginToNew(page);
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Title').fill(CREATED.title);
    await page.getByTestId('create-incident').click();
    await expect(page.getByRole('alert')).toContainText('The Git server cannot be reached.');
    await expect(page.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    await expect(sheet.getByLabel('Title')).toHaveValue(CREATED.title);
    await expect(page).toHaveURL(newIncidentAddress(2026));
    await expectNoSeriousViolations(page, 'incident new: the Git server is down');
  });

  test('a year without a repository is not found, and no form is offered', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop#incident-year-missing');
    await pinClock(page);
    await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(newIncidentAddress(2026))}`);
    await expect(page.getByTestId('not-found-view')).toBeVisible();
    await expect(page).toHaveURL(newIncidentAddress(2026));
    await expect(page.getByTestId('new-incident-sheet')).toHaveCount(0);
    await expect(page.getByTestId('create-incident')).toHaveCount(0);
    await expectNoSeriousViolations(page, 'incident new: the year is missing');
  });

  test('a person who may only read gets a sheet that says so, and no form', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'read-only');
    await loginToIncidents(page, newIncidentAddress(2026));
    const blocked = page.getByTestId('new-incident-blocked');
    await expect(blocked).toBeVisible();
    await expect(blocked).toContainText(
      'Creating an incident needs the right to edit the incident reports of this year, and your account has none.',
    );
    await expect(page.getByTestId('create-incident')).toHaveCount(0);
    await expect(page.getByTestId('new-incident-sheet')).toHaveCount(0);
    await expect(page.getByTestId('new-incident-back')).toHaveAttribute('href', yearAddress(2026));
    await expectNoSeriousViolations(page, 'incident new: no right');
    await page.getByTestId('new-incident-back').click();
    await expect(page).toHaveURL(yearAddress(2026));
    await expect(page.getByTestId('incident-list')).toBeVisible();
  });

  test('a year that is over takes no new incident: the sheet is blocked, whatever the person may edit', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToIncidents(page, newIncidentAddress(2025));
    // The person holds the right to read the year 2025 only: the sheet says what is missing first.
    await expect(page.getByTestId('new-incident-blocked')).toContainText(
      'Creating an incident needs the right to edit',
    );
    await expect(page.getByTestId('create-incident')).toHaveCount(0);
  });

  test('a person who may edit a year that is not the current one is told to open the current year', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    // The years of the mock list 2026 as the current year: the read of the page says it is over, so the person (who
    // edits 2026) meets the sheet of a year that is not the current one.
    await patchRead(page, `**/api/v1/incidents`, (body) => ({
      ...body,
      years: body.years.map((year) => (year.year === 2026 ? { ...year, current: false } : year)),
    }));
    await loginToIncidents(page, newIncidentAddress(2026));
    const blocked = page.getByTestId('new-incident-blocked');
    await expect(blocked).toContainText(
      'A new incident is made in the current year. Open the current year to create one.',
    );
    await expect(page.getByTestId('create-incident')).toHaveCount(0);
    await expect(page.getByTestId('new-incident-back')).toHaveText(
      'Back to the incidents of the year',
    );
    await expectNoSeriousViolations(page, 'incident new: not the current year');
  });

  test('leaving the form with typed text asks first, and staying keeps the text', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToNew(page);
    const title = page.getByTestId('new-incident-sheet').getByLabel('Title');
    await title.fill('Not saved yet');
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Leave this page?');
    await expectNoSeriousViolations(page, 'incident new: leave the form');
    await page.getByTestId('leave-stay').click();
    await expect(page).toHaveURL(newIncidentAddress(2026));
    await expect(title).toHaveValue('Not saved yet');
    await page.getByTestId('nav-settings').click();
    await page.getByTestId('leave-confirm').click();
    await expect(page).toHaveURL('/settings');
  });

  test('a form nobody typed in is left without a question, and so is the incident that was created', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToNew(page);
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await page.goto(newIncidentAddress(2026));
    await expect(page.getByTestId('new-incident-sheet')).toBeVisible();
    await page.getByTestId('new-incident-sheet').getByLabel('Title').fill(CREATED.title);
    await page.getByTestId('create-incident').click();
    await expect(page).toHaveURL(incidentAddress(CREATED));
    await page.getByTestId('nav-settings').click();
    await expect(page).toHaveURL('/settings');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('is written in German: the form, the act, the reason and the blocked sheet', async ({
    page,
    request,
  }) => {
    await useScenario(request, 'workshop');
    await loginToNew(page);
    await useLanguage(page, 'de');
    const sheet = page.getByTestId('new-incident-sheet');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Neuer Vorfall');
    await expect(sheet).toContainText('Ein Vorfall des Jahres 2026.');
    await expect(sheet.getByLabel('Titel')).toBeVisible();
    await expect(sheet.getByLabel('Bekannt geworden am')).toBeVisible();
    await expect(page.getByTestId('create-incident')).toHaveText('Vorfall anlegen');
    await expect(sheet).toContainText('Geben Sie zuerst einen Titel ein.');
    await expect(sheet).toContainText(
      'Der Vorfall wird in dem Jahr abgelegt, in dem er Ihnen bekannt geworden ist.',
    );
    await expect(page.getByTestId('save-state')).toContainText('Noch nicht gespeichert');
    await sheet.getByLabel('Titel').fill(CREATED.title);
    await page.getByTestId('nav-settings').click();
    await expect(page.getByRole('dialog')).toContainText('Diese Seite verlassen?');
    await page.getByTestId('leave-stay').click();
    await expectNoSeriousViolations(page, 'incident new in German');
    await useScenario(request, 'read-only');
    await page.goto(newIncidentAddress(2026));
    await expect(page.getByTestId('new-incident-blocked')).toContainText(
      'Zum Anlegen eines Vorfalls brauchen Sie das Recht',
    );
    await expect(page.getByTestId('new-incident-back')).toHaveText(
      'Zurück zu den Vorfällen des Jahres',
    );
  });

  test('the refusal of the awareness is German', async ({ page, request }) => {
    await useScenario(request, 'workshop');
    await loginToNew(page);
    await useLanguage(page, 'de');
    let refused = false;
    await page.route(`**${createPath(2026)}`, (route) => {
      if (route.request().method() !== 'POST' || refused) return route.continue();
      refused = true;
      return route.fulfill({
        status: 422,
        json: {
          outcome: 'VALIDATION',
          errors: [{ part: 'triage', pointer: '/aware-at', code: 'OUT_OF_YEAR' }],
        },
      });
    });
    const sheet = page.getByTestId('new-incident-sheet');
    await sheet.getByLabel('Titel').fill(CREATED.title);
    await sheet.getByLabel('Bekannt geworden am').fill('2025-12-31T23:30');
    await page.getByTestId('create-incident').click();
    await expect(field(sheet, '/aware-at')).toContainText(
      'Dieser Zeitpunkt liegt nicht im Jahr des Vorfalls.',
    );
  });
});
