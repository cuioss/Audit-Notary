import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import type { SammTrendReport, ThreatEvaluation } from '../../api/types';
import { clearModels } from '../../samm/store';
import { session } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { scenarioFetch } from '../../test/scenarioFetch';
import ReportsView from './ReportsView.svelte';
import RiskRegisterView from './RiskRegisterView.svelte';
import SammCompareView from './SammCompareView.svelte';
import SammTrendView from './SammTrendView.svelte';
import ThreatEvaluationTable from './ThreatEvaluationTable.svelte';
import ThreatEvaluationView from './ThreatEvaluationView.svelte';

/**
 * The lens Reports against the `web-mock` profiles (AUN-TEST-1): the dashboard, the trend of every scope, the comparison of
 * two assessments, the threat evaluation and the risk register as of a day or a tag.
 */

/**
 * Stubs fetch with a profile and signs its user in.
 *
 * @param profile `name` or `name#state`
 */
async function useProfile(profile: string) {
  const scenario = scenarioFetch(profile);
  vi.stubGlobal('fetch', scenario.fetch);
  session.set(await apiClient.getSession());
  return scenario;
}

const navigate = vi.fn();

beforeEach(() => {
  clearModels();
  navigate.mockReset();
});

afterEach(() => {
  session.set(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('ReportsView', () => {
  it('shows the three registers with their figures and links to their reports', async () => {
    await useProfile('workshop');
    render(ReportsView);
    const samm = await screen.findByTestId('reports-samm');
    expect(within(samm).getByRole('heading', { level: 2 })).toHaveTextContent('SAMM maturity');
    expect(samm).toHaveTextContent('Scopes');
    expect(within(samm).getByTestId('reports-latest-payments')).toHaveTextContent('1.36');
    expect(within(samm).getByTestId('reports-latest-payments')).toHaveTextContent('+0.4');
    expect(within(samm).getByTestId('reports-latest-shop')).toHaveTextContent(
      'No earlier release of this model version',
    );
    expect(within(samm).getByTestId('reports-open-trend')).toHaveAttribute(
      'href',
      '/reports/samm-trend',
    );
    expect(within(samm).getByTestId('reports-open-compare')).toHaveAttribute(
      'href',
      '/reports/samm-compare',
    );
    const threats = screen.getByTestId('reports-threats');
    expect(threats).toHaveTextContent('Reviews overdue');
    expect(within(threats).getByTestId('reports-open-threats')).toHaveAttribute(
      'href',
      '/reports/threat-evaluation',
    );
    const risks = screen.getByTestId('reports-risks');
    expect(risks).toHaveTextContent('Critical');
    expect(risks).toHaveTextContent('Last release');
    expect(within(risks).getByTestId('reports-open-risks')).toHaveAttribute(
      'href',
      '/reports/risk-register',
    );
  });

  it('shows the date of the figures in the lede', async () => {
    await useProfile('workshop');
    render(ReportsView);
    expect(await screen.findByText(/as of/)).toHaveTextContent('Nov 26, 2026');
  });

  it('leaves out the section of a register the person may not read', async () => {
    await useProfile('release');
    render(ReportsView);
    await screen.findByTestId('reports-samm');
    expect(screen.queryByTestId('reports-threats')).toBeNull();
    expect(screen.getByTestId('reports-risks')).toBeInTheDocument();
  });

  it('shows zeros and no latest assessment of an empty installation', async () => {
    await useProfile('empty');
    render(ReportsView);
    const samm = await screen.findByTestId('reports-samm');
    expect(samm).toHaveTextContent('No scope has a released assessment yet.');
    expect(screen.getByTestId('reports-risks')).toHaveTextContent(
      'The register holds no released risk yet.',
    );
  });

  it('says so when no register can be read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getReportsSummary').mockResolvedValue({ today: '2026-11-26' });
    render(ReportsView);
    expect(await screen.findByText('No report to show')).toBeInTheDocument();
  });

  it('names a failed read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getReportsSummary').mockRejectedValue(new ApiError('NETWORK', 0));
    render(ReportsView);
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
  });

  it('reads the dashboard of a degraded installation like the workshop', async () => {
    await useProfile('degraded');
    render(ReportsView);
    expect(await screen.findByTestId('reports-threats')).toBeInTheDocument();
  });
});

