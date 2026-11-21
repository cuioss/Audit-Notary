import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadMessages } from '../../test/catalogue-fixture';
import { LOCALES } from './index';

/**
 * The catalogue (TRH-WEB-7): the languages are its files, both languages hold the same keys, no text
 * is empty, and every key the sources name exists.
 */
const en = loadMessages('en');
const de = loadMessages('de');
const SRC = path.resolve(__dirname, '../..');

function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory())
      return entry.name === 'main' || entry.name === 'test' ? [] : sources(full);
    return /\.(svelte|ts)$/.test(entry.name) && !entry.name.endsWith('.test.ts') ? [full] : [];
  });
}

const MESSAGES_DIR = path.resolve(__dirname, '../../main/resources/META-INF/trailhand/messages');

describe('the message catalogue', () => {
  it('offers exactly the languages that have a catalogue file', () => {
    // The server serves every language with a file; the app's language list must name the same ones.
    const files = fs
      .readdirSync(MESSAGES_DIR)
      .flatMap((name) => /^messages_([a-z]{2})\.properties$/.exec(name)?.[1] ?? []);
    expect([...LOCALES].sort()).toEqual(files.sort());
  });

  it('holds the same keys in English and German', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('holds no empty text', () => {
    for (const [key, text] of [...Object.entries(en), ...Object.entries(de)]) {
      expect(text.trim(), key).not.toBe('');
    }
  });

  it('holds every key the sources name literally', () => {
    const missing = new Set<string>();
    const KEY = /\$t\(\s*'([a-z0-9.-]+)'|(?:Key|titleKey|labelKey)\s*[:=]\s*'([a-z0-9.-]+)'/g;
    for (const file of sources(SRC)) {
      for (const match of fs.readFileSync(file, 'utf8').matchAll(KEY)) {
        const key = match[1] ?? match[2];
        if (!Object.hasOwn(en, key)) missing.add(`${path.relative(SRC, file)}: ${key}`);
      }
    }
    expect([...missing]).toEqual([]);
  });

  it('holds the texts of every lens, kind and live state the app builds keys for', () => {
    const built = [
      ...[
        'due',
        'samm',
        'threat-models',
        'incidents',
        'isms',
        'catalogs',
        'reports',
        'settings',
      ].map((lens) => `lens.${lens}`),
      ...['deadline', 'review', 'release'].map((kind) => `due.kind.${kind}`),
      ...['connecting', 'connected', 'reconnecting', 'offline'].map((state) => `live.${state}`),
      'error.validation.REQUIRED',
      'error.validation.REFERENCE_NOT_FOUND',
    ];
    for (const key of built) {
      expect(Object.hasOwn(en, key), key).toBe(true);
    }
  });
});
