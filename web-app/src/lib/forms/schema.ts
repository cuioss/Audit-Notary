/**
 * What the form kit reads of a JSON Schema (AUN-WEB-4, "Choosing the Component", "Values"): `$ref` resolution inside
 * one file, the ordered rules that choose a component, the label keys, and the helpers for the JSON value the form
 * edits and for the JSON Pointers (RFC 6901) that name its fields.
 */
import type { JsonSchema } from '../api/types';

export type { JsonSchema } from '../api/types';

export type { JsonObject, JsonValue } from '../api/types';

/** The components of "Choosing the Component", by the name of the kit's component; a section has none of its own. */
export type FieldKind =
  | 'catalog'
  | 'person'
  | 'asciidoc'
  | 'docref'
  | 'date-time'
  | 'date'
  | 'select'
  | 'toggle'
  | 'text'
  | 'number'
  | 'section'
  | 'table'
  | 'plain';

/**
 * The kinds that read one value in one line: every kind but the structures (`section`, `table`) and the plain data. The
 * record is exhaustive on purpose, so that a kind added to {@link FieldKind} has to be classified here.
 */
const SCALAR_KINDS: Record<Exclude<FieldKind, 'section' | 'table' | 'plain'>, true> = {
  catalog: true,
  person: true,
  asciidoc: true,
  docref: true,
  'date-time': true,
  date: true,
  select: true,
  toggle: true,
  text: true,
  number: true,
};

/**
 * @param kind the component of a field
 * @returns whether it holds one scalar value, as `scalarKind` chooses it
 */
export function isScalarKind(kind: FieldKind): boolean {
  return Object.hasOwn(SCALAR_KINDS, kind);
}

/** The deepest chain of `$ref` the form follows: a cycle ends the chain instead of looping. */
const MAX_REF_DEPTH = 16;

/**
 * @param value any value
 * @returns whether it is a JSON object (no array, no `null`)
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * @param pointer a JSON Pointer
 * @returns its reference tokens, unescaped
 */
export function pointerTokens(pointer: string): string[] {
  if (pointer === '') return [];
  return pointer
    .slice(1)
    .split('/')
    .map((token) => token.replaceAll('~1', '/').replaceAll('~0', '~'));
}

/**
 * @param tokens reference tokens
 * @returns the JSON Pointer that names them
 */
export function toPointer(tokens: readonly string[]): string {
  return tokens.map((token) => `/${token.replaceAll('~', '~0').replaceAll('/', '~1')}`).join('');
}

/**
 * @param pointer the pointer of the parent
 * @param token the property name or the index
 * @returns the pointer of the child
 */
export function childPointer(pointer: string, token: string | number): string {
  return `${pointer}/${String(token).replaceAll('~', '~0').replaceAll('/', '~1')}`;
}

/**
 * @param value the value
 * @param pointer the pointer into it
 * @returns what the pointer names, or `undefined` when nothing is there
 */
export function getAt(value: unknown, pointer: string): unknown {
  let current: unknown = value;
  for (const token of pointerTokens(pointer)) {
    if (Array.isArray(current)) {
      current = /^(0|[1-9]\d*)$/.test(token) ? current[Number(token)] : undefined;
    } else if (isObject(current) && Object.hasOwn(current, token)) {
      current = current[token];
    } else {
      return undefined;
    }
  }
  return current;
}

/**
 * The value with one place replaced; the value itself is not changed. `undefined` removes the property (or, for an
 * index, the item), the way an empty field removes its property (AUN-WEB-4, Values).
 *
 * @param root the value
 * @param pointer the place
 * @param next the new value, or `undefined` to remove
 * @returns the new value
 */
export function setAt(root: unknown, pointer: string, next: unknown): unknown {
  const tokens = pointerTokens(pointer);
  const write = (current: unknown, depth: number): unknown => {
    if (depth === tokens.length) return next;
    const token = tokens[depth];
    if (Array.isArray(current)) {
      const copy = [...current];
      const index = Number(token);
      const child = write(copy[index], depth + 1);
      if (child === undefined) copy.splice(index, 1);
      else copy[index] = child;
      return copy;
    }
    const copy: Record<string, unknown> = isObject(current) ? { ...current } : {};
    const child = write(copy[token], depth + 1);
    if (child === undefined) delete copy[token];
    else copy[token] = child;
    return copy;
  };
  return write(root, 0);
}

/**
 * @param a a JSON value
 * @param b a JSON value
 * @returns whether they are equal as JSON values
 */
export function jsonEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => jsonEqual(item, b[index]));
  }
  if (isObject(a) && isObject(b)) {
    const keys = Object.keys(a);
    return (
      keys.length === Object.keys(b).length &&
      keys.every((key) => Object.hasOwn(b, key) && jsonEqual(a[key], b[key]))
    );
  }
  return false;
}

/**
 * @param ref a `$ref` that starts with `#`
 * @returns the pointer it holds, percent-decoded; the text as it is when it is no valid percent-encoding
 */
