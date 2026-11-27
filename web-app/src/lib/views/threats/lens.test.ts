import { render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import ThreatModelsView from './ThreatModelsView.svelte';

/**
 * The lens Threat models against the profiles of the mock (AUN-TEST-1): the evaluation as the first column, a service
 * with its models, the sheet of a model, an earlier state, and the states of a person without the right to edit or to read.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(resetKit);

const CHECKOUT = { service: 'payment-api', model: 'checkout-flow' };

/**
 * @param profile `name` or `name#state`
 * @param route the route id
 * @param params the values of the address
 * @param query the admitted query
 * @param lang the language
 * @returns the kit and the navigation spy
 */
async function open(
  profile: string,
  route: string,
  params: Record<string, string> = {},
  query: Record<string, string> = {},
  lang: 'en' | 'de' = 'en',
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang);
  const onnavigate = vi.fn();
  render(ThreatModelsView, { route, params, query, onnavigate });
  return { ...kit, onnavigate };
}

/** Opens the sheet of the checkout flow and waits for it. */
async function openSheet(profile = 'workshop', query: Record<string, string> = {}) {
  const kit = await open(profile, 'threat-models.model', CHECKOUT, query);
  await screen.findByTestId('threat-model-sheet');
  return kit;
}

describe('the evaluation, the first column', () => {
  it('lists every threat model of the services and the services without one', async () => {
    await open('workshop', 'threat-models');
    const table = await screen.findByTestId('threat-evaluation-table');
    expect(within(table).getAllByRole('row')).toHaveLength(7);
    expect(screen.getByTestId('threat-row-payment-api-checkout-flow')).toHaveTextContent(
      'Payment API',
    );
    expect(screen.getByTestId('threat-evaluation-without')).toHaveTextContent('Report scheduler');
    // The lens draws the table as served: the order is the server's, there is nothing to choose.
    expect(screen.queryByTestId('threat-evaluation-sort')).toBeNull();
  });

  it('offers a service without a model the act New threat model, which leads to the wizard', async () => {
    await open('workshop', 'threat-models');
    const link = await screen.findByTestId('threat-new-report-scheduler');
    expect(link).toHaveTextContent('New threat model');
    expect(link).toHaveAccessibleName('New threat model for Report scheduler');
    expect(link).toHaveAttribute('href', '/threat-models/report-scheduler/new');
  });

  it('leaves the act out for a person who may only read', async () => {
    await open('read-only', 'threat-models');
    await screen.findByTestId('threat-evaluation-without');
    expect(screen.queryByTestId('threat-new-report-scheduler')).toBeNull();
  });

  it('tells a person without the right to read the threat models, in place of the table', async () => {
    await open('release', 'threat-models');
    expect(await screen.findByTestId('threat-forbidden')).toHaveTextContent(
      'The threat models are not open to you',
    );
    expect(screen.queryByTestId('threat-evaluation-table')).toBeNull();
  });

  it('lists the services of an installation without a threat model as services that have none', async () => {
    await open('workshop#no-threat-models', 'threat-models');
    expect(await screen.findByTestId('threat-evaluation-none')).toHaveTextContent(
      'No service has a threat model yet.',
    );
  });

  it('says that an installation without services has none', async () => {
    await open('empty', 'threat-models');
    expect(await screen.findByText('No service in the catalog')).toBeInTheDocument();
  });
});

