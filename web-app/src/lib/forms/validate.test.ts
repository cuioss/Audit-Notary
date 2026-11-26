import { describe, expect, it } from 'vitest';
import { instantToLocalInput, localInputToInstant } from './dateTime';
import { BROKEN_VALIDATION, CLEAN_NOTE, MARKED_NOTE, schemaOf, useProfile } from './testkit';
import {
  isDate,
  isDateTime,
  isEmptyValue,
  isGdrLink,
  missingRequired,
  validate,
  validateWith,
} from './validate';

describe('the browser validation (AUN-WEB-4, Validation)', () => {
  it('finds no error in a clean test-note and in one with every mark', async () => {
    const schema = await schemaOf(useProfile(), 'test-note');
    expect(validate(schema, CLEAN_NOTE)).toEqual([]);
    expect(validate(schema, MARKED_NOTE)).toEqual([]);
  });

  it('breaks every constraint of form-validation once, with the code of the keyword', async () => {
    const schema = await schemaOf(useProfile(), 'form-validation');
    const errors = validate(schema, BROKEN_VALIDATION);
    const codes = Object.fromEntries(
      Object.entries(Object.groupBy(errors, (error) => error.pointer)).map(([pointer, list]) => [
        pointer,
        list!.map((error) => error.code),
      ]),
    );
    expect(codes).toEqual({
      '/code': ['PATTERN'],
      '/title': ['MIN_LENGTH'],
      '/severity': ['ENUM'],
      '/score': ['MAXIMUM'],
      '/weight': ['EXCLUSIVE_MAXIMUM'],
      '/opened': ['FORMAT'],
      '/closed': ['FORMAT'],
      '/acknowledged': ['CONST'],
      '/link': ['FORMAT'],
      '/references': ['MAX_ITEMS', 'UNIQUE_ITEMS'],
      '/checks': ['MIN_ITEMS'],
    });
  });

  it('checks the other bounds: maxLength, minimum, exclusiveMinimum, the type, and the members of a list', async () => {
    const schema = await schemaOf(useProfile(), 'form-validation');
    const errors = validate(schema, {
      code: 'AB-1234',
      title: 'x'.repeat(41),
      score: -1,
      weight: 0,
      references: ['a:b/c', 5],
      checks: [{ name: 'a' }, { name: 'ok' }, { name: 7 }],
    });
    expect(errors).toEqual(
      expect.arrayContaining([
        { pointer: '/code', code: 'MAX_LENGTH' },
        { pointer: '/title', code: 'MAX_LENGTH' },
        { pointer: '/score', code: 'MINIMUM' },
        { pointer: '/weight', code: 'EXCLUSIVE_MINIMUM' },
        { pointer: '/references/1', code: 'TYPE' },
        { pointer: '/checks/0/name', code: 'MIN_LENGTH' },
        { pointer: '/checks/2/name', code: 'TYPE' },
      ]),
    );
    // A wrong type ends the check of that value: no second error on it.
    expect(errors.filter((error) => error.pointer === '/references/1')).toHaveLength(1);
  });

  it('counts characters, not UTF-16 units, and tells an integer from a number', () => {
    const schema = {
      type: 'object',
      properties: { s: { type: 'string', maxLength: 1 }, n: { type: 'integer' } },
    };
    expect(validate(schema, { s: '😀', n: 1 })).toEqual([]);
    expect(validate(schema, { n: 1.5 })).toEqual([{ pointer: '/n', code: 'TYPE' }]);
  });

  it('matches a pattern anywhere in the value and skips one it cannot compile', () => {
    const schema = {
      type: 'object',
      properties: { a: { type: 'string', pattern: 'b+' }, b: { type: 'string', pattern: '(' } },
    };
    expect(validate(schema, { a: 'abbc', b: 'x' })).toEqual([]);
    expect(validate(schema, { a: 'xyz' })).toEqual([{ pointer: '/a', code: 'PATTERN' }]);
  });

  it('does not check what only the server checks', () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      properties: { v: { oneOf: [{ type: 'string' }, { type: 'integer' }] } },
    };
    expect(validate(schema, { v: true, extra: 1 })).toEqual([]);
  });

  it('follows a $ref and reports the pointers into the value it was given', async () => {
    const schema = await schemaOf(useProfile(), 'form-sections');
    expect(validate(schema, { primary: { channel: 'pigeon' } })).toEqual([
      { pointer: '/primary/channel', code: 'ENUM' },
    ]);
    const item = { type: 'object', properties: { a: { type: 'integer', maximum: 1 } } };
    expect(validateWith(schema, item, { a: 2 })).toEqual([{ pointer: '/a', code: 'MAXIMUM' }]);
  });
});

