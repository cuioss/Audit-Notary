/**
 * The texts of the web app (TRH-WEB-7).
 *
 * Every user-facing text comes from the server's message catalogue, `GET /api/v1/messages?lang=`; the
 * app embeds no catalogue. A catalogue is kept in `localStorage` per locale and application version, so
 * a reload shows the texts at once and a new application version never shows the texts of the old one.
 */
import { derived, get, writable } from 'svelte/store';
import { apiClient } from '../api/client';
import { formatString } from './format';

export { formatString } from './format';

/** The languages of the catalogue. */
export const LOCALES = ['en', 'de'] as const;

/** A language of the catalogue. */
export type Locale = (typeof LOCALES)[number];

/** The storage key of the language this browser chose. */
export const LOCALE_STORAGE_KEY = 'trailhand_locale';

/** The storage key prefix of a cached catalogue: `<prefix><locale>@<version>`. */
export const CATALOGUE_STORAGE_PREFIX = 'trailhand_messages_';

/** The language the app shows. */
export const currentLocale = writable<Locale>('en');

/** The catalogue of the language the app shows. */
export const messagesStore = writable<Record<string, string>>({});

/** Whether a catalogue is loaded; before that, no view shows text. */
export const catalogueReady = derived(
  messagesStore,
  ($messages) => Object.keys($messages).length > 0,
);

/** The application version the cached catalogues belong to; `null` until the status is read. */
let catalogueVersion: string | null = null;

/** The keys reported missing, so each is reported once. */
const warnedKeys = new Set<string>();

currentLocale.subscribe((locale) => {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = locale;
  }
});

/**
 * @param value any value
 * @returns whether it names a language of the catalogue
 */
export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function storage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function cacheKey(locale: Locale, version: string): string {
  return `${CATALOGUE_STORAGE_PREFIX}${locale}@${version}`;
}

function isMessageMap(value: unknown): value is Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  return Object.values(value).every((text) => typeof text === 'string');
}

/**
 * Reads the cached catalogue of a language for the current application version.
 *
 * @param locale the language
 * @returns the catalogue, or `null` when none is cached for this version
 */
export function loadCachedCatalogue(locale: Locale): Record<string, string> | null {
  const store = storage();
  if (!store || catalogueVersion === null) return null;
  try {
    const raw = store.getItem(cacheKey(locale, catalogueVersion));
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isMessageMap(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Keeps a catalogue for the next visit and drops the ones of other application versions.
 *
 * @param locale the language
 * @param messages the catalogue
 */
export function persistCatalogue(locale: Locale, messages: Record<string, string>): void {
  const store = storage();
  if (!store || catalogueVersion === null) return;
  const key = cacheKey(locale, catalogueVersion);
  try {
    store.setItem(key, JSON.stringify(messages));
  } catch {
    return;
  }
  const prefix = `${CATALOGUE_STORAGE_PREFIX}${locale}@`;
  const stale: string[] = [];
  for (let index = 0; index < store.length; index += 1) {
    const candidate = store.key(index);
    if (candidate?.startsWith(prefix) && candidate !== key) {
      stale.push(candidate);
    }
  }
  for (const candidate of stale) {
    store.removeItem(candidate);
  }
}

/**
 * @returns the language this browser chose, or `null` when it chose none
 */
export function storedLocale(): Locale | null {
  try {
    const saved = storage()?.getItem(LOCALE_STORAGE_KEY);
    return isLocale(saved) ? saved : null;
  } catch {
    return null;
  }
}

/**
 * @returns the stored choice, else German for a German browser, else English
 */
export function detectInitialLocale(): Locale {
  const saved = storedLocale();
  if (saved) return saved;
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('de')
    ? 'de'
    : 'en';
}

async function catalogueFor(locale: Locale): Promise<Record<string, string> | null> {
  const cached = loadCachedCatalogue(locale);
  try {
    const messages = await apiClient.getMessages(locale);
    persistCatalogue(locale, messages);
    return messages;
  } catch {
    return cached;
  }
}

/**
 * Loads the texts at start.
 *
 * A cached catalogue of this version is shown at once; the server's catalogue replaces it when it
 * arrives. A failed request keeps the cached one.
 *
 * @param version the application version from `GET /api/v1/status`, or `null` when unknown
 */
export async function initI18n(version: string | null): Promise<void> {
  catalogueVersion = version && version.trim() !== '' ? version.trim() : null;
  const locale = detectInitialLocale();
  currentLocale.set(locale);
  const cached = loadCachedCatalogue(locale);
  if (cached) {
    messagesStore.set(cached);
  }
  const loaded = await catalogueFor(locale);
  if (loaded && get(currentLocale) === locale) {
    messagesStore.set(loaded);
  }
}

/**
 * Switches the language and remembers the choice in this browser.
 *
 * @param locale the chosen language
 * @returns whether the texts of that language could be loaded
 */
export async function setLocale(locale: Locale): Promise<boolean> {
  const loaded = await catalogueFor(locale);
  if (!loaded) return false;
  try {
    storage()?.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage refused: the choice holds for this visit.
  }
  currentLocale.set(locale);
  messagesStore.set(loaded);
  return true;
}

/**
 * The fallback for a key the catalogue lacks: the last segment in words, so a missing text is visible
 * but never breaks a view. The catalogue test keeps it from reaching a build.
 *
 * @param key the message key
 * @returns a readable form of the key
 */
export function humanizeKey(key: string): string {
  const leaf = key.split('.').findLast((segment) => segment.length > 0) ?? '';
  const words = leaf.replace(/[_-]+/g, ' ').trim();
  if (!words) return '?';
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function resolve(messages: Record<string, string>, key: string): string {
  if (Object.hasOwn(messages, key)) {
    return messages[key];
  }
  // Before the catalogue is loaded every key is missing; only a key the loaded catalogue lacks is reported.
  if (Object.keys(messages).length > 0 && !warnedKeys.has(key)) {
    warnedKeys.add(key);
    console.warn('[i18n] missing text for key', key);
  }
  return humanizeKey(key);
}

/**
 * @param key the message key
 * @returns whether the current catalogue holds the key
 */
export function hasMessage(key: string): boolean {
  return Object.hasOwn(get(messagesStore), key);
}

/**
 * The translation function as a store: `$t('due.title')`, `$t('due.due-on', { date })`.
 */
export const t = derived(
  messagesStore,
  ($messages) =>
    (key: string, params?: Record<string, string | number>): string =>
      formatString(resolve($messages, key), params),
);

/**
 * Translates outside a component.
 *
 * @param key the message key
 * @param params the parameters
 * @returns the text
 */
export function translate(key: string, params?: Record<string, string | number>): string {
  return get(t)(key, params);
}
