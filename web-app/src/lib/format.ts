/**
 * Dates and times as the views show them, in the language the app shows (AUN-WEB-7). The server sends ISO 8601; a
 * view never formats a date by hand.
 */

/** A day: a date without a time, `YYYY-MM-DD`. */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param value an ISO date or date-time
 * @returns the instant; a plain day is read as local midnight
 */
export function parseInstant(value: string): Date {
  return new Date(DAY.test(value) ? `${value}T00:00:00` : value);
}

/**
 * @param value an ISO date or date-time
 * @param locale the language
 * @param style the date style
 * @returns the date, or the value itself when it is no date
 */
export function formatDate(
  value: string,
  locale: string,
  style: 'long' | 'medium' | 'short' = 'medium',
): string {
  const date = parseInstant(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: style }).format(date);
}

/**
 * @param value an ISO date-time
 * @param locale the language
 * @returns date and time, short
 */
export function formatDateTime(value: string, locale: string): string {
  const date = parseInstant(value);
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

/**
 * @param value an ISO date-time
 * @param locale the language
 * @returns the time of day, short
 */
export function formatTime(value: string | Date, locale: string): string {
  const date = typeof value === 'string' ? parseInstant(value) : value;
  return new Intl.DateTimeFormat(locale, { timeStyle: 'short' }).format(date);
}

/**
 * @param value an ISO date or date-time
 * @param now the present
 * @returns the whole calendar days from today to the day of the value; negative in the past
 */
export function daysFrom(value: string, now: Date = new Date()): number {
  const date = parseInstant(value);
  const start = (instant: Date) =>
    Date.UTC(instant.getFullYear(), instant.getMonth(), instant.getDate());
  return Math.round((start(date) - start(now)) / 86_400_000);
}

/**
 * @param value an ISO date or date-time
 * @param locale the language
 * @param now the present
 * @returns the time from now in words: "today", "in 2 days", "3 days ago"
 */
export function formatRelativeDay(value: string, locale: string, now: Date = new Date()): string {
  return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
    daysFrom(value, now),
    'day',
  );
}

/**
 * @param value an ISO date-time
 * @param locale the language
 * @param now the present
 * @returns how long ago, in the largest fitting unit: "5 minutes ago", "yesterday"
 */
export function formatAgo(value: string, locale: string, now: Date = new Date()): string {
  const seconds = Math.round((parseInstant(value).getTime() - now.getTime()) / 1000);
  const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const abs = Math.abs(seconds);
  if (abs < 60) return format.format(0, 'minute');
  if (abs < 3600) return format.format(Math.round(seconds / 60), 'minute');
  if (abs < 86_400) return format.format(Math.round(seconds / 3600), 'hour');
  return format.format(daysFrom(value, now), 'day');
}

/**
 * @param value an ISO date
 * @param locale the language
 * @returns the parts the daybook's date gutter shows: day of month, month, weekday
 */
export function dayParts(
  value: string,
  locale: string,
): { day: string; month: string; weekday: string } {
  const date = parseInstant(value);
  return {
    day: new Intl.DateTimeFormat(locale, { day: 'numeric' }).format(date),
    month: new Intl.DateTimeFormat(locale, { month: 'short' }).format(date),
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short' }).format(date),
  };
}

/**
 * @param name a person's name
 * @returns up to two initials, for an avatar
 */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return `${first}${last}`.toUpperCase();
}
