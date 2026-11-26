/**
 * What the pages of the lens Reports know: their addresses, the words of a status, the typed date or tag of the risk
 * register and the order of the threat evaluation (rest-api.adoc, Reports Requests).
 */
import type {
  ProtectionLevel,
  RiskRating,
  ThreatEvaluationModel,
  ThreatStatus,
} from '../api/types';
import type { StatusTone } from '../components/StatusLabel.svelte';
import { formatAddress } from '../routes';

/** The dashboard of the lens. */
export const REPORTS_ADDRESS = '/reports';

/** The trend of every scope. */
export const SAMM_TREND_ADDRESS = '/reports/samm-trend';

/** The comparison of two assessments of one scope. */
export const SAMM_COMPARE_ADDRESS = '/reports/samm-compare';

/** The threat models evaluated across the services. */
export const THREAT_EVALUATION_ADDRESS = '/reports/threat-evaluation';

/** The risk register as of a date or tag. */
export const RISK_REGISTER_ADDRESS = '/reports/risk-register';

/**
 * @param scope the scope to draw by business function; every scope without it
 * @returns the address of the trend report
 */
export function trendAddress(scope?: string): string {
  return formatAddress({
    route: 'reports.samm-trend',
    params: {},
    ...(scope ? { query: { scope } } : {}),
  });
}

/**
 * @param scope the scope
 * @param from the earlier assessment
 * @param to the later assessment
 * @returns the address of the comparison; without `from` and `to` the page offers the pairs of the scope
 */
export function compareAddress(scope?: string, from?: string, to?: string): string {
  const query: Record<string, string> = {};
  if (scope) query.scope = scope;
  if (scope && from && to) {
    query.from = from;
    query.to = to;
  }
  return formatAddress({ route: 'reports.samm-compare', params: {}, query });
}

/**
 * @param asOf the date or tag; the register as of now without it
 * @returns the address of the risk register
 */
export function riskRegisterAddress(asOf?: string): string {
  return formatAddress({
    route: 'reports.risk-register',
    params: {},
    ...(asOf ? { query: { 'as-of': asOf } } : {}),
  });
}

/** The value pattern of the query `as-of` (`canonical-addresses.json`). */
const AS_OF = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;

/**
 * @param text what the person typed into the date-or-tag field
 * @returns whether the address admits it; the server decides whether it is a date or tag that exists
 */
export function isAsOfText(text: string): boolean {
  return AS_OF.test(text);
}

/** A calendar date as the server reads it. */
const DATE_TEXT = /^\d{4}-\d{2}-\d{2}$/;

/**
 * @param text a value of `as-of`
 * @returns whether the server reads it as a calendar date and not as the name of a tag
 */
export function isDateText(text: string): boolean {
  return DATE_TEXT.test(text);
}

/**
 * The catalogue key of the sentence for a refusal of `as-of`.
 *
 * @param code the code of the `422` with the pointer `/as-of`
 * @returns the message key
 */
export function asOfErrorKey(code: string): string {
  switch (code) {
    case 'FUTURE':
      return 'reports.risk.asof.future';
    case 'UNKNOWN_TAG':
      return 'reports.risk.asof.unknown-tag';
    default:
      return 'reports.risk.asof.pattern';
  }
}

/**
 * @param status the review state of a threat model
 * @returns the tone of its dot; the two states that need the person are drawn as a box instead
 */
export function statusTone(status: ThreatStatus): StatusTone {
  return status === 'ok' ? 'success' : 'neutral';
}

/**
 * @param rating the rating of a risk
 * @returns the tone of its dot; the word always says it
 */
export function ratingTone(rating: RiskRating): StatusTone {
  return rating === 'critical' ? 'danger' : rating === 'high' ? 'attention' : 'neutral';
}

/**
 * @param interval an ISO 8601 period of whole months, such as `P6M`
 * @returns the months, or `null` for any other period
 */
export function intervalMonths(interval: string): number | null {
  const match = /^P(\d{1,3})M$/.exec(interval);
  return match ? Number(match[1]) : null;
}

/** The levels of a protection need, highest first. */
const NEED_RANK: Record<ProtectionLevel, number> = { 'very-high': 0, high: 1, normal: 2 };

/**
 * @param level a protection need
 * @returns its place in a list that starts with the highest
 */
export function needRank(level: ProtectionLevel): number {
  return NEED_RANK[level];
}

/** The orders the threat evaluation offers. */
export const THREAT_SORTS = ['due', 'service', 'open', 'untreated'] as const;

/** One order of the threat evaluation. */
export type ThreatSort = (typeof THREAT_SORTS)[number];

/**
 * Orders the rows of the threat evaluation on the page. `due` is the order of the server (the review due first, a model
 * without one last) and is not changed; the others break ties by the name of the service.
 *
 * @param models the rows as served
 * @param sort the order
 * @param locale the language, for the names
 * @returns a new list
 */
export function sortModels(
  models: ThreatEvaluationModel[],
  sort: ThreatSort,
  locale: string,
): ThreatEvaluationModel[] {
  const byName = (a: ThreatEvaluationModel, b: ThreatEvaluationModel) =>
    a.service.name.localeCompare(b.service.name, locale, { sensitivity: 'base' }) ||
    a.model.localeCompare(b.model);
  const copy = [...models];
  switch (sort) {
    case 'service':
      return copy.sort(byName);
    case 'open':
      return copy.sort((a, b) => b.threats.open - a.threats.open || byName(a, b));
    case 'untreated':
      return copy.sort((a, b) => b.threats.untreated - a.threats.untreated || byName(a, b));
    default:
      return copy;
  }
}
