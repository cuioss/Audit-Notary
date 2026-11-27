import { beforeEach, describe, expect, it } from 'vitest';
import type { IncidentDeadline, IncidentStage, JsonObject, JsonSchema } from '../api/types';
import { currentLocale, messagesStore, translate } from '../i18n';
import { loadMessages } from '../../test/catalogue-fixture';
import {
  allStagesDone,
  clockRow,
  deadlineOfNotification,
  defaultStage,
  incidentAddress,
  knownStage,
  newAddress,
  notificationRows,
  openStages,
  partKind,
  partSchema,
  releaseAddress,
  repositoryOf,
  spanOf,
  splitPointer,
  stageTabs,
  titleSchema,
  yearAddress,
} from './model';
import { reportSections } from './report';

/**
 * What the lens Incidents knows of an incident, without a component (rest-api.adoc, Incident Report Requests).
 */
const ID = '01JZ9T4M6Q8S0V2X4B6D8F0H2K';

/** @returns a stage with the members the tests do not care about */
function stage(id: string, own: Partial<IncidentStage> = {}): IncidentStage {
  return {
    id,
    part: id,
    after: [],
    when: null,
    narrative: [],
    stepUp: false,
    status: 'open',
    unanswered: false,
    completion: null,
    predecessorReopened: false,
    missing: [],
    blockedBy: [],
    ...own,
  };
}

/** @returns a deadline with the members the tests do not care about */
function deadline(own: Partial<IncidentDeadline> = {}): IncidentDeadline {
  return {
    rule: 'gdpr-art33',
    element: null,
    startedAt: '2026-11-19T07:40:00Z',
    due: '2026-11-22T07:40:00Z',
    status: 'OPEN',
    sentAt: null,
    metBy: '/notifications/supervisory-authority',
    ...own,
  };
}

/** Sets the language of the catalogue the translation function reads. */
function use(lang: 'en' | 'de'): void {
  currentLocale.set(lang);
  messagesStore.set(loadMessages(lang));
}

beforeEach(() => use('en'));

const english = translate;
const german = translate;
const when = (instant: string) => `at ${instant}`;

describe('the addresses', () => {
  it('writes the canonical address of every page of the lens', () => {
    expect(repositoryOf(2026)).toBe('isms-incidents-2026');
    expect(yearAddress('2026')).toBe('/incidents/2026');
    expect(newAddress(2026)).toBe('/incidents/2026/new');
    expect(incidentAddress(2026, ID)).toBe(`/incidents/2026/${ID}`);
    expect(incidentAddress(2026, ID, { stage: 'review' })).toBe(
      `/incidents/2026/${ID}?stage=review`,
    );
    expect(incidentAddress(2026, ID, { at: 'v1', stage: 'review' })).toBe(
      `/incidents/2026/${ID}?at=v1&stage=review`,
    );
    expect(releaseAddress(2026, ID)).toBe(`/incidents/2026/${ID}/release`);
  });

  it('names a part by its own kind, so two stages keep their own words for a field', () => {
    expect(partKind('triage')).toBe('incident.triage');
    expect(partKind('notifications')).toBe('incident.notifications');
  });

  it('splits a pointer of the document into the part and the pointer in it', () => {
    expect(splitPointer('/triage/severity')).toEqual({ part: 'triage', pointer: '/severity' });
    expect(splitPointer('/notifications/supervisory-authority/sent-at')).toEqual({
      part: 'notifications',
      pointer: '/supervisory-authority/sent-at',
    });
    expect(splitPointer('/title')).toEqual({ part: 'title', pointer: '' });
  });
});

