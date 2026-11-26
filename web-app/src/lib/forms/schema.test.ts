import { describe, expect, it } from 'vitest';
import { schemaOf, useProfile } from './testkit';
import {
  catalogsOf,
  chooseKind,
  childNodes,
  childPointer,
  fieldNode,
  fieldPointers,
  getAt,
  isScalarKind,
  itemNode,
  jsonEqual,
  messageKey,
  pointerTokens,
  resolveRef,
  rootNode,
  setAt,
  tableColumns,
  toPointer,
  type FieldKind,
  type FieldNode,
  type JsonSchema,
} from './schema';

/** The component of every property of a schema, by pointer, as "Choosing the Component" picks it. */
function kinds(root: JsonSchema): Record<string, FieldKind> {
  const found: Record<string, FieldKind> = {};
  const visit = (node: FieldNode): void => {
    if (node.pointer !== '') found[node.pointer] = node.kind;
    if (node.kind === 'section') childNodes(node, root).forEach(visit);
    if (node.kind === 'table') {
      const item = itemNode(node, root);
      if (item.kind === 'section') {
        for (const child of childNodes(item, root)) {
          found[`${node.pointer}/*${child.pointer}`] = child.kind;
        }
      } else {
        found[`${node.pointer}/*`] = item.kind;
      }
    }
  };
  visit(rootNode(root));
  return found;
}

describe('the choice of the component (AUN-WEB-4, Choosing the Component)', () => {
  it('picks the component of every property of test-note', async () => {
    const kit = useProfile();
    const schema = await schemaOf(kit, 'test-note');
    expect(kinds(schema)).toEqual({
      '/title': 'text',
      '/noted': 'date-time',
      '/status': 'select',
      '/pinned': 'toggle',
      '/service': 'catalog',
      '/owner': 'person',
      '/related': 'docref',
      '/summary': 'text',
      '/body': 'asciidoc',
      '/actions': 'table',
      '/actions/*/what': 'text',
      '/actions/*/who': 'person',
      '/actions/*/due': 'date',
      '/actions/*/done': 'toggle',
    });
  });

  it('picks the component of every property of form-sections, with $ref, sections and plain data', async () => {
    const kit = useProfile();
    const schema = await schemaOf(kit, 'form-sections');
    expect(kinds(schema)).toEqual({
      '/name': 'text',
      '/created': 'date-time',
      '/origin': 'text',
      '/scope': 'section',
      '/scope/teams': 'table',
      '/scope/teams/*': 'catalog',
      '/scope/services': 'table',
      '/scope/services/*': 'catalog',
      '/scope/reviewers': 'table',
      '/scope/reviewers/*': 'person',
      '/scope/tags': 'table',
      '/scope/tags/*': 'text',
      '/scope/levels': 'table',
      '/scope/levels/*': 'select',
      '/scope/references': 'table',
      '/scope/references/*': 'docref',
      '/metrics': 'section',
      '/metrics/count': 'number',
      '/metrics/ratio': 'number',
      '/metrics/window': 'section',
      '/metrics/window/from': 'date',
      '/metrics/window/until': 'date',
      '/primary': 'section',
      '/primary/person': 'person',
      '/primary/channel': 'select',
      '/notes': 'asciidoc',
      '/rows': 'table',
      '/rows/*/label': 'text',
      '/rows/*/weight': 'number',
      // Rule 13: an array inside a row of a table is plain data.
      '/rows/*/attachments': 'plain',
      '/variant': 'plain',
      '/matrix': 'plain',
    });
  });

  it('picks the component of every property of form-validation', async () => {
    const kit = useProfile();
    const schema = await schemaOf(kit, 'form-validation');
    expect(kinds(schema)).toMatchObject({
      '/code': 'text',
      '/severity': 'select',
      '/score': 'number',
      '/weight': 'number',
      '/opened': 'date-time',
      '/closed': 'date',
      '/acknowledged': 'toggle',
      '/link': 'docref',
      '/references': 'table',
      '/checks': 'table',
      '/checks/*/name': 'text',
      '/checks/*/passed': 'toggle',
    });
  });

  it('ignores a marker on a schema of another type, and takes the first rule that matches', () => {
    const root = {};
    expect(chooseKind({ type: 'number', 'x-catalog': 'service' }, root)).toBe('number');
    expect(chooseKind({ type: 'integer', 'x-person': true }, root)).toBe('number');
    expect(chooseKind({ type: 'boolean', 'x-asciidoc': true }, root)).toBe('toggle');
    // x-catalog beats x-person beats x-asciidoc beats gdr-link beats the date formats.
    expect(
      chooseKind({ type: 'string', 'x-catalog': 'a', 'x-person': true, format: 'gdr-link' }, root),
    ).toBe('catalog');
    expect(chooseKind({ type: 'string', 'x-person': true, 'x-asciidoc': true }, root)).toBe(
      'person',
    );
    expect(chooseKind({ type: 'string', 'x-asciidoc': true, format: 'gdr-link' }, root)).toBe(
      'asciidoc',
    );
    expect(chooseKind({ type: 'string', format: 'gdr-link' }, root)).toBe('docref');
    // An enum of strings, numbers and booleans is a select; one with another member is not.
    expect(chooseKind({ enum: [1, 'a', true] }, root)).toBe('select');
    expect(chooseKind({ type: 'string', enum: ['a', null] }, root)).toBe('text');
    expect(chooseKind({ type: 'object', properties: {} }, root)).toBe('plain');
    expect(chooseKind({ type: 'array', items: { type: 'array' } }, root)).toBe('plain');
    expect(chooseKind({ type: ['string', 'null'] }, root)).toBe('plain');
  });

  it('shows the item of an array in a row as plain data and reads a readOnly property by its kind', () => {
    const root = {};
    const list = { type: 'array', items: { type: 'string' } };
    expect(chooseKind(list, root, { inRow: true })).toBe('plain');
    const node = fieldNode(
      'x',
      '/x',
      ['x'],
      { type: 'string', readOnly: true },
      root,
      false,
      false,
    );
    expect(node.kind).toBe('text');
    expect(node.readOnly).toBe(true);
  });

  it('shows the first four scalar properties as the columns, and one column for a scalar item', async () => {
    const kit = useProfile();
    const schema = await schemaOf(kit, 'test-note');
    const actions = childNodes(rootNode(schema), schema).find((node) => node.name === 'actions')!;
    expect(tableColumns(actions, schema).map((column) => column.pointer)).toEqual([
      '/what',
      '/who',
      '/due',
      '/done',
    ]);
    const wide: JsonSchema = {
      type: 'object',
      properties: {
        rows: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              a: { type: 'string' },
              nested: { type: 'object', properties: { x: { type: 'string' } } },
              b: { type: 'string' },
              c: { type: 'string' },
              d: { type: 'string' },
              e: { type: 'string' },
            },
          },
        },
      },
    };
    const table = childNodes(rootNode(wide), wide)[0];
    expect(tableColumns(table, wide).map((column) => column.name)).toEqual(['a', 'b', 'c', 'd']);
    const tags = { ...table, schema: { type: 'array', items: { type: 'string' } } };
    expect(tableColumns(tags, wide)).toHaveLength(1);
  });
});

