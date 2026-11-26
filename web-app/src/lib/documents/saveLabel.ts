/**
 * The sentence of the save state in a sheet's margin (AUN-WEB-5): what the person's work is, in words they can tell
 * apart — "saved for you" and "saved for everyone" above all.
 */
import { formatTime } from '../format';
import type { DocumentController } from './controller.svelte';

/** The translation function of the catalogue (`$t`). */
export type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * @param controller the controller of the sheet
 * @param t the translation function
 * @param locale the language, for the time of the last save
 * @param readonlyLabel the sentence of a sheet that cannot be edited, which names its document type; `null` for a sheet
 * that can
 * @returns the sentence for the margin
 */
export function saveLabel(
  controller: DocumentController,
  t: Translate,
  locale: string,
  readonlyLabel: string | null,
): string {
  const time = () => formatTime(controller.stampAt ?? new Date(), locale);
  switch (controller.saveState) {
    case 'changed':
      return t('save.changed');
    case 'drafting':
      return t('save.drafting');
    case 'draft':
      return t('save.draft', { time: time() });
    case 'saving':
      return t('save.saving');
    case 'saved':
      return t('save.saved', { time: time() });
    case 'conflict':
      return t('save.conflict', { count: controller.open });
    case 'failed':
      return controller.draftRefused ? t('save.invalid') : t('save.failed');
    default:
      return readonlyLabel ?? t('save.clean');
  }
}
