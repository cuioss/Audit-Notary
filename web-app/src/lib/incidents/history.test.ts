import { beforeEach, describe, expect, it } from 'vitest';
import type { HistoryLine } from '../api/types';
import { currentLocale, messagesStore, translate } from '../i18n';
import { loadMessages } from '../../test/catalogue-fixture';
import { incidentHistory } from './history';

/**
 * The signed history of an incident worded for its margin: the completion and the reopening of a stage, the save of a part,
 * and the lines of the generic lifecycle.
 */
const NOW = new Date('2026-11-26T10:00:00Z');
const ALEX = { pseudonym: 'p-4c1a9e', name: 'Alex Example' };
const NAMES = { triage: 'Triage', review: 'Review' };

beforeEach(() => {
  currentLocale.set('en');
  messagesStore.set(loadMessages('en'));
});

const lines: HistoryLine[] = [
  { at: '2026-11-26T09:30:00Z', by: ALEX, kind: 'reopen', stage: 'triage' },
  { at: '2026-11-20T16:05:00Z', by: ALEX, kind: 'save', part: 'review', count: 3 },
  { at: '2026-11-20T11:00:00Z', by: ALEX, kind: 'save', part: 'data', count: 1 },
  { at: '2026-11-19T09:30:00Z', by: ALEX, kind: 'complete', stage: 'triage' },
  { at: '2026-11-19T09:00:00Z', by: ALEX, kind: 'create' },
  { at: '2026-11-18T09:00:00Z', by: ALEX, kind: 'save' },
  { at: '2026-11-18T08:00:00Z', by: ALEX, kind: 'release', tag: 'incidents/ID1/v1' },
];

describe('the history of an incident', () => {
  it('words the completion and the reopening of a stage by the name of the stage', () => {
    const entries = incidentHistory(lines, translate, 'en', NOW, NAMES);
    expect(entries[0]).toMatchObject({ who: 'Alex Example', what: 'Reopened the stage Triage' });
    expect(entries[3].what).toBe('Completed the stage Triage');
  });

  it('says in the words of the recent past what happened in the last day, and the date for the rest', () => {
    const entries = incidentHistory(lines, translate, 'en', NOW, NAMES);
    expect(entries[0].when).toBe('30 minutes ago');
    expect(entries[1].when).toMatch(/^Nov 20, 2026, /);
  });

  it('words the save of a part by the stage, and the save of the title as the title', () => {
    const entries = incidentHistory(lines, translate, 'en', NOW, NAMES);
    expect(entries[1].what).toBe('Saved 3 fields of Review');
    expect(entries[2].what).toBe('Saved one field of the title');
  });

  it('leaves the other lines to the generic history, each with a key of its own', () => {
    const entries = incidentHistory(lines, translate, 'en', NOW, NAMES);
    expect(entries[4].what).toBe('Created the document');
    expect(entries[5].what).toBe('Saved 0 fields');
    expect(entries[6]).toMatchObject({ what: 'Released it as v1', release: true });
    expect(new Set(entries.map((entry) => entry.key)).size).toBe(entries.length);
  });

  it('is written in German', () => {
    currentLocale.set('de');
    messagesStore.set(loadMessages('de'));
    const entries = incidentHistory(lines, translate, 'de', NOW, NAMES);
    expect(entries[0].what).toBe('Phase Triage wieder geöffnet');
    expect(entries[1].what).toBe('3 Felder gespeichert: Review');
  });
});
