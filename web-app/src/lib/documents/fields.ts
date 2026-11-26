/**
 * The pure part of the document controller: how the fields of a save are keyed and read back, and how the refusals of the
 * server are read (AUN-WEB-5, rest-api.adoc, Document Lifecycle Requests). Nothing here touches the network or a
 * component.
 *
 * A save and a draft carry `fields`, a map from a key to the new value. For a generic document the key is a JSON Pointer
 * into the value of the part, and `null` removes a property; for the SAMM practice it is `<question>/answer` or
 * `<question>/comment`, and the controller treats it as opaque. A {@link FieldKeys} adapter names the key of a pointer
 * that a refusal carries.
 */
import type { ApiError, FieldError } from '../api/errors';
import type { ConflictField, JsonObject, JsonValue } from '../api/types';
import { jsonEqual, setAt } from '../forms/schema';

/** How the keys of a document type's fields relate to the pointers of the server's refusals. */
export interface FieldKeys {
  /**
   * @param pointer the pointer of a conflict or of a field error
   * @returns the key under which the controller holds the field's edit and sends it
   */
  keyOf(pointer: string): string;
  /**
   * @param key the key of the field
   * @param other the value the other person saved
   * @returns the value taking the other side of a conflict puts into the field; the value as it is when absent
   */
  adopt?(key: string, other: unknown): unknown;
}

/** The keys of a generic document: the JSON Pointer into the value of the part, as the server sends it. */
export const POINTER_KEYS: FieldKeys = {
  keyOf: (pointer) => pointer,
};

/**
 * @param edits the changes made, by key
 * @param sent the changes a save sent
 * @returns the changes the save did not carry: fields changed since, or never sent
 */
export function withoutSent(
  edits: Record<string, unknown>,
  sent: Record<string, unknown>,
): Record<string, unknown> {
  const rest: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(edits)) {
    if (!Object.hasOwn(sent, key) || !jsonEqual(value, sent[key])) rest[key] = value;
  }
  return rest;
}

/**
 * The changes of a form's value against the value it started from, as the fields of a save: the properties of the top
 * level that changed, a list or a section as a whole, and `null` for a property that is gone (AUN-WEB-5).
 *
 * @param base the value the edits stand on
 * @param next the value the form holds now
 * @returns the changed top-level properties, keyed by their JSON Pointer
 */
export function diffFields(base: JsonObject, next: JsonObject): Record<string, JsonValue> {
  const fields: Record<string, JsonValue> = {};
  const names = new Set([...Object.keys(base), ...Object.keys(next)]);
  for (const name of names) {
    const before = Object.hasOwn(base, name) ? base[name] : undefined;
    const after = Object.hasOwn(next, name) ? next[name] : undefined;
    if (jsonEqual(before, after)) continue;
    fields[`/${name.replaceAll('~', '~0').replaceAll('/', '~1')}`] = after ?? null;
  }
  return fields;
}

/**
 * @param base a value
 * @param fields fields keyed by JSON Pointer; `null` removes the property
 * @returns the value with the fields applied; the value itself is not changed
 */
export function applyFields(base: JsonObject, fields: Record<string, unknown>): JsonObject {
  let value: unknown = base;
  for (const [pointer, next] of Object.entries(fields)) {
    value = setAt(value, pointer, next === null ? undefined : next);
  }
  return value as JsonObject;
}

/** What the controller reads of a `CONFLICT` refusal for its part. */
export interface PartConflicts {
  /** The blob id now current: the one of the next save. */
  blob: string;
  /** The fields that differ, by the key the controller holds. */
  fields: Record<string, ConflictField>;
}

/**
 * @param error a `CONFLICT` refusal
 * @param part the part the controller edits
 * @param keys how pointers become keys
 * @returns the blob and the differing fields of the part; `null` when the refusal names none for it
 */
export function conflictsOf(error: ApiError, part: string, keys: FieldKeys): PartConflicts | null {
  const conflicts = error.details.conflicts;
  if (!Array.isArray(conflicts)) return null;
  const entry = (conflicts as { part?: string; blob?: string; fields?: ConflictField[] }[]).find(
    (candidate) => candidate?.part === part,
  );
  if (!entry) return null;
  const fields: Record<string, ConflictField> = {};
  for (const field of entry.fields ?? []) fields[keys.keyOf(field.pointer)] = field;
  return { blob: entry.blob ?? '', fields };
}

/**
 * @param error a `VALIDATION` refusal of a draft, a save or a create
 * @param part the part the form shows
 * @returns the errors of that part, with the pointers of the form (an error that names no part counts for every part)
 */
export function validationOf(error: ApiError, part: string): FieldError[] {
  return error.errors.filter((entry) => entry.part === undefined || entry.part === part);
}

/**
 * @param error a `MANDATORY_FIELDS_MISSING` refusal
 * @returns the JSON Pointers of the empty mandatory fields
 */
export function missingOf(error: ApiError): string[] {
  const missing = error.details.missing;
  return Array.isArray(missing)
    ? missing.filter((item): item is string => typeof item === 'string')
    : [];
}

/**
 * @param error a `DOCUMENT_RELEASED` refusal
 * @returns the tag of the release, `''` when the refusal names none
 */
export function releasedTagOf(error: ApiError): string {
  return typeof error.details.tag === 'string' ? error.details.tag : '';
}

/** The events that make an open document read again. */
const REFRESHING_EVENTS = new Set(['document-saved', 'document-transitioned']);

/**
 * Whether an event of the stream concerns a document: a save or a transition of that very document (rest-api.adoc,
 * Events of the Lifecycle). The open sheet then reads it again and refreshes the fields not edited locally.
 *
 * @param event the event name
 * @param data its data
 * @param repository the repository of the document
 * @param id the document id
 * @returns whether the document is to be read again
 */
export function refreshesDocument(
  event: string,
  data: unknown,
  repository: string,
  id: string,
): boolean {
  if (!REFRESHING_EVENTS.has(event) || typeof data !== 'object' || data === null) return false;
  const record = data as { repository?: unknown; id?: unknown };
  return record.repository === repository && record.id === id;
}
