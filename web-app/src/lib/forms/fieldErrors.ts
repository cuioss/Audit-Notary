/**
 * Which errors a form shows (AUN-WEB-4, Validation): the browser's own, until the server's verdict arrives; then the
 * server's, which win. The error of a field goes when the field changes, and the browser checks it again then.
 */
import type { FieldError } from '../api/errors';
import { hasMessage } from '../i18n';
import { pointerTokens, toPointer } from './schema';

/**
 * @param parent a pointer
 * @param child a pointer
 * @returns whether `child` is `parent` or lies below it
 */
export function isWithin(parent: string, child: string): boolean {
  return child === parent || child.startsWith(`${parent}/`);
}

/**
 * Whether a change at one place makes an error at another stale: the change is at the error's place, below it (the
 * error was about the whole list or row) or above it (the whole list or row was replaced).
 *
 * @param changed the pointer of the change
 * @param errorPointer the pointer of the error
 * @returns whether the error no longer stands
 */
export function isAffectedBy(changed: string, errorPointer: string): boolean {
  return isWithin(changed, errorPointer) || isWithin(errorPointer, changed);
}

/**
 * The errors the form shows.
 *
 * @param server the errors of the last `422 VALIDATION`, minus the places changed since; `null` while there is none
 * @param browser the browser's check of the current value
 * @param touched the places changed since the server's answer
 * @returns before an answer, the browser's errors; after it, the server's, with the browser's again for a place that
 * changed since (the browser errors the server did not repeat disappear when the answer arrives)
 */
export function effectiveErrors(
  server: FieldError[] | null,
  browser: FieldError[],
  touched: readonly string[],
): FieldError[] {
  if (server === null) return browser;
  const rechecked = browser.filter((error) =>
    touched.some((place) => isAffectedBy(place, error.pointer)),
  );
  return [...server, ...rechecked];
}

/**
 * The nearest pointer a field answers to: the pointer itself when it is one of the form's fields, else its closest
 * ancestor that is. An error at no ancestor either (the root, a stale row) is listed under the form.
 *
 * @param pointer the pointer of an error
 * @param known the pointers of the form's fields
 * @returns the field's pointer, or `null` when it names none
 */
export function placeOf(pointer: string, known: ReadonlySet<string>): string | null {
  const tokens = pointerTokens(pointer);
  for (let length = tokens.length; length > 0; length -= 1) {
    const candidate = toPointer(tokens.slice(0, length));
    if (known.has(candidate)) return candidate;
  }
  return null;
}

/**
 * @param code the code of an error
 * @returns the catalogue key of its text: `form.error.<code in lower case, with hyphens>`, or `form.error.invalid`
 * when the catalogue has none
 */
export function errorKey(code: string): string {
  const key = `form.error.${code.toLowerCase().replaceAll('_', '-')}`;
  return hasMessage(key) ? key : 'form.error.invalid';
}