describe('the format advice', () => {
  it('asserts date-time, date and the shape of a reference', () => {
    expect(isDateTime('2026-11-24T09:30:00Z')).toBe(true);
    expect(isDateTime('2025-03-02T14:00:00+01:00')).toBe(true);
    expect(isDateTime('2026-11-24T09:30:00.123456Z')).toBe(true);
    expect(isDateTime('2026-11-24t09:30:00z')).toBe(true);
    for (const bad of [
      'yesterday',
      '2026-11-24',
      '2026-11-24T09:30:00',
      '2026-11-24T24:30:00Z',
      '2026-11-24T09:60:00Z',
      '2026-11-24T09:30:00+25:00',
      '2026-11-24T09:30:00.Z',
      '2026-02-30T09:30:00Z',
      '2026-11-24T09:30Z',
    ]) {
      expect(isDateTime(bad), bad).toBe(false);
    }
    expect(isDate('2024-02-29')).toBe(true);
    expect(isDate('2026-02-29')).toBe(false);
    expect(isDate('2026-13-40')).toBe(false);
    expect(isDate('2026-1-1')).toBe(false);
    expect(isDate('2000-02-29')).toBe(true);
    expect(isDate('1900-02-29')).toBe(false);
    for (const good of [
      'service:payment-api',
      'isms-register:risk/R-042',
      'samm-assessments:assessment/payments-2026-q4#sm',
      'a:b/c',
    ]) {
      expect(isGdrLink(good), good).toBe(true);
    }
    for (const bad of [
      'not a link',
      'a:',
      ':b',
      'a:b/',
      'a/b:c',
      'a:b/c/d',
      'a:b#',
      'a:b#c#d',
      'a b:c',
      'plain',
    ]) {
      expect(isGdrLink(bad), bad).toBe(false);
    }
  });
});

describe('the mandatory fields', () => {
  it('lists the empty fields of required, in a section and in every row, and no error for them', async () => {
    const schema = await schemaOf(useProfile(), 'test-note');
    expect(missingRequired(schema, {})).toEqual(['/title', '/noted', '/status']);
    expect(missingRequired(schema, { title: ' ', noted: 'x', status: 'open' })).toEqual(['/title']);
    expect(validate(schema, {})).toEqual([]);
    const sections = await schemaOf(useProfile(), 'form-sections');
    expect(missingRequired(sections, { name: 'x' })).toEqual([]);
    expect(missingRequired(sections, {})).toEqual(['/name']);
    const validation = await schemaOf(useProfile(), 'form-validation');
    expect(
      missingRequired(validation, {
        code: 'AB-123',
        title: 'Title',
        severity: 'low',
        opened: '2026-11-24T09:30:00Z',
        checks: [{ passed: true }, { name: 'ok' }],
      }),
    ).toEqual(['/checks/0/name']);
  });

  it('counts nothing, null, a blank text and an empty list as empty, and false and zero as filled', () => {
    for (const empty of [undefined, null, '', '  ', []]) expect(isEmptyValue(empty)).toBe(true);
    for (const filled of [false, 0, 'x', [1]]) expect(isEmptyValue(filled)).toBe(false);
  });
});

describe('the date and time of the browser', () => {
  it('shows an instant in the time zone of the browser and stores it back in UTC to the second', () => {
    const local = instantToLocalInput('2026-11-24T09:30:00Z');
    expect(local).toMatch(/^2026-11-2[345]T\d{2}:\d{2}:00$/);
    expect(localInputToInstant(local!)).toBe('2026-11-24T09:30:00Z');
    expect(localInputToInstant('2026-11-24T09:30')).toMatch(/Z$/);
    // The same instant with another offset reads the same.
    expect(instantToLocalInput('2025-03-02T14:00:00+01:00')).toBe(
      instantToLocalInput('2025-03-02T13:00:00Z'),
    );
  });

  it('refuses what is no date and time, and an entry that does not exist', () => {
    expect(instantToLocalInput('yesterday')).toBeNull();
    expect(localInputToInstant('')).toBeNull();
    expect(localInputToInstant('2026-11-24')).toBeNull();
    expect(localInputToInstant('2026-11-24T09')).toBeNull();
    expect(localInputToInstant('2026-11-24T09:xx')).toBeNull();
    expect(localInputToInstant('2026-02-30T09:30')).toBeNull();
    expect(localInputToInstant('a-b-cT09:30')).toBeNull();
    expect(localInputToInstant('2026-11-24T09:30T10')).toBeNull();
  });
});