describe('SammTrendView', () => {
  it('draws the scopes in series colours with a legend and states every point in a table', async () => {
    await useProfile('workshop');
    render(SammTrendView, { onnavigate: navigate });
    expect(await screen.findByTestId('trend-chart')).toBeInTheDocument();
    const legend = screen.getByRole('list', { name: 'Scopes' });
    expect(legend).toHaveTextContent('Payments');
    expect(legend).toHaveTextContent('Web shop');
    // The scope without a released assessment has no line; the table names it.
    expect(legend).not.toHaveTextContent('Identity Platform');
    const table = screen.getByTestId('trend-table');
    expect(within(table).getByTestId('trend-row-payments-2025-q4')).toHaveTextContent('0.96');
    expect(within(table).getByTestId('trend-row-payments-2026-q2')).toHaveTextContent('1.36');
    expect(within(table).getByTestId('trend-none-identity')).toHaveTextContent(
      'No released assessment yet',
    );
    expect(screen.queryByTestId('trend-versions')).toBeNull();
    expect(screen.queryByTestId('trend-omitted')).toBeNull();
    expect(get(breadcrumb)).toEqual([
      { label: 'SAMM maturity over time', href: '/reports/samm-trend' },
    ]);
  });

  it('names the model versions when the scopes differ, and counts what a scope leaves out', async () => {
    await useProfile('workshop#trend-mixed-models');
    render(SammTrendView, { onnavigate: navigate });
    const notice = await screen.findByTestId('trend-versions');
    expect(notice).toHaveTextContent('different versions of the model');
    expect(notice).toHaveTextContent('v2.2.0: Payments');
    expect(notice).toHaveTextContent('v2.1.0: Web shop');
    expect(screen.getByTestId('trend-omitted')).toHaveTextContent(
      'Payments: one released assessment taken with another model version is not shown; only v2.2.0 is drawn.',
    );
  });

  it('shows the five business functions of one scope in the order of the model', async () => {
    await useProfile('workshop');
    render(SammTrendView, { query: { scope: 'payments' }, onnavigate: navigate });
    expect(await screen.findByTestId('trend-functions-chart')).toBeInTheDocument();
    const legend = await screen.findByRole('list', { name: 'Business functions' });
    await vi.waitFor(() => expect(legend).toHaveTextContent('Governance'));
    expect(legend.querySelectorAll('li')).toHaveLength(5);
    const table = screen.getByTestId('trend-functions-table');
    expect(within(table).getByTestId('trend-point-2026-q2')).toHaveTextContent('1.36');
    expect(within(table).getByTestId('trend-point-2026-q2')).toHaveTextContent('1.42');
    expect(screen.getByTestId('trend-compare')).toHaveAttribute(
      'href',
      '/reports/samm-compare?scope=payments',
    );
    expect(screen.getByTestId('trend-all')).toHaveAttribute('href', '/reports/samm-trend');
  });

  it('says that a scope without a released assessment has no trend', async () => {
    await useProfile('workshop');
    render(SammTrendView, { query: { scope: 'identity' }, onnavigate: navigate });
    expect(await screen.findByText('No released assessment yet')).toBeInTheDocument();
    expect(screen.queryByTestId('trend-functions-chart')).toBeNull();
  });

  it('names a scope that does not exist and shows every scope', async () => {
    await useProfile('workshop');
    render(SammTrendView, { query: { scope: 'nowhere' }, onnavigate: navigate });
    expect(await screen.findByTestId('trend-scope-unknown')).toHaveTextContent(
      'No scope of this name',
    );
    expect(screen.getByTestId('trend-chart')).toBeInTheDocument();
  });

  it('opens a scope by business function from the picker, and every scope again', async () => {
    await useProfile('workshop');
    render(SammTrendView, { onnavigate: navigate });
    const select = (await screen.findByTestId('trend-scope')) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'payments' } });
    expect(navigate).toHaveBeenLastCalledWith('/reports/samm-trend?scope=payments');
    await fireEvent.change(select, { target: { value: '' } });
    expect(navigate).toHaveBeenLastCalledWith('/reports/samm-trend');
  });

  it('leaves the sixth scope to the table and says so', async () => {
    await useProfile('workshop');
    const point = (assessment: string, date: string, overall: number) => ({
      assessment,
      document: `d-${assessment}`,
      title: `Assessment ${assessment}`,
      date,
      overall,
      functions: { governance: overall },
    });
    const report: SammTrendReport = {
      scopes: Array.from({ length: 6 }, (_, index) => ({
        scope: `s${index + 1}`,
        title: `Scope ${index + 1}`,
        subject: { kind: 'organisation' as const, name: 'Org' },
        modelVersion: 'v2.2.0',
        omitted: 0,
        points: [point(`a${index}`, `2026-0${index + 1}-10`, 0.5 + index * 0.3)],
      })),
    };
    vi.spyOn(apiClient, 'getSammTrendReport').mockResolvedValue(report);
    render(SammTrendView, { onnavigate: navigate });
    expect(await screen.findByTestId('trend-beyond')).toHaveTextContent(
      'Scope 6 is in the table only',
    );
    expect(screen.getByRole('list', { name: 'Scopes' }).querySelectorAll('li')).toHaveLength(5);
    expect(screen.getByTestId('trend-row-s6-a5')).toBeInTheDocument();
  });

  it('says so when there is no scope at all', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammTrendReport').mockResolvedValue({ scopes: [] });
    render(SammTrendView, { onnavigate: navigate });
    expect(await screen.findByText('No scope yet')).toBeInTheDocument();
  });

  it('names a refusal', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammTrendReport').mockRejectedValue(new ApiError('FORBIDDEN', 403));
    render(SammTrendView, { onnavigate: navigate });
    expect(await screen.findByRole('alert')).toHaveTextContent('no right');
  });
});

