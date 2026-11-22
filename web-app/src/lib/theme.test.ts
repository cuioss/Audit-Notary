import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  THEME_STORAGE_KEY,
  applyTheme,
  isThemeChoice,
  readThemeChoice,
  resolveTheme,
  watchSystemTheme,
  writeThemeChoice,
} from './theme';

function stubMedia(matches: boolean) {
  const listeners = new Set<() => void>();
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches,
    media: query,
    addEventListener: (_: string, fn: () => void) => listeners.add(fn),
    removeEventListener: (_: string, fn: () => void) => listeners.delete(fn),
  }));
  return listeners;
}

afterEach(() => vi.unstubAllGlobals());

describe('theme', () => {
  it('stores and reads the choice under audit_notary_theme (AUN-WEB-2)', () => {
    expect(THEME_STORAGE_KEY).toBe('audit_notary_theme');
    expect(readThemeChoice()).toBe('system');
    writeThemeChoice('dark');
    expect(readThemeChoice()).toBe('dark');
    localStorage.setItem(THEME_STORAGE_KEY, 'neon');
    expect(readThemeChoice()).toBe('system');
    expect(isThemeChoice('light')).toBe(true);
  });

  it('resolves system by the preference and applies the theme to the document', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
    stubMedia(true);
    expect(applyTheme('system')).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });

  it('follows the system while subscribed', () => {
    const listeners = stubMedia(false);
    const onChange = vi.fn();
    const stop = watchSystemTheme(onChange);
    listeners.forEach((fn) => fn());
    expect(onChange).toHaveBeenCalledTimes(1);
    stop();
    expect(listeners.size).toBe(0);
  });
});
