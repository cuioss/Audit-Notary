/**
 * What every field of one form shares: the value it edits, the errors it shows, and where its texts come from. The
 * form (`SchemaForm`) provides one; the row editor of a `DataTable` provides another over the draft of one row, so
 * that a row edited and cancelled changes nothing.
 */
import { getContext, setContext } from 'svelte';
import type { FieldError } from '../api/errors';
import type { JsonSchema } from './schema';

/** The context of the fields of one form or of one row. */
export interface FormContext {
  /** The category, for the label keys. */
  readonly category: string;
  /** The kind, for the label keys. */
  readonly kind: string;
  /** The schema of the file, which `$ref` points into. */
  readonly root: JsonSchema;
  /** Whether the form shows its value and offers no control. */
  readonly readonly: boolean;
  /** The level of the heading of a first-level section. */
  readonly headingLevel: number;
  /** Whether the form is one part that a heading above it already names: that part's own title is not drawn. */
  readonly untitled?: boolean;
  /** @returns the value of the field at a pointer into this context's value */
  valueAt(pointer: string): unknown;
  /**
   * Replaces the value at a pointer; `undefined` removes the property.
   *
   * @param pointer the place
   * @param next the new value
   * @param touched the place whose errors go stale (default: the place itself); a table passes its own pointer when
   * rows move, since the indices of the errors below it no longer fit
   */
  change(pointer: string, next: unknown, touched?: string): void;
  /** @returns the codes of the errors that stand at exactly this pointer */
  errorsAt(pointer: string): string[];
  /** @returns whether an error stands at this pointer or below it (a table row shows that it has one) */
  hasErrorWithin(pointer: string): boolean;
  /** @returns whether the mandatory field at the pointer is empty and the form has been asked to say so */
  isMissing(pointer: string): boolean;
  /** Whether the form has been asked to say which mandatory fields are empty. */
  readonly showMissing: boolean;
  /** @returns the errors of the server that still stand, with pointers into this context's value; `null` before an answer */
  serverErrors(): FieldError[] | null;
}

const FORM = Symbol('form-context');

/**
 * @param context the context the fields below use
 */
export function provideForm(context: FormContext): void {
  setContext(FORM, context);
}

/**
 * @returns the context of the form or the row this field stands in
 * @throws Error outside a form
 */
export function useForm(): FormContext {
  const context = getContext<FormContext | undefined>(FORM);
  if (!context) throw new Error('a field of the form kit stands outside a SchemaForm');
  return context;
}
