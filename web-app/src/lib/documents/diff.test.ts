import { describe, expect, it } from 'vitest';
import type { DocumentDiff } from '../api/types';
import { mockMessages, scenarioFetch } from '../test/scenarioFetch';
import { groupDiff, nodeAtPointer } from './diff';

/**
 * The diff of a release as the approver reads it (UC-DOC-7): the changes grouped by part and by property, the words of
 * the fields, and the node of the form that a pointer names, over the schema and the diffs of `test-note`.
 */
const messages = mockMessages('en');
const t = (key: string, params?: Record<string, string | number>) =>
  `${key}${params ? JSON.stringify(params) : ''}`;

async function read<T>(path: string): Promise<T> {
  return (await scenarioFetch('workshop').fetch(path)).json() as Promise<T>;
}

const NOTE = 'test-note';

describe('groupDiff', () => {
  it('groups the changes of a part by the property of the schema, in the order of the diff', async () => {
    const diff = await read<DocumentDiff>(
      '/api/v1/documents/test-notes/01JZ8V8D0F2H4K6N8Q0S2W4Y6A/diff',
    );
    const groups = groupDiff(diff, messages, NOTE, 'note', t);
    expect(groups.map((group) => [group.key, group.property, group.title])).toEqual([
      ['status', 'status', 'Status'],
      ['summary', 'summary', 'Summary'],
      ['actions', 'actions', 'Actions'],
    ]);
    // The property itself has no words of its own: the title says it.
    expect(groups[0].rows[0]).toMatchObject({
      pointer: '/status',
      label: '',
      before: 'open',
      after: 'agreed',
    });
    // A field of a row says which row, counted from one.
    expect(groups[2].rows[0].label).toBe('documents.release.row{"row":2,"field":"Done"}');
  });

  it('keeps the changes of one property together and tells a whole row by its place', () => {
    const diff: DocumentDiff = {
      repository: 'test-notes',
      id: 'x',
      from: null,
      to: 'working',
      sections: [
        {
          part: 'data',
          changes: [
            { pointer: '/actions/0/what', before: 'a', after: 'b' },
            { pointer: '/title', before: null, after: 'T' },
            { pointer: '/actions/2', before: null, after: { what: 'new' } },
          ],
        },
      ],
    };
    const groups = groupDiff(diff, messages, NOTE, 'note', t);
    expect(groups.map((group) => group.key)).toEqual(['actions', 'title']);
    expect(groups[0].rows.map((row) => row.label)).toEqual([
      'documents.release.row{"row":1,"field":"What"}',
      'documents.release.row-whole{"row":3}',
    ]);
    expect(groups[0].rows.map((row) => row.key)).toEqual([
      'actions/actions/0/what',
      'actions/actions/2',
    ]);
  });

  it('keys the groups by part as well when the document has several parts', () => {
    const diff: DocumentDiff = {
      repository: 'r',
      id: 'x',
      from: null,
      to: 'working',
      sections: [
        { part: 'one', changes: [{ pointer: '/a', before: null, after: 1 }] },
        {
          part: 'two',
          changes: [
            { pointer: '/a', before: null, after: 2 },
            { pointer: '', before: null, after: 3 },
          ],
        },
      ],
    };
    const groups = groupDiff(diff, {}, NOTE, 'note', t);
    expect(groups.map((group) => [group.key, group.part, group.title])).toEqual([
      ['one:a', 'one', 'a'],
      ['two:a', 'two', 'a'],
      ['two:', 'two', 'two'],
    ]);
  });

  it('is empty for a diff without a change', () => {
    expect(
      groupDiff(
        { repository: 'r', id: 'x', from: null, to: 'working', sections: [] },
        {},
        NOTE,
        'note',
        t,
      ),
    ).toEqual([]);
  });
});

describe('nodeAtPointer', () => {
  it('finds the field a pointer names, through a table and its rows', async () => {
    const schema = (
      await read<{ kinds: { schema: Record<string, unknown> }[] }>(
        '/api/v1/categories/test-note/schema',
      )
    ).kinds[0].schema;
    expect(nodeAtPointer(schema, '/status')?.kind).toBe('select');
    expect(nodeAtPointer(schema, '/owner')?.kind).toBe('person');
    expect(nodeAtPointer(schema, '/actions')?.kind).toBe('table');
    expect(nodeAtPointer(schema, '/actions/1/done')?.kind).toBe('toggle');
    expect(nodeAtPointer(schema, '/actions/1')?.kind).toBe('section');
    expect(nodeAtPointer(schema, '')?.kind).toBe('section');
  });

  it('is null for a field the schema does not have', async () => {
    const schema = (
      await read<{ kinds: { schema: Record<string, unknown> }[] }>(
        '/api/v1/categories/test-note/schema',
      )
    ).kinds[0].schema;
    expect(nodeAtPointer(schema, '/gone')).toBeNull();
    expect(nodeAtPointer(schema, '/actions/x')).toBeNull();
    expect(nodeAtPointer(schema, '/actions/1/gone')).toBeNull();
    expect(nodeAtPointer(schema, '/title/deeper')).toBeNull();
  });
});
