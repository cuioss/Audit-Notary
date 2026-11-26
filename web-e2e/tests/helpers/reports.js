import { expect } from '@playwright/test';

/**
 * What the lens Reports of the end-to-end suite needs of the page and of the mock (web-mock/README.adoc, Reports): the
 * addresses, the paths of the requests, the fixtures the pages show and the shared steps. The fixtures are static:
 * `reports.spec.js` has one test that compares them with what the mock answers, so a change of the mock fails that test
 * and not every test that uses a value.
 */

/** The canonical addresses. */
export const REPORTS_ADDRESS = '/reports';
export const TREND_ADDRESS = '/reports/samm-trend';
export const COMPARE_ADDRESS = '/reports/samm-compare';
export const THREATS_ADDRESS = '/reports/threat-evaluation';
export const RISKS_ADDRESS = '/reports/risk-register';

/** @returns the address of the trend, of one scope by business function with a scope */
export function trendAddress(scope) {
  return scope ? `${TREND_ADDRESS}?scope=${scope}` : TREND_ADDRESS;
}

/** @returns the address of the comparison; the pair needs the scope */
export function compareAddress(scope, from, to) {
  if (!scope) return COMPARE_ADDRESS;
  return from && to
    ? `${COMPARE_ADDRESS}?scope=${scope}&from=${from}&to=${to}`
    : `${COMPARE_ADDRESS}?scope=${scope}`;
}

/** @returns the address of the risk register as of a day or a tag */
export function risksAddress(asOf) {
  return asOf ? `${RISKS_ADDRESS}?as-of=${asOf}` : RISKS_ADDRESS;
}

/** The paths of the requests at the mock. */
export const SUMMARY_PATH = '/api/v1/reports/summary';
export const TREND_PATH = '/api/v1/reports/samm-trend';
export const THREATS_PATH = '/api/v1/reports/threat-evaluation';
export const RISKS_PATH = '/api/v1/isms/risks';

/** The values of `as-of` the server refuses, each with the code of its `422`. */
export const REFUSED_AS_OF = {
  FUTURE: '2027-01-01',
  PATTERN: '2026-13-45',
  UNKNOWN_TAG: 'no-such-tag',
};

/** The figures of the dashboard of `workshop` (the term the page shows, the value). */
export const SUMMARY = {
  samm: [
    ['Scopes', '4'],
    ['Without a release', '1'],
    ['With an open assessment', '2'],
  ],
  threatModels: [
    ['Services', '8'],
    ['With a threat model', '6'],
    ['Without a threat model', '2'],
    ['Open threats', '13'],
    ['Untreated threats', '10'],
    ['Reviews overdue', '2'],
    ['Reviews due soon', '1'],
  ],
  risks: [
    ['Released risks', '7'],
    ['Critical', '1'],
    ['High', '3'],
    ['Medium', '2'],
    ['Low', '1'],
    ['Risk reviews overdue', '1'],
    ['Risk reviews due soon', '1'],
  ],
};

/** The latest released assessment of every scope of the dashboard, as the page writes it. */
export const LATEST = [
  { scope: 'payments', name: 'Payments', score: '1.36', change: '+0.4 since the release before' },
  {
    scope: 'shop',
    name: 'Web shop',
    score: '1.23',
    change: 'No earlier release of this model version',
  },
  {
    scope: 'organisation',
    name: 'Organisation',
    score: '1.21',
    change: 'No earlier release of this model version',
  },
];

/**
 * The scopes of the trend in the order of the list, which is the order of the series colours: a scope without a released
 * assessment (Identity Platform) keeps its place and has no line. `overall` is the end value the chart writes.
 */
