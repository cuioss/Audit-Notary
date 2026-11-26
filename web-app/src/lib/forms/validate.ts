/**
 * The browser's check of a value against its schema, without a validator library (AUN-WEB-4, Validation;
 * PROVISIONAL). It checks `type`, `enum`, `const`, `minLength`, `maxLength`, `pattern`, `minimum`, `maximum`,
 * `exclusiveMinimum`, `exclusiveMaximum`, `minItems`, `maxItems`, `uniqueItems` and `format`, and lists the empty
 * mandatory fields from `required`. It does not check `additionalProperties`, `patternProperties`, `oneOf`, `anyOf`,
 * `not`, `if`, `dependentRequired` or any other keyword: only the server does.
 *
 * `format` is an annotation for the library, which asserts none; the browser asserts `date-time`, `date` and the shape
 * of `gdr-link`, so its `FORMAT` error can stand where the server finds none. It is advice and never stops a save.
 */
import type { FieldError } from '../api/errors';
import {
  childNodes,
  childPointer,
  getAt,
  isObject,
  itemNode,
  jsonEqual,
  propertiesOf,
  resolveRef,
  rootNode,
  type FieldNode,
  type JsonSchema,
} from './schema';

/** The codes of a field error, the capitalised keyword of the constraint that failed. */
export const BROWSER_CODES = [
  'TYPE',
  'ENUM',
  'CONST',
  'MIN_LENGTH',
  'MAX_LENGTH',
  'PATTERN',
  'MINIMUM',
  'MAXIMUM',
  'EXCLUSIVE_MINIMUM',
  'EXCLUSIVE_MAXIMUM',
  'MIN_ITEMS',
  'MAX_ITEMS',
  'UNIQUE_ITEMS',
  'FORMAT',
] as const;

/** The codes of the server that the form has a text for besides the keywords (AUN-DP-2, AUN-DP-5). */
export const SERVER_CODES = ['REFERENCE_NOT_FOUND', 'PSEUDONYM_UNKNOWN'] as const;

/** The days of each month in a year that is no leap year. */
const MONTH_DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const CLOCK = /^(\d{2}):(\d{2}):(\d{2})$/;
const OFFSET = /^[+-](\d{2}):(\d{2})$/;

/**
 * @param year the year
 * @returns whether it is a leap year
 */
function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * @param value a text
 * @returns whether it is a calendar date `YYYY-MM-DD` that exists
 */
export function isDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  if (month < 1 || month > 12 || day < 1) return false;
  return day <= MONTH_DAYS[month - 1] + (month === 2 && isLeap(year) ? 1 : 0);
}

/**
 * @param value a text
 * @returns whether it is an RFC 3339 date and time with a zone
 */
export function isDateTime(value: string): boolean {
  if (value.length < 20 || value.charAt(10).toUpperCase() !== 'T' || !isDate(value.slice(0, 10))) {
    return false;
  }
  const rest = value.slice(11);
  let clock: string;
  let zone: string;
  if (rest.endsWith('Z') || rest.endsWith('z')) {
    clock = rest.slice(0, -1);
    zone = 'Z';
  } else {
    const cut = Math.max(rest.lastIndexOf('+'), rest.lastIndexOf('-'));
    if (cut < 0) return false;
    clock = rest.slice(0, cut);
    zone = rest.slice(cut);
  }
  const dot = clock.indexOf('.');
  const fraction = dot < 0 ? null : clock.slice(dot + 1);
  const time = CLOCK.exec(dot < 0 ? clock : clock.slice(0, dot));
  if (!time || (fraction !== null && !/^\d{1,9}$/.test(fraction))) return false;
  if (Number(time[1]) > 23 || Number(time[2]) > 59 || Number(time[3]) > 60) return false;
  const offset = OFFSET.exec(zone);
  return zone === 'Z' || (offset !== null && Number(offset[1]) <= 23 && Number(offset[2]) <= 59);
}

/**
 * @param value a text
 * @returns whether it has the shape of a reference: `<alias>:<kind>/<id>[#<fragment>]` or `<catalog>:<id>`, no part
 * empty, no white space
 */
