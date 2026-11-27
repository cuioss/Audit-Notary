/**
 * The signed history of an incident worded for its margin: the lines of the generic lifecycle, and the completion and
 * reopening of a stage and the save of one part, which the incident adds (rest-api.adoc, An Incident).
 */
import type { HistoryLine } from '../api/types';
import { documentHistory } from '../documents/history';
import type { Translate } from '../documents/saveLabel';
import type { HistoryEntry } from '../components/HistoryList.svelte';
import { formatAgo, formatDateTime } from '../format';
import { DATA_PART } from './model';

/**
 * @param lines the history, newest first
 * @param t the translation function
 * @param locale the language
 * @param now the present
 * @param names the name of every stage, by id
 * @returns the worded lines
 */
export function incidentHistory(
  lines: HistoryLine[],
  t: Translate,
  locale: string,
  now: Date,
  names: Record<string, string>,
): HistoryEntry[] {
  return lines.map((line, index) => {
    const stage = line.stage ?? line.part ?? '';
    const name = names[stage] ?? stage;
    if (line.kind === 'complete' || line.kind === 'reopen') {
      const recent = now.getTime() - new Date(line.at).getTime() < 86_400_000;
      return {
        key: `${line.at}-${index}`,
        who: line.by.name,
        what: t(`incidents.history.${line.kind}`, { stage: name }),
        when: recent ? formatAgo(line.at, locale, now) : formatDateTime(line.at, locale),
        datetime: line.at,
        release: false,
      };
    }
    const entry = documentHistory([line], t, locale, now)[0];
    const what =
      line.kind === 'save' && line.part
        ? t('incidents.history.save', {
            count: line.count ?? 0,
            part: line.part === DATA_PART ? t('incidents.history.title') : name,
          })
        : entry.what;
    return { ...entry, key: `${line.at}-${index}`, what };
  });
}