export const SCOPES = [
  {
    id: 'payments',
    title: 'Payments',
    slot: 1,
    version: 'v2.2.0',
    points: [
      { assessment: '2025-q4', title: 'Payments 2025 Q4', overall: '0.96' },
      { assessment: '2026-q2', title: 'Payments 2026 Q2', overall: '1.36' },
    ],
  },
  { id: 'identity', title: 'Identity Platform', slot: 2, version: null, points: [] },
  {
    id: 'shop',
    title: 'Web shop',
    slot: 3,
    version: 'v2.2.0',
    points: [{ assessment: '2026-q3', title: 'Web shop 2026 Q3', overall: '1.23' }],
  },
  {
    id: 'organisation',
    title: 'Organisation',
    slot: 4,
    version: 'v2.2.0',
    points: [{ assessment: '2026-h1', title: 'Organisation 2026 H1', overall: '1.21' }],
  },
];

/** The business functions of the model v2.2.0 in its order, with the end value of Payments (2026 Q2) for each. */
export const FUNCTIONS = [
  { id: 'governance', name: 'Governance', end: '1.42' },
  { id: 'design', name: 'Design', end: '1.67' },
  { id: 'implementation', name: 'Implementation', end: '1.54' },
  { id: 'verification', name: 'Verification', end: '0.96' },
  { id: 'operations', name: 'Operations', end: '1.21' },
];

/** The two released assessments of Payments the comparison starts from, and their overall change. */
export const PAIR = {
  scope: 'payments',
  from: '2025-q4',
  to: '2026-q2',
  fromTitle: 'Payments 2025 Q4',
  toTitle: 'Payments 2026 Q2',
  overall: { from: '0.96', to: '1.36', change: '+0.4' },
  /** The rows of the dumbbell and the table: the overall score and the five functions, each with its change. */
  functions: [
    { id: 'overall', from: '0.96', to: '1.36', change: '+0.4' },
    { id: 'governance', from: '0.96', to: '1.42', change: '+0.46' },
    { id: 'design', from: '1', to: '1.67', change: '+0.67' },
    { id: 'implementation', from: '1.25', to: '1.54', change: '+0.29' },
    { id: 'verification', from: '0.83', to: '0.96', change: '+0.13' },
    { id: 'operations', from: '0.75', to: '1.21', change: '+0.46' },
  ],
  /** A practice of Governance with its two streams, as the opened disclosure shows them. */
  practice: { id: 'sm', from: '1.13', to: '1.25', change: '+0.13' },
  streams: [
    { letter: 'A', from: '1', to: '1.5', change: '+0.5' },
    { letter: 'B', from: '1.25', to: '1', change: '-0.25' },
  ],
};

/** The assessments of Payments the pickers offer, earliest first, with the text of an option. */
export const PAYMENTS_ASSESSMENTS = [
  { id: '2025-q4', option: 'Payments 2025 Q4, Dec 8, 2025, Released' },
  { id: '2026-q2', option: 'Payments 2026 Q2, Jun 16, 2026, Released' },
  { id: '2026-q4', option: 'Payments 2026 Q4, Nov 24, 2026, Draft' },
];

/** What `workshop#model-versions-differ` answers for every pair of Payments. */
export const DIFFER = {
  from: { assessment: '2026-q2', title: 'Payments 2026 Q2', modelVersion: 'v2.1.0' },
  to: { assessment: '2026-q4', title: 'Payments 2026 Q4', modelVersion: 'v2.2.0' },
};

/**
 * The threat models of the evaluation in the order of the server (the review due first, a model without one last). `status`
 * is the word the page shows in the column of the review; `badge` is true for a box (overdue, due soon).
 */
