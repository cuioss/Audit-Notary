/**
 * The UI icons of Audit Notary and the names that resolve to them (AUN-WEB-2: an own icon set).
 *
 * The drawings are taken over from `pm-web-app` (`src/lib/icons/ui/`, the same 24 px grid, round caps,
 * `currentColor` only, 1.5 px stroke). Every name has one SVG under `ui/`; a view resolves a name here
 * and never builds an asset path of its own.
 */
import actBackUrl from './ui/act-back.svg?url';
import actCancelUrl from './ui/act-cancel.svg?url';
import actExternalUrl from './ui/act-external.svg?url';
import actMoreUrl from './ui/act-more.svg?url';
import actRefreshUrl from './ui/act-refresh.svg?url';
import actSearchUrl from './ui/act-search.svg?url';
import kindDocumentUrl from './ui/kind-document.svg?url';
import kindEntityUrl from './ui/kind-entity.svg?url';
import kindReportUrl from './ui/kind-report.svg?url';
import navInboxUrl from './ui/nav-inbox.svg?url';
import navReportsUrl from './ui/nav-reports.svg?url';
import navSettingsUrl from './ui/nav-settings.svg?url';
import stateAlertUrl from './ui/state-alert.svg?url';
import stateCheckUrl from './ui/state-check.svg?url';
import stateClockUrl from './ui/state-clock.svg?url';
import stateDotUrl from './ui/state-dot.svg?url';
import stateErrorUrl from './ui/state-error.svg?url';
import stateLockUrl from './ui/state-lock.svg?url';

/** The delivered asset URL of every icon name. */
export const ICON_URLS = {
  'act.back': actBackUrl,
  'act.close': actCancelUrl,
  'act.external': actExternalUrl,
  'act.more': actMoreUrl,
  'act.refresh': actRefreshUrl,
  'act.search': actSearchUrl,
  'kind.document': kindDocumentUrl,
  'lens.due': navInboxUrl,
  'lens.samm': kindReportUrl,
  'lens.threat-models': stateAlertUrl,
  'lens.incidents': stateErrorUrl,
  'lens.isms': stateLockUrl,
  'lens.catalogs': kindEntityUrl,
  'lens.reports': navReportsUrl,
  'lens.settings': navSettingsUrl,
  'state.check': stateCheckUrl,
  'state.clock': stateClockUrl,
  'state.dot': stateDotUrl,
  'state.alert': stateAlertUrl,
} as const satisfies Record<string, string>;

/** A name of the icon set. */
export type IconName = keyof typeof ICON_URLS;

/**
 * @param name an icon name, or nothing
 * @returns the asset URL, or `null` for a name the set does not deliver
 */
export function uiIconUrl(name: string | null | undefined): string | null {
  if (!name || !Object.hasOwn(ICON_URLS, name)) return null;
  return ICON_URLS[name as IconName];
}