describe('a service', () => {
  it('lists its models with their state, their review and their threats', async () => {
    await open('workshop', 'threat-models.service', { service: 'payment-api' });
    const row = await screen.findByTestId('model-checkout-flow');
    expect(row).toHaveAttribute('href', '/threat-models/payment-api/checkout-flow');
    expect(row).toHaveTextContent('Payment API, checkout flow');
    expect(row).toHaveTextContent('Released as v3');
    expect(row).toHaveTextContent('Due in 5 days');
    expect(row).toHaveTextContent('3 open threats, 2 untreated');
    expect(screen.getByTestId('new-threat-model-link')).toHaveAttribute(
      'href',
      '/threat-models/payment-api/new',
    );
  });

  it('says that a service without a model has none and offers the first one', async () => {
    await open('workshop', 'threat-models.service', { service: 'report-scheduler' });
    expect(await screen.findByTestId('service-no-models')).toBeInTheDocument();
    expect(screen.getByTestId('new-threat-model-link')).toBeInTheDocument();
  });

  it('offers the recipe the person started again', async () => {
    await open('workshop#recipe-draft-saved', 'threat-models.service', {
      service: 'report-scheduler',
    });
    const link = await screen.findByTestId('continue-quick-start');
    expect(link).toHaveAttribute('href', '/threat-models/report-scheduler/new?recipe=quick-start');
  });

  it('gives a retired service no new model', async () => {
    await open('workshop', 'threat-models.service', { service: 'ledger' });
    expect(await screen.findByTestId('service-retired')).toBeInTheDocument();
    expect(screen.queryByTestId('new-threat-model-link')).toBeNull();
  });

  it('is the not-found view for a service that is in no catalog', async () => {
    await open('workshop', 'threat-models.service', { service: 'nowhere' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('leads the new address to a placeholder that breaks nothing', async () => {
    await open(
      'workshop',
      'threat-models.new',
      { service: 'report-scheduler' },
      { recipe: 'stride' },
    );
    const sheet = await screen.findByTestId('new-threat-model-sheet');
    await waitFor(() =>
      expect(sheet).toHaveTextContent('A threat model of Report scheduler, step by step.'),
    );
    expect(screen.getByText('Not built yet')).toBeInTheDocument();
  });
});

describe('the sheet of a model', () => {
  it('shows the record: the head, the review, the diagram, the threats and the countermeasures', async () => {
    await openSheet();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Payment API, checkout flow',
    );
    expect(screen.getByTestId('document-state')).toHaveTextContent('Released as v3');
    const facts = screen.getByTestId('threat-model-sheet');
    expect(facts).toHaveTextContent('Payment API');
    expect(screen.getByTestId('review-section')).toHaveTextContent('Jun 1, 2026');
    expect(screen.getByTestId('review-section')).toHaveTextContent('178 days ago');
    expect(screen.getByTestId('review-status')).toHaveTextContent('Due in 5 days');
    expect(screen.getByTestId('review-section')).toHaveTextContent('Every 6 months');
    expect(screen.getByTestId('threat-counts')).toHaveTextContent(
      '9 threats: 3 open, 2 untreated, 1 transferred.',
    );
    expect(within(screen.getByTestId('threats-table')).getAllByRole('row')).toHaveLength(10);
    expect(
      within(screen.getByTestId('mitigations-table')).getAllByRole('row').length,
    ).toBeGreaterThan(1);
  });

  it('draws the diagram as an image with the names of the components as its text', async () => {
    await openSheet();
    const image = screen.getByTestId('diagram-image');
    expect(image.getAttribute('src')).toMatch(/^data:image\/svg\+xml;base64,/);
    expect(image).toHaveAccessibleName(/Customer browser, Payment API/);
    expect(image.tagName).toBe('IMG');
  });

  it('shows a threat that was carried into the risk register as a link, written by no one here', async () => {
    await openSheet();
    const note = screen.getByTestId('threat-transferred-T-07');
    expect(note).toHaveTextContent('Transferred to risk R-009');
    expect(within(note).getByRole('link')).toHaveAttribute('href', '/isms/risks/r-009');
  });

  it('marks the open threat that nothing treats and counts the countermeasures of the others', async () => {
    await openSheet();
    expect(screen.getByTestId('threat-untreated-T-01')).toHaveTextContent('Untreated');
    expect(screen.getByTestId('threat-untreated-T-02')).toBeInTheDocument();
    // T-03 is open with a countermeasure; T-07 is transferred.
    expect(screen.queryByTestId('threat-untreated-T-03')).toBeNull();
    expect(screen.queryByTestId('threat-untreated-T-07')).toBeNull();
  });

  it('names the release in the margin, with its tag, and lists the earlier states', async () => {
    await openSheet();
    expect(screen.getByTestId('release-block')).toHaveTextContent('Released by Noor Haddad');
    expect(screen.getByTestId('release-block')).toHaveTextContent(
      'models/payment-api-checkout-flow/v3',
    );
    expect(await screen.findByTestId('revision-select')).toBeInTheDocument();
  });

  it('says what the next save does, for a model that is released and not frozen', async () => {
    await openSheet();
    expect(screen.getByTestId('released-notice')).toHaveTextContent('Released as v3');
    expect(screen.getByTestId('released-notice')).toHaveTextContent(
      'Your next save starts version 4.',
    );
  });

  it('is the not-found view for a model that does not exist', async () => {
    await open('workshop', 'threat-models.model', { service: 'payment-api', model: 'nowhere' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('reads an earlier state as it was, with no act and a way back', async () => {
    await openSheet('workshop', { at: 'v1' });
    expect(screen.getByTestId('revision-notice')).toHaveTextContent(
      'You are reading an earlier state',
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'An earlier state can be read only.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(screen.queryByTestId('start-review')).toBeNull();
    expect(screen.queryByTestId('transition-bar')).toBeNull();
    // v1 held five threats, all open.
    expect(within(screen.getByTestId('threats-table')).getAllByRole('row')).toHaveLength(6);
    expect(screen.queryByTestId('threat-status-T-01')).toHaveTextContent('Open');
  });

  it('is the not-found view for an earlier state that does not exist, and for one that is no revision', async () => {
    await open('workshop', 'threat-models.model', CHECKOUT, { at: 'v9' });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('leaves the not-found view when the address goes back to a state that exists', async () => {
    await useProfile('workshop', 'en');
    const { rerender } = render(ThreatModelsView, {
      route: 'threat-models.model',
      params: CHECKOUT,
      query: { at: 'v9' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    await rerender({
      route: 'threat-models.model',
      params: CHECKOUT,
      query: {},
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('threat-model-sheet')).toBeInTheDocument();
    expect(screen.queryByTestId('not-found-view')).toBeNull();
  });

  it('reads as a document that may only be read for a person without the edit right', async () => {
    await openSheet('read-only');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'You can read this document. Editing needs the edit right.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(screen.queryByTestId('start-review')).toBeNull();
    expect(screen.queryByTestId('threats-add')).toBeNull();
    // The statuses are words, not controls.
    expect(screen.getByTestId('threat-status-T-01')).toHaveTextContent('Open');
    expect(screen.getByTestId('threat-status-T-01').tagName).not.toBe('SELECT');
  });

  it('shows the breadcrumb of the chain and clears it when the view goes', async () => {
    const { onnavigate } = await open('workshop', 'threat-models.model', CHECKOUT);
    await screen.findByTestId('threat-model-sheet');
    expect(onnavigate).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId('threat-models-view')).toBeInTheDocument());
  });
});
