/**
 * A value of a document as one plain line, for the places that name a value without a form around it: the two sides of a
 * conflict. A section or a list is told by its size and then spelled out, so that two lists of the same size still read
 * differently and the person can tell which side to keep.
 */
import { fieldLabel } from './categories';
import { optionOf } from '../forms/texts';
import { pointerTokens } from '../forms/schema';
import type { Translate } from './saveLabel';

/**
 * How deep a list or a section is spelled out; below it a value is told by its size alone. Four levels reach the ids of a
 * list inside a row of a list (a countermeasure's issues), which two lists of the same size would otherwise not tell apart.
 */
const SPELLED_DEPTH = 4;

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the document type id
 * @param pointer the JSON Pointer of the field the value belongs to
 * @param value the value
 * @param t the translation function
 * @returns the value as a line of text: an option by its text, a switch as yes or no, an empty value as such, a list or a
 *     section by its size followed by its content
 */
export function plainValue(
  messages: Record<string, string>,
  category: string,
  kind: string,
  pointer: string,
  value: unknown,
  t: Translate,
): string {
  return line(messages, category, kind, pointer, value, t, 0);
}

function line(
  messages: Record<string, string>,
  category: string,
  kind: string,
  pointer: string,
  value: unknown,
  t: Translate,
  depth: number,
): string {
  if (value === null || value === undefined || value === '') return t('form.read.empty');
  if (typeof value === 'boolean') return t(value ? 'form.read.yes' : 'form.read.no');
  if (Array.isArray(value)) {
    const size = t('documents.value.entries', { count: value.length });
    if (value.length === 0 || depth >= SPELLED_DEPTH) return size;
    const content = value
      .map((item, index) =>
        line(messages, category, kind, `${pointer}/${index}`, item, t, depth + 1),
      )
      .join('; ');
    return t('documents.value.with-content', { size, content });
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    const size = t('documents.value.group', { count: entries.length });
    if (entries.length === 0 || depth >= SPELLED_DEPTH) return size;
    const content = entries
      .map(([key, member]) => {
        const at = `${pointer}/${key.replaceAll('~', '~0').replaceAll('/', '~1')}`;
        const label = fieldLabel(messages, category, kind, at);
        return `${label}: ${line(messages, category, kind, at, member, t, depth + 1)}`;
      })
      .join(', ');
    return t('documents.value.with-content', { size, content });
  }
  const path = pointerTokens(pointer).filter((token) => !/^\d+$/.test(token));
  return optionOf(messages, category, kind, path, value as string | number);
}
