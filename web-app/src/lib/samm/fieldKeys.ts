/**
 * The keys of the fields of a SAMM practice (rest-api.adoc, Document Lifecycle Requests: "for `samm-assessments` the
 * keys are those of the SAMM practice, `<question>/answer`; the key is opaque to the document controller").
 */
import type { FieldKeys } from '../documents/fields';

/** The key of the evidence links of a practice: the whole list, in a draft, a save and a conflict. */
export const EVIDENCE_KEY = 'evidence';

/**
 * The key of a pointer of the server's conflict, `/answers/<practice>/<question>/answer` or `…/comment`: the last two
 * segments, which are also the keys of a draft and a save. A pointer into the evidence of the practice
 * (`/evidence/<practice>`, or a link of it) is the one key {@link EVIDENCE_KEY}, whose value is the whole list.
 *
 * @param pointer the pointer of a conflict
 * @returns `<question>/answer`, `<question>/comment` or `evidence`
 */
function keyOf(pointer: string): string {
  if (pointer.startsWith('/evidence/')) return EVIDENCE_KEY;
  return pointer.split('/').slice(-2).join('/');
}

/**
 * Takes the other side of a conflict into the field it belongs to: a comment is a text, an answer a number or none, the
 * evidence a list.
 *
 * @param key `<question>/answer`, `<question>/comment` or `evidence`
 * @param other the other person's value
 * @returns the value of the field
 */
function adopt(key: string, other: unknown): unknown {
  if (key === EVIDENCE_KEY) return Array.isArray(other) ? other : [];
  if (key.endsWith('/comment')) return typeof other === 'string' ? other : '';
  return typeof other === 'number' ? other : null;
}

/** The keys of the SAMM practice sheet. */
export const SAMM_KEYS: FieldKeys = { keyOf, adopt };

/**
 * The keys of the roadmap of a scope, the part `targets` (rest-api.adoc, SAMM Requests, A Scope and Its Targets): the key is
 * the JSON Pointer `/<practice>` of the whole entry of a practice, as the server's conflict names it; the other side of a
 * conflict is the entry, or none for a practice the other person removed.
 */
export const TARGET_KEYS: FieldKeys = {
  keyOf: (pointer) => pointer,
  adopt: (_key, other) => other ?? null,
};
