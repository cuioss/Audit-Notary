import { fireEvent, render, screen } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import type { DueItem } from '../api/types';
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
    expect(screen.getByText('Review in SAMM')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Open Payments 2026-Q4: Strategy & Metrics' }),
    ).toHaveAttribute('href', '/samm/payments/2026-q4/sm');
    expect(screen.getByText('December 4, 2026')).toBeInTheDocument();
  });

  it('keeps a daybook: overdue, today, this week and later, one day after the other', async () => {
    const day = (offset: number): string => {
      const date = new Date();
      date.setDate(date.getDate() + offset);
      const pad = (value: number) => String(value).padStart(2, '0');
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
    };
    const entry = (title: string, address: string, due: string, lens: DueItem['lens']) => ({
      kind: 'deadline' as const,
      lens,
      title,
      address,
      due,
    });
    vi.spyOn(apiClient, 'getDue').mockResolvedValue({
      items: [
        entry('Later one', '/samm/shop', day(20), 'isms'),
        entry('Overdue one', '/samm/payments', day(-2), 'threat-models'),
        entry('Overdue two', '/samm/identity', day(-2), 'samm'),
        entry('Today one', '/samm/organisation', day(0), 'incidents'),
        entry('Week one', '/samm/payments/2026-q4', day(3), 'samm'),
      ],
    });
    render(DueView);
    await screen.findByTestId('due-list');
    expect(
      screen.getAllByRole('heading', { level: 2 }).map((heading) => heading.textContent?.trim()),
    ).toEqual(['Overdue', 'Today', 'This week', 'Later']);
    expect(screen.getAllByTestId('due-overdue')).toHaveLength(2);
    expect(screen.getAllByTestId('due-overdue')[0]).toHaveTextContent('2 days overdue');
    expect(screen.getByTestId('due-summary')).toHaveTextContent(
      '2 entries are overdue. 2 more are due this week.',
    );
    expect(screen.getByText('Due today')).toBeInTheDocument();
    expect(screen.getByText('Due in 3 days')).toBeInTheDocument();
    const overdue = screen.getByRole('region', { name: 'Overdue' });
    expect(overdue.querySelectorAll('.daybook__day')).toHaveLength(1);
  });

  it('shows the loading word until the list arrives', () => {
    vi.spyOn(apiClient, 'getDue').mockReturnValue(new Promise(() => {}));
    render(DueView);
    expect(screen.getByText('Loading…')).toBeInTheDocument();
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
    expect(
      await screen.findByText('This reference leads nowhere. Check it or choose another.'),
    ).toBeInTheDocument();
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
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection to Audit Notary');
  });
});

describe('SettingsView', () => {
  it('leads to the page of the own entry', () => {
    render(SettingsView);
    expect(screen.getByTestId('settings-profile')).toHaveAttribute('href', '/settings/profile');
  });

  it('switches the theme and the language', async () => {
    const getMessages = vi
      .spyOn(apiClient, 'getMessages')
      .mockResolvedValue({ 'settings.title': 'Einstellungen' });
    render(SettingsView);
    await fireEvent.change(screen.getByTestId('theme-dark'));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('audit_notary_theme')).toBe('dark');
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
    ['/samm/payments/2026-q4/sm', 'samm-view'],
    ['/threat-models/payment-gateway', 'lens-view'],
    ['/categories', 'documents-view'],
    ['/categories/test-note', 'documents-view'],
    ['/categories/test-note/new?kind=note', 'documents-view'],
    ['/categories/test-note/01JZ8W1E3G5J7M9P1R3T5X7Z9B', 'documents-view'],
    ['/categories/test-note/01JZ8W1E3G5J7M9P1R3T5X7Z9B?at=v1', 'documents-view'],
    ['/categories/test-note/01JZ8W1E3G5J7M9P1R3T5X7Z9B/release', 'release-view'],
    ['/catalogs/team', 'catalogs-view'],
    ['/catalogs/service/payment-api', 'catalogs-view'],
    ['/catalogs/service/new', 'catalogs-view'],
    ['/directory/import', 'import-view'],
    ['/directory/persons', 'persons-view'],
    ['/settings/profile', 'profile-view'],
    ['/nowhere/at/all/here/x', 'not-found-view'],
  ])('renders %s as %s', async (pathname, testId) => {
    vi.spyOn(apiClient, 'listCategories').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getDue').mockResolvedValue({ items: [] });
    vi.spyOn(apiClient, 'getDirectoryMe').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getCatalog').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getCatalogSchema').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getCatalogEntry').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getSammScopes').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'getSammScope').mockReturnValue(new Promise(() => {}));
    vi.spyOn(apiClient, 'subscribeEvents').mockReturnValue(() => {});
    const [path, search = ''] = pathname.split('?');
    render(AppRouter, { pathname: path, search: search ? `?${search}` : '', onnavigate: () => {} });
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
