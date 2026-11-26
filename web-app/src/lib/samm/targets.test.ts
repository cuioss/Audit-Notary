import { describe, expect, it } from 'vitest';
import {
  TARGET_STEPS,
  parseTarget,
  targetErrorsOf,
  targetOptions,
  targetText,
  withTarget,
} from './targets';

describe('the targets of a scope (AUN-SAMM-6)', () => {
  it('offers 0 to 3 in steps of a half, written as the language writes numbers', () => {
    expect(TARGET_STEPS).toEqual([0, 0.5, 1, 1.5, 2, 2.5, 3]);
    expect(targetOptions('en').map((option) => option.label)).toEqual([
      '0',
      '0.5',
      '1',
      '1.5',
      '2',
      '2.5',
      '3',
    ]);
    expect(targetOptions('de')[1]).toEqual({ value: '0.5', label: '0,5' });
  });

  it('reads the select: a step is a target, empty and anything else is none', () => {
    expect(parseTarget('2.5')).toBe(2.5);
    expect(parseTarget('0')).toBe(0);
    expect(parseTarget('')).toBeNull();
    expect(parseTarget('4')).toBeNull();
    expect(parseTarget('abc')).toBeNull();
  });

  it('shows the held target, even one that is no step', () => {
    expect(targetText({ target: 1.5 })).toBe('1.5');
    expect(targetText({ target: 1.25 })).toBe('1.25');
    expect(targetText(undefined)).toBe('');
  });

  it('changes one practice and leaves the others and the original alone', () => {
    const before = { sm: { target: 2 }, ta: { target: 2.5, due: '2027-03-31' } };
    expect(withTarget(before, 'sm', 3, '2027-01-01')).toEqual({
      sm: { target: 3, due: '2027-01-01' },
      ta: { target: 2.5, due: '2027-03-31' },
    });
    expect(withTarget(before, 'rt', 1)).toEqual({ ...before, rt: { target: 1 } });
    // No target removes the entry and with it the due day; an empty day is no day.
    expect(withTarget(before, 'ta', null)).toEqual({ sm: { target: 2 } });
    expect(withTarget(before, 'ta', 2.5, '')).toEqual({ sm: { target: 2 }, ta: { target: 2.5 } });
    expect(before.ta).toEqual({ target: 2.5, due: '2027-03-31' });
  });

  it('reads the refusal of a create and of a save by practice and field', () => {
    const errors = [
      { pointer: '/title', code: 'REQUIRED' },
      { pointer: '/targets/ta/target', code: 'ENUM' },
      { pointer: '/targets/rt/due', code: 'PATTERN' },
      { pointer: '/targets/rt/due', code: 'REQUIRED' },
      { pointer: '/targets/om', code: 'ENUM' },
    ];
    expect(targetErrorsOf(errors, '/targets')).toEqual({
      ta: { target: 'ENUM' },
      rt: { due: 'PATTERN' },
      om: { entry: 'ENUM' },
    });
    expect(targetErrorsOf([{ pointer: '/ta/target', code: 'ENUM', part: 'targets' }], '')).toEqual({
      ta: { target: 'ENUM' },
    });
    expect(targetErrorsOf(null, '')).toEqual({});
  });
});
