import { beforeEach, describe, expect, it } from 'vitest';
import { currentLocale, messagesStore, translate } from '../i18n';
import { loadMessages } from '../../test/catalogue-fixture';
import { plainValue } from './display';

/** A value of a document as one plain line: a moment and a day are told as the person reads them. */
beforeEach(() => {
  currentLocale.set('en');
  messagesStore.set(loadMessages('en'));
});

const line = (value: unknown) =>
  plainValue(
    loadMessages('en'),
    'incident-reports',
    'incident.notifications',
    '/x',
    value,
    (key, params) => translate(key, params),
  );

describe('the plain line of a value', () => {
  it('tells a moment in the language and the time zone of the person, not as the ISO text', () => {
    const text = line('2026-11-26T09:45:00Z');
    expect(text).not.toContain('T09:45');
    expect(text).toMatch(/Nov 26, 2026/);
  });

  it('tells a day as a date', () => {
    expect(line('2026-12-15')).toBe('Dec 15, 2026');
  });

  it('tells a moment inside a section too', () => {
    expect(line({ 'sent-at': '2026-11-26T09:45:00Z' })).not.toContain('2026-11-26T');
  });

  it('keeps any other text as it is', () => {
    expect(line('plain text')).toBe('plain text');
  });
});
