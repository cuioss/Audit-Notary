/**
 * The conversions of the `DateTimeField` (AUN-WEB-4, Values): a `date-time` is an RFC 3339 instant in UTC to the
 * second (`2026-11-24T09:30:00Z`), shown and entered in the time zone of the browser; a `date` is a calendar date
 * `YYYY-MM-DD` and is not converted at all.
 */
import { isDateTime } from './validate';

const pad = (value: number, width = 2): string => String(value).padStart(width, '0');

/**
 * @param instant an RFC 3339 date and time, with any offset
 * @returns the same instant as the value of an `<input type="datetime-local">` in the browser's time zone, or `null`
 * when the text is no date and time
 */
export function instantToLocalInput(instant: string): string | null {
  if (!isDateTime(instant)) return null;
  const date = new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  return (
    `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  );
}

/**
 * @param local the value of an `<input type="datetime-local">`, read in the browser's time zone
 * @returns the instant in UTC to the second, or `null` for an incomplete or impossible entry
 */
export function localInputToInstant(local: string): string | null {
  const [day, clock, ...extra] = local.split('T');
  if (clock === undefined || extra.length > 0 || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const time = clock.split(':').map(Number);
  if (time.length < 2 || time.length > 3 || time.some((part) => !Number.isInteger(part)))
    return null;
  const [year, month, date] = day.split('-').map(Number);
  const [hour, minute, second = 0] = time;
  const moment = new Date(year, month - 1, date, hour, minute, second);
  const same =
    moment.getFullYear() === year &&
    moment.getMonth() === month - 1 &&
    moment.getDate() === date &&
    moment.getHours() === hour &&
    moment.getMinutes() === minute &&
    moment.getSeconds() === second;
  return same ? moment.toISOString().replace(/\.\d{3}Z$/, 'Z') : null;
}
