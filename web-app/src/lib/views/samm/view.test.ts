import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient, type EventListener } from '../../api/client';
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
});
