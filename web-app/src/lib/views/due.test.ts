import { render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { DueItem } from '../api/types';
import { N2, N4, N5, resetKit, useProfile } from './documents/testkit';
import DueView from './DueView.svelte';

/**
 * The Due lens with the items of the document lifecycle (UC-DOC-8, UC-DOC-9) against the `workshop` profile: a release
 * request shows who asked and the comment, for the person who asked and for the approver, each entry opens the address it
 * names, and the list follows the events of a request and of a document that moved along its workflow.
 */
afterEach(resetKit);

/** @returns the entry of a document in the list */
function entryOf(title: string, lang: 'en' | 'de' = 'en'): HTMLElement {
  const name = lang === 'en' ? `Open ${title}` : `${title} öffnen`;
  return screen.getByRole('link', { name }).closest('li') as HTMLElement;
}

describe('the items of the generic documents lens', () => {
  it('shows the review of an approver and the request that came with it', async () => {
    await useProfile('workshop');
    render(DueView);
    await screen.findByTestId('due-list');
    const review = entryOf('Supplier security questionnaire');
    expect(review).toHaveAttribute('data-kind', 'review');
    expect(review).toHaveAttribute('data-lens', 'categories');
    expect(within(review).getByRole('link')).toHaveAttribute(
      'href',
      `/categories/test-note/${N4}/release`,
    );
    expect(review).toHaveTextContent('Review in Documents');
    // No request: the entry says nothing about one.
    expect(within(review).queryByTestId('due-request')).toBeNull();
    const requested = entryOf('Access review cadence');
    expect(within(requested).getByRole('link')).toHaveAttribute(
      'href',
      `/categories/test-note/${N5}/release`,
    );
    expect(within(requested).getByTestId('due-request')).toHaveTextContent(
      'Jordan Weber asked for the release.',
    );
    expect(within(requested).getByTestId('due-request')).toHaveTextContent(
      'Reviewed with the team; ready to release.',
    );
  });

  it('shows the own request of the person as theirs, and opens the document it names', async () => {
    await useProfile('workshop');
    render(DueView);
    await screen.findByTestId('due-list');
    const own = entryOf('Retention schedule for audit evidence');
    expect(own).toHaveAttribute('data-kind', 'release');
    // The document is still in its first state: the person submits it there.
    expect(within(own).getByRole('link')).toHaveAttribute('href', `/categories/test-note/${N2}`);
    expect(within(own).getByTestId('due-request')).toHaveTextContent('You asked for the release.');
    expect(within(own).getByTestId('due-request')).toHaveTextContent(
      'Written from the interview notes; please submit it and release it.',
    );
  });

  it('is read in German', async () => {
    await useProfile('workshop', 'de');
    render(DueView);
    await screen.findByTestId('due-list');
    expect(entryOf('Access review cadence', 'de')).toHaveTextContent(
      'Jordan Weber hat um die Freigabe gebeten.',
    );
    expect(entryOf('Retention schedule for audit evidence', 'de')).toHaveTextContent(
      'Sie haben um die Freigabe gebeten.',
    );
  });

  it('shows a request with an empty comment, and no request on an item that has none', async () => {
    const items: DueItem[] = [
      {
        kind: 'release',
        lens: 'categories',
        title: 'Threat model review',
        address: `/categories/test-note/${N4}/release`,
        due: '2026-12-01',
        requestId: 'rr-1',
        requestedBy: { pseudonym: 'p-9', name: 'Pat Agent' },
        requestedAt: '2026-11-26T08:00:00Z',
        comment: '',
      },
      {
        kind: 'review',
        lens: 'samm',
        title: 'Payments 2026 Q4',
        address: '/samm/payments/2026-q4/release',
        due: '2026-12-02',
      },
    ];
    await useProfile('workshop');
    vi.spyOn(apiClient, 'getDue').mockResolvedValue({ items });
    render(DueView);
    await screen.findByTestId('due-list');
    expect(within(entryOf('Threat model review')).getByTestId('due-request')).toHaveTextContent(
      'Pat Agent asked for the release.',
    );
    expect(within(entryOf('Payments 2026 Q4')).queryByTestId('due-request')).toBeNull();
  });
});

describe('the events', () => {
  it('reads the list again when a release was requested or a document moved along its workflow', async () => {
    const kit = await useProfile('workshop');
    render(DueView);
    await screen.findByTestId('due-list');
    const reads = () => kit.requests.filter((request) => request === 'GET /api/v1/due').length;
    expect(reads()).toBe(1);
    kit.emit('release-requested', { repository: 'test-notes', id: N4, requestId: 'rr-9' });
    await vi.waitFor(() => expect(reads()).toBe(2));
    kit.emit('document-transitioned', { repository: 'test-notes', id: N4 });
    await vi.waitFor(() => expect(reads()).toBe(3));
    kit.emit('document-saved', { repository: 'test-notes', id: N4, fields: [] });
    expect(reads()).toBe(3);
  });

  it('drops the request once the release is made', async () => {
    const kit = await useProfile('workshop#note-release-request-done');
    render(DueView);
    await screen.findByTestId('due-list');
    expect(screen.queryByRole('link', { name: 'Open Access review cadence' })).toBeNull();
    expect(kit.scenario.state()).toBe('note-release-request-done');
  });

  it('keeps the list when a read after an event fails, and stops listening when it is left', async () => {
    const kit = await useProfile('workshop');
    const view = render(DueView);
    await screen.findByTestId('due-list');
    vi.spyOn(apiClient, 'getDue').mockRejectedValueOnce(new Error('network'));
    kit.emit('release-requested', { repository: 'test-notes', id: N4, requestId: 'rr-9' });
    await vi.waitFor(() => expect(apiClient.getDue).toHaveBeenCalled());
    expect(screen.getByTestId('due-list')).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
    view.unmount();
  });
});