function decodedRef(ref: string): string {
  try {
    return decodeURIComponent(ref.slice(1));
  } catch {
    return ref.slice(1);
  }
}

/**
 * Follows `$ref` to a schema of the same file (`#/$defs/x`, any pointer after the `#`), as the library does, and
 * nothing else: a reference to another file stays unresolved. The keywords beside `$ref` are kept and win.
 *
 * @param schema a schema or subschema
 * @param root the schema of the file
 * @returns the schema without its `$ref`, or the schema with it when it names nothing the file holds
 */
export function resolveRef(schema: JsonSchema, root: JsonSchema): JsonSchema {
  let current = schema;
  for (let depth = 0; depth < MAX_REF_DEPTH; depth += 1) {
    const ref = current.$ref;
    if (typeof ref !== 'string') return current;
    if (!ref.startsWith('#')) return current;
    const target = getAt(root, decodedRef(ref));
    if (!isObject(target)) return current;
    const { $ref: _ref, ...siblings } = current;
    current = { ...target, ...siblings };
  }
  return current;
}

/**
 * @param schema a schema
 * @param keyword a keyword
 * @returns the keyword's value when it is a string
 */
function stringKeyword(schema: JsonSchema, keyword: string): string | undefined {
  const value = schema[keyword];
  return typeof value === 'string' ? value : undefined;
}

/**
 * @param schema a resolved schema
 * @returns its subschemas of `properties`, in the order of the schema file
 */
export function propertiesOf(schema: JsonSchema): [string, JsonSchema][] {
  const properties = schema.properties;
  if (!isObject(properties)) return [];
  return Object.entries(properties).flatMap(([name, sub]) => (isObject(sub) ? [[name, sub]] : []));
}

/**
 * @param schema a resolved schema
 * @returns the names its `required` lists
 */
export function requiredOf(schema: JsonSchema): string[] {
  const required = schema.required;
  return Array.isArray(required)
    ? required.filter((name): name is string => typeof name === 'string')
    : [];
}

/**
 * @param schema a resolved schema
 * @returns its `enum` members when it has an `enum` of strings, numbers and booleans only
 */
export function enumMembers(schema: JsonSchema): (string | number | boolean)[] | null {
  const members = schema.enum;
  if (!Array.isArray(members) || members.length === 0) return null;
  const scalar = members.every((member) => ['string', 'number', 'boolean'].includes(typeof member));
  return scalar ? (members as (string | number | boolean)[]) : null;
}

/**
 * The kind of a scalar property, by rules 2 to 10 of "Choosing the Component".
 *
 * @param schema a resolved schema
 * @returns the kind, or `null` when none of those rules matches
 */
function scalarKind(schema: JsonSchema): FieldKind | null {
  const type = schema.type;
  if (type === 'string') {
    if (typeof schema['x-catalog'] === 'string' && schema['x-catalog'] !== '') return 'catalog';
    if (schema['x-person'] === true) return 'person';
    if (schema['x-asciidoc'] === true) return 'asciidoc';
    if (stringKeyword(schema, 'format') === 'gdr-link') return 'docref';
    const format = stringKeyword(schema, 'format');
    if (format === 'date-time' || format === 'date') return format;
  }
  if (enumMembers(schema)) return 'select';
  if (type === 'boolean') return 'toggle';
  if (type === 'string') return 'text';
  if (type === 'integer' || type === 'number') return 'number';
  return null;
}

/** Where a property stands, which decides how an array is shown (rule 13: an array in a row is plain data). */
export interface Placement {
  /** Whether the property is a property of the row of a `DataTable`, in the row editor. */
  inRow: boolean;
}

/**
 * The component of a property: the first rule that matches, after `$ref` has been resolved.
 *
 * @param schema the property's schema (resolved)
 * @param root the schema of the file
 * @param placement where the property stands
 * @returns the kind
 */
export function chooseKind(
  schema: JsonSchema,
  root: JsonSchema,
  placement: Placement = { inRow: false },
): FieldKind {
  const scalar = scalarKind(schema);
  if (scalar) return scalar;
  if (schema.type === 'object' && propertiesOf(schema).length > 0) return 'section';
  if (schema.type === 'array' && !placement.inRow && isObject(schema.items)) {
    const items = resolveRef(schema.items, root);
    const itemKind = scalarKind(items) ?? (isSection(items) ? 'section' : null);
    if (itemKind) return 'table';
  }
  return 'plain';
}

function isSection(schema: JsonSchema): boolean {
  return schema.type === 'object' && propertiesOf(schema).length > 0;
}

/** One property of a form: what the component needs to draw it and to name it. */
export interface FieldNode {
  /** The property name; the last token of the pointer, or the table's name for the item of a one-column table. */
  name: string;
  /** The JSON Pointer of the field in the value of its form (a row editor's value is the row). */
  pointer: string;
  /** The property names from the root, without array indices: the labels' key path. */
  path: string[];
  /** The schema, `$ref` resolved. */
  schema: JsonSchema;
  /** The component. */
  kind: FieldKind;
  /** Whether the parent's `required` lists it. */
  required: boolean;
  /** Whether it is `readOnly: true` (rule 1) and so shown and never edited. */
  readOnly: boolean;
  /** Whether it is a property of a row in the row editor. */
  inRow: boolean;
}

