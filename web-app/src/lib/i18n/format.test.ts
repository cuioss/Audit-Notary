import { describe, expect, it } from 'vitest';
import { formatString } from './format';

describe('formatString', () => {
  it('returns the template without parameters', () => {
    expect(formatString('Hello {name}')).toBe('Hello {name}');
  });

  it('fills parameters and keeps unknown ones', () => {
    expect(formatString('{a} and {b}', { a: 'x' })).toBe('x and {b}');
  });

  it('resolves select', () => {
    const template = '{kind, select, review{a review} other{something}}';
    expect(formatString(template, { kind: 'review' })).toBe('a review');
    expect(formatString(template, { kind: 'x' })).toBe('something');
  });

  it('resolves plural with exact, one and other branches', () => {
    const template = '{count, plural, =0{none} one{one item} other{# items}}';
    expect(formatString(template, { count: 0 })).toBe('none');
    expect(formatString(template, { count: 1 })).toBe('one item');
    expect(formatString(template, { count: 5 })).toBe('5 items');
  });
});