export const MODELS = [
  {
    service: 'customer-portal',
    model: 'portal',
    name: 'Customer Portal',
    need: 'Very high',
    status: 'Overdue by 177 days',
    badge: true,
    counts: ['2', '2', '0'],
    address: '/threat-models/customer-portal/portal',
  },
  {
    service: 'identity-provider',
    model: 'login-flow',
    name: 'Identity Provider',
    need: 'Very high',
    status: 'Overdue by 43 days',
    badge: true,
    counts: ['4', '3', '0'],
    address: '/threat-models/identity-provider/login-flow',
  },
  {
    service: 'payment-api',
    model: 'checkout-flow',
    name: 'Payment API',
    need: 'Very high',
    status: 'Due in 5 days',
    badge: true,
    counts: ['3', '2', '1'],
    address: '/threat-models/payment-api/checkout-flow',
  },
  {
    service: 'reporting',
    model: 'report-generation',
    name: 'Reporting Service',
    need: 'Normal',
    status: 'In date',
    badge: false,
    counts: ['0', '0', '0'],
    address: '/threat-models/reporting/report-generation',
  },
  {
    service: 'customer-db',
    model: 'storage',
    name: 'Customer database',
    need: 'Very high',
    status: 'In date',
    badge: false,
    counts: ['1', '0', '0'],
    address: '/threat-models/customer-db/storage',
  },
  {
    service: 'notification-service',
    model: 'notification-flows',
    name: 'Notification service',
    need: 'Normal',
    status: 'Not released yet',
    badge: false,
    counts: ['3', '3', '0'],
    address: '/threat-models/notification-service/notification-flows',
  },
];

/** The services without a threat model of `workshop`. */
export const WITHOUT_MODEL = [
  {
    service: 'notification-gateway',
    name: 'Notification gateway',
    owner: 'Mobile Apps',
    state: 'Planned',
  },
  {
    service: 'report-scheduler',
    name: 'Report scheduler',
    owner: 'Security Office',
    state: 'Active',
  },
];

/** The services `no-threat-models` lists, the very high ones first, each group by name. */
export const WITHOUT_ALL = [
  'customer-db',
  'customer-portal',
  'identity-provider',
  'payment-api',
  'notification-gateway',
  'notification-service',
  'report-scheduler',
  'reporting',
];

/** The services of the evaluation in each order the sort control offers. */
export const ORDERS = {
  'Service name': [
    'customer-db',
    'customer-portal',
    'identity-provider',
    'notification-service',
    'payment-api',
    'reporting',
  ],
  'Open threats': [
    'identity-provider',
    'notification-service',
    'payment-api',
    'customer-portal',
    'customer-db',
    'reporting',
  ],
  'Untreated threats': [
    'identity-provider',
    'notification-service',
    'customer-portal',
    'payment-api',
    'customer-db',
    'reporting',
  ],
};

/** The tags of the register and the commit each one marks. */
export const TAGS = [
  {
    tag: 'management-review-2026-06',
    commit: 'b81d4e6',
    option: 'management-review-2026-06, Jun 18, 2026',
  },
  { tag: 'audit-2026-03', commit: '3f9a1c2', option: 'audit-2026-03, Feb 27, 2026' },
];

/**
 * The register as of now: the entries in order, each with its version, rating and review. `review` is what the entry
 * says of its review, which only the register as of now flags (it is read on 2026-11-26).
 */
export const RISKS_NOW = [
  {
    entry: 'r-004',
    id: 'R-004',
    rating: 'High',
    version: 3,
    address: '/isms/risks/r-004',
    review: null,
  },
  {
    entry: 'r-007',
    id: 'R-007',
    rating: 'Low',
    version: 1,
    address: '/isms/risks/r-007',
    review: 'Overdue by 8 days',
  },
  {
    entry: 'r-009',
    id: 'R-009',
    rating: 'Critical',
    version: 2,
    address: '/isms/risks/r-009',
    review: null,
  },
  {
    entry: 'r-012',
    id: 'R-012',
    rating: 'High',
    version: 2,
    address: '/isms/risks/r-012',
    review: 'Due in 19 days',
  },
  {
    entry: 'r-015',
    id: 'R-015',
    rating: 'Medium',
    version: 1,
    address: '/isms/risks/r-015',
    review: null,
  },
  {
    entry: 'r-018',
    id: 'R-018',
    rating: 'High',
    version: 1,
    address: '/isms/risks/r-018',
    review: null,
  },
  {
    entry: 'r-021',
    id: 'R-021',
    rating: 'Medium',
    version: 1,
    address: '/isms/risks/r-021',
    review: null,
  },
];