describe('SammCompareView', () => {
  const PAIR = { scope: 'payments', from: '2025-q4', to: '2026-q2' };

  it('offers the scope first, and the pairs once a scope is chosen', async () => {
    await useProfile('workshop');
    render(SammCompareView, { onnavigate: navigate });
    const select = (await screen.findByTestId('compare-scope')) as HTMLSelectElement;
    await fireEvent.change(select, { target: { value: 'payments' } });
    expect(navigate).toHaveBeenLastCalledWith('/reports/samm-compare?scope=payments');
  });

  it('offers the pairs of released assessments of a scope and two pickers', async () => {
    await useProfile('workshop');
    render(SammCompareView, { query: { scope: 'payments' }, onnavigate: navigate });
    const pairs = await screen.findByTestId('compare-pairs');
    const link = within(pairs).getByRole('link');
    expect(link).toHaveTextContent('Payments 2025 Q4 and Payments 2026 Q2');
    expect(link).toHaveAttribute(
      'href',
      '/reports/samm-compare?scope=payments&from=2025-q4&to=2026-q2',
    );
    // Nothing is chosen yet: the act says what is missing.
    expect(screen.getByTestId('compare-show')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Choose the two assessments first.')).toBeInTheDocument();
  });

  it('turns two chosen assessments into a link, and refuses the same one twice', async () => {
    await useProfile('workshop');
    render(SammCompareView, { query: { scope: 'payments' }, onnavigate: navigate });
    const from = (await screen.findByTestId('compare-from')) as HTMLSelectElement;
    const to = screen.getByTestId('compare-to') as HTMLSelectElement;
    await vi.waitFor(() => expect(from.options.length).toBeGreaterThan(1));
    await fireEvent.change(from, { target: { value: '2025-q4' } });
    await fireEvent.change(to, { target: { value: '2025-q4' } });
    expect(screen.getByText('Choose two different assessments.')).toBeInTheDocument();
    await fireEvent.change(to, { target: { value: '2026-q2' } });
    expect(screen.getByTestId('compare-show')).toHaveAttribute(
      'href',
      '/reports/samm-compare?scope=payments&from=2025-q4&to=2026-q2',
    );
  });

  it('draws a dumbbell for the overall score and each business function, and a table', async () => {
    await useProfile('workshop');
    render(SammCompareView, { query: PAIR, onnavigate: navigate });
    const result = await screen.findByTestId('compare-result');
    const overall = within(result).getByTestId('dumbbell-overall');
    expect(overall).toHaveTextContent('0.96 to 1.36');
    expect(overall).toHaveTextContent('+0.4');
    await vi.waitFor(() =>
      expect(within(result).getByTestId('dumbbell-governance')).toHaveTextContent('Governance'),
    );
    expect(within(result).getByTestId('dumbbell-governance')).toHaveTextContent('+0.46');
    // The two ends of the pair are named by the assessments, with their date and state.
    expect(result).toHaveTextContent('Payments 2025 Q4, Dec 8, 2025, Released');
    const table = within(result).getByTestId('compare-table');
    expect(within(table).getByTestId('compare-row-governance')).toHaveTextContent('1.42');
    expect(get(breadcrumb)[0].label).toBe('Compare two assessments');
  });

  it('shows the practices and streams of a function under it', async () => {
    await useProfile('workshop');
    render(SammCompareView, { query: PAIR, onnavigate: navigate });
    const practices = await screen.findByTestId('compare-practices-governance');
    await vi.waitFor(() => expect(practices).toHaveTextContent('Strategy and Metrics'));
    expect(within(practices).getByTestId('dumbbell-governance-sm')).toHaveTextContent('+0.13');
    expect(within(practices).getByTestId('dumbbell-governance-sm-B')).toHaveTextContent('-0.25');
    expect(practices).toHaveTextContent('Stream A');
  });

  it('names both assessments and both versions when the model versions differ', async () => {
    await useProfile('workshop#model-versions-differ');
    render(SammCompareView, { query: PAIR, onnavigate: navigate });
    const notice = await screen.findByTestId('compare-differ');
    expect(notice).toHaveTextContent('These assessments are not compared');
    expect(notice).toHaveTextContent('model version v2.1.0');
    expect(notice).toHaveTextContent('Payments 2026 Q4 with v2.2.0');
    expect(screen.queryByTestId('compare-result')).toBeNull();
  });

  it('says so when one of the assessments is none of the scope', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'compareSamm').mockRejectedValue(new ApiError('NOT_FOUND', 404));
    render(SammCompareView, { query: PAIR, onnavigate: navigate });
    expect(await screen.findByTestId('compare-missing')).toHaveTextContent(
      'An assessment is missing',
    );
  });

  it('names a failed comparison', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'compareSamm').mockRejectedValue(new ApiError('NETWORK', 0));
    render(SammCompareView, { query: PAIR, onnavigate: navigate });
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be read');
  });

  it('shows the not-found page for a scope that does not exist', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammScope').mockRejectedValue(new ApiError('NOT_FOUND', 404));
    render(SammCompareView, { query: { scope: 'nowhere' }, onnavigate: navigate });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('says that a scope with fewer than two assessments has nothing to compare', async () => {
    await useProfile('workshop');
    render(SammCompareView, { query: { scope: 'shop' }, onnavigate: navigate });
    expect(await screen.findByTestId('compare-too-few')).toBeInTheDocument();
  });

  it('says so when no scope exists', async () => {
    await useProfile('empty');
    render(SammCompareView, { onnavigate: navigate });
    expect(await screen.findByText('No scope yet')).toBeInTheDocument();
  });

  it('names a failed read of the scopes', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammScopes').mockRejectedValue(new ApiError('NETWORK', 0));
    render(SammCompareView, { onnavigate: navigate });
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
  });
});

