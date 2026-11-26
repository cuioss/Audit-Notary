/**
 * The diff of a release as the approver reads it (UC-DOC-7, AUN-WEB-6): the server's structured diff is grouped by part
 * (the file of the document; a stage of an incident) and then by the first segment of the pointer, the property of the
 * schema, so that the changes of one section of the form stand together under its label.
 */
import type { DiffChange, DocumentDiff, JsonSchema } from '../api/types';
import {
  childNodes,
  itemNode,
  pointerTokens,
  rootNode,
  toPointer,
  type FieldNode,
} from '../forms/schema';
import { fieldLabel } from './categories';
import type { Translate } from './saveLabel';

/** One change of a group, with the words of its field. */
export interface DiffRow {
  /** The key of the row in a list. */
  key: string;
  /** The JSON Pointer of the field, into the value of the part. */
  pointer: string;
  /** The words of the field: empty when the change is the group's own property (the group's title says it). */
  label: string;
  before: unknown;
  after: unknown;
}

/** The changes of one property of one part. */
export interface DiffGroup {
  /** A key that is unique in the diff; the property alone when the diff has one part. */
  key: string;
  /** The part the property is in. */
  part: string;
  /** The property: the first segment of the pointers of the group. */
  property: string;
  /** The words of the property. */
  title: string;
  rows: DiffRow[];
}

/**
 * @param diff the diff the server answered
 * @param messages the catalogue, for the labels of the fields
 * @param category the category id
 * @param kind the document type id
 * @param t the translation function
 * @returns the groups in the order the server listed the changes: part by part, the properties in order of appearance
 */
export function groupDiff(
  diff: DocumentDiff,
  messages: Record<string, string>,
  category: string,
  kind: string,
  t: Translate,
): DiffGroup[] {
  const single = diff.sections.length === 1;
  const groups: DiffGroup[] = [];
  for (const section of diff.sections) {
    const byProperty = new Map<string, DiffGroup>();
    for (const change of section.changes) {
      const tokens = pointerTokens(change.pointer);
      const property = tokens[0] ?? '';
      let group = byProperty.get(property);
      if (!group) {
        group = {
          key: single ? property : `${section.part}:${property}`,
          part: section.part,
          property,
          title:
            property === ''
              ? section.part
              : fieldLabel(messages, category, kind, toPointer([property])),
          rows: [],
        };
        byProperty.set(property, group);
        groups.push(group);
      }
      group.rows.push(row(change, tokens, group, messages, category, kind, t));
    }
  }
  return groups;
}

/** The row of a change: nothing but the values for the property itself, the words of the field for a field below it. */
function row(
  change: DiffChange,
  tokens: string[],
  group: DiffGroup,
  messages: Record<string, string>,
  category: string,
  kind: string,
  t: Translate,
): DiffRow {
  let label = '';
  if (tokens.length > 1) {
    label = fieldLabel(messages, category, kind, change.pointer);
    const index = tokens.findIndex((token) => /^\d+$/.test(token));
    // A field of a row of a table: which row, by its place in the list as the person counts it.
    if (index > 0) {
      label = t('documents.release.row', { row: Number(tokens[index]) + 1, field: label });
    }
    // A change of a row itself (a new row, a removed one) has no field of its own: the row is its words.
    if (index === tokens.length - 1) {
      label = t('documents.release.row-whole', { row: Number(tokens[index]) + 1 });
    }
  }
  return {
    key: `${group.key}${change.pointer}`,
    pointer: change.pointer,
    label,
    before: change.before,
    after: change.after,
  };
}

/**
 * The node of the form a pointer names, so that a value can be drawn as the form draws it (the name of a person, the
 * text of an option) and not as data.
 *
 * @param schema the schema of the document type
 * @param pointer a JSON Pointer into the value of a part
 * @returns the node, or `null` when the schema has no such field (a field the type dropped since)
 */
export function nodeAtPointer(schema: JsonSchema, pointer: string): FieldNode | null {
  let node = rootNode(schema);
  for (const token of pointerTokens(pointer)) {
    if (node.kind === 'table') {
      if (!/^\d+$/.test(token)) return null;
      node = itemNode(node, schema);
    } else if (node.kind === 'section') {
      const child = childNodes(node, schema).find((candidate) => candidate.name === token);
      if (!child) return null;
      node = child;
    } else {
      return null;
    }
  }
  return node;
}