describe('$ref', () => {
  const root: JsonSchema = {
    $defs: {
      contact: { type: 'object', properties: { a: { type: 'string' } } },
      loop: { $ref: '#/$defs/loop' },
    },
    properties: { x: { $ref: '#/$defs/contact', readOnly: true } },
  };

  it('resolves a reference to a schema of the same file and keeps the keywords beside it', () => {
    const resolved = resolveRef({ $ref: '#/$defs/contact', readOnly: true }, root);
    expect(resolved).toMatchObject({ type: 'object', readOnly: true });
    expect(resolved.$ref).toBeUndefined();
  });

  it('leaves a reference to another file, to nothing, or in a cycle unresolved', () => {
    expect(resolveRef({ $ref: 'other.json#/x' }, root).$ref).toBe('other.json#/x');
    expect(resolveRef({ $ref: '#/$defs/missing' }, root).$ref).toBe('#/$defs/missing');
    expect(resolveRef({ $ref: '#/$defs/loop' }, root).$ref).toBe('#/$defs/loop');
    expect(resolveRef({ $ref: '#/$defs/100%' }, root).$ref).toBe('#/$defs/100%');
  });
});

describe('pointers and values', () => {
  it('reads and writes a value by its JSON Pointer without changing the original', () => {
    const value = { a: { b: [{ c: 1 }, { c: 2 }] }, 'x/y': 3, 'm~n': 4 };
    expect(getAt(value, '/a/b/1/c')).toBe(2);
    expect(getAt(value, '/x~1y')).toBe(3);
    expect(getAt(value, '/m~0n')).toBe(4);
    expect(getAt(value, '/a/b/9/c')).toBeUndefined();
    expect(getAt(value, '/a/b/x')).toBeUndefined();
    expect(getAt(value, '')).toBe(value);
    const changed = setAt(value, '/a/b/1/c', 5) as typeof value;
    expect(changed.a.b[1].c).toBe(5);
    expect(value.a.b[1].c).toBe(2);
    expect(setAt(value, '/a/b/0', undefined)).toMatchObject({ a: { b: [{ c: 2 }] } });
    expect(setAt(value, '/new/deep', 'x')).toMatchObject({ new: { deep: 'x' } });
    expect(setAt(undefined, '/a', 1)).toEqual({ a: 1 });
    expect('a' in (setAt({ a: 1 }, '/a', undefined) as object)).toBe(false);
    expect(setAt(1, '', 2)).toBe(2);
  });

  it('builds and splits pointers with the escapes of RFC 6901', () => {
    expect(pointerTokens('')).toEqual([]);
    expect(pointerTokens('/a~1b/c~0d')).toEqual(['a/b', 'c~d']);
    expect(toPointer(['a/b', 'c~d'])).toBe('/a~1b/c~0d');
    expect(childPointer('/rows', 2)).toBe('/rows/2');
    expect(childPointer('', 'x/y')).toBe('/x~1y');
  });

  it('compares JSON values deeply', () => {
    expect(jsonEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual([1, 2], [1])).toBe(false);
    expect(jsonEqual(null, {})).toBe(false);
  });

  it('names the label keys of a property without the indices of the arrays', () => {
    expect(messageKey('test-note', 'note', ['actions', 'what'])).toBe(
      'category.test-note.note.field.actions.what',
    );
    expect(messageKey('test-note', 'note', ['status'], 'option.agreed')).toBe(
      'category.test-note.note.field.status.option.agreed',
    );
  });

  it('lists the pointers that name a field, rows and their properties included', async () => {
    const kit = useProfile();
    const schema = await schemaOf(kit, 'test-note');
    const pointers = fieldPointers(schema, {
      actions: [{ what: 'x' }, { what: 'y' }],
    });
    expect(pointers).toContain('/title');
    expect(pointers).toContain('/actions');
    expect(pointers).toContain('/actions/1');
    expect(pointers).toContain('/actions/1/who');
    expect(pointers).not.toContain('/actions/2/what');
    const sections = await schemaOf(kit, 'form-sections');
    const scalar = fieldPointers(sections, { scope: { tags: ['a', 'b'] } });
    expect(scalar).toContain('/scope/tags/1');
    expect(scalar).toContain('/scope');
  });
});

