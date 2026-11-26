/**
 * A value of a document as one plain line, for the places that name a value without a form around it: the two sides of a
 * conflict. A section or a list is told by its size, not spelled out.
 */
import { optionOf } from '../forms/texts';
import { pointerTokens } from '../forms/schema';
import type { Translate } from './saveLabel';

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the document type id
 * @param pointer the JSON Pointer of the field the value belongs to
 * @param value the value
 * @param t the translation function
 * @returns the value as a line of text: an option by its text, a switch as yes or no, an empty value as such
 */
export function plainValue(
  messages: Record<string, string>,
  category: string,
  kind: string,
  pointer: string,
  value: unknown,
  t: Translate,
): string {
  if (value === null || value === undefined || value === '') return t('form.read.empty');
  if (typeof value === 'boolean') return t(value ? 'form.read.yes' : 'form.read.no');
  if (Array.isArray(value)) return t('documents.value.entries', { count: value.length });
  if (typeof value === 'object') {
    return t('documents.value.group', { count: Object.keys(value).length });
  }
  const path = pointerTokens(pointer).filter((token) => !/^\d+$/.test(token));
  return optionOf(messages, category, kind, path, value as string | number);
}
