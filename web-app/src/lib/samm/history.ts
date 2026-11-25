/**
 * The signed history of a document worded for its margin: who did what and when, from the catalogue.
 */
import type { HistoryEntry } from '../components/HistoryList.svelte';
import type { HistoryLine, SammModel } from '../api/types';
import { formatAgo, formatDateTime } from '../format';
import { findPractice } from './scores';

type Translate = (key: string, params?: Record<string, string | number>) => string;

/**
 * @param lines the history, newest first
 * @param model the model, to name a practice
 * @param t the translation function
 * @param locale the language
 * @param now the present
 * @returns the worded lines
 */
export function historyEntries(
  lines: HistoryLine[],
  model: SammModel | null,
  t: Translate,
  locale: string,
  now: Date = new Date(),
): HistoryEntry[] {
  return lines.map((line, index) => {
    const practice =
      line.part && model ? (findPractice(model, line.part)?.practice.name ?? line.part) : line.part;
    let what: string;
    switch (line.kind) {
      case 'save':
        what = t('history.save', { count: line.count ?? 0, part: practice ?? '' });
        break;
      case 'release':
        what = t('history.release', { version: line.tag?.split('/').at(-1) ?? '' });
        break;
      default:
        what = t(`history.${line.kind}`);
    }
    const recent = now.getTime() - new Date(line.at).getTime() < 86_400_000;
    return {
      key: `${line.at}-${index}`,
      who: line.by.name,
      what,
      when: recent ? formatAgo(line.at, locale, now) : formatDateTime(line.at, locale),
      datetime: line.at,
      release: line.kind === 'release',
    };
  });
}
