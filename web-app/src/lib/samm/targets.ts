/**
 * The targets of a scope (AUN-SAMM-6, rest-api.adoc, SAMM Requests): a practice maps to a maturity from 0 to 3 in steps
 * of 0.5, and optionally to the day it should be reached. A practice without an entry has no target.
 */
import type { FieldError } from '../api/errors';
import type { SammTarget } from '../api/types';
import { formatScore } from './scores';

/** The maturities a target may take. */
export const TARGET_STEPS: readonly number[] = [0, 0.5, 1, 1.5, 2, 2.5, 3];

/** One field of a practice's target that an error names. */
export type TargetField = 'target' | 'due';

/** The codes of the errors of one practice's target, by field; `entry` for an error of the whole entry. */
export type TargetErrors = Record<string, Partial<Record<TargetField | 'entry', string>>>;

/**
 * @param locale the language
 * @returns the options of the target of a practice: the value as text, the label as the language writes the number
 */
export function targetOptions(locale: string): { value: string; label: string }[] {
  return TARGET_STEPS.map((step) => ({ value: String(step), label: formatScore(step, locale) }));
}

/**
 * @param text the value of the select of a target; empty for no target
 * @returns the target, or `null` for none or for a text that is none of the steps
 */
export function parseTarget(text: string): number | null {
  if (text === '') return null;
  const value = Number(text);
  return TARGET_STEPS.includes(value) ? value : null;
}

/**
 * @param entry the target of a practice, if it has one
 * @returns the value of the select: the target as text, empty for none; a target that is none of the steps is shown
 * as it is, so that it can be read and kept
 */
export function targetText(entry: SammTarget | undefined): string {
  return entry === undefined ? '' : String(entry.target);
}

/**
 * The targets with one practice changed.
 *
 * @param targets the targets
 * @param practice the practice id
 * @param target its new target; `null` removes the target and its due day
 * @param due its new due day; `''` or `undefined` for none; a practice without a target has no due day
 * @returns a new object; the first is not changed
 */
export function withTarget(
  targets: Record<string, SammTarget>,
  practice: string,
  target: number | null,
  due?: string,
): Record<string, SammTarget> {
  const next = { ...targets };
  if (target === null) {
    delete next[practice];
  } else {
    next[practice] = due ? { target, due } : { target };
  }
  return next;
}

/**
 * Reads the errors of a refused scope: a create names `/targets/<practice>/<field>`, a save of the roadmap
 * `/<practice>/<field>`.
 *
 * @param errors the field errors of a `VALIDATION`
 * @param prefix the pointer of the map of the targets: `/targets` for a create, empty for a save
 * @returns the code of the first error per practice and field
 */
export function targetErrorsOf(errors: FieldError[] | null, prefix: string): TargetErrors {
  const found: TargetErrors = {};
  for (const error of errors ?? []) {
    if (!error.pointer.startsWith(`${prefix}/`)) continue;
    const [practice, field] = error.pointer.slice(prefix.length + 1).split('/');
    if (!practice) continue;
    const slot = field === 'target' || field === 'due' ? field : 'entry';
    found[practice] ??= {};
    found[practice][slot] ??= error.code;
  }
  return found;
}
