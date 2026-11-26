/**
 * The texts of a generated form (AUN-WEB-4, Labels and Texts): no text comes from the schema. A property `/a/b` of the
 * kind `<kind>` of the category `<category>` has the label `category.<category>.<kind>.field.a.b`, an optional help
 * under `….help` and the text of an `enum` value under `….option.<value>`. A property without a key shows its name, so
 * that a missing text is visible; an option without a key shows its value.
 */
import { messageKey } from './schema';

/**
 * @param messages the catalogue
 * @param key a key
 * @returns the text, or `null` when the catalogue has none
 */
function lookup(messages: Record<string, string>, key: string): string | null {
  return Object.hasOwn(messages, key) ? messages[key] : null;
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the kind id
 * @param path the property names from the root
 * @param name the property's name, shown when the catalogue has no label
 * @returns the label of the field or the heading of the section
 */
export function labelOf(
  messages: Record<string, string>,
  category: string,
  kind: string,
  path: string[],
  name: string,
): string {
  return lookup(messages, messageKey(category, kind, path)) ?? name;
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the kind id
 * @param path the property names from the root
 * @returns the help under the field, or `null`
 */
export function helpOf(
  messages: Record<string, string>,
  category: string,
  kind: string,
  path: string[],
): string | null {
  return lookup(messages, messageKey(category, kind, path, 'help'));
}

/**
 * @param messages the catalogue
 * @param category the category id
 * @param kind the kind id
 * @param path the property names from the root
 * @param member the `enum` member
 * @returns the text of the option, or the value itself
 */
export function optionOf(
  messages: Record<string, string>,
  category: string,
  kind: string,
  path: string[],
  member: string | number | boolean,
): string {
  return (
    lookup(messages, messageKey(category, kind, path, `option.${String(member)}`)) ?? String(member)
  );
}