export function isGdrLink(value: string): boolean {
  if (/\s/.test(value)) return false;
  const hash = value.indexOf('#');
  const main = hash < 0 ? value : value.slice(0, hash);
  const fragment = hash < 0 ? null : value.slice(hash + 1);
  if (fragment !== null && (fragment === '' || fragment.includes('#'))) return false;
  const colon = main.indexOf(':');
  if (colon <= 0 || main.slice(0, colon).includes('/')) return false;
  const parts = main.slice(colon + 1).split('/');
  return parts.length <= 2 && parts.every((part) => part !== '');
}

/**
 * @param text a text
 * @returns its length in characters as JSON Schema counts them: code points, not UTF-16 units
 */
function codePoints(text: string): number {
  let count = 0;
  for (const _char of text) count += 1;
  return count;
}

/**
 * @param pattern a `pattern` of a schema
 * @returns the expression, or `null` when the browser cannot compile it (that pattern is not checked)
 */
function compile(pattern: string): RegExp | null {
  try {
    // eslint-disable-next-line security/detect-non-literal-regexp -- the pattern is the schema's, matched as the library does
    return new RegExp(pattern, 'u');
  } catch {
    try {
      // eslint-disable-next-line security/detect-non-literal-regexp -- the same, without the unicode rules
      return new RegExp(pattern);
    } catch {
      return null;
    }
  }
}

/**
 * @param schema a resolved schema
 * @param keyword a numeric keyword
 * @returns its value when it is a number
 */
function numberKeyword(schema: JsonSchema, keyword: string): number | undefined {
  const value = schema[keyword];
  return typeof value === 'number' ? value : undefined;
}

/**
 * @param value a value
 * @returns its JSON type name, `integer` for a whole number
 */
function typeNames(value: unknown): string[] {
  if (value === null) return ['null'];
  if (Array.isArray(value)) return ['array'];
  if (typeof value === 'number')
    return Number.isInteger(value) ? ['integer', 'number'] : ['number'];
  return [typeof value];
}

function checkString(schema: JsonSchema, value: string): string[] {
  const codes: string[] = [];
  const length = codePoints(value);
  const min = numberKeyword(schema, 'minLength');
  const max = numberKeyword(schema, 'maxLength');
  if (min !== undefined && length < min) codes.push('MIN_LENGTH');
  if (max !== undefined && length > max) codes.push('MAX_LENGTH');
  if (typeof schema.pattern === 'string') {
    const expression = compile(schema.pattern);
    if (expression && !expression.test(value)) codes.push('PATTERN');
  }
  const format = schema.format;
  const failsFormat =
    (format === 'date-time' && !isDateTime(value)) ||
    (format === 'date' && !isDate(value)) ||
    (format === 'gdr-link' && !isGdrLink(value));
  if (failsFormat) codes.push('FORMAT');
  return codes;
}

function checkNumber(schema: JsonSchema, value: number): string[] {
  const codes: string[] = [];
  const minimum = numberKeyword(schema, 'minimum');
  const maximum = numberKeyword(schema, 'maximum');
  const exclusiveMinimum = numberKeyword(schema, 'exclusiveMinimum');
  const exclusiveMaximum = numberKeyword(schema, 'exclusiveMaximum');
  if (minimum !== undefined && value < minimum) codes.push('MINIMUM');
  if (maximum !== undefined && value > maximum) codes.push('MAXIMUM');
  if (exclusiveMinimum !== undefined && value <= exclusiveMinimum) codes.push('EXCLUSIVE_MINIMUM');
  if (exclusiveMaximum !== undefined && value >= exclusiveMaximum) codes.push('EXCLUSIVE_MAXIMUM');
  return codes;
}

function checkArray(schema: JsonSchema, value: unknown[]): string[] {
  const codes: string[] = [];
  const min = numberKeyword(schema, 'minItems');
  const max = numberKeyword(schema, 'maxItems');
  if (min !== undefined && value.length < min) codes.push('MIN_ITEMS');
  if (max !== undefined && value.length > max) codes.push('MAX_ITEMS');
  if (schema.uniqueItems === true) {
    const repeated = value.some(
      (item, index) => value.findIndex((o) => jsonEqual(o, item)) !== index,
    );
    if (repeated) codes.push('UNIQUE_ITEMS');
  }
  return codes;
}