/**
 * @param name the property name
 * @param pointer the pointer of the property
 * @param path the label path of the property
 * @param schema the property's schema, not yet resolved
 * @param root the schema of the file
 * @param required whether the parent requires it
 * @param inRow whether it is a property of a row
 * @returns the node
 */
export function fieldNode(
  name: string,
  pointer: string,
  path: string[],
  schema: JsonSchema,
  root: JsonSchema,
  required: boolean,
  inRow: boolean,
): FieldNode {
  const resolved = resolveRef(schema, root);
  return {
    name,
    pointer,
    path,
    schema: resolved,
    kind: chooseKind(resolved, root, { inRow }),
    required,
    readOnly: resolved.readOnly === true,
    inRow,
  };
}

/**
 * The properties of a section as nodes, in the order of the schema file.
 *
 * @param node a section (or the root)
 * @param root the schema of the file
 * @returns its child nodes
 */
export function childNodes(node: FieldNode, root: JsonSchema): FieldNode[] {
  const required = new Set(requiredOf(node.schema));
  return propertiesOf(node.schema).map(([name, sub]) =>
    fieldNode(
      name,
      childPointer(node.pointer, name),
      [...node.path, name],
      sub,
      root,
      required.has(name),
      node.inRow,
    ),
  );
}

/**
 * The root of a form: the kind's schema as a section without a name.
 *
 * @param schema the kind's schema
 * @returns the root node
 */
export function rootNode(schema: JsonSchema): FieldNode {
  return {
    name: '',
    pointer: '',
    path: [],
    schema,
    kind: 'section',
    required: false,
    readOnly: false,
    inRow: false,
  };
}

/**
 * The node of one item of a table: an object item is a section of the row's properties, a scalar item is the field
 * itself (the row's value is the scalar, its pointer empty).
 *
 * @param table the table's node
 * @param root the schema of the file
 * @returns the node of an item, with the pointer `''` (the row editor's value is the item)
 */
export function itemNode(table: FieldNode, root: JsonSchema): FieldNode {
  const items = isObject(table.schema.items) ? table.schema.items : {};
  const resolved = resolveRef(items, root);
  return {
    name: table.name,
    pointer: '',
    path: table.path,
    schema: resolved,
    kind: isSection(resolved) ? 'section' : (scalarKind(resolved) ?? 'plain'),
    required: false,
    readOnly: false,
    inRow: true,
  };
}

/**
 * The columns of a table: for a scalar item its one column, for an object item the first four scalar properties
 * (those that are no section, no array and no plain data).
 *
 * @param table the table's node
 * @param root the schema of the file
 * @returns the column nodes, with pointers relative to the item (`/what`, or `''` for a scalar item)
 */
export function tableColumns(table: FieldNode, root: JsonSchema): FieldNode[] {
  const item = itemNode(table, root);
  if (item.kind !== 'section') return [item];
  return childNodes(item, root)
    .filter((child) => child.kind !== 'section' && child.kind !== 'table' && child.kind !== 'plain')
    .slice(0, 4);
}

/**
 * The keys of the message catalogue for a property of a kind (AUN-WEB-4, Labels and Texts); the indices of arrays
 * are not part of the path.
 *
 * @param category the category id
 * @param kind the kind id
 * @param path the property names from the root
 * @param suffix `''` for the label, or `help` or `option.<value>`
 * @returns the key
 */
export function messageKey(category: string, kind: string, path: string[], suffix = ''): string {
  const base = `category.${category}.${kind}.field.${path.join('.')}`;
  return suffix === '' ? base : `${base}.${suffix}`;
}

/**
 * Every pointer that names a field of the form for a value: the sections' properties, the tables with the properties
 * of each row, and the items of a one-column table. An error whose pointer is none of these is listed under the form.
 *
 * @param root the schema of the file
 * @param value the value
 * @param start the section to begin with, the whole form by default
 * @returns the pointers
 */
export function fieldPointers(
  root: JsonSchema,
  value: unknown,
  start: FieldNode = rootNode(root),
): Set<string> {
  const pointers = new Set<string>();
  const visit = (node: FieldNode, current: unknown): void => {
    pointers.add(node.pointer);
    if (node.kind === 'section') {
      for (const child of childNodes(node, root))
        visit(child, getAt(current, childPointer('', child.name)));
    } else if (node.kind === 'table' && Array.isArray(current)) {
      const item = itemNode(node, root);
      current.forEach((row, index) => {
        const rowPointer = childPointer(node.pointer, index);
        if (item.kind === 'section') {
          pointers.add(rowPointer);
          for (const child of childNodes({ ...item, pointer: rowPointer, path: node.path }, root)) {
            visit({ ...child, inRow: true }, getAt(row, childPointer('', child.name)));
          }
        } else {
          pointers.add(rowPointer);
        }
      });
    }
  };
  visit(start, value);
  return pointers;
}
