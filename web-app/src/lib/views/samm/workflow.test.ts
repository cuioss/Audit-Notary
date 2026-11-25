import { describe, expect, it } from 'vitest';
import { stateTone, versionOf } from './workflow';

describe('stateTone', () => {
  it('seals the released, runs the review and keeps the draft neutral', () => {
    expect(stateTone('released')).toBe('sealed');
    expect(stateTone('in-review')).toBe('running');
    expect(stateTone('draft')).toBe('neutral');
  });
});

describe('versionOf', () => {
  it('takes the last segment of a release tag', () => {
    expect(versionOf('assessments/payments-2026-q4/v1')).toBe('v1');
    expect(versionOf('v2')).toBe('v2');
  });
});