describe('ThreatEvaluationView', () => {
  it('lists one row for each threat model with its review and its threats', async () => {
    await useProfile('workshop');
    render(ThreatEvaluationView);
    const table = await screen.findByTestId('threat-evaluation-table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    const portal = within(table).getByTestId('threat-row-customer-portal-portal');
    expect(portal).toHaveTextContent('Customer Portal');
    expect(portal).toHaveTextContent('Very high');
    expect(portal).toHaveTextContent('Overdue by 177 days');
    expect(portal).toHaveTextContent('Jun 2, 2026');
    expect(portal).toHaveTextContent('Every 6 months');
    expect(portal).toHaveTextContent('359 days ago');
    expect(within(portal).getByRole('link')).toHaveAttribute(
      'href',
      '/threat-models/customer-portal/portal',
    );
    expect(within(table).getByTestId('threat-status-payment-api-checkout-flow')).toHaveTextContent(
      'Due in 5 days',
    );
    expect(
      within(table).getByTestId('threat-status-reporting-report-generation'),
    ).toHaveTextContent('In date');
    const draft = within(table).getByTestId('threat-row-notification-service-notification-flows');
    expect(draft).toHaveTextContent('Not released yet');
    expect(draft).toHaveTextContent('No review yet');
    expect(draft).toHaveTextContent('Draft');
    expect(screen.getByTestId('threat-evaluation-summary')).toHaveTextContent(
      '6 threat models: 13 open threats, 10 untreated, 2 reviews overdue.',
    );
  });

  it('lists the services without a threat model, planned ones included', async () => {
    await useProfile('workshop');
    render(ThreatEvaluationView);
    const without = await screen.findByTestId('threat-evaluation-without-table');
    expect(within(without).getByTestId('threat-without-report-scheduler')).toHaveTextContent(
      'Security Office',
    );
    expect(within(without).getByTestId('threat-without-notification-gateway')).toHaveTextContent(
      'Planned',
    );
    expect(within(without).getByTestId('threat-without-report-scheduler')).toHaveTextContent(
      'Active',
    );
    expect(
      within(within(without).getByTestId('threat-without-report-scheduler')).getByRole('link'),
    ).toHaveAttribute('href', '/threat-models/report-scheduler');
  });

  it('orders the rows on request', async () => {
    await useProfile('workshop');
    render(ThreatEvaluationView);
    const table = await screen.findByTestId('threat-evaluation-table');
    const names = () =>
      within(table)
        .getAllByRole('row')
        .slice(1)
        .map((row) => row.querySelector('th a')?.textContent);
    expect(names()[0]).toBe('Customer Portal');
    await fireEvent.change(screen.getByTestId('threat-evaluation-sort'), {
      target: { value: 'service' },
    });
    expect(names()).toEqual([
      'Customer database',
      'Customer Portal',
      'Identity Provider',
      'Notification service',
      'Payment API',
      'Reporting Service',
    ]);
    await fireEvent.change(screen.getByTestId('threat-evaluation-sort'), {
      target: { value: 'untreated' },
    });
    expect(names().slice(0, 2)).toEqual(['Identity Provider', 'Notification service']);
    await fireEvent.change(screen.getByTestId('threat-evaluation-sort'), {
      target: { value: 'open' },
    });
    expect(names()[0]).toBe('Identity Provider');
    await fireEvent.change(screen.getByTestId('threat-evaluation-sort'), {
      target: { value: '' },
    });
    expect(names()[0]).toBe('Customer Portal');
  });

  it('tells a person without the right that the threat models are not open to them', async () => {
    await useProfile('release');
    render(ThreatEvaluationView);
    expect(await screen.findByTestId('threat-forbidden')).toHaveTextContent(
      'The threat models are not open to you',
    );
    expect(screen.queryByTestId('threat-evaluation-table')).toBeNull();
  });

  it('lists every service as one without a model when none has one', async () => {
    await useProfile('workshop#no-threat-models');
    render(ThreatEvaluationView);
    expect(await screen.findByTestId('threat-evaluation-none')).toHaveTextContent(
      'No service has a threat model yet.',
    );
    expect(screen.getAllByTestId(/^threat-without-/)).toHaveLength(8);
  });

  it('says so when the catalog has no service', async () => {
    await useProfile('empty');
    render(ThreatEvaluationView);
    expect(await screen.findByText('No service in the catalog')).toBeInTheDocument();
    expect(screen.getByText('Every service has a threat model.')).toBeInTheDocument();
  });

  it('names a failed read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getThreatEvaluation').mockRejectedValue(new ApiError('NETWORK', 0));
    render(ThreatEvaluationView);
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
  });

  it('can be drawn without the order control, as a lens that has its own', async () => {
    const evaluation: ThreatEvaluation = {
      today: '2026-11-26',
      models: [],
      withoutModel: [],
    };
    render(ThreatEvaluationTable, { evaluation, sortable: false, testId: 'embedded' });
    expect(screen.getByTestId('embedded')).toBeInTheDocument();
    expect(screen.queryByTestId('embedded-sort')).toBeNull();
  });
});