/**
 * The failing constraints of one value and, below it, of its members; the first failing `type` ends the check of that
 * value, as a value of the wrong type has no other constraint to fail.
 */
function check(
  raw: JsonSchema,
  root: JsonSchema,
  value: unknown,
  pointer: string,
  errors: FieldError[],
): void {
  if (value === undefined) return;
  const schema = resolveRef(raw, root);
  const type = schema.type;
  if (typeof type === 'string' && !typeNames(value).includes(type)) {
    errors.push({ pointer, code: 'TYPE' });
    return;
  }
  const members = schema.enum;
  if (Array.isArray(members) && !members.some((member) => jsonEqual(member, value))) {
    errors.push({ pointer, code: 'ENUM' });
  }
  if (Object.hasOwn(schema, 'const') && !jsonEqual(schema.const, value)) {
    errors.push({ pointer, code: 'CONST' });
  }
  const codes =
    typeof value === 'string'
      ? checkString(schema, value)
      : typeof value === 'number'
        ? checkNumber(schema, value)
        : Array.isArray(value)
          ? checkArray(schema, value)
          : [];
  for (const code of codes) errors.push({ pointer, code });
  if (Array.isArray(value) && isObject(schema.items)) {
    value.forEach((item, index) =>
      check(schema.items as JsonSchema, root, item, childPointer(pointer, index), errors),
    );
  } else if (isObject(value)) {
    for (const [name, sub] of propertiesOf(schema)) {
      check(sub, root, value[name], childPointer(pointer, name), errors);
    }
  }
}

/**
 * Checks a value against the schema of its kind.
 *
 * @param schema the kind's schema
 * @param value the value of the form
 * @returns the errors, in the order of the schema file; none for a mandatory field that is empty
 */
export function validate(schema: JsonSchema, value: unknown): FieldError[] {
  return validateWith(schema, schema, value);
}

/**
 * Checks a value against a subschema of a file; the pointers of the errors are those into the value.
 *
 * @param root the schema of the file, which `$ref` points into
 * @param schema the subschema the value must satisfy
 * @param value the value
 * @returns the errors
 */
export function validateWith(root: JsonSchema, schema: JsonSchema, value: unknown): FieldError[] {
  const errors: FieldError[] = [];
  check(schema, root, value, '', errors);
  return errors;
}

/**
 * @param value a value of a field
 * @returns whether the field counts as empty for `required`: nothing, `null`, a blank text or an empty list
 */
export function isEmptyValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim() === '') ||
    (Array.isArray(value) && value.length === 0)
  );
}

/**
 * The mandatory fields that are empty, as the JSON Pointers of the empty fields (AUN-WEB-4, Validation): the
 * properties `required` lists, in every section and in every row of a table. A missing mandatory field is no error;
 * the list is for the transition that needs them.
 *
 * @param schema the kind's schema
 * @param value the value of the form
 * @returns the pointers, in the order of the schema file
 */
export function missingRequired(schema: JsonSchema, value: unknown): string[] {
  return missingWith(schema, rootNode(schema), value);
}

/**
 * The empty mandatory fields below one node, for the whole form or for the draft of one row.
 *
 * @param schema the schema of the file
 * @param start the section to look in
 * @param value the value of the section
 * @returns the pointers, joined onto the section's own pointer
 */
export function missingWith(schema: JsonSchema, start: FieldNode, value: unknown): string[] {
  const missing: string[] = [];
  const visitSection = (node: FieldNode, current: unknown): void => {
    for (const child of childNodes(node, schema)) {
      const next = getAt(current, childPointer('', child.name));
      if (child.kind === 'section') {
        visitSection(child, next);
        continue;
      }
      if (child.required && isEmptyValue(next)) missing.push(child.pointer);
      if (child.kind === 'table' && Array.isArray(next)) visitRows(child, next);
    }
  };
  const visitRows = (table: FieldNode, rows: unknown[]): void => {
    const item = itemNode(table, schema);
    if (item.kind !== 'section') return;
    rows.forEach((row, index) => {
      visitSection({ ...item, pointer: childPointer(table.pointer, index), path: table.path }, row);
    });
  };
  visitSection(start, value);
  return missing;
}
