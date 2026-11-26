import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/errors';
import { SAMM_KEYS } from '../samm/fieldKeys';
import {
  POINTER_KEYS,
  applyFields,
  conflictsOf,
  diffFields,
  missingOf,
  refreshesDocument,
  releasedTagOf,
  validationOf,
  withoutSent,
} from './fields';

const BY = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };

describe('the keys of the fields', () => {
  it('are the JSON Pointers of the server for a generic document', () => {
    expect(POINTER_KEYS.keyOf('/summary')).toBe('/summary');
    expect(POINTER_KEYS.adopt).toBeUndefined();
  });

  it('are the last two segments of a conflict pointer for a SAMM practice, and its values are typed', () => {
    expect(SAMM_KEYS.keyOf('/answers/sm/sm-a-2/answer')).toBe('sm-a-2/answer');
    expect(SAMM_KEYS.keyOf('/answers/sm/sm-a-1/comment')).toBe('sm-a-1/comment');
    expect(SAMM_KEYS.adopt?.('sm-a-2/answer', 0.5)).toBe(0.5);
    expect(SAMM_KEYS.adopt?.('sm-a-2/answer', 'x')).toBeNull();
    expect(SAMM_KEYS.adopt?.('sm-a-1/comment', 'Theirs.')).toBe('Theirs.');
    expect(SAMM_KEYS.adopt?.('sm-a-1/comment', 3)).toBe('');
  });
});

describe('withoutSent', () => {
  it('keeps the fields changed since and the fields never sent', () => {
    const rest = withoutSent(
      { '/a': 1, '/b': 'x', '/c': [1, 2], '/d': { n: 1 } },
      { '/a': 1, '/b': 'y', '/c': [1, 2] },
    );
    expect(rest).toEqual({ '/b': 'x', '/d': { n: 1 } });
  });

  it('compares lists and sections by value', () => {
    expect(withoutSent({ '/a': [{ w: 1 }] }, { '/a': [{ w: 1 }] })).toEqual({});
    expect(withoutSent({ '/a': [{ w: 2 }] }, { '/a': [{ w: 1 }] })).toEqual({ '/a': [{ w: 2 }] });
  });
});

describe('diffFields and applyFields', () => {
  const base = { title: 'T', pinned: false, actions: [{ what: 'a' }], gone: 'x' };

  it('write the top-level properties that changed, a list as a whole, and null for a removed one', () => {
    const next = { title: 'T', pinned: true, actions: [{ what: 'a' }, { what: 'b' }], added: 1 };
    expect(diffFields(base, next)).toEqual({
      '/pinned': true,
      '/actions': [{ what: 'a' }, { what: 'b' }],
      '/gone': null,
      '/added': 1,
    });
    expect(diffFields(base, base)).toEqual({});
  });

  it('escape a property name that holds a slash or a tilde', () => {
    expect(diffFields({}, { 'a/b': 1, 'c~d': 2 })).toEqual({ '/a~1b': 1, '/c~0d': 2 });
  });

  it('read back what was written, without changing the value they start from', () => {
    const next = { title: 'T', pinned: true, actions: [{ what: 'a' }, { what: 'b' }], added: 1 };
    const applied = applyFields(base, diffFields(base, next));
    expect(applied).toEqual(next);
    expect(base.pinned).toBe(false);
    expect(applyFields(base, { '/actions/0/what': 'z' }).actions).toEqual([{ what: 'z' }]);
  });
});

describe('the refusals of a save', () => {
  const conflict = new ApiError('CONFLICT', 409, [], {
    outcome: 'CONFLICT',
    conflicts: [
      {
        part: 'data',
        blob: '5d1e9a0',
        fields: [{ pointer: '/summary', own: 'a', other: 'b', by: BY }],
      },
      { part: 'other', blob: 'x1', fields: [] },
    ],
  });

  it('name the conflicts of the part by the key of the field, and the blob of the next save', () => {
    const found = conflictsOf(conflict, 'data', POINTER_KEYS);
    expect(found?.blob).toBe('5d1e9a0');
    expect(Object.keys(found?.fields ?? {})).toEqual(['/summary']);
    expect(conflictsOf(conflict, 'missing', POINTER_KEYS)).toBeNull();
    expect(conflictsOf(new ApiError('CONFLICT', 409), 'data', POINTER_KEYS)).toBeNull();
  });

  it('survive a conflict entry without blob and fields', () => {
    const bare = new ApiError('CONFLICT', 409, [], { conflicts: [{ part: 'data' }] });
    expect(conflictsOf(bare, 'data', POINTER_KEYS)).toEqual({ blob: '', fields: {} });
  });

  it('keep the field errors of the part, and those that name no part', () => {
    const error = new ApiError('VALIDATION', 422, [
      { part: 'data', pointer: '/related', code: 'REFERENCE_NOT_FOUND' },
      { part: 'other', pointer: '/x', code: 'REQUIRED' },
      { pointer: '/y', code: 'REQUIRED' },
    ]);
    expect(validationOf(error, 'data').map((entry) => entry.pointer)).toEqual(['/related', '/y']);
  });

  it('read the missing fields and the tag of a release', () => {
    expect(
      missingOf(new ApiError('MANDATORY_FIELDS_MISSING', 422, [], { missing: ['/a', 3] })),
    ).toEqual(['/a']);
    expect(missingOf(new ApiError('MANDATORY_FIELDS_MISSING', 422))).toEqual([]);
    expect(releasedTagOf(new ApiError('DOCUMENT_RELEASED', 409, [], { tag: 'notes/x/v1' }))).toBe(
      'notes/x/v1',
    );
    expect(releasedTagOf(new ApiError('DOCUMENT_RELEASED', 409))).toBe('');
  });
});

describe('refreshesDocument', () => {
  const data = { repository: 'test-notes', id: 'N2' };

  it('is true for a save or a transition of that very document', () => {
    expect(refreshesDocument('document-saved', data, 'test-notes', 'N2')).toBe(true);
    expect(refreshesDocument('document-transitioned', data, 'test-notes', 'N2')).toBe(true);
  });

  it('is false for another document, another repository, another event or no data', () => {
    expect(refreshesDocument('document-saved', data, 'test-notes', 'N3')).toBe(false);
    expect(refreshesDocument('document-saved', data, 'samm-assessments', 'N2')).toBe(false);
    expect(refreshesDocument('document-created', data, 'test-notes', 'N2')).toBe(false);
    expect(refreshesDocument('document-saved', 'text', 'test-notes', 'N2')).toBe(false);
    expect(refreshesDocument('document-saved', null, 'test-notes', 'N2')).toBe(false);
  });
});
