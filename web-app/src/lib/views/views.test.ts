import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { currentLocale } from '../i18n';
import { session } from '../stores/app';
import AppRouter from './AppRouter.svelte';
import DueView from './DueView.svelte';
import SettingsView from './SettingsView.svelte';
import WelcomeView from './WelcomeView.svelte';

const DUE = {
  items: [
    {
      kind: 'review' as const,
      lens: 'samm' as const,
      title: 'Payments 2026-Q4: Strategy & Metrics',
      address: '/samm/payments/2026-q4/sm',
      due: '2026-12-04',
    },
    {
      kind: 'deadline' as const,
      lens: 'incidents' as const,
      title: 'Unknown address',
      address: '/nowhere',
      due: '2026-12-05',
    },
  ],
};

describe('DueView', () => {
  it('lists the due entries with kind, link and date, and drops an address without a view', async () => {
    vi.spyOn(apiClient, 'getDue').mockResolvedValue(DUE);
    render(DueView);
    const list = await screen.findByTestId('due-list');
    expect(list.querySelectorAll('li')).toHaveLength(1);
    expect(screen.getByText('Review')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Payments 2026-Q4: Strategy & Metrics' }),
    ).toHaveAttribute('href', '/samm/payments/2026-q4/sm');
    expect(screen.getByText(/Due Dec 4, 2026/)).toBeInTheDocument();
  });

  it('says when nothing is due', async () => {
    vi.spyOn(apiClient, 'getDue').mockResolvedValue({ items: [] });
    render(DueView);
    expect(await screen.findByText('Nothing is due for you.')).toBeInTheDocument();
  });

  it('shows a refusal', async () => {
    vi.spyOn(apiClient, 'getDue').mockRejectedValue(new ApiError('FORBIDDEN', 403));
    render(DueView);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have no right for this action.',
    );
  });
});

describe('WelcomeView', () => {
  function prepare() {
    vi.spyOn(apiClient, 'getDirectoryMe').mockResolvedValue({
      name: 'Robin Newcomer',
      teams: ['payments'],
      informationText: 'Your entry is processed under Art. 6 (1) (b).',
    });
    vi.spyOn(apiClient, 'getCatalog').mockImplementation(async (catalog) => ({
      entries:
        catalog === 'team'
          ? [{ id: 'payments', name: 'Payments' }]
          : [{ id: 'assessor', name: 'Assessor' }],
    }));
    session.set({
      user: { pseudonym: null, name: 'Robin Newcomer' },
      rights: [],
      csrfToken: 't',
      firstLoginRequired: true,
    });
  }

  it('prefills the form, shows the information text and saves the entry', async () => {
    prepare();
    const put = vi
      .spyOn(apiClient, 'putDirectoryMe')
      .mockResolvedValue({ outcome: 'SAVED', pseudonym: 'p-9b7e21' });
    const onnavigate = vi.fn();
    render(WelcomeView, { onnavigate });
    expect(await screen.findByTestId('welcome-name')).toHaveValue('Robin Newcomer');
    expect(screen.getByTestId('welcome-team')).toHaveValue('payments');
    expect(screen.getByTestId('welcome-information')).toHaveTextContent('Art. 6');
    await fireEvent.change(screen.getByTestId('welcome-role'), { target: { value: 'assessor' } });
    await fireEvent.click(screen.getByTestId('welcome-save'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(put).toHaveBeenCalledWith({
      name: 'Robin Newcomer',
      team: 'payments',
      role: 'assessor',
    });
    expect(get(session)?.firstLoginRequired).toBe(false);
  });

  it('shows the field errors of a refused save', async () => {
    prepare();
    vi.spyOn(apiClient, 'putDirectoryMe').mockRejectedValue(
      new ApiError('VALIDATION', 422, [{ pointer: '/team', code: 'REFERENCE_NOT_FOUND' }]),
    );
    render(WelcomeView, { onnavigate: () => {} });
    await fireEvent.click(await screen.findByTestId('welcome-save'));
    expect(await screen.findByText('Pick an entry from the list.')).toBeInTheDocument();
  });

  it('shows any other refusal as a notice', async () => {
    prepare();
    vi.spyOn(apiClient, 'putDirectoryMe').mockRejectedValue(new ApiError('GIT_UNAVAILABLE', 503));
    render(WelcomeView, { onnavigate: () => {} });
    await fireEvent.click(await screen.findByTestId('welcome-save'));
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached');
  });

  it('shows a failed prefill', async () => {
    vi.spyOn(apiClient, 'getDirectoryMe').mockRejectedValue(new ApiError('NETWORK', 0));
    vi.spyOn(apiClient, 'getCatalog').mockResolvedValue({ entries: [] });
    render(WelcomeView, { onnavigate: () => {} });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
  });
});

describe('SettingsView', () => {
  it('switches the theme and the language', async () => {
    const getMessages = vi
      .spyOn(apiClient, 'getMessages')
      .mockResolvedValue({ 'settings.title': 'Einstellungen' });
    render(SettingsView);
    await fireEvent.change(screen.getByTestId('theme-dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('trailhand_theme')).toBe('dark');
    await fireEvent.change(screen.getByTestId('language-de'));
    await vi.waitFor(() => expect(get(currentLocale)).toBe('de'));
    expect(getMessages).toHaveBeenCalledWith('de');
  });
});

describe('AppRouter', () => {
  it.each([
    ['/', 'due-view'],
    ['/welcome', 'welcome-view'],
    ['/settings', 'settings-view'],
    ['/settings/appearance', 'settings-view'],
    ['/samm/payments/2026-q4/sm', 'lens-view'],
    ['/nowhere/at/all/here/x', 'not-found-view'],
  ])('renders %s as %s', async (pathname, testId) => {
    vi.spyOn(apiClient, 'getDue').mockResolvedValue({ items: [] });
    vi.spyOn(apiClient, 'getDirectoryMe').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getCatalog').mockReturnValue(new Promise(() => {}));
    render(AppRouter, { pathname, onnavigate: () => {} });
    expect(await screen.findByTestId(testId)).toBeInTheDocument();
  });

  it('names the route of a lens view', async () => {
    render(AppRouter, { pathname: '/incidents/2026/inc-0007/release', onnavigate: () => {} });
    expect(await screen.findByTestId('lens-route')).toHaveAttribute(
      'data-route',
      'incidents.release',
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Release');
  });
});
