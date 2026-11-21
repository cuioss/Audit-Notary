import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import {
  CATALOGUE_STORAGE_PREFIX,
  catalogueReady,
  LOCALE_STORAGE_KEY,
  currentLocale,
  detectInitialLocale,
  hasMessage,
  humanizeKey,
  initI18n,
  isLocale,
  loadCachedCatalogue,
  messagesStore,
  persistCatalogue,
  setLocale,
  storedLocale,
  t,
  translate,
} from './index';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('translation', () => {
  it('translates with parameters', () => {
    expect(get(t)('due.due-on', { date: 'today' })).toBe('Due today');
    expect(translate('lens.samm')).toBe('SAMM');
    expect(hasMessage('lens.samm')).toBe(true);
  });

  it('shows a readable form of a missing key and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(get(t)('missing.some_key')).toBe('Some key');
    get(t)('missing.some_key');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(humanizeKey('')).toBe('?');
  });

  it('reports nothing missing before a catalogue is loaded', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    messagesStore.set({});
    expect(get(catalogueReady)).toBe(false);
    expect(get(t)('missing.before_load')).toBe('Before load');
    expect(warn).not.toHaveBeenCalled();
  });

  it('knows its languages', () => {
    expect(isLocale('de')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });
});

describe('the cache', () => {
  it('keeps one catalogue per language and version, dropping other versions', async () => {
    vi.spyOn(apiClient, 'getMessages').mockRejectedValue(new Error('offline'));
    await initI18n('1.0');
    persistCatalogue('en', { a: 'old' });
    await initI18n('2.0');
    persistCatalogue('en', { a: 'new' });
    expect(localStorage.getItem(`${CATALOGUE_STORAGE_PREFIX}en@1.0`)).toBeNull();
    expect(loadCachedCatalogue('en')).toEqual({ a: 'new' });
  });

  it('ignores an unreadable cache entry', async () => {
    vi.spyOn(apiClient, 'getMessages').mockRejectedValue(new Error('offline'));
    await initI18n('3.0');
    localStorage.setItem(`${CATALOGUE_STORAGE_PREFIX}en@3.0`, '{broken');
    expect(loadCachedCatalogue('en')).toBeNull();
    localStorage.setItem(`${CATALOGUE_STORAGE_PREFIX}en@3.0`, '{"a": 1}');
    expect(loadCachedCatalogue('en')).toBeNull();
  });

  it('caches nothing without a version', async () => {
    vi.spyOn(apiClient, 'getMessages').mockResolvedValue({ a: 'b' });
    await initI18n(null);
    expect(loadCachedCatalogue('en')).toBeNull();
  });
});

describe('initI18n and setLocale', () => {
  it('shows the cached catalogue, then the server catalogue', async () => {
    vi.spyOn(apiClient, 'getMessages').mockResolvedValue({ 'lens.due': 'Server' });
    await initI18n('4.0');
    expect(get(messagesStore)).toEqual({ 'lens.due': 'Server' });
    expect(loadCachedCatalogue('en')).toEqual({ 'lens.due': 'Server' });
  });

  it('keeps the cached catalogue when the server cannot be reached', async () => {
    const getMessages = vi.spyOn(apiClient, 'getMessages').mockResolvedValue({ x: 'cached' });
    await initI18n('5.0');
    getMessages.mockRejectedValue(new Error('offline'));
    messagesStore.set({});
    await initI18n('5.0');
    expect(get(messagesStore)).toEqual({ x: 'cached' });
  });

  it('switches the language, remembers it, and sets the document language', async () => {
    vi.spyOn(apiClient, 'getMessages').mockResolvedValue({ 'lens.due': 'Fällig' });
    expect(await setLocale('de')).toBe(true);
    expect(get(currentLocale)).toBe('de');
    expect(document.documentElement.lang).toBe('de');
    expect(storedLocale()).toBe('de');
    expect(detectInitialLocale()).toBe('de');
  });

  it('keeps the language when the texts cannot be loaded', async () => {
    vi.spyOn(apiClient, 'getMessages').mockRejectedValue(new Error('offline'));
    expect(await setLocale('de')).toBe(false);
    expect(get(currentLocale)).toBe('en');
  });

  it('starts in German for a German browser without a stored choice', () => {
    vi.stubGlobal('navigator', { language: 'de-DE' });
    expect(detectInitialLocale()).toBe('de');
    localStorage.setItem(LOCALE_STORAGE_KEY, 'xx');
    expect(storedLocale()).toBeNull();
  });
});
