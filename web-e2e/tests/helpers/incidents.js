import { expect } from '@playwright/test';
import { patchRead } from './samm.js';

/**
 * What the lens Incidents of the end-to-end suite needs of the page and of the mock (web-mock/README.adoc, Incident
 * Reports): the addresses, the paths of the requests, the static fixtures the pages show and the shared steps. The
 * fixtures are static: `incidents.spec.js` has one test that compares them with what the mock answers, so a change of
 * the mock fails that test and not every test that uses a value.
 *
 * The clock of the page is the real one, and the deadline clock compares with it; every step that opens a page here pins it
 * to `NOW`, the instant the mock reads at (`asOf` of its base state).
 */

/** The canonical address of the first column of the lens. */
export const LENS_ADDRESS = '/incidents';

/** The instant the mock reads at: `asOf` of the base state, which the page of a test is pinned to. */
export const NOW = '2026-11-26T10:00:00Z';

/** @returns the address of a year */
export function yearAddress(year) {
  return `${LENS_ADDRESS}/${year}`;
}

/** @returns the address of an incident, with the stage and an earlier state when they are named */
export function incidentAddress(incident, { stage, at } = {}) {
  const query = [at ? `at=${at}` : null, stage ? `stage=${stage}` : null].filter(Boolean);
  return `${yearAddress(incident.year)}/${incident.id}${query.length > 0 ? `?${query.join('&')}` : ''}`;
}

/** @returns the address of the release page of an incident */
export function releaseAddress(incident) {
  return `${incidentAddress(incident)}/release`;
}

/** @returns the address of the form of a new incident of a year */
export function newIncidentAddress(year = 2026) {
  return `${yearAddress(year)}/new`;
}

/** The stages of an incident in the order of the declaration. */
export const STAGES = ['triage', 'privacy-assessment', 'response', 'notifications', 'review'];

/** The names of the stages in English and German. */
export const STAGE_NAMES = {
  triage: { en: 'Triage', de: 'Ersteinschätzung' },
  'privacy-assessment': { en: 'Privacy assessment', de: 'Datenschutzbewertung' },
  response: { en: 'Response', de: 'Reaktion' },
  notifications: { en: 'Notifications', de: 'Meldungen' },
  review: { en: 'Review', de: 'Auswertung' },
};

/** The words of the status of a stage. */
export const STATUS_WORDS = {
  open: 'Open',
  completed: 'Completed',
  'not-applicable': 'Does not apply',
};

/** The names of the deadline rules in English. */
export const RULES = {
  'gdpr-art33': 'Notice to the supervisory authority',
  'nis2-early-warning': 'NIS2 early warning',
  'nis2-notification': 'NIS2 incident notification',
  'nis2-intermediate-report': 'NIS2 intermediate report',
  'nis2-final-report': 'NIS2 final report',
  'nis2-final-report-after-handling': 'NIS2 final report after handling',
};

/**
 * The incidents of the mock that the spec uses. `stages` is the status of each stage in the order of `STAGES`: `C`
 * completed, `O` open, `N` does not apply, `N*` does not apply and is not answered yet, and `^` completed with a reopened
 * predecessor. `deadlines` are `[rule, element, status, sent]`.
 */
export const CARD_DATA = {
  slug: 'card-data',
  id: '01JZ9T4M6Q8S0V2X4B6D8F0H2K',
  year: 2026,
  title: 'Card data exposed in the checkout log',
  stages: ['C', 'O', 'O', 'O', 'O'],
  deadlines: [
    ['gdpr-art33', null, 'MISSED', null],
    ['nis2-early-warning', null, 'MET', '2026-11-20T06:55:00Z'],
    ['nis2-notification', null, 'MISSED', '2026-11-22T10:20:00Z'],
    ['nis2-final-report', null, 'OPEN', null],
  ],
};

export const CREDENTIAL_STUFFING = {
  slug: 'credential-stuffing',
  id: '01JZ9V7P9S1T3W5Y7A9C1E3G5J',
  year: 2026,
  title: 'Credential stuffing against the login form',
  stages: ['C', 'N', 'C', 'N', 'O'],
  deadlines: [],
};