describe('the stage of an address', () => {
  const stages = [
    stage('triage', { status: 'completed' }),
    stage('privacy-assessment', { status: 'not-applicable' }),
    stage('response', { blockedBy: ['triage'] }),
    stage('review', { blockedBy: ['response'] }),
  ];

  it('accepts a stage the incident declares and no other', () => {
    expect(knownStage('review', stages)).toBe('review');
    expect(knownStage('nope', stages)).toBeNull();
    expect(knownStage(undefined, stages)).toBeNull();
  });

  it('opens the first stage that is open and not waiting for another', () => {
    const ready = [stage('triage'), stage('response', { blockedBy: ['triage'] })];
    expect(defaultStage(ready)).toBe('triage');
  });

  it('opens the first open stage when every one waits, then the first that applies, then the first', () => {
    expect(defaultStage(stages)).toBe('response');
    expect(
      defaultStage([stage('a', { status: 'not-applicable' }), stage('b', { status: 'completed' })]),
    ).toBe('b');
    expect(defaultStage([stage('a', { status: 'not-applicable' })])).toBe('a');
    expect(defaultStage([])).toBeNull();
  });

  it('knows whether every stage that applies is completed', () => {
    expect(openStages(stages).map((entry) => entry.id)).toEqual(['response', 'review']);
    expect(allStagesDone(stages)).toBe(false);
    expect(
      allStagesDone([
        stage('a', { status: 'completed' }),
        stage('b', { status: 'not-applicable' }),
      ]),
    ).toBe(true);
  });
});

describe('the tabs', () => {
  it('words the status of every stage and the condition of one that does not apply', () => {
    const tabs = stageTabs(
      [
        stage('triage', { status: 'completed' }),
        stage('privacy-assessment', { status: 'not-applicable' }),
        stage('notifications', { status: 'not-applicable', unanswered: true }),
      ],
      english,
    );
    expect(tabs.map((tab) => [tab.label, tab.statusLabel])).toEqual([
      ['Triage', 'Completed'],
      ['Privacy assessment', 'Does not apply'],
      ['Notifications', 'Does not apply'],
    ]);
    expect(tabs[0].note).toBeNull();
    expect(tabs[1].note).toBe('Does not apply: it applies when personal data is affected');
    expect(tabs[2].note).toBe(
      'Not answered yet: applies when personal data is affected or the incident is significant under NIS2',
    );
  });

  it('marks a stage that was signed off before an earlier one was reopened, and carries a flag', () => {
    const [tab] = stageTabs(
      [stage('response', { status: 'completed', predecessorReopened: true })],
      english,
      {
        response: 'Conflict',
      },
    );
    expect(tab.marker).toBe('Signed off before an earlier stage was reopened');
    expect(tab.flag).toBe('Conflict');
  });

  it('is written in German too', () => {
    use('de');
    const [tab] = stageTabs([stage('privacy-assessment', { status: 'not-applicable' })], german);
    expect(tab.label).toBe('Datenschutzbewertung');
    expect(tab.statusLabel).toBe('Entfällt');
    expect(tab.note).toBe('Entfällt: gilt, wenn personenbezogene Daten betroffen sind');
  });
});

describe('a span of time', () => {
  it('is told in the largest unit that fits, at least a minute', () => {
    expect(spanOf(10_000)).toEqual({ unit: 'minutes', count: 1 });
    expect(spanOf(-25 * 60_000)).toEqual({ unit: 'minutes', count: 25 });
    expect(spanOf(3 * 3_600_000)).toEqual({ unit: 'hours', count: 3 });
    expect(spanOf(47 * 3_600_000)).toEqual({ unit: 'hours', count: 47 });
    expect(spanOf(5 * 86_400_000)).toEqual({ unit: 'days', count: 5 });
  });
});

