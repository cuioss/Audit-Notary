import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { DRAFT_DELAY_MS } from '../../documents/controller.svelte';
import { resetKit, useProfile, type Kit } from '../documents/testkit';
import ThreatModelsView from './ThreatModelsView.svelte';

/**
 * Editing a threat model against the states of the profile `workshop` (AUN-TEST-1): the review, the threats, the
 * countermeasures, the save of both parts, every refusal with its place, the steps of the workflow and the live refresh.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(resetKit);

const DOCUMENT = 'payment-api-checkout-flow';
const SAVE = `POST /api/v1/documents/threat-models/${DOCUMENT}/save`;

/**
 * @param profile `name` or `name#state`
 * @param lang the language
 * @returns the kit with the sheet of the checkout flow open
 */
async function open(profile = 'workshop', lang: 'en' | 'de' = 'en'): Promise<Kit> {
  const kit = await useProfile(profile, lang);
  render(ThreatModelsView, {
    route: 'threat-models.model',
    params: { service: 'payment-api', model: 'checkout-flow' },
    query: {},
    onnavigate: vi.fn(),
  });
  await screen.findByTestId('threat-model-sheet');
  return kit;
}

/** @returns the body of the save the page sent, `null` for none */
function saved(kit: Kit): {
  parts: Record<string, { blob: string; fields: Record<string, unknown> }>;
} | null {
  const found = kit.bodies.find((entry) => entry.request === SAVE);
  return (found?.body as ReturnType<typeof saved>) ?? null;
}

async function choose(testId: string, value: string) {
  await fireEvent.change(screen.getByTestId(testId), { target: { value } });
}

async function type(testId: string, value: string) {
  await fireEvent.input(screen.getByTestId(testId), { target: { value } });
}

type Entry = { id: string; attributes: Record<string, unknown> };
const listOf = (body: ReturnType<typeof saved>, pointer: string) =>
  body?.parts.model.fields[pointer] as unknown as Entry[];

describe('the status of a threat', () => {
  it('changes in its row, keeps the draft for the person, and saves the whole list for everyone', async () => {
    const kit = await open();
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await choose('threat-status-T-01', 'accepted');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Keeping it for you…');
    // An accepted threat is no longer untreated.
    await vi.advanceTimersByTimeAsync(DRAFT_DELAY_MS + 50);
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'draft'),
    );
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveTextContent(/Saved for everyone at/),
    );
    const body = saved(kit);
    expect(Object.keys(body?.parts ?? {})).toEqual(['model']);
    expect(body?.parts.model.blob).toBeTruthy();
    const threats = listOf(body, '/threats');
    expect(threats).toHaveLength(9);
    expect(threats.find((entry) => entry.id === 'T-01')?.attributes.status).toBe('accepted');
    // The transfer is written by no one here, yet the list keeps it as read.
    expect(threats.find((entry) => entry.id === 'T-07')?.attributes.transferred).toBe(
      'isms-register:risk/R-009',
    );
  });

  it('starts the next version with the first save and says so', async () => {
    await open();
    await choose('threat-status-T-01', 'mitigated');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const notice = await screen.findByTestId('reopened-notice');
    expect(notice).toHaveTextContent('Version 4 has begun');
    // The sheet reads the model again: it is the next version, in the first state of the workflow.
    await vi.waitFor(() => expect(screen.getByTestId('document-state')).toHaveTextContent('Draft'));
  });
});

