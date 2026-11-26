import { describe, expect, it } from 'vitest';
import { translate } from '../i18n';
import { DocumentController } from './controller.svelte';
import { saveLabel } from './saveLabel';

const t = translate;

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
    expect(saveLabel(draft, t, 'en', null)).toMatch(/^Saved for you at/);
    expect(saveLabel(saved, t, 'en', null)).toMatch(/^Saved for everyone at/);
    expect(saveLabel(saved, t, 'de', null)).toMatch(/\d/);
  });

  it('uses the time of now when none is known', () => {
    expect(saveLabel(controllerIn('draft'), t, 'en', null)).toMatch(/\d/);
  });

  it('counts the conflicts still to decide', () => {
    const controller = controllerIn('conflict');
    expect(saveLabel(controller, t, 'en', null)).toContain('Decide, then save again.');
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