describe('a row of the deadline clock', () => {
  const at = new Date('2026-11-26T10:00:00Z');

  it('tells how long is left for an open deadline', () => {
    const row = clockRow(deadline({ due: '2026-11-27T09:10:00Z' }), at, english, when);
    expect(row).toMatchObject({
      name: 'Notice to the supervisory authority',
      basis: 'GDPR Art. 33: 72 hours after becoming aware',
      status: 'OPEN',
      statusLabel: 'Open',
      needsYou: false,
      detail: 'Due in 23 hours',
      dueText: 'at 2026-11-27T09:10:00Z',
    });
  });

  it('tells a deadline that was missed and never sent as one that needs the person', () => {
    const row = clockRow(deadline({ status: 'MISSED' }), at, english, when);
    expect(row).toMatchObject({ status: 'MISSED', needsYou: true, detail: 'Overdue by 4 days' });
  });

  it('tells a notice sent late as missed but no duty, and one sent in time as met', () => {
    const late = clockRow(
      deadline({ status: 'MISSED', sentAt: '2026-11-22T10:20:00Z' }),
      at,
      english,
      when,
    );
    expect(late).toMatchObject({ status: 'MISSED', needsYou: false });
    expect(late.detail).toBe('Sent at 2026-11-22T10:20:00Z, 3 hours late');
    const met = clockRow(
      deadline({ status: 'MET', sentAt: '2026-11-20T06:55:00Z' }),
      at,
      english,
      when,
    );
    expect(met).toMatchObject({
      status: 'MET',
      needsYou: false,
      detail: 'Sent at 2026-11-20T06:55:00Z',
    });
  });

  it('has no time for a clock that has not started', () => {
    const row = clockRow(
      deadline({ rule: 'nis2-final-report-after-handling', due: null, startedAt: null }),
      at,
      english,
      when,
    );
    expect(row.due).toBeNull();
    expect(row.dueText).toBeNull();
    expect(row.needsYou).toBe(false);
    expect(row.detail).toBe('The clock starts when the time it depends on is recorded.');
  });

  it('numbers the entries of a list rule', () => {
    const row = clockRow(
      deadline({ rule: 'nis2-intermediate-report', element: 1 }),
      at,
      english,
      when,
    );
    expect(row.name).toBe('NIS2 intermediate report, no. 2');
    expect(row.key).toBe('nis2-intermediate-report/1');
  });

  it('reads an open deadline the clock of the page has passed as missed before the server says so', () => {
    const row = clockRow(deadline({ due: '2026-11-26T09:00:00Z' }), at, english, when);
    expect(row).toMatchObject({ status: 'MISSED', statusLabel: 'Missed', needsYou: true });
  });

  it('leaves the status of a deadline with a notice to the server, whatever the page clock says', () => {
    const row = clockRow(
      deadline({ due: '2026-11-26T09:00:00Z', sentAt: '2026-11-26T08:00:00Z' }),
      at,
      english,
      when,
    );
    expect(row).toMatchObject({ status: 'OPEN', needsYou: false });
  });

  it('is written in German too', () => {
    use('de');
    const row = clockRow(deadline({ due: '2026-11-28T10:00:00Z' }), at, german, when);
    expect(row.name).toBe('Meldung an die Aufsichtsbehörde');
    expect(row.detail).toBe('Noch 2 Tage bis zur Fälligkeit');
    expect(row.statusLabel).toBe('Offen');
  });
});

