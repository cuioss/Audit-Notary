import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$app/navigation', () => ({
  beforeNavigate: () => {},
  afterNavigate: () => {},
  goto: vi.fn(),
}));

import { apiClient, type EventListener } from '../../api/client';
import { ApiError } from '../../api/errors';
import { clearModels } from '../../samm/store';
import { session } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { scenarioFetch } from '../../test/scenarioFetch';
import SammView from './SammView.svelte';

/**
 * The SAMM lens against the `web-mock` profiles (AUN-TEST-1).
 */
let listeners: EventListener[] = [];

/**
 * Stubs fetch with a profile, signs its user in and captures the listener of the event stream.
 *
 * @param profile `name` or `name#state`
 */
async function useProfile(profile: string): Promise<void> {
  vi.stubGlobal('fetch', scenarioFetch(profile).fetch);
  session.set(await apiClient.getSession());
  vi.spyOn(apiClient, 'subscribeEvents').mockImplementation((listener) => {
    listeners.push(listener);
    return () => {};
  });
}

beforeEach(() => {
  clearModels();
  listeners = [];
});

afterEach(() => {
  session.set(null);
  vi.unstubAllGlobals();
});

describe('SammView', () => {
  it('shows the scopes and their overview at /samm', async () => {
    await useProfile('workshop');
    render(SammView, { params: {} });
    expect(await screen.findByTestId('scope-list')).toBeInTheDocument();
    expect(screen.getByTestId('samm-overview')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([]);
  });

  it('shows a scope beside the scopes and names it in the breadcrumb', async () => {
    await useProfile('workshop');
    render(SammView, { params: { scope: 'payments' } });
    expect(await screen.findByTestId('scope-sheet')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([{ label: 'Payments', href: '/samm/payments' }]);
  });

  it('shows an assessment as its sheet', async () => {
    await useProfile('workshop');
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4' } });
    expect(await screen.findByTestId('assessment-sheet')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(get(breadcrumb).map((entry) => entry.label)).toEqual(['Payments', 'Payments 2026 Q4']),
    );
  });

  it('shows a practice and reads the assessment again when it was saved', async () => {
    await useProfile('workshop');
    const read = vi.spyOn(apiClient, 'getSammAssessment');
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4', practice: 'sm' } });
    expect(await screen.findByTestId('practice-sheet')).toBeInTheDocument();
    expect(get(breadcrumb).at(-1)).toEqual({
      label: 'Strategy and Metrics',
      href: '/samm/payments/2026-q4/sm',
    });
    expect(read).toHaveBeenCalledTimes(1);

    vi.stubGlobal('fetch', scenarioFetch('workshop#saved-by-other').fetch);
    for (const listener of listeners) {
      listener('document-saved', { repository: 'samm-assessments', id: 'other' });
      listener('document-saved', { repository: 'samm-assessments', id: 'payments-2026-q4' });
    }
    await vi.waitFor(() =>
      expect(screen.getAllByText('Jordan Weber just saved this practice.').length).toBeGreaterThan(
        0,
      ),
    );
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('moves along the chain when the address changes', async () => {
    await useProfile('workshop');
    const { rerender } = render(SammView, { params: { scope: 'payments' } });
    expect(await screen.findByTestId('scope-sheet')).toBeInTheDocument();
    await rerender({ params: { scope: 'identity' } });
    await vi.waitFor(() =>
      expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Identity'),
    );
    await rerender({ params: {} });
    expect(await screen.findByTestId('samm-overview')).toBeInTheDocument();
  });

  it('says when the scopes cannot be read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammScopes').mockRejectedValue(new Error('down'));
    render(SammView, { params: {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('says when a scope cannot be read', async () => {
    await useProfile('workshop');
    render(SammView, { params: { scope: 'nowhere' } });
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });

  it('says when the model or the assessment cannot be read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammModel').mockRejectedValue(new Error('down'));
    vi.spyOn(apiClient, 'getSammAssessment').mockRejectedValue(new Error('down'));
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
  });

  it('shows the whole chain as columns on a wide screen and reads again after a save', async () => {
    await useProfile('workshop');
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(2400);
    const read = vi.spyOn(apiClient, 'getSammAssessment');
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4', practice: 'sm' } });
    expect(await screen.findByTestId('assessment-list')).toBeInTheDocument();
    expect(await screen.findByTestId('practice-list')).toBeInTheDocument();
    await fireEvent.click(await screen.findByTestId('answer-sm-a-1-3'));
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it('empties the breadcrumb when it closes', async () => {
    await useProfile('workshop');
    const { unmount } = render(SammView, { params: { scope: 'payments' } });
    await screen.findByTestId('scope-sheet');
    unmount();
    expect(get(breadcrumb)).toEqual([]);
  });

  it('keeps the failure of the model while the assessment loads', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammModel').mockRejectedValue(new ApiError('NETWORK', 0));
    const read = vi.spyOn(apiClient, 'getSammAssessment');
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection to Audit Notary');
    // The assessment's own read succeeds after the model failed; the model's failure stays said.
    await vi.waitFor(() => expect(read).toHaveBeenCalled());
    await read.mock.results[0].value;
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(screen.getByRole('alert')).toHaveTextContent('No connection to Audit Notary');
  });

  it('reads a save that arrives during the first read, and drops an older answer', async () => {
    await useProfile('workshop');
    const original = apiClient.getSammAssessment.bind(apiClient);
    let releaseFirst: () => void = () => {};
    const reads: string[] = [];
    vi.spyOn(apiClient, 'getSammAssessment').mockImplementation(async (id) => {
      reads.push(id);
      if (reads.length === 1) {
        await new Promise<void>((resolve) => (releaseFirst = resolve));
        return { ...(await original(id)), title: 'Stale' };
      }
      return original(id);
    });
    render(SammView, { params: { scope: 'payments', assessment: '2026-q4' } });
    await vi.waitFor(() => expect(reads).toHaveLength(1));
    for (const listener of listeners) {
      listener('document-saved', {
        repository: 'samm-assessments',
        id: 'payments-2026-q4',
        fields: [],
      });
    }
    await vi.waitFor(() => expect(reads).toHaveLength(2));
    expect(await screen.findByTestId('assessment-sheet')).toBeInTheDocument();
    releaseFirst();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payments 2026 Q4');
  });

  it('opens the form of a new scope at /samm/new and names it in the breadcrumb', async () => {
    await useProfile('workshop');
    const onnavigate = vi.fn();
    render(SammView, { route: 'samm.new', params: {}, onnavigate });
    expect(await screen.findByTestId('new-scope-sheet')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([{ label: 'New scope', href: '/samm/new' }]);
  });

  it('creates the scope, reads the scopes again and moves to its address', async () => {
    await useProfile('workshop');
    const onnavigate = vi.fn();
    const scopes = vi.spyOn(apiClient, 'getSammScopes');
    render(SammView, { route: 'samm.new', params: {}, onnavigate });
    await screen.findByTestId('new-scope-sheet');
    await fireEvent.input(screen.getByTestId('new-scope-title'), { target: { value: 'Mobile' } });
    await fireEvent.click(screen.getByTestId('new-scope-kind-organisation'));
    await fireEvent.click(screen.getByTestId('create-scope'));
    await vi.waitFor(() =>
      expect(onnavigate).toHaveBeenCalledWith('/samm/mobile', { replace: true }),
    );
    expect(scopes).toHaveBeenCalledTimes(2);
  });

  it('opens the form of a new assessment at /samm/{scope}/new', async () => {
    await useProfile('workshop');
    render(SammView, { route: 'samm.assessment.new', params: { scope: 'shop' } });
    expect(await screen.findByTestId('new-assessment-sheet')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(get(breadcrumb).map((entry) => entry.label)).toEqual(['Web shop', 'New assessment']),
    );
  });

  it('offers no form to a reader and says why on the overview', async () => {
    await useProfile('read-only');
    render(SammView, { route: 'samm.new', params: {} });
    expect(await screen.findByTestId('new-scope-no-right')).toBeInTheDocument();
    expect(screen.queryByTestId('new-scope-link')).not.toBeInTheDocument();
  });

  it('reads the scopes again when one was created elsewhere, and the open scope with them', async () => {
    await useProfile('workshop');
    const scopes = vi.spyOn(apiClient, 'getSammScopes');
    const scope = vi.spyOn(apiClient, 'getSammScope');
    render(SammView, { params: { scope: 'payments' } });
    expect(await screen.findByTestId('scope-sheet')).toBeInTheDocument();
    for (const listener of listeners) {
      listener('document-created', { repository: 'samm-assessments', id: 'mobile', kind: 'scope' });
      listener('document-created', { repository: 'other', id: 'x', kind: 'scope' });
    }
    await vi.waitFor(() => expect(scopes).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(scope).toHaveBeenCalledTimes(2));
  });

  it('reads the scope again when its targets were saved elsewhere', async () => {
    await useProfile('workshop');
    const scope = vi.spyOn(apiClient, 'getSammScope');
    render(SammView, { params: { scope: 'payments' } });
    expect(await screen.findByTestId('scope-sheet')).toBeInTheDocument();
    for (const listener of listeners) {
      listener('document-saved', {
        repository: 'samm-assessments',
        id: 'payments',
        part: 'targets',
        fields: ['/ta'],
      });
    }
    await vi.waitFor(() => expect(scope).toHaveBeenCalledTimes(2));
  });

  it('says when the pinned models cannot be read', async () => {
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getSammModels').mockRejectedValue(new ApiError('NETWORK', 0));
    render(SammView, { params: {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection to Audit Notary');
  });

  it('keeps the scope when a read after a save fails', async () => {
    await useProfile('workshop');
    render(SammView, { params: { scope: 'payments' } });
    expect(await screen.findByTestId('scope-sheet')).toBeInTheDocument();
    vi.spyOn(apiClient, 'getSammScope').mockRejectedValue(new ApiError('NETWORK', 0));
    for (const listener of listeners) {
      listener('document-saved', { repository: 'samm-assessments', id: 'payments' });
    }
    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(screen.getByTestId('scope-sheet')).toBeInTheDocument();
  });
});
