/**
 * The signed history of a generic document worded for its margin: who did what and when, from the catalogue.
 */
import type { HistoryLine, Revision, RevisionAt } from '../api/types';
import type { HistoryEntry } from '../components/HistoryList.svelte';
import { formatAgo, formatDateTime } from '../format';
import type { Translate } from './saveLabel';

/**
 * @param tag a release tag, `notes/<id>/v2`
 * @returns its version, `v2`
 */
export function versionOfTag(tag: string): string {
  return tag.split('/').at(-1) ?? tag;
}

/**
 * @param lines the history, newest first
 * @param t the translation function
 * @param locale the language
 * @param now the present
 * @returns the worded lines
 */
export function documentHistory(
  lines: HistoryLine[],
  t: Translate,
  locale: string,
  now: Date = new Date(),
): HistoryEntry[] {
  return lines.map((line, index) => {
    let what: string;
    switch (line.kind) {
      case 'save':
        what = t('documents.history.save', { count: line.count ?? 0 });
        break;
      case 'release':
        what = t('documents.history.release', { version: versionOfTag(line.tag ?? '') });
        break;
      default:
        what = t(`documents.history.${line.kind}`);
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

/**
 * @param revision a revision of the list, or what a revision read says about itself
 * @param t the translation function
 * @returns what the revision is: created, saved, submitted for review, or released as its version
 */
export function revisionKind(revision: Revision | RevisionAt, t: Translate): string {
  return revision.kind === 'release'
    ? t('documents.revision.kind.release', { version: versionOfTag(revision.tag ?? revision.ref) })
    : t(`documents.revision.kind.${revision.kind}`);
}