export const PHISHING = {
  slug: 'phishing-link',
  id: '01JZA2B4D6F8H0K2N4Q6S8V0X2',
  year: 2026,
  title: 'Phishing mail with a forged payment link',
  stages: ['C', 'O', 'O', 'O', 'O'],
  deadlines: [['gdpr-art33', null, 'OPEN', null]],
};

export const OUTAGE = {
  slug: 'notification-outage',
  id: '01JZ8M3N5P7R9T1V3X5Z7B9D1F',
  year: 2026,
  title: 'Notification service down after a failed deployment',
  stages: ['C', 'N', 'C', 'C', 'C'],
  deadlines: [
    ['nis2-early-warning', null, 'MET', '2026-10-13T09:30:00Z'],
    ['nis2-notification', null, 'MET', '2026-10-14T16:00:00Z'],
    ['nis2-intermediate-report', 0, 'MET', '2026-10-29T15:00:00Z'],
    ['nis2-final-report', null, 'MET', '2026-11-13T10:00:00Z'],
  ],
};

export const ARCHIVE = {
  slug: 'archive-access',
  id: '01JZ8K1M3P5R7T9V1X3Z5B7D9F',
  year: 2026,
  title: 'Unauthorised access to the report archive',
  stages: ['C', 'N', 'O', 'O', 'O'],
  deadlines: [
    ['nis2-early-warning', null, 'MET', '2026-10-06T07:00:00Z'],
    ['nis2-notification', null, 'MET', '2026-10-07T09:00:00Z'],
    ['nis2-final-report', null, 'MET', '2026-11-06T10:00:00Z'],
    ['nis2-final-report-after-handling', null, 'OPEN', null],
  ],
};

export const WRONG_RECIPIENT = {
  slug: 'wrong-recipient',
  id: '01JZ6Q8S0V2X4B6D8F0H2K4M6P',
  year: 2026,
  title: 'Customer export sent to the wrong recipient',
  stages: ['O', '^', '^', '^', 'O'],
  deadlines: [['gdpr-art33', null, 'MET', '2026-09-04T09:00:00Z']],
};

export const SUSPICIOUS = {
  slug: 'suspicious-logins',
  id: '01JZA6D8F0H2K4M6P8R0T2W4Y6',
  year: 2026,
  title: 'Suspicious logins from an unknown network',
  stages: ['O', 'N*', 'O', 'N*', 'O'],
  deadlines: [],
};

export const LOST_LAPTOP = {
  slug: 'lost-laptop',
  id: '01JZ2A4C6E8G0J2M4P6R8T0W2Y',
  year: 2025,
  title: 'Laptop with customer extracts lost',
  stages: ['C', 'C', 'C', 'C', 'C'],
  deadlines: [['gdpr-art33', null, 'MET', '2025-03-15T10:00:00Z']],
};

export const NEWSLETTER = {
  slug: 'newsletter-list',
  id: '01JZ3B5D7F9H1K3N5Q7S9V1X3Z',
  year: 2025,
  title: 'Misdirected newsletter exposed the subscriber list',
  stages: ['C', 'C', 'C', 'C', 'C'],
  deadlines: [['gdpr-art33', null, 'MISSED', '2025-09-12T09:00:00Z']],
};

/** The incidents of 2026 in the order of the list: the newest awareness first. */
export const YEAR_2026 = [
  SUSPICIOUS,
  PHISHING,
  CARD_DATA,
  CREDENTIAL_STUFFING,
  OUTAGE,
  ARCHIVE,
  WRONG_RECIPIENT,
];

/** The incidents of 2025 in the order of the list. */
export const YEAR_2025 = [NEWSLETTER, LOST_LAPTOP];

/** The two years of the mock: the figures of the row of each in the first column. */
export const YEARS = [
  {
    year: 2026,
    current: true,
    incidents: 7,
    open: 6,
    withMissedDeadline: 1,
    retentionEnd: '2031-12-31',
  },
  {
    year: 2025,
    current: false,
    incidents: 2,
    open: 0,
    withMissedDeadline: 1,
    retentionEnd: '2030-12-31',
  },
];

/** The incident the mock adds in `incident-created`. */
export const CREATED = {
  id: '01JZA8F0H2K4M6P8R0T2W4Y6A8',
  year: 2026,
  title: 'Suspicious logins from the VPN gateway',
};

/** @returns the path of a request of an incident at the mock; `tail` starts with a `/` */
export function documentPath(incident, tail = '') {
  return `/api/v1/documents/isms-incidents-${incident.year}/${incident.id}${tail}`;
}

