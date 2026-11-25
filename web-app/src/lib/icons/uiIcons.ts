/**
 * The UI icons of Audit Notary and the names that resolve to them (AUN-WEB-2: an own icon set).
 *
 * The drawings follow the contract of `pm-web-app` (`src/lib/icons/ui/`): the 24 px grid, round caps and joins,
 * `currentColor` only, a 1.5 px stroke, no text. The first drawings are taken over from there; the lens icons and
 * the states of the register (stage, deadline, seal, presence) are Audit Notary's own. The seal is scalloped, with
 * no points and no ribbons (doc/concepts/brand.adoc, The Mark). Every name has one SVG under `ui/`; a view resolves
 * a name here and never builds an asset path of its own.
 */
import actBackUrl from './ui/act-back.svg?url';
import actCancelUrl from './ui/act-cancel.svg?url';
import actChartUrl from './ui/act-chart.svg?url';
import actCompareUrl from './ui/act-compare.svg?url';
import actExpandUrl from './ui/act-expand.svg?url';
import actExternalUrl from './ui/act-external.svg?url';
import actMoreUrl from './ui/act-more.svg?url';
import actNextUrl from './ui/act-next.svg?url';
import actRefreshUrl from './ui/act-refresh.svg?url';
import actReopenUrl from './ui/act-reopen.svg?url';
import actSaveUrl from './ui/act-save.svg?url';
import actSearchUrl from './ui/act-search.svg?url';
import actStampUrl from './ui/act-stamp.svg?url';
import actTableUrl from './ui/act-table.svg?url';
import kindDocumentUrl from './ui/kind-document.svg?url';
import kindEntityUrl from './ui/kind-entity.svg?url';
import kindReportUrl from './ui/kind-report.svg?url';
import lensCatalogsUrl from './ui/lens-catalogs.svg?url';
import lensDaybookUrl from './ui/lens-daybook.svg?url';
import lensIncidentUrl from './ui/lens-incident.svg?url';
import lensIsmsUrl from './ui/lens-isms.svg?url';
import lensSammUrl from './ui/lens-samm.svg?url';
import lensThreatModelUrl from './ui/lens-threat-model.svg?url';
import navInboxUrl from './ui/nav-inbox.svg?url';
import navReportsUrl from './ui/nav-reports.svg?url';
import navSettingsUrl from './ui/nav-settings.svg?url';
import stateAlertUrl from './ui/state-alert.svg?url';
import stateCheckUrl from './ui/state-check.svg?url';
import stateClockUrl from './ui/state-clock.svg?url';
import stateConflictUrl from './ui/state-conflict.svg?url';
import stateDoneUrl from './ui/state-done.svg?url';
import stateDotUrl from './ui/state-dot.svg?url';
import stateDraftUrl from './ui/state-draft.svg?url';
import stateErrorUrl from './ui/state-error.svg?url';
import stateHistoryUrl from './ui/state-history.svg?url';
import stateKeyboardUrl from './ui/state-keyboard.svg?url';
import stateLockUrl from './ui/state-lock.svg?url';
import stateMissedUrl from './ui/state-missed.svg?url';
import stateNaUrl from './ui/state-na.svg?url';
import stateOpenUrl from './ui/state-open.svg?url';
import statePersonUrl from './ui/state-person.svg?url';
import stateSealUrl from './ui/state-seal.svg?url';
import stateTargetUrl from './ui/state-target.svg?url';

/** The delivered asset URL of every icon name. */
export const ICON_URLS = {
  'act.back': actBackUrl,
  'act.chart': actChartUrl,
  'act.close': actCancelUrl,
  'act.compare': actCompareUrl,
  'act.expand': actExpandUrl,
  'act.external': actExternalUrl,
  'act.more': actMoreUrl,
  'act.next': actNextUrl,
  'act.refresh': actRefreshUrl,
  'act.reopen': actReopenUrl,
  'act.save': actSaveUrl,
  'act.search': actSearchUrl,
  'act.stamp': actStampUrl,
  'act.table': actTableUrl,
  'kind.document': kindDocumentUrl,
  'kind.entity': kindEntityUrl,
  'kind.report': kindReportUrl,
  'lens.catalogs': lensCatalogsUrl,
  'lens.due': lensDaybookUrl,
  'lens.incidents': lensIncidentUrl,
  'lens.isms': lensIsmsUrl,
  'lens.reports': navReportsUrl,
  'lens.samm': lensSammUrl,
  'lens.settings': navSettingsUrl,
  'lens.threat-models': lensThreatModelUrl,
  'state.alert': stateAlertUrl,
  'state.check': stateCheckUrl,
  'state.clock': stateClockUrl,
  'state.conflict': stateConflictUrl,
  'state.done': stateDoneUrl,
  'state.dot': stateDotUrl,
  'state.draft': stateDraftUrl,
  'state.error': stateErrorUrl,
  'state.history': stateHistoryUrl,
  'state.inbox': navInboxUrl,
  'state.keyboard': stateKeyboardUrl,
  'state.lock': stateLockUrl,
  'state.missed': stateMissedUrl,
  'state.na': stateNaUrl,
  'state.open': stateOpenUrl,
  'state.person': statePersonUrl,
  'state.seal': stateSealUrl,
  'state.target': stateTargetUrl,
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