describe('RiskRegisterView', () => {
  it('lists the released risks as they are now, with the review that is due', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { onnavigate: navigate });
    const table = await screen.findByTestId('risk-table');
    expect(screen.getByTestId('risk-count')).toHaveTextContent('7 released risks');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'The released risks as they are now.',
    );
    const row = within(table).getByTestId('risk-row-r-009');
    expect(row).toHaveTextContent('R-009');
    expect(row).toHaveTextContent('Critical');
    expect(row).toHaveTextContent('Mitigate');
    expect(row).toHaveTextContent('Payments');
    expect(row).toHaveTextContent('Version 2, released Aug 11, 2026');
    expect(row).toHaveTextContent('Payment API, checkout flow: T-07');
    expect(within(table).getByTestId('risk-link-r-009')).toHaveAttribute(
      'href',
      '/isms/risks/r-009',
    );
    // 2026-11-18 is before today (2026-11-26): the person is told.
    expect(within(table).getByTestId('risk-review-r-007')).toHaveTextContent('Overdue by 8 days');
    expect(within(table).queryByTestId('risk-review-r-009')).toBeNull();
    expect(screen.queryByTestId('risk-now')).toBeNull();
  });

  it('flags a review due within 30 days', async () => {
    await useProfile('workshop');
    const register = await apiClient.getRiskRegister();
    register.risks[0].reviewDue = '2026-12-10';
    vi.spyOn(apiClient, 'getRiskRegister').mockResolvedValue(register);
    render(RiskRegisterView, { onnavigate: navigate });
    expect(await screen.findByTestId('risk-review-r-004')).toHaveTextContent('Due in 14 days');
  });

  it('shows the register as of a day with the commit it read, and opens each entry as it was then', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { query: { 'as-of': '2026-03-01' }, onnavigate: navigate });
    const table = await screen.findByTestId('risk-table');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'The released risks at the end of Mar 1, 2026.',
    );
    expect(screen.getByTestId('risk-result')).toHaveTextContent('3f9a1c2');
    expect(screen.getByTestId('risk-earlier-commit')).toBeInTheDocument();
    expect(within(table).getByTestId('risk-link-r-004')).toHaveAttribute(
      'href',
      '/isms/risks/r-004?at=v1',
    );
    // A day in the past is only read: no review is flagged.
    expect(within(table).queryByTestId('risk-review-r-004')).toBeNull();
    expect(screen.getByTestId('risk-now')).toHaveAttribute('href', '/reports/risk-register');
    expect(screen.getByTestId<HTMLInputElement>('risk-asof').value).toBe('2026-03-01');
  });

  it('shows the register at a tag', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { query: { 'as-of': 'audit-2026-03' }, onnavigate: navigate });
    await screen.findByTestId('risk-table');
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent(
      'The released risks at the tag audit-2026-03, which marks Feb 27, 2026.',
    );
    expect(screen.queryByTestId('risk-earlier-commit')).toBeNull();
  });

  it('says that the register had no commit yet before its first', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { query: { 'as-of': '2025-06-01' }, onnavigate: navigate });
    expect(await screen.findByTestId('risk-before-first')).toBeInTheDocument();
    expect(screen.getByText('No released risk')).toBeInTheDocument();
    expect(screen.getByText(/held no released risk at the end of Jun 1, 2025/)).toBeInTheDocument();
  });

  it.each([
    ['2027-01-01', /This day has not come yet/],
    ['2026-13-45', /Use a day such as 2026-03-01/],
    ['no-such-tag', /No tag of the register has this name\./],
  ])('keeps %s in the field and says beside it what the server refused', async (value, text) => {
    await useProfile('workshop');
    render(RiskRegisterView, { query: { 'as-of': value }, onnavigate: navigate });
    expect(await screen.findByTestId('risk-refused')).toHaveTextContent(
      'Nothing is shown for this value',
    );
    expect(screen.getByText(text)).toBeInTheDocument();
    expect(screen.getByTestId<HTMLInputElement>('risk-asof').value).toBe(value);
    expect(screen.queryByTestId('risk-table')).toBeNull();
    // The tags of the register are still offered.
    expect(await screen.findByTestId('risk-tag')).toBeInTheDocument();
  });

  it('says that a past register cannot be built while the Git server is down', async () => {
    await useProfile('workshop#risk-register-git-unavailable');
    render(RiskRegisterView, { query: { 'as-of': '2026-03-01' }, onnavigate: navigate });
    expect(await screen.findByTestId('risk-git-unavailable')).toHaveTextContent(
      'cannot be read now',
    );
    expect(screen.getByTestId('risk-now')).toBeInTheDocument();
  });

  it('says that the register holds no released risk', async () => {
    await useProfile('workshop#risk-register-empty');
    render(RiskRegisterView, { onnavigate: navigate });
    expect(await screen.findByText('No released risk')).toBeInTheDocument();
    expect(screen.getByText('The register holds no released risk yet.')).toBeInTheDocument();
    expect(screen.queryByTestId('risk-tag')).toBeNull();
  });

  it('tells a person without the right that the register is not open to them', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getRiskRegister').mockRejectedValue(new ApiError('FORBIDDEN', 403));
    render(RiskRegisterView, { onnavigate: navigate });
    expect(await screen.findByTestId('risk-forbidden')).toBeInTheDocument();
  });

  it('names any other failure', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getRiskRegister').mockRejectedValue(new ApiError('NETWORK', 0));
    render(RiskRegisterView, { onnavigate: navigate });
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection');
  });

  it('opens the register as of the typed day', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { onnavigate: navigate });
    await screen.findByTestId('risk-table');
    await fireEvent.input(screen.getByTestId('risk-asof'), { target: { value: ' 2026-06-30 ' } });
    await fireEvent.click(screen.getByTestId('risk-show'));
    expect(navigate).toHaveBeenCalledWith('/reports/risk-register?as-of=2026-06-30');
  });

  it('opens the register as it is now for an empty field', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { query: { 'as-of': '2026-03-01' }, onnavigate: navigate });
    await screen.findByTestId('risk-table');
    await fireEvent.input(screen.getByTestId('risk-asof'), { target: { value: '' } });
    await fireEvent.click(screen.getByTestId('risk-show'));
    expect(navigate).toHaveBeenCalledWith('/reports/risk-register');
  });

  it('refuses a value of no valid form without asking the server', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { onnavigate: navigate });
    await screen.findByTestId('risk-table');
    await fireEvent.input(screen.getByTestId('risk-asof'), { target: { value: 'two words' } });
    await fireEvent.click(screen.getByTestId('risk-show'));
    expect(navigate).not.toHaveBeenCalled();
    expect(screen.getByText(/Use a day such as 2026-03-01/)).toBeInTheDocument();
  });

  it('fills the field from a tag of the register', async () => {
    await useProfile('workshop');
    render(RiskRegisterView, { onnavigate: navigate });
    await screen.findByTestId('risk-table');
    const tag = screen.getByTestId('risk-tag') as HTMLSelectElement;
    await fireEvent.change(tag, { target: { value: 'audit-2026-03' } });
    expect(screen.getByTestId<HTMLInputElement>('risk-asof').value).toBe('audit-2026-03');
    expect(
      within(tag).getByRole('option', { name: 'audit-2026-03, Feb 27, 2026' }),
    ).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('risk-show'));
    expect(navigate).toHaveBeenCalledWith('/reports/risk-register?as-of=audit-2026-03');
  });
});
