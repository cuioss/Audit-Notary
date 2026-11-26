import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { breadcrumb } from '../../stores/breadcrumb';
import { resetKit, useProfile } from '../documents/testkit';
import CatalogsView, { resetFirstVisit } from './CatalogsView.svelte';

/**
 * The Catalogs lens against the `workshop`, `read-only`, `catalog-admin` and `empty` profiles of the scenario mock
 * (AUN-TEST-1): the five catalogs, the entries of one with their marks and filter, the action *New* with and without the
 * right, an address that is no address of the lens, and a list that follows the event stream.
 */
afterEach(resetKit);
beforeEach(() => {
  // The first visit of the page session opens the first catalog; the other tests look at the lists themselves.
  resetFirstVisit();
});

const CATALOG = (catalog: string) => ({ route: 'catalogs.catalog', params: { catalog } });

describe('the catalogs', () => {
  it('opens the first catalog at the first visit, in place of the address', async () => {
    await useProfile('catalog-admin');
    const onnavigate = vi.fn();
    render(CatalogsView, { route: 'catalogs', params: {}, onnavigate });
    expect(onnavigate).toHaveBeenCalledWith('/catalogs/team', { replace: true });
  });

  it('lists the five catalogs in their order once the lens was visited, without a request', async () => {
    const kit = await useProfile('catalog-admin');
    const first = render(CatalogsView, { ...CATALOG('team'), onnavigate: vi.fn() });
    await screen.findByTestId('entry-list');
    first.unmount();
    const before = kit.requests.length;
    const view = render(CatalogsView, { route: 'catalogs', params: {}, onnavigate: vi.fn() });
    const list = await screen.findByTestId('catalog-list');
    expect(
      within(list)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual([
      '/catalogs/team',
      '/catalogs/role',
      '/catalogs/service',
      '/catalogs/system',
      '/catalogs/external',
    ]);
    expect(screen.getByTestId('catalog-service')).toHaveTextContent('Services');
    expect(screen.getByTestId('catalog-external')).toHaveTextContent('External parties');
    expect(kit.requests.slice(before)).toEqual([]);
    view.unmount();
  });

  it('keeps the list of the catalogs beside the entries and marks the catalog that is open', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    expect(await screen.findByTestId('entry-list')).toBeInTheDocument();
    expect(screen.getByTestId('catalog-service')).toHaveAttribute('aria-current', 'page');
    expect(screen.getByTestId('catalog-team')).not.toHaveAttribute('aria-current');
  });

  it('shows the not-found view for an address that names no catalog', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('nothing'), onnavigate: vi.fn() });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([]);
  });
});

describe('the entries of a catalog', () => {
  it('lists every entry with its name and id, and marks the retired ones with a dot', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    const list = await screen.findByTestId('entry-list');
    expect(list.querySelectorAll('li')).toHaveLength(8);
    const row = screen.getByTestId('entry-payment-api');
    expect(row).toHaveTextContent('Payment API');
    expect(row).toHaveTextContent('payment-api');
    expect(row).toHaveAttribute('href', '/catalogs/service/payment-api');
    expect(screen.getByTestId('entry-ledger')).toHaveTextContent('Retired');
    expect(row).not.toHaveTextContent('Retired');
    expect(screen.getByText('8 entries')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([{ label: 'Services', href: '/catalogs/service' }]);
  });

  it('filters by name or id, and says when nothing matches', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    const list = await screen.findByTestId('entry-list');
    await fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: 'REPORT' } });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    await fireEvent.input(screen.getByLabelText('Filter by name'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No entry matches')).toBeInTheDocument();
  });

  it('offers New as a link with the right to administer the catalogs', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('team'), onnavigate: vi.fn() });
    const act = await screen.findByTestId('new-entry');
    expect(act).toHaveTextContent('New Team');
    expect(act).toHaveAttribute('href', '/catalogs/team/new');
  });

  it.each(['workshop', 'read-only'])(
    'offers New as an act that says why not, in %s',
    async (profile) => {
      await useProfile(profile);
      render(CatalogsView, { ...CATALOG('team'), onnavigate: vi.fn() });
      const act = await screen.findByTestId('new-entry');
      expect(act.tagName).toBe('BUTTON');
      expect(act).toHaveAttribute('aria-disabled', 'true');
      expect(
        screen.getByText('Changing the catalogs needs the right to administer them.'),
      ).toBeInTheDocument();
      expect(await screen.findByTestId('entry-list')).toBeInTheDocument();
    },
  );

  it('says that a catalog is empty, and invites the first entry only to a person who may add it', async () => {
    await useProfile('empty');
    const admin = render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    expect(await screen.findByText('No entries yet')).toBeInTheDocument();
    expect(screen.getByText('Add the first one.')).toBeInTheDocument();
    admin.unmount();
    resetKit();
    await useProfile('read-only', 'en', { 'GET /api/v1/catalogs/service': { entries: [] } });
    render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    expect(
      await screen.findByText('Nothing has been entered in this catalog yet.'),
    ).toBeInTheDocument();
  });

  it('reads the list again when the event stream names the catalog, and not for another', async () => {
    const kit = await useProfile('catalog-admin');
    render(CatalogsView, { ...CATALOG('service'), onnavigate: vi.fn() });
    await screen.findByTestId('entry-list');
    const reads = () =>
      kit.requests.filter((request) => request === 'GET /api/v1/catalogs/service').length;
    expect(reads()).toBe(1);
    kit.emit('catalog-changed', { catalog: 'team', id: 'payments' });
    kit.emit('document-saved', { repository: 'x', id: 'y' });
    expect(reads()).toBe(1);
    kit.scenario.goto('service-created');
    kit.emit('catalog-changed', { catalog: 'service', id: 'notification-gateway' });
    expect(await screen.findByTestId('entry-notification-gateway')).toBeInTheDocument();
    expect(reads()).toBe(2);
  });

  it('says what went wrong when the list cannot be read', async () => {
    await useProfile('catalog-admin', 'en', {
      'GET /api/v1/catalogs/team': new Response(JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }), {
        status: 503,
      }),
    });
    render(CatalogsView, { ...CATALOG('team'), onnavigate: vi.fn() });
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
  });
});
