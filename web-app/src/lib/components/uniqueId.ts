let counter = 0;

/**
 * @param prefix the prefix of the id
 * @returns an id unique within the page, for `for`/`id` and `aria-describedby` pairs
 */
export function uniqueId(prefix: string): string {
  counter += 1;
  return `${prefix}-${counter}`;
}