describe('the notices sent', () => {
  const value: JsonObject = {
    'nis2-early-warning': {
      'sent-at': '2026-10-13T09:30:00Z',
      recipient: 'Office',
      channel: 'email',
      reference: 'X-1',
    },
    'supervisory-authority': {
      'sent-at': '2026-10-12T09:30:00Z',
      recipient: 'Authority',
      channel: 'post',
    },
    'nis2-intermediate-reports': [
      {
        'sent-at': '2026-10-29T15:00:00Z',
        recipient: 'Office',
        channel: 'email',
        due: '2026-10-30T12:00:00Z',
      },
      { recipient: 'No time', channel: 'email' },
    ],
    others: [
      {
        'sent-at': '2026-10-13T10:00:00Z',
        recipient: 'Customers',
        channel: 'email',
        comment: 'Status.',
      },
    ],
    'nis2-final-report': 'not an object',
    completion: { at: '2026-11-13T10:10:00Z', by: 'p-2b7f10' },
  };

  it('lists a row for each notice that has a time, in the order of the table', () => {
    const rows = notificationRows(value);
    expect(rows.map((row) => row.key)).toEqual([
      'supervisory-authority',
      'nis2-early-warning',
      'nis2-intermediate-reports/0',
      'others/0',
    ]);
    expect(rows[1]).toMatchObject({
      reference: 'X-1',
      pointer: '/notifications/nis2-early-warning',
    });
    expect(rows[2].pointer).toBe('/notifications/nis2-intermediate-reports/0');
    expect(rows[3].comment).toBe('Status.');
    expect(notificationRows(undefined)).toEqual([]);
  });

  it('finds the deadline a notice meets by the pointer of its record', () => {
    const rows = notificationRows(value);
    const deadlines = [deadline({ metBy: '/notifications/nis2-early-warning', status: 'MET' })];
    expect(deadlineOfNotification(rows[1], deadlines)?.status).toBe('MET');
    expect(deadlineOfNotification(rows[0], deadlines)).toBeNull();
  });
});

describe('the schema of a form', () => {
  const schema: JsonSchema = {
    type: 'object',
    required: ['title'],
    properties: {
      title: { type: 'string' },
      triage: {
        type: 'object',
        required: ['severity'],
        properties: {
          severity: { type: 'string' },
          completion: { type: 'object', readOnly: true },
        },
      },
    },
  };

  it('leaves the completion out of the form of a stage, which only the acts write', () => {
    const form = partSchema(schema, 'triage');
    expect(Object.keys(form.properties as object)).toEqual(['severity']);
    expect(form.required).toEqual(['severity']);
  });

  it('is an empty form for a part the schema does not know', () => {
    expect(partSchema(schema, 'nope')).toEqual({ type: 'object', properties: {} });
  });

  it('keeps the title alone for the form of the part data', () => {
    expect(titleSchema(schema)).toEqual({
      type: 'object',
      required: ['title'],
      properties: { title: { type: 'string' } },
    });
    expect(titleSchema({})).toEqual({ type: 'object', required: ['title'], properties: {} });
  });
});

describe('the report', () => {
  const adoc = [
    '= Title of it',
    '',
    '== Summary',
    '',
    'x',
    '',
    '== Deadlines',
    '',
    '|===',
    '|a',
    '|===',
  ].join('\n');

  it('is cut into its level-2 sections, one level lower, without its title', () => {
    const sections = reportSections(adoc);
    expect(sections).toHaveLength(2);
    expect(sections[0].source).toBe('=== Summary\n\nx');
    expect(sections[1].source.startsWith('=== Deadlines')).toBe(true);
  });

  it('puts every heading one level lower, so that a subsection stays below its section', () => {
    const sections = reportSections('= T\n\n== A\n\n=== A1\n\ntext\n\n== B\n');
    expect(sections.map((section) => section.source)).toEqual([
      '=== A\n\n==== A1\n\ntext',
      '=== B',
    ]);
  });

  it('does not cut a listing, a literal or a comment block at a line that looks like a heading', () => {
    const adoc = [
      '= T',
      '',
      '== A',
      '',
      '----',
      '== not a heading',
      '----',
      '',
      '== B',
      '',
      '....',
      '== x',
      '....',
    ];
    const sections = reportSections(adoc.join('\n'));
    expect(sections).toHaveLength(2);
    expect(sections[0].source).toBe('=== A\n\n----\n== not a heading\n----');
    expect(sections[1].source).toBe('=== B\n\n....\n== x\n....');
  });

  it('keeps a text before the first section as a section of its own and drops empty ones', () => {
    expect(reportSections('= T\n\nlead\n\n== A\n\nb').map((section) => section.source)).toEqual([
      'lead',
      '=== A\n\nb',
    ]);
    expect(reportSections('= T\n')).toEqual([]);
  });
});
