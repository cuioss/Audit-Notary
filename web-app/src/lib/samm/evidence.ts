/**
 * The evidence links of a practice (AUN-SAMM-7, rest-api.adoc, SAMM Requests, The Assessment): a title and an absolute
 * `https` address, for a question of the practice or for the practice as a whole. Evidence is a link, never a file.
 */
import type { FieldError } from '../api/errors';
import type { SammEvidenceLink } from '../api/types';

/** The most links one practice holds. */
export const MAX_EVIDENCE = 50;
/** The longest title of a link, in characters. */
export const MAX_EVIDENCE_TITLE = 200;
/** The longest address of a link, in characters. */
export const MAX_EVIDENCE_URL = 2048;

/** One field of a link that an error names. */
export type EvidenceField = 'title' | 'url' | 'question';

/** The codes of the errors of one link, by field; `link` for an error of the whole link. */
export type EvidenceRowErrors = Partial<Record<EvidenceField | 'link', string>>;

/** What a refusal says about the evidence of a practice. */
export interface EvidenceErrors {
  /** The errors per row, by the position of the link in the list the sheet sent. */
  rows: Record<number, EvidenceRowErrors>;
  /** The code of an error of the list as a whole (`MAX_ITEMS`). */
  list: string | null;
}

/**
 * @param text an address
 * @returns whether it is an absolute `https` address of at most {@link MAX_EVIDENCE_URL} characters
 */
export function isHttpsUrl(text: string): boolean {
  if (text.length > MAX_EVIDENCE_URL || !text.toLowerCase().startsWith('https://')) return false;
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && url.hostname !== '';
  } catch {
    return false;
  }
}

/**
 * The first problem of a link as the browser sees it, so that a link the server would refuse is not kept as a draft.
 *
 * @param link the link
 * @returns the code of the problem, or `null` when the link is as the register asks
 */
export function linkProblem(link: Pick<SammEvidenceLink, 'title' | 'url'>): string | null {
  const title = link.title.trim();
  if (title === '' || link.url.trim() === '') return 'REQUIRED';
  if (title.length > MAX_EVIDENCE_TITLE) return 'MAX_LENGTH';
  if (!isHttpsUrl(link.url.trim())) return 'PATTERN';
  return null;
}

/**
 * Reads the errors of a refused save or draft for the evidence of one practice: `/evidence/<practice>/<n>/<member>` and
 * `/evidence/<practice>` for the list.
 *
 * @param errors the field errors of a `VALIDATION`
 * @param practice the practice id
 * @returns the code of the first error per row and member, and of the list
 */
export function evidenceErrorsOf(errors: FieldError[] | null, practice: string): EvidenceErrors {
  const found: EvidenceErrors = { rows: {}, list: null };
  const base = `/evidence/${practice}`;
  for (const error of errors ?? []) {
    if (error.pointer === base) {
      found.list ??= error.code;
    } else if (error.pointer.startsWith(`${base}/`)) {
      const [index, member] = error.pointer.slice(base.length + 1).split('/');
      const row = Number(index);
      if (!Number.isInteger(row) || row < 0) continue;
      const slot =
        member === 'title' || member === 'url' || member === 'question' ? member : 'link';
      found.rows[row] ??= {};
      found.rows[row][slot] ??= error.code;
    }
  }
  return found;
}

/**
 * Finds a link again in a list that may have been replaced meanwhile: a confirmation or an editor holds the position the
 * link had, and that position is only trusted while the list still holds the same link there.
 *
 * @param links the list as it stands
 * @param original the link as it stood when the position was taken
 * @param index the position it had
 * @returns `index` while the list holds the same link there; else the first position of the same link; `-1` when it is gone
 */
export function locateLink(
  links: readonly SammEvidenceLink[],
  original: SammEvidenceLink,
  index: number,
): number {
  const same = (link: SammEvidenceLink | undefined) =>
    link !== undefined &&
    link.title === original.title &&
    link.url === original.url &&
    link.question === original.question;
  return same(links[index]) ? index : links.findIndex((link) => same(link));
}