/** @returns the path of the save of an incident at the mock */
export function savePath(incident) {
  return documentPath(incident, '/save');
}

/** @returns the path of the draft of an incident at the mock */
export function draftPath(incident) {
  return `/api/v1/drafts/isms-incidents-${incident.year}/${incident.id}`;
}

/** @returns the path of the completion of a stage at the mock */
export function completePath(incident, stage) {
  return documentPath(incident, `/stages/${stage}/complete`);
}

/** @returns the path of the reopening of a stage at the mock */
export function reopenPath(incident, stage) {
  return documentPath(incident, `/stages/${stage}/reopen`);
}

/** @returns the path of the submit of an incident at the mock */
export function submitPath(incident) {
  return documentPath(incident, '/transitions/incident.submit');
}

/** @returns the path of the release of an incident at the mock */
export function releasePath(incident) {
  return `/api/v1/releases/isms-incidents-${incident.year}/${incident.id}`;
}

/** @returns the path of the diff against the last release of an incident at the mock */
export function diffPath(incident) {
  return documentPath(incident, '/diff');
}

/** @returns the path of the create of an incident of a year at the mock */
export function createPath(year = 2026) {
  return `/api/v1/documents/isms-incidents-${year}`;
}

/** @returns the path of the read of an incident (the lens's own address) at the mock */
export function readPath(incident) {
  return `/api/v1/incidents/${incident.year}/${incident.id}`;
}

/** @returns the path of the report of an incident at the mock */
export function reportPath(incident) {
  return `${readPath(incident)}/report`;
}

/** The paths of the years and of the incidents of a year. */
export const YEARS_PATH = '/api/v1/incidents';

/** @returns the path of the list of a year */
export function yearPath(year) {
  return `${YEARS_PATH}/${year}`;
}

/** The path of the schema of the document type. */
export const SCHEMA_PATH = '/api/v1/categories/incident-reports/schema';

/** The path of the Due list. */
export const DUE_PATH = '/api/v1/due';

/**
 * Pins the clock of the page to the instant the mock reads at. Call it before the page is opened.
 *
 * @param page the page
 * @param at the instant, `NOW` by default
 */
export async function pinClock(page, at = NOW) {
  await page.clock.setFixedTime(new Date(at));
}

/**
 * Signs in at the mock and waits for the lens Incidents at the returned address. On a phone the top bar shows only the last
 * step of a path, so the title of the lens (which `login` waits for) is not visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 */
export async function loginToIncidents(page, address = LENS_ADDRESS) {
  await pinClock(page);
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('incidents-view')).toBeVisible();
}

/**
 * Signs in and waits for the sheet of an incident with the panel of its stage drawn.
 *
 * @param page the page
 * @param incident the incident
 * @param stage the stage the address names, the default stage of the incident when none
 */
export async function loginToSheet(page, incident, stage) {
  await loginToIncidents(page, incidentAddress(incident, { stage }));
  await expect(page.getByTestId('incident-sheet')).toBeVisible();
  await expect(page.getByTestId('stage-panel')).toBeVisible();
}

/**
 * @param page the page
 * @returns the status of every tab of the stages in the order shown, by the `data-status` of the tab
 */
export async function tabStatuses(page) {
  return page
    .getByTestId('stage-tabs')
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.status));
}

/** @returns the ids of the stages as the tabs stand in the tab list, in the order of the page */
export async function tabIds(page) {
  return page
    .getByTestId('stage-tabs')
    .getByRole('tab')
    .evaluateAll((tabs) => tabs.map((tab) => tab.dataset.testid.replace(/^stage-tabs-/, '')));
}

/** The statuses of a row of the fixtures as the tabs and the rows of the list name them. */
export function statusesOf(stages) {
  return stages.map((mark) =>
    mark === 'O' ? 'open' : mark === 'N' || mark === 'N*' ? 'not-applicable' : 'completed',
  );
}

/** @returns the tab of a stage */
export function tab(page, stage) {
  return page.getByTestId(`stage-tabs-${stage}`);
}

/** Chooses a stage by its tab and waits for its panel. */
export async function chooseStage(page, stage) {
  await tab(page, stage).click();
  await expect(page.getByTestId('stage-panel')).toHaveAttribute('data-stage', stage);
}