describe('isScalarKind', () => {
  it('tells the kinds that hold one value from the structures and the plain data', () => {
    const scalars: FieldKind[] = [
      'catalog',
      'person',
      'asciidoc',
      'docref',
      'date-time',
      'date',
      'select',
      'toggle',
      'text',
      'number',
    ];
    const others: FieldKind[] = ['section', 'table', 'plain'];
    expect(scalars.every((kind) => isScalarKind(kind))).toBe(true);
    expect(others.some((kind) => isScalarKind(kind))).toBe(false);
  });
});

describe('catalogsOf (x-catalog as a catalog or an array of them, PROVISIONAL)', () => {
  it('reads a catalog, an array of catalogs and nothing else', () => {
    expect(catalogsOf({ 'x-catalog': 'service' })).toEqual(['service']);
    expect(catalogsOf({ 'x-catalog': ['service', 'external'] })).toEqual(['service', 'external']);
    expect(catalogsOf({ 'x-catalog': ['service', 3, '', null, 'external'] })).toEqual([
      'service',
      'external',
    ]);
    expect(catalogsOf({ 'x-catalog': '' })).toEqual([]);
    expect(catalogsOf({ 'x-catalog': 7 })).toEqual([]);
    expect(catalogsOf({})).toEqual([]);
  });

  it('chooses the catalog picker for a string with several catalogs, and a table for a list of them', () => {
    const root = {};
    expect(chooseKind({ type: 'string', 'x-catalog': ['a', 'b'] }, root)).toBe('catalog');
    expect(chooseKind({ type: 'string', 'x-catalog': [] }, root)).toBe('text');
    expect(
      chooseKind({ type: 'array', items: { type: 'string', 'x-catalog': ['a', 'b'] } }, root),
    ).toBe('table');
    expect(chooseKind({ type: 'number', 'x-catalog': ['a'] }, root)).toBe('number');
  });
});
