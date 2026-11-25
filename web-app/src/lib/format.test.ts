import { describe, expect, it } from 'vitest';
import {
  dayParts,
  daysFrom,
  formatAgo,
  formatDate,
  formatDateTime,
  formatRelativeDay,
  formatTime,
  initials,
} from './format';

const NOW = new Date('2026-11-25T10:00:00');

describe('format', () => {
  it('formats days and instants in the language', () => {
    expect(formatDate('2026-12-04', 'en')).toBe('Dec 4, 2026');
    expect(formatDate('2026-12-04', 'de')).toBe('04.12.2026');
    expect(formatDate('not a date', 'en')).toBe('not a date');
    expect(formatDateTime('nope', 'en')).toBe('nope');
    expect(formatDateTime('2026-11-25T09:48:00', 'en')).toContain('Nov 25, 2026');
    expect(formatTime('2026-11-25T09:48:00', 'en')).toBe('9:48 AM');
  });

  it('counts calendar days and words them', () => {
    expect(daysFrom('2026-11-27', NOW)).toBe(2);
    expect(daysFrom('2026-11-22', NOW)).toBe(-3);
    expect(formatRelativeDay('2026-11-25', 'en', NOW)).toBe('today');
    expect(formatRelativeDay('2026-11-27', 'en', NOW)).toBe('in 2 days');
    expect(formatRelativeDay('2026-11-22', 'de', NOW)).toBe('vor 3 Tagen');
  });

  it('says how long ago in the largest unit', () => {
    expect(formatAgo('2026-11-25T09:59:40', 'en', NOW)).toBe('this minute');
    expect(formatAgo('2026-11-25T09:48:00', 'en', NOW)).toBe('12 minutes ago');
    expect(formatAgo('2026-11-25T07:00:00', 'en', NOW)).toBe('3 hours ago');
    expect(formatAgo('2026-11-24T09:00:00', 'en', NOW)).toBe('yesterday');
  });

  it('splits a day for the daybook and takes initials', () => {
    expect(dayParts('2026-11-27', 'en')).toEqual({ day: '27', month: 'Nov', weekday: 'Fri' });
    expect(initials('Jordan Weber')).toBe('JW');
    expect(initials('Alex Mary Example')).toBe('AE');
    expect(initials('Noor')).toBe('N');
  });

  it('hands back what is no date instead of throwing', () => {
    expect(formatTime('nope', 'en')).toBe('nope');
    expect(formatTime(new Date('nope'), 'en')).toBe('');
    expect(dayParts('nope', 'en')).toEqual({ day: 'nope', month: '', weekday: '' });
  });
});