/** @returns the row of the clock for a deadline; the element is the number of the entry of a list, none for a single one */
export function clockRow(page, rule, element = null) {
  return page.getByTestId(`deadline-clock-${rule}-${element ?? ''}`);
}

/** @returns the states of the rows of the clock in the order shown, `[rule, status]` */
export async function clockStates(page) {
  return page
    .getByTestId('deadline-clock')
    .locator('li[data-status]')
    .evaluateAll((rows) =>
      rows.map((row) => [row.dataset.testid.replace('deadline-clock-', ''), row.dataset.status]),
    );
}

/** @returns the last body the mock received on a path with a method, `null` when it received none */
export function lastBody(sent, path, method) {
  const found = sent.filter((act) => act.path === path && act.method === method);
  return found.length === 0 ? null : found.at(-1).body;
}

/** @returns the requests that changed something, in the order they were sent, as `METHOD path` */
export function changes(sent) {
  return sent
    .filter((act) => act.method !== 'GET')
    .map((act) => `${act.method} ${act.path.split('?')[0]}`);
}

/**
 * Answers a read of the mock with another body, or another status, for the reads that match a pattern.
 *
 * @param page the page
 * @param pattern the address pattern of the read
 * @param status the status to answer
 * @param body the JSON body to answer
 */
export async function refuseRead(page, pattern, status, body) {
  await page.route(pattern, (route) =>
    route.request().method() === 'GET' ? route.fulfill({ status, json: body }) : route.continue(),
  );
}

/**
 * Signs in and waits for the release page of an incident with its record read. The review of the page is drawn only once the
 * incident, its schema and its diff are there, so the record is what the step waits for.
 *
 * @param page the page
 * @param incident the incident
 */
export async function loginToRelease(page, incident) {
  await pinClock(page);
  const address = releaseAddress(incident);
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId('release-view')).toBeVisible();
  await expect(page.getByTestId('release-record')).toBeVisible();
}

/**
 * Signs in and waits for the sheet of a new incident.
 *
 * @param page the page
 * @param year the year of the address
 */
export async function loginToNew(page, year = 2026) {
  await loginToIncidents(page, newIncidentAddress(year));
  await expect(page.getByTestId('new-incident-sheet')).toBeVisible();
}

/**
 * The deadlines of the card data as the mock reads them (`incident-card-data.json`): one missed and never sent, one met, one
 * missed and sent late, one open. The mock has no incident in review that has a deadline still open, so the tests of the
 * release page that need one give the *Credential stuffing* these (see `withOpenDeadlines`).
 */
export const OPEN_DEADLINES = [
  {
    rule: 'gdpr-art33',
    element: null,
    startedAt: '2026-11-19T07:40:00Z',
    due: '2026-11-22T07:40:00Z',
    status: 'MISSED',
    sentAt: null,
    metBy: '/notifications/supervisory-authority',
  },
  {
    rule: 'nis2-early-warning',
    element: null,
    startedAt: '2026-11-19T07:40:00Z',
    due: '2026-11-20T07:40:00Z',
    status: 'MET',
    sentAt: '2026-11-20T06:55:00Z',
    metBy: '/notifications/nis2-early-warning',
  },
  {
    rule: 'nis2-notification',
    element: null,
    startedAt: '2026-11-19T07:40:00Z',
    due: '2026-11-22T07:40:00Z',
    status: 'MISSED',
    sentAt: '2026-11-22T10:20:00Z',
    metBy: '/notifications/nis2-notification',
  },
  {
    rule: 'nis2-final-report',
    element: null,
    startedAt: '2026-11-22T10:20:00Z',
    due: '2026-12-22T10:20:00Z',
    status: 'OPEN',
    sentAt: null,
    metBy: '/notifications/nis2-final-report',
  },
];

/**
 * Gives the incident the deadlines of `OPEN_DEADLINES` in the read of the page: a patch of the answer of the mock for the
 * tests of the release page that need a deadline still open, which no incident in review of the mock has. The mock itself
 * still holds none, so what it answers to the release is unchanged.
 *
 * @param page the page
 * @param incident the incident
 */
export async function withOpenDeadlines(page, incident) {
  await patchRead(page, `**${readPath(incident)}`, (body) => ({
    ...body,
    deadlines: OPEN_DEADLINES,
  }));
}