describe('the review', () => {
  it('starts with today, shows when the next review would be due, and saves the data part', async () => {
    const kit = await open();
    const act = screen.getByTestId('start-review');
    expect(act).toHaveTextContent('Start the review');
    expect(screen.queryByTestId('review-next-due')).toBeNull();
    await fireEvent.click(act);
    expect(screen.getByTestId('review-next-due')).toHaveTextContent(
      'the next review is due on May 26, 2027',
    );
    // Today is the review date: the act says why it is spent.
    expect(screen.getByTestId('start-review')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('The review date is already today.')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(saved(kit)).not.toBeNull());
    const body = saved(kit);
    expect(Object.keys(body?.parts ?? {})).toEqual(['data']);
    expect(body?.parts.data.fields).toEqual({ '/last-review': '2026-11-26' });
    expect(body?.parts.data.blob).toBeTruthy();
  });

  it('shows the review of a model that was never released as not yet reviewed', async () => {
    await useProfile('workshop');
    render(ThreatModelsView, {
      route: 'threat-models.model',
      params: { service: 'notification-service', model: 'notification-flows' },
      query: {},
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('threat-model-sheet');
    expect(screen.getByTestId('review-status')).toHaveTextContent('Not released yet');
    expect(screen.getByTestId('review-facts')).toHaveTextContent('No review yet');
    expect(screen.queryByTestId('released-notice')).toBeNull();
  });
});

describe('the threats', () => {
  it('adds a threat with the next id and saves it in the whole list', async () => {
    const kit = await open();
    const table = screen.getByTestId('threats-table');
    await fireEvent.click(within(table).getByRole('button', { name: 'Add a threat' }));
    // Nothing invalid is kept: the dialog says what is wrong and applies nothing.
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(screen.getAllByText('Fill in this field.').length).toBeGreaterThan(0);
    expect(within(table).getAllByRole('row')).toHaveLength(10);
    await type('threats-field-name', 'Logs are kept too long');
    await type('threats-field-description', 'Old logs hold card numbers.');
    await fireEvent.click(screen.getByTestId('threats-category-information-disclosure'));
    await type('threats-field-likelihood', '40');
    await type('threats-field-impact', '101');
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(screen.getAllByText('Enter a whole number from 0 to 100.').length).toBeGreaterThan(0);
    await type('threats-field-impact', '80');
    await fireEvent.click(screen.getByTestId('threats-apply'));
    expect(within(table).getAllByRole('row')).toHaveLength(11);
    expect(screen.getByTestId('threat-T-10')).toHaveTextContent('Logs are kept too long');
    expect(screen.getByTestId('threat-untreated-T-10')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(saved(kit)).not.toBeNull());
    const added = listOf(saved(kit), '/threats').at(-1);
    expect(added).toEqual({
      id: 'T-10',
      name: 'Logs are kept too long',
      description: 'Old logs hold card numbers.',
      categories: ['Information Disclosure'],
      risk: { likelihood: 40, impact: 80 },
      attributes: { status: 'open' },
    });
  });

  it('changes a threat in a dialog over a copy, so that giving up changes nothing', async () => {
    await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit T-01' }));
    await type('threats-field-name', 'Something else');
    await fireEvent.click(screen.getByTestId('threats-cancel'));
    expect(screen.getByTestId('threat-T-01')).toHaveTextContent(
      'Tampering with the amount in the checkout request',
    );
    expect(screen.getByTestId('save-state')).not.toHaveAttribute('data-state', 'changed');
  });

  it('asks before it removes a threat and takes its countermeasures with it', async () => {
    const kit = await open();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove T-03' }));
    expect(
      screen.getByText(/T-03, Card data in the application log, leaves this model/),
    ).toBeInTheDocument();
    expect(screen.getByTestId('threats-remove-treatments')).toHaveTextContent(
      'Its countermeasure goes with it.',
    );
    await fireEvent.click(screen.getByTestId('threats-remove-cancel'));
    expect(within(screen.getByTestId('threats-table')).getAllByRole('row')).toHaveLength(10);
    await fireEvent.click(screen.getByRole('button', { name: 'Remove T-03' }));
    await fireEvent.click(screen.getByTestId('threats-remove-confirm'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(saved(kit)).not.toBeNull());
    const body = saved(kit);
    expect(listOf(body, '/threats').map((entry) => entry.id)).not.toContain('T-03');
    // Both lists go in one save: the file never holds a countermeasure of a threat that is gone.
    expect(listOf(body, '/mitigations').map((entry) => entry.attributes.threat)).not.toContain(
      'T-03',
    );
  });
});

describe('the countermeasures', () => {
  it('adds one to a threat with its issue ids and saves the whole list', async () => {
    const kit = await open();
    const table = screen.getByTestId('mitigations-table');
    await fireEvent.click(within(table).getByRole('button', { name: 'Add a countermeasure' }));
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    expect(screen.getAllByText('Fill in this field.').length).toBeGreaterThan(0);
    await type('mitigations-field-name', 'Rate limit the login');
    await choose('mitigations-field-threat', 'T-02');
    await choose('mitigations-field-status', 'planned');
    await type('mitigations-field-reduction', '60');
    await type('mitigations-field-issues', 'PAY-1500, PAY-1501 PAY-1500');
    await fireEvent.click(screen.getByTestId('mitigations-apply'));
    // T-02 is treated now.
    expect(screen.queryByTestId('threat-untreated-T-02')).toBeNull();
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(saved(kit)).not.toBeNull());
    const added = listOf(saved(kit), '/mitigations').at(-1);
    expect(added).toMatchObject({
      name: 'Rate limit the login',
      riskReduction: 60,
      attributes: { threat: 'T-02', status: 'planned', issues: ['PAY-1500', 'PAY-1501'] },
    });
    expect(added?.id).toMatch(/^M-\d{2}$/);
  });

  it('shows a countermeasure with its threat, its status and its issues', async () => {
    await open();
    const entry = screen.getByTestId('mitigation-M-03');
    expect(entry).toHaveTextContent('Mask card numbers before logging');
    const row = entry.closest('tr') as HTMLElement;
    expect(row).toHaveTextContent('T-03');
    expect(row).toHaveTextContent('Planned');
    expect(row).toHaveTextContent('PAY-1423');
  });

  it('is offered only where there is a threat to treat', async () => {
    await useProfile('workshop');
    render(ThreatModelsView, {
      route: 'threat-models.model',
      params: { service: 'payment-api', model: 'checkout-flow' },
      query: {},
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('threat-model-sheet');
    expect(
      within(screen.getByTestId('mitigations-table')).getByRole('button', {
        name: 'Add a countermeasure',
      }),
    ).not.toHaveAttribute('aria-disabled', 'true');
  });
});

describe('the refusals', () => {
  it('decides a conflict per list, with the two lists named by their threats', async () => {
    await open('workshop#threat-model-saved-by-other');
    await choose('threat-status-T-02', 'accepted');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    const conflict = await screen.findByTestId('conflict-/threats');
    expect(conflict).toHaveTextContent('Threats');
    expect(conflict).toHaveTextContent('Jordan Weber');
    expect(conflict).toHaveTextContent(/T-01: .* \(Open\)/);
    expect(screen.getByTestId('save-state')).toHaveTextContent(/changed by someone else/);
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(screen.getByTestId('keep-own-/threats'));
    expect(screen.queryByTestId('conflict-panel')).toBeNull();
    expect(screen.getByTestId('save-everyone')).not.toHaveAttribute('aria-disabled', 'true');
  });

  it('shows the refusal where it belongs: at the row, at the field of the data, and says what it is', async () => {
    await open('workshop#threat-model-invalid');
    await choose('threat-status-T-01', 'accepted');
    await fireEvent.click(screen.getByTestId('start-review'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('threats-errors')).toHaveTextContent(
      'Row 1: This number is too large.',
    );
    expect(screen.getByTestId('mitigations-errors')).toHaveTextContent(
      'Row 1: This reference leads nowhere.',
    );
    await vi.waitFor(() =>
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed'),
    );
    expect(screen.getByTestId('failure-notice')).toBeInTheDocument();
    // The changes stay in the page.
    expect(screen.getByTestId('threat-status-T-01')).toHaveValue('accepted');
  });

  it('keeps the changes and says that the Git server cannot be reached', async () => {
    await open('workshop#threat-model-git-unavailable');
    await choose('threat-status-T-01', 'accepted');
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(/Git server/);
    expect(screen.getByTestId('threat-status-T-01')).toHaveValue('accepted');
  });
});

describe('the steps of the workflow', () => {
  it('submits for review after the changes were saved, and offers the release on the page of its own', async () => {
    const kit = await open('workshop#threat-model-reopened');
    expect(await screen.findByTestId('transition-bar')).toBeInTheDocument();
    const submit = screen.getByTestId('transition-threat-model.submit');
    expect(submit).toHaveTextContent('Submit for review');
    await choose('threat-status-T-01', 'accepted');
    await fireEvent.click(submit);
    // A step acts on the saved document: the sheet offers to save first.
    expect(screen.getByTestId('save-first')).toHaveTextContent(
      'Save for everyone, then Submit for review',
    );
    expect(kit.requests.filter((request) => request.includes('/transitions/'))).toHaveLength(0);
    await fireEvent.click(screen.getByTestId('save-first'));
    await vi.waitFor(() =>
      expect(
        kit.requests.some((request) => request.includes('/transitions/threat-model.submit')),
      ).toBe(true),
    );
  });

  it('leads an in-review model to the release, whose act reads Release', async () => {
    await open('workshop#threat-model-in-review');
    const release = await screen.findByTestId('transition-threat-model.release');
    expect(release).toHaveTextContent('Release');
    expect(release).toHaveAttribute('href', '/threat-models/payment-api/checkout-flow/release');
    expect(screen.getByTestId('document-state')).toHaveTextContent('In review');
    expect(screen.getByTestId('step-up-note')).toHaveTextContent(
      'You confirm your identity once more before the release.',
    );
  });

  it('lists the empty mandatory fields a refused submit names, each as a way to the field', async () => {
    await open('workshop#threat-model-submit-incomplete');
    await fireEvent.click(await screen.findByTestId('transition-threat-model.submit'));
    const list = await screen.findByTestId('missing-fields');
    expect(list).toHaveTextContent('Name');
    await fireEvent.click(within(list).getByRole('button'));
    expect(document.activeElement).toBe(
      within(screen.getByTestId('model-form')).getByRole('textbox', { name: /^Name(?! in)/ }),
    );
  });
});

describe('the live refresh', () => {
  it('reads the model again when the stream names a save of it, and refreshes what was not edited', async () => {
    const kit = await open();
    const before = kit.requests.filter((request) =>
      request.startsWith('GET /api/v1/threat-models/payment-api/checkout-flow'),
    ).length;
    kit.emit('document-saved', { repository: 'threat-models', id: DOCUMENT, fields: ['/threats'] });
    await vi.waitFor(() =>
      expect(
        kit.requests.filter((request) =>
          request.startsWith('GET /api/v1/threat-models/payment-api/checkout-flow'),
        ).length,
      ).toBeGreaterThan(before),
    );
  });

  it('reads the evaluation and the service again when the stream names a step of any model', async () => {
    const kit = await open();
    const reads = () =>
      kit.requests.filter((request) => request === 'GET /api/v1/reports/threat-evaluation').length;
    const before = reads();
    kit.emit('document-transitioned', {
      repository: 'threat-models',
      id: DOCUMENT,
      state: 'in-review',
    });
    await vi.waitFor(() => expect(reads()).toBeGreaterThan(before));
  });

  it('ignores a save of another repository', async () => {
    const kit = await open();
    const before = kit.requests.length;
    kit.emit('document-saved', { repository: 'samm-assessments', id: 'x', fields: [] });
    await vi.advanceTimersByTimeAsync(100);
    expect(kit.requests.length).toBe(before);
  });
});

describe('German', () => {
  it('words the sheet in German, the labels of the form and the names of the kinds of threat included', async () => {
    await open('workshop', 'de');
    expect(screen.getByTestId('review-section')).toHaveTextContent('Überprüfung');
    expect(screen.getByTestId('threats-section')).toHaveTextContent('Bedrohungen');
    expect(screen.getByTestId('threat-T-01')).toHaveTextContent('Manipulation');
    expect(screen.getByTestId('document-state')).toHaveTextContent('Freigegeben als v3');
    expect(screen.getByLabelText(/^Überprüfungsdatum/)).toBeInTheDocument();
  });
});

// Keep the client import used: the sheet never calls a method of its own for a save, the controller does.
void apiClient;
