import fs from 'node:fs';
import path from 'node:path';

/**
 * The catalogue of the unit tests: the same properties files the server and the mock serve
 * (TRH-WEB-7). Production code never imports this module.
 */

/** The directory of the catalogue. */
export const MESSAGES_DIR = path.resolve(
  __dirname,
  '../main/resources/META-INF/trailhand/messages',
);

/**
 * Reads a properties file the way `java.util.Properties` reads UTF-8: `key=value` lines, `#` and `!`
 * comments, `\uXXXX` escapes.
 *
 * @param filePath the file
 * @returns the key/value pairs
 */
export function loadPropertiesFile(filePath: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of fs.readFileSync(filePath, 'utf-8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('!')) continue;
    const separator = trimmed.indexOf('=');
    if (separator > 0) {
      result[trimmed.slice(0, separator).trim()] = trimmed
        .slice(separator + 1)
        .trim()
        .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex: string) =>
          String.fromCodePoint(Number.parseInt(hex, 16)),
        );
    }
  }
  return result;
}

/**
 * @param locale `en` or `de`
 * @returns the catalogue of the language
 */
export function loadMessages(locale: 'en' | 'de'): Record<string, string> {
  return loadPropertiesFile(path.join(MESSAGES_DIR, `messages_${locale}.properties`));
}
