import { describe, expect, it } from 'vitest';
import { messagesStore } from '../i18n';
import {
  effectiveErrors,
  errorKey,
  errorKeyOf,
  isAffectedBy,
  isWithin,
  placeOf,
} from './fieldErrors';
import { loadMessages } from '../../test/catalogue-fixture';
import { useMessages } from './testkit';
import { BROWSER_CODES, SERVER_CODES } from './validate';

describe('which errors the form shows', () => {
  const browser = [
    { pointer: '/title', code: 'MIN_LENGTH' },
    { pointer: '/closed', code: 'FORMAT' },
  ];
  const server = [{ pointer: '/related', code: 'REFERENCE_NOT_FOUND' }];

  it('shows the errors of the browser until the server has answered', () => {
    expect(effectiveErrors(null, browser, [])).toEqual(browser);
  });

  it('replaces the errors of the browser with the server verdict, and checks a changed field again', () => {
    expect(effectiveErrors(server, browser, [])).toEqual(server);
    expect(effectiveErrors(server, browser, ['/title'])).toEqual([
      ...server,
      { pointer: '/title', code: 'MIN_LENGTH' },
    ]);
  });

  it('tells which places a change makes stale', () => {
    expect(isWithin('/actions', '/actions/1/what')).toBe(true);
    expect(isWithin('/actions', '/actionsx')).toBe(false);
    expect(isAffectedBy('/actions/1', '/actions')).toBe(true);
    expect(isAffectedBy('/actions', '/actions/1/what')).toBe(true);
    expect(isAffectedBy('/actions/0', '/actions/1/what')).toBe(false);
  });

  it('places an error at the nearest field of the form, or nowhere', () => {
    const known = new Set(['', '/a', '/a/b']);
    expect(placeOf('/a/b', known)).toBe('/a/b');
    expect(placeOf('/a/b/c/d', known)).toBe('/a/b');
    expect(placeOf('/x', known)).toBeNull();
    expect(placeOf('', known)).toBeNull();
  });

  it('names the text of a code, and falls back to the general one for a code it has no text for', () => {
    useMessages('en');
    expect(errorKey('MAX_LENGTH')).toBe('form.error.max-length');
    expect(errorKey('REFERENCE_NOT_FOUND')).toBe('form.error.reference-not-found');
    expect(errorKey('SOMETHING_NEW')).toBe('form.error.invalid');
    messagesStore.set({});
    expect(errorKey('MAX_LENGTH')).toBe('form.error.invalid');
  });

  it('has a text in both languages for every code the form knows', () => {
    for (const lang of ['en', 'de'] as const) {
      const messages = loadMessages(lang);
      for (const code of [...BROWSER_CODES, ...SERVER_CODES]) {
        const key = errorKeyOf(code);
        expect(Object.hasOwn(messages, key), `${lang} ${key}`).toBe(true);
      }
      expect(Object.hasOwn(messages, 'form.error.invalid')).toBe(true);
    }
  });
});
