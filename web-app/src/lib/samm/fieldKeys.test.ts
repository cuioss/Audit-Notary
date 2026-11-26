import { describe, expect, it } from 'vitest';
import { EVIDENCE_KEY, SAMM_KEYS, TARGET_KEYS } from './fieldKeys';

describe('the keys of the fields of a SAMM document', () => {
  it('keys an answer and a comment by the last two segments of the pointer', () => {
    expect(SAMM_KEYS.keyOf('/answers/sb/sb-b-1/answer')).toBe('sb-b-1/answer');
    expect(SAMM_KEYS.keyOf('/answers/sb/sb-b-1/comment')).toBe('sb-b-1/comment');
  });

  it('keys the whole evidence of a practice by one key, whatever the pointer names', () => {
    expect(SAMM_KEYS.keyOf('/evidence/sb')).toBe(EVIDENCE_KEY);
    expect(SAMM_KEYS.keyOf('/evidence/sb/1/url')).toBe(EVIDENCE_KEY);
  });

  it('takes the other side of a conflict into the field it belongs to', () => {
    expect(SAMM_KEYS.adopt?.('sb-b-1/answer', 2)).toBe(2);
    expect(SAMM_KEYS.adopt?.('sb-b-1/answer', 'x')).toBeNull();
    expect(SAMM_KEYS.adopt?.('sb-b-1/comment', 'Theirs.')).toBe('Theirs.');
    expect(SAMM_KEYS.adopt?.('sb-b-1/comment', 3)).toBe('');
    const links = [{ question: null, title: 'T', url: 'https://x.example' }];
    expect(SAMM_KEYS.adopt?.(EVIDENCE_KEY, links)).toBe(links);
    expect(SAMM_KEYS.adopt?.(EVIDENCE_KEY, undefined)).toEqual([]);
  });

  it('keys a target by the pointer of its practice, and none is the removal', () => {
    expect(TARGET_KEYS.keyOf('/ta')).toBe('/ta');
    expect(TARGET_KEYS.adopt?.('/ta', { target: 2 })).toEqual({ target: 2 });
    expect(TARGET_KEYS.adopt?.('/ta', undefined)).toBeNull();
  });
});
