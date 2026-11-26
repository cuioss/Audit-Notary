/**
 * The keys of the fields of a SAMM practice (rest-api.adoc, Document Lifecycle Requests: "for `samm-assessments` the
 * keys are those of the SAMM practice, `<question>/answer`; the key is opaque to the document controller").
 */
import type { FieldKeys } from '../documents/fields';

/**
 * The key of a pointer of the server's conflict, `/answers/<practice>/<question>/answer` or `…/comment`: the last two
 * segments, which are also the keys of a draft and a save.
 *
 * @param pointer the pointer of a conflict
 * @returns `<question>/answer` or `<question>/comment`
 */
function keyOf(pointer: string): string {
  return pointer.split('/').slice(-2).join('/');
}

/**
 * Takes the other side of a conflict into the field it belongs to: a comment is a text, an answer a number or none.
 *
 * @param key `<question>/answer` or `<question>/comment`
 * @param other the other person's value
 * @returns the value of the field
 */
function adopt(key: string, other: unknown): unknown {
  if (key.endsWith('/comment')) return typeof other === 'string' ? other : '';
  return typeof other === 'number' ? other : null;
}

/** The keys of the SAMM practice sheet. */
export const SAMM_KEYS: FieldKeys = { keyOf, adopt };
