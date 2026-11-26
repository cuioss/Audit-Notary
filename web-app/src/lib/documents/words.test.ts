import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import type { Category, HistoryLine, Revision, Session } from '../api/types';
import { formatString, messagesStore } from '../i18n';
import { mockMessages, scenarioFetch } from '../test/scenarioFetch';
import {
  actionsOn,
  categoryList,
  categoryName,
  fieldLabel,
  findDocument,
  hasDocumentsLens,
  isShown,
  kindName,
  loadCategories,
  refreshCategories,
  repositoriesOf,
  transitionName,
} from './categories';
import { plainValue } from './display';
import { documentHistory, revisionKind, versionOfTag } from './history';

/**
 * The words and the lookups of the generic lens: categories, rights, the names the category's catalogue holds, the values
 * a conflict shows, the history and the revisions in sentences.
 */
const MESSAGES = mockMessages('en');
const MESSAGES_DE = mockMessages('de');
const t = (key: string, params?: Record<string, string | number>): string =>
  formatString(MESSAGES[key] ?? key, params);

const NOTE: Category = {
  id: 'test-note',
  generic: true,
  kinds: [{ id: 'note', repository: 'test-notes' }],
};

afterEach(() => {
  categoryList.set(null);
  vi.unstubAllGlobals();
  messagesStore.set(MESSAGES);
});

describe('the categories', () => {
  it('shows a generic category that is switched on, and no other', () => {
    expect(isShown(NOTE)).toBe(true);
    expect(isShown({ ...NOTE, enabled: true })).toBe(true);
    expect(isShown({ ...NOTE, enabled: false })).toBe(false);
    expect(isShown({ ...NOTE, generic: false })).toBe(false);
  });

  it('offers the lens while a generic category is listed', () => {
    expect(get(hasDocumentsLens)).toBe(false);
    categoryList.set({ categories: [{ ...NOTE, generic: false }] });
    expect(get(hasDocumentsLens)).toBe(false);
    categoryList.set({ categories: [{ ...NOTE, enabled: false }] });
    expect(get(hasDocumentsLens)).toBe(false);
    categoryList.set({ categories: [NOTE] });
    expect(get(hasDocumentsLens)).toBe(true);
  });

  it('reads the categories and keeps them for the rail', async () => {
    vi.stubGlobal('fetch', scenarioFetch('workshop').fetch);
    const list = await loadCategories(new ApiClient(() => {}));
    expect(list.categories.map((category) => category.id)).toEqual(['test-note']);
    expect(get(categoryList)).toEqual(list);
  });

  it('keeps quiet when the categories cannot be read: no lens', async () => {
    categoryList.set({ categories: [NOTE] });
    vi.stubGlobal('fetch', async () => Response.json({ outcome: 'FORBIDDEN' }, { status: 403 }));
    await refreshCategories(new ApiClient(() => {}));
    expect(get(categoryList)).toBeNull();
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('offline');
    });
    await refreshCategories(new ApiClient(() => {}));
    expect(get(categoryList)).toBeNull();
  });

  it('lists the repositories of the document types, each once', () => {
    expect(
      repositoriesOf({
        ...NOTE,
        kinds: [
          { id: 'a', repository: 'x' },
          { id: 'b', repository: 'x' },
          { id: 'c', repository: 'y' },
        ],
      }),
    ).toEqual(['x', 'y']);
  });

  it('reads the actions of a session on a repository', () => {
    const session = {
      rights: [{ repository: 'test-notes', actions: ['read', 'edit'] }],
    } as unknown as Session;
    expect(actionsOn(session, 'test-notes')).toEqual(['read', 'edit']);
    expect(actionsOn(session, 'other')).toEqual([]);
    expect(actionsOn(null, 'test-notes')).toEqual([]);
  });
});

describe('finding a document among the repositories of a category', () => {
  const many: Category = {
    ...NOTE,
    kinds: [
      { id: 'memo', repository: 'memos' },
      { id: 'note', repository: 'test-notes' },
    ],
  };

  it('takes the first repository that has it', async () => {
    const client = new ApiClient(() => {});
    const read = vi
      .spyOn(client, 'getDocument')
      .mockRejectedValueOnce(new ApiError('NOT_FOUND', 404))
      .mockResolvedValueOnce({ id: 'x', repository: 'test-notes' } as never);
    const found = await findDocument(client, many, 'x', 'v1');
    expect(found.repository).toBe('test-notes');
    expect(read).toHaveBeenNthCalledWith(1, 'memos', 'x', 'v1');
    expect(read).toHaveBeenNthCalledWith(2, 'test-notes', 'x', 'v1');
  });

  it('says not found when none has it, and any other refusal as it is', async () => {
    const client = new ApiClient(() => {});
    vi.spyOn(client, 'getDocument').mockRejectedValue(new ApiError('NOT_FOUND', 404));
    await expect(findDocument(client, many, 'x')).rejects.toMatchObject({ outcome: 'NOT_FOUND' });
    vi.spyOn(client, 'getDocument').mockRejectedValue(new ApiError('GIT_UNAVAILABLE', 503));
    await expect(findDocument(client, many, 'x')).rejects.toMatchObject({
      outcome: 'GIT_UNAVAILABLE',
    });
    vi.spyOn(client, 'getDocument').mockRejectedValue(new Error('boom'));
    await expect(findDocument(client, many, 'x')).rejects.toThrow('boom');
  });

  it('fails for a category without a repository', async () => {
    await expect(
      findDocument(new ApiClient(() => {}), { ...NOTE, kinds: [] }, 'x'),
    ).rejects.toThrow('has no repository');
  });
});

