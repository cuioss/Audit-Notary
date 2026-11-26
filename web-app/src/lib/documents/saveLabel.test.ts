import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatTime } from '../format';
import { translate } from '../i18n';
import { DocumentController } from './controller.svelte';
import { saveLabel } from './saveLabel';

const t = translate;

afterEach(() => {
  vi.useRealTimers();
});

/** A controller in a given state of the margin. */
function controllerIn(
  state: DocumentController['saveState'],
  change?: (c: DocumentController) => void,
) {
  const controller = new DocumentController({ repository: 'test-notes' });
  controller.saveState = state;
  change?.(controller);
  return controller;
}

describe('the sentence of the save state', () => {
  it.each([
    ['changed', 'save.changed'],
    ['drafting', 'save.drafting'],
    ['saving', 'save.saving'],
    ['failed', 'save.failed'],
    ['clean', 'save.clean'],
  ] as const)('says %s with the key %s', (state, key) => {
    expect(saveLabel(controllerIn(state), t, 'en', null)).toBe(t(key));
  });

  it('names the time of a draft and of a save, in the language asked', () => {
    const at = new Date('2026-11-26T09:45:00Z');
    const draft = controllerIn('draft', (c) => (c.stampAt = at));
    const saved = controllerIn('saved', (c) => (c.stampAt = at));
    expect(saveLabel(draft, t, 'en', null)).toBe(t('save.draft', { time: formatTime(at, 'en') }));
    expect(saveLabel(saved, t, 'en', null)).toBe(t('save.saved', { time: formatTime(at, 'en') }));
    expect(saveLabel(saved, t, 'de', null)).toBe(t('save.saved', { time: formatTime(at, 'de') }));
    expect(formatTime(at, 'de')).not.toBe(formatTime(at, 'en'));
    expect(saveLabel(saved, t, 'de', null)).not.toBe(saveLabel(saved, t, 'en', null));
  });

  it('uses the time of now when none is known', () => {
    vi.useFakeTimers();
    const now = new Date('2026-11-26T14:20:00Z');
    vi.setSystemTime(now);
    expect(saveLabel(controllerIn('draft'), t, 'en', null)).toBe(
      t('save.draft', { time: formatTime(now, 'en') }),
    );
    expect(saveLabel(controllerIn('saved'), t, 'de', null)).toBe(
      t('save.saved', { time: formatTime(now, 'de') }),
    );
  });

  it('counts the conflicts still to decide', () => {
    const controller = controllerIn('conflict', (c) => {
      const field = (pointer: string) => ({
        pointer,
        own: 1,
        other: 2,
        by: { pseudonym: 'p', name: 'N' },
      });
      c.conflicts = { '/a': field('/a'), '/b': field('/b') };
    });
    const asked: [string, Record<string, string | number> | undefined][] = [];
    const spy = (key: string, params?: Record<string, string | number>) => {
      asked.push([key, params]);
      return key;
    };
    expect(saveLabel(controller, spy, 'en', null)).toBe('save.conflict');
    expect(asked).toEqual([['save.conflict', { count: 2 }]]);
    expect(saveLabel(controllerIn('conflict'), t, 'en', null)).toContain(
      'Decide, then save again.',
    );
  });

  it('tells a refused draft from a draft that could not be kept', () => {
    const refused = controllerIn('failed', (c) => (c.draftRefused = true));
    expect(saveLabel(refused, t, 'en', null)).toBe(t('save.invalid'));
  });

  it('names a read-only sheet in the words of its document type, and only while nothing was changed', () => {
    expect(saveLabel(controllerIn('clean'), t, 'en', 'Read only.')).toBe('Read only.');
    expect(saveLabel(controllerIn('changed'), t, 'en', 'Read only.')).toBe(t('save.changed'));
  });
});
