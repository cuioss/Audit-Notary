import { describe, expect, it } from 'vitest';
import { previousRelease, stateTone, versionOf } from './workflow';

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

describe('previousRelease', () => {
  const list = [
    { id: '2026-q4', state: 'draft' as const },
    { id: '2026-q2', state: 'released' as const },
    { id: '2026-q1', state: 'in-review' as const },
    { id: '2025-q4', state: 'released' as const },
  ];

  it('takes the latest release before the assessment, never a later one', () => {
    expect(previousRelease(list, '2026-q4')?.id).toBe('2026-q2');
    expect(previousRelease(list, '2026-q2')?.id).toBe('2025-q4');
    expect(previousRelease(list, '2025-q4')).toBeNull();
    expect(previousRelease(list, 'unknown')).toBeNull();
  });
});