describe('the names of the category', () => {
  it('reads them from the catalogue in both languages, and falls back to the id in words', () => {
    expect(categoryName(MESSAGES, 'test-note')).toBe('Test notes');
    expect(categoryName(MESSAGES_DE, 'test-note')).toBe('Testnotizen');
    expect(categoryName(MESSAGES, 'custom-risks')).toBe('Custom risks');
    expect(kindName(MESSAGES, 'test-note', 'note')).toBe('Note');
    expect(kindName(MESSAGES_DE, 'test-note', 'note')).toBe('Notiz');
    expect(kindName(MESSAGES, 'test-note', 'memo')).toBe('Memo');
    expect(transitionName(MESSAGES, 'test-note', 'test-note.submit')).toBe('Submit for review');
    expect(transitionName(MESSAGES_DE, 'test-note', 'test-note.submit')).toBe(
      'Zur Prüfung einreichen',
    );
    expect(transitionName(MESSAGES, 'test-note', 'test-note.archive')).toBe('Archive');
  });

  it('labels a field by its pointer, rows left out, and falls back to the property name', () => {
    expect(fieldLabel(MESSAGES, 'test-note', 'note', '/noted')).toBe('Noted at');
    expect(fieldLabel(MESSAGES, 'test-note', 'note', '/actions/1/what')).toBe('What');
    expect(fieldLabel(MESSAGES_DE, 'test-note', 'note', '/summary')).toBe('Zusammenfassung');
    expect(fieldLabel(MESSAGES, 'test-note', 'note', '/unknown~1name')).toBe('unknown/name');
    expect(fieldLabel(MESSAGES, 'test-note', 'note', '')).toBe('');
  });
});

describe('a value as one line', () => {
  const show = (pointer: string, value: unknown) =>
    plainValue(MESSAGES, 'test-note', 'note', pointer, value, t);

  it('says an empty value, a switch, a size and an option in words', () => {
    expect(show('/summary', null)).toBe('No value');
    expect(show('/summary', undefined)).toBe('No value');
    expect(show('/summary', '')).toBe('No value');
    expect(show('/pinned', true)).toBe('Yes');
    expect(show('/pinned', false)).toBe('No');
    expect(show('/actions', [{}, {}])).toBe('2 entries');
    expect(show('/section', { a: 1 })).toBe('one field');
  });

  it('shows an option by its text and any other text or number as it is', () => {
    expect(show('/status', 'dropped')).toBe('Dropped');
    expect(show('/summary', 'Rotate every 60 days.')).toBe('Rotate every 60 days.');
    expect(show('/count', 3)).toBe('3');
  });
});

describe('the history in sentences', () => {
  const NOW = new Date('2026-11-26T12:00:00Z');
  const lines: HistoryLine[] = [
    { at: '2026-11-26T10:00:00Z', by: { pseudonym: 'p', name: 'Alex' }, kind: 'save', count: 2 },
    {
      at: '2026-11-20T10:00:00Z',
      by: { pseudonym: 'p', name: 'Noor' },
      kind: 'release',
      tag: 'notes/X/v2',
    },
    { at: '2026-11-19T10:00:00Z', by: { pseudonym: 'p', name: 'Alex' }, kind: 'submit' },
    { at: '2026-11-18T10:00:00Z', by: { pseudonym: 'p', name: 'Alex' }, kind: 'create' },
  ];

  it('names who did what and when; a day ago reads as a time ago and a release wears the seal', () => {
    const entries = documentHistory(lines, t, 'en', NOW);
    expect(entries.map((entry) => entry.who)).toEqual(['Alex', 'Noor', 'Alex', 'Alex']);
    expect(entries[0].when).toMatch(/hours? ago/);
    expect(entries[1].when).toMatch(/Nov 20, 2026/);
    expect(entries.map((entry) => entry.release)).toEqual([false, true, false, false]);
    expect(entries.map((entry) => entry.what)).toEqual([
      'Saved 2 fields',
      'Released it as v2',
      'Submitted it for review',
      'Created the document',
    ]);
  });

  it('names a revision by what it is', () => {
    const base = {
      commit: 'c',
      version: 1,
      at: '2026-11-20T10:00:00Z',
      by: { pseudonym: 'p', name: 'N' },
    };
    const release: Revision = { ...base, ref: 'v2', kind: 'release', tag: 'notes/X/v2' };
    expect(revisionKind(release, t)).toBe('Released as v2');
    expect(revisionKind({ ...base, ref: 'abcdef0', kind: 'save', tag: null }, t)).toBe('Saved');
    expect(revisionKind({ ...base, ref: 'v1', kind: 'release', tag: null }, t)).toBe(
      'Released as v1',
    );
    expect(versionOfTag('notes/X/v2')).toBe('v2');
    expect(versionOfTag('')).toBe('');
  });
});