/** The register as of a day and as of a tag: the commit read and the entries as they were, each opening pinned. */
export const RISKS_AS_OF = {
  '2026-03-01': {
    commit: '3f9a1c2',
    tag: null,
    risks: [
      ['r-004', 'Medium', 1],
      ['r-007', 'Low', 1],
      ['r-012', 'Medium', 1],
    ],
  },
  'audit-2026-03': {
    commit: '3f9a1c2',
    tag: 'audit-2026-03',
    risks: [
      ['r-004', 'Medium', 1],
      ['r-007', 'Low', 1],
      ['r-012', 'Medium', 1],
    ],
  },
  '2026-06-30': {
    commit: 'b81d4e6',
    tag: null,
    risks: [
      ['r-004', 'High', 2],
      ['r-007', 'Low', 1],
      ['r-009', 'High', 1],
      ['r-012', 'Medium', 1],
    ],
  },
  'management-review-2026-06': {
    commit: 'b81d4e6',
    tag: 'management-review-2026-06',
    risks: [
      ['r-004', 'High', 2],
      ['r-007', 'Low', 1],
      ['r-009', 'High', 1],
      ['r-012', 'Medium', 1],
    ],
  },
};

/**
 * Signs in at the mock and waits for the view at the returned address. On a phone the top bar shows only the last step
 * of a path, so the title (which `login` waits for) is not always visible there.
 *
 * @param page the page
 * @param address the canonical address to return to
 * @param view the test id of the view that must show
 */
export async function loginToReports(page, address, view) {
  await page.goto(`/api/v1/auth/login?return=${encodeURIComponent(address)}`);
  await expect(page).toHaveURL(address);
  await expect(page.getByTestId(view)).toBeVisible();
}

/**
 * @param page the page
 * @param testId the test id of a table
 * @returns the cells of every body row of the table as text, the row head first
 */
export async function rowsOf(page, testId) {
  return page
    .getByTestId(testId)
    .locator('tbody tr')
    .evaluateAll((rows) =>
      rows.map((row) =>
        [...row.querySelectorAll('th, td')].map((cell) =>
          cell.textContent.replace(/\s+/g, ' ').trim(),
        ),
      ),
    );
}

/**
 * @param page the page
 * @param token a custom property of the tokens, such as `--color-series-3`
 * @returns the colour the token resolves to, as the browser computes it
 */
export async function tokenColour(page, token) {
  return page.evaluate((name) => {
    const probe = document.createElement('span');
    probe.style.color = `var(${name})`;
    document.body.append(probe);
    const colour = getComputedStyle(probe).color;
    probe.remove();
    return colour;
  }, token);
}

/**
 * Fails when a text of a chart is smaller on the screen than `least` pixels: the font size of the text, scaled as the
 * figure is (a figure drawn narrower than its box would shrink its text; the charts are drawn at the width they have).
 *
 * @param page the page
 * @param chart the test id of the chart
 * @param least the smallest size, in pixels
 */
export async function expectLegibleText(page, chart, least = 11) {
  const sizes = await page.getByTestId(chart).evaluate((figure) => {
    const found = [];
    for (const svg of figure.querySelectorAll('svg.chart__figure')) {
      const box = svg.getBoundingClientRect();
      const width = svg.viewBox.baseVal.width;
      const scale = width > 0 ? box.width / width : 1;
      for (const text of svg.querySelectorAll('text')) {
        found.push(parseFloat(getComputedStyle(text).fontSize) * scale);
      }
    }
    for (const text of figure.querySelectorAll('li, span, p')) {
      if (text.children.length === 0 && text.textContent.trim() !== '') {
        found.push(parseFloat(getComputedStyle(text).fontSize));
      }
    }
    return found;
  });
  expect(sizes.length).toBeGreaterThan(0);
  for (const size of sizes) expect(size).toBeGreaterThanOrEqual(least - 0.01);
}
