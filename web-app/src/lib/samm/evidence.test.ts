import { describe, expect, it } from 'vitest';
import {
  MAX_EVIDENCE_URL,
  evidenceErrorsOf,
  isHttpsUrl,
  linkProblem,
  locateLink,
} from './evidence';

describe('the evidence links of a practice (AUN-SAMM-7)', () => {
  it('takes an absolute https address and nothing else', () => {
    expect(isHttpsUrl('https://ci.example/payments/pipeline')).toBe(true);
    expect(isHttpsUrl('HTTPS://ci.example/x')).toBe(true);
    expect(isHttpsUrl('http://ci.example/x')).toBe(false);
    expect(isHttpsUrl('/relative/path')).toBe(false);
    expect(isHttpsUrl('file:///etc/passwd')).toBe(false);
    expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
    expect(isHttpsUrl('https://')).toBe(false);
    expect(isHttpsUrl('https://exa mple')).toBe(false);
    expect(isHttpsUrl(`https://ci.example/${'a'.repeat(MAX_EVIDENCE_URL)}`)).toBe(false);
  });

  it('names the first problem of a link as the server would', () => {
    expect(linkProblem({ title: 'Pipeline', url: 'https://ci.example/x' })).toBeNull();
    expect(linkProblem({ title: '  ', url: 'https://ci.example/x' })).toBe('REQUIRED');
    expect(linkProblem({ title: 'Pipeline', url: '' })).toBe('REQUIRED');
    expect(linkProblem({ title: 'x'.repeat(201), url: 'https://ci.example/x' })).toBe('MAX_LENGTH');
    expect(linkProblem({ title: 'Pipeline', url: 'http://ci.example/x' })).toBe('PATTERN');
  });

  it('reads the refusal of a save by link and member, and the list as a whole', () => {
    const errors = [
      { pointer: '/evidence/sb/1/url', code: 'PATTERN', part: 'sb' },
      { pointer: '/evidence/sb/0/title', code: 'REQUIRED', part: 'sb' },
      { pointer: '/evidence/sb/1/url', code: 'MAX_LENGTH', part: 'sb' },
      { pointer: '/evidence/sb/2', code: 'TYPE', part: 'sb' },
      { pointer: '/evidence/sb', code: 'MAX_ITEMS', part: 'sb' },
      { pointer: '/evidence/ta/0/url', code: 'PATTERN', part: 'ta' },
      { pointer: '/answers/sb/sb-b-1/comment', code: 'MAX_LENGTH', part: 'sb' },
      { pointer: '/evidence/sb/x/url', code: 'PATTERN', part: 'sb' },
    ];
    expect(evidenceErrorsOf(errors, 'sb')).toEqual({
      rows: { 0: { title: 'REQUIRED' }, 1: { url: 'PATTERN' }, 2: { link: 'TYPE' } },
      list: 'MAX_ITEMS',
    });
    expect(evidenceErrorsOf(null, 'sb')).toEqual({ rows: {}, list: null });
  });

  it('finds a link again in a list that was replaced meanwhile, and says when it is gone', () => {
    const a = { question: null, title: 'A', url: 'https://a.example/' };
    const b = { question: 'q', title: 'B', url: 'https://b.example/' };
    expect(locateLink([a, b], a, 0)).toBe(0);
    expect(locateLink([b, a], a, 0)).toBe(1);
    expect(locateLink([b, { ...a, title: 'A2' }], a, 0)).toBe(-1);
    expect(locateLink([], a, 0)).toBe(-1);
  });
});
