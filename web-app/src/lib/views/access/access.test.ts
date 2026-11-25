import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import { ApiError } from '../../api/errors';
import { messagesStore, currentLocale } from '../../i18n';
import AccessNotices from '../../shell/AccessNotices.svelte';
import { session, status } from '../../stores/app';
import { loadMessages } from '../../../test/catalogue-fixture';
import { scenarioFetch } from '../../test/scenarioFetch';
import AppRouter from '../AppRouter.svelte';
import LoginProblemView from './LoginProblemView.svelte';
import LoginView from './LoginView.svelte';
import NoRightsView from './NoRightsView.svelte';
import SignedOutView from './SignedOutView.svelte';

/**
 * The access views (UC-ACC-1, -2, -7, doc/specification/rest-api.adoc, Addresses Outside the Shell and A Session
 * Without Rights) against the profiles `local`, `login-trouble`, `no-rights` and `workshop` of `web-mock`.
 */
afterEach(() => {
  vi.unstubAllGlobals();
  session.set(null);
  status.set(null);
});

/**
 * Stubs fetch with a scenario and reads its status, as the start of a page outside the shell does.
 *
 * @param reference the scenario, `name#state`
 * @returns the scenario
 */
async function outside(reference: string) {
  const scenario = scenarioFetch(reference);
  vi.stubGlobal('fetch', scenario.fetch);
  status.set(await apiClient.getStatus());
  return scenario;
}

/**
 * Stubs fetch with a scenario and reads its status and session, as the start of the shell does.
 *
 * @param reference the scenario, `name#state`
 * @returns the scenario
 */
async function inside(reference: string) {
  const scenario = await outside(reference);
  session.set(await apiClient.getSession());
  return scenario;
}

describe('LoginView with local test accounts (profile local)', () => {
  it('shows the form and the notice of local test accounts, outside the shell', async () => {
    await outside('local');
    render(LoginView, { search: '?return=%2Fsamm' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Log in');
    expect(screen.getByLabelText('Username')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('type', 'password');
    expect(screen.getByTestId('login-submit')).toHaveTextContent(/^Log in$/);
    expect(
      screen.getByText('This installation uses local test accounts', { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('navigation')).toBeNull();
    expect(screen.queryByTestId('user-name')).toBeNull();
  });

  it('logs in and goes to the checked return address', async () => {
    const scenario = await outside('local');
    const go = vi.spyOn(apiClient, 'go').mockImplementation(() => {});
    render(LoginView, { search: '?return=%2Fsamm%2Fpayments' });
    await fireEvent.input(screen.getByTestId('login-username'), { target: { value: 'alex' } });
    await fireEvent.input(screen.getByTestId('login-password'), {
      target: { value: 'local-password' },
    });
    await fireEvent.click(screen.getByTestId('login-submit'));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('/samm/payments'));
    expect(scenario.state()).toBe('ready');
  });

  it.each([
    '?return=//evil.example/x',
    '?return=%2Flogin',
    '',
    '?return=https%3A%2F%2Fevil.example',
  ])('goes to the start page when the return is %j', async (search) => {
    await outside('local');
    const go = vi.spyOn(apiClient, 'go').mockImplementation(() => {});
    render(LoginView, { search });
    await fireEvent.input(screen.getByTestId('login-username'), { target: { value: 'alex' } });
    await fireEvent.input(screen.getByTestId('login-password'), {
      target: { value: 'local-password' },
    });
    await fireEvent.click(screen.getByTestId('login-submit'));
    await vi.waitFor(() => expect(go).toHaveBeenCalledWith('/'));
  });

  it('says that the password is wrong, keeps the form and clears the password', async () => {
    await outside('local');
    const go = vi.spyOn(apiClient, 'go').mockImplementation(() => {});
    render(LoginView, { search: '' });
    await fireEvent.input(screen.getByTestId('login-username'), { target: { value: 'alex' } });
    await fireEvent.input(screen.getByTestId('login-password'), { target: { value: 'wrong' } });
    await fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The username or the password is wrong.',
    );
    expect(go).not.toHaveBeenCalled();
    expect(screen.getByTestId('login-username')).toHaveValue('alex');
    expect(screen.getByTestId('login-password')).toHaveValue('');
    expect(screen.getByTestId('login-submit')).not.toHaveAttribute('aria-busy', 'true');
  });

  it('asks for both fields before it sends anything', async () => {
    await outside('local');
    const login = vi.spyOn(apiClient, 'localLogin');
    render(LoginView, { search: '' });
    await fireEvent.click(screen.getByTestId('login-submit'));
    expect(screen.getAllByText('Fill in this field.')).toHaveLength(2);
    expect(login).not.toHaveBeenCalled();
  });

  it('says that there is no connection, and keeps the form', async () => {
    await outside('local');
    vi.spyOn(apiClient, 'localLogin').mockRejectedValue(new ApiError('NETWORK', 0));
    render(LoginView, { search: '' });
    await fireEvent.input(screen.getByTestId('login-username'), { target: { value: 'alex' } });
    await fireEvent.input(screen.getByTestId('login-password'), { target: { value: 'x' } });
    await fireEvent.click(screen.getByTestId('login-submit'));
    expect(await screen.findByRole('alert')).toHaveTextContent('No connection to Audit Notary');
    expect(screen.getByTestId('login-username')).toHaveValue('alex');
  });

  it('is written in German too', async () => {
    await outside('local');
    currentLocale.set('de');
    messagesStore.set(loadMessages('de'));
    render(LoginView, { search: '' });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Anmelden');
    expect(screen.getByLabelText('Benutzername')).toBeInTheDocument();
    expect(screen.getByText('Diese Installation verwendet lokale Testkonten')).toBeInTheDocument();
  });
});

describe('LoginView with the identity provider', () => {
  it('starts the provider login at once, with the checked return', async () => {
    await outside('login-trouble#recovered');
    const start = vi.spyOn(apiClient, 'startLogin').mockImplementation(() => {});
    render(LoginView, { search: '?return=%2Fisms%2Frisks' });
    expect(start).toHaveBeenCalledWith('oidc', '/isms/risks');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Taking you to the login');
    expect(screen.getByTestId('login-continue')).toHaveAttribute(
      'href',
      '/api/v1/auth/login?return=%2Fisms%2Frisks',
    );
    expect(screen.queryByTestId('login-username')).toBeNull();
  });

  it('starts it for an installation whose status cannot be read, and refuses a foreign return', async () => {
    const start = vi.spyOn(apiClient, 'startLogin').mockImplementation(() => {});
    render(LoginView, { search: '?return=//evil.example' });
    expect(start).toHaveBeenCalledWith('oidc', '/');
  });
});

describe('SignedOutView', () => {
  it('says that the session ended and offers the login again with return /', async () => {
    await outside('workshop');
    const request = vi.fn(scenarioFetch('workshop').fetch);
    vi.stubGlobal('fetch', request);
    render(SignedOutView);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('You are signed out');
    const act = screen.getByTestId('signed-out-login');
    expect(act).toHaveTextContent(/^Log in$/);
    expect(act).toHaveAttribute('href', '/api/v1/auth/login?return=%2F');
    expect(act).toHaveAttribute('data-sveltekit-reload');
    // The page needs no session and makes no request.
    expect(request).not.toHaveBeenCalled();
  });

  it('offers the own login page with local test accounts, and keeps their notice', async () => {
    await outside('local');
    render(SignedOutView);
    expect(screen.getByTestId('signed-out-login')).toHaveAttribute('href', '/login?return=%2F');
    expect(screen.getByText('This installation uses local test accounts')).toBeInTheDocument();
  });

  it('is written in German', async () => {
    await outside('workshop');
    currentLocale.set('de');
    messagesStore.set(loadMessages('de'));
    render(SignedOutView);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Sie sind abgemeldet');
    expect(screen.getByTestId('signed-out-login')).toHaveTextContent(/^Anmelden$/);
  });
});

describe('LoginProblemView (profile login-trouble)', () => {
  it.each([
    ['idp-unavailable', 'The login service of your organisation cannot be reached', 'danger'],
    ['too-many-logins', 'Many people are logging in right now', 'attention'],
    ['unknown-transaction', 'The login took too long or was interrupted', 'attention'],
  ])('names the reason %s', async (reason, title, tone) => {
    await outside(`login-trouble#${reason}`);
    render(LoginProblemView, { search: `?reason=${reason}` });
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The login did not work');
    expect(screen.getByText(title)).toBeInTheDocument();
    expect(screen.getByTestId('notice')).toHaveAttribute('data-tone', tone);
    const retry = screen.getByTestId('login-problem-retry');
    expect(retry).toHaveTextContent(/^Try again$/);
    expect(retry).toHaveAttribute('href', '/api/v1/auth/login?return=%2F');
  });

  it.each(['?reason=nothing', '', '?reason=constructor', '?reason=__proto__'])(
    'shows the general failure for %j',
    async (search) => {
      await outside('login-trouble');
      render(LoginProblemView, { search });
      expect(screen.getByText('The login could not be completed')).toBeInTheDocument();
    },
  );

  it('starts the login on the own page with local test accounts', async () => {
    await outside('local');
    render(LoginProblemView, { search: '?reason=unknown-transaction' });
    expect(screen.getByTestId('login-problem-retry')).toHaveAttribute('href', '/login?return=%2F');
  });

  it('shows no mascot: a failure is no calm surface', async () => {
    await outside('login-trouble');
    const { container } = render(LoginProblemView, { search: '?reason=idp-unavailable' });
    expect(container.querySelector('.mascot')).toBeNull();
  });
});

describe('a session without a right (profile no-rights)', () => {
  it('is told so by a notice in the shell and an empty state in place of the Due list', async () => {
    await inside('no-rights');
    const request = vi.spyOn(apiClient, 'getDue');
    render(AccessNotices);
    expect(
      screen.getByText('Your organisation has not granted you access yet'),
    ).toBeInTheDocument();
    render(AppRouter, { pathname: '/', onnavigate: () => {} });
    expect(screen.getByTestId('no-rights-view')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Due');
    expect(screen.getByText('Nothing to show without access')).toBeInTheDocument();
    expect(screen.queryByTestId('due-view')).toBeNull();
    expect(request).not.toHaveBeenCalled();
  });

  it.each(['/samm', '/samm/payments/2026-q4', '/threat-models', '/incidents', '/catalogs'])(
    'shows the empty state for %s, with no request that would be refused',
    async (pathname) => {
      await inside('no-rights');
      const request = vi.fn(scenarioFetch('no-rights').fetch);
      vi.stubGlobal('fetch', request);
      render(AppRouter, { pathname, onnavigate: () => {} });
      expect(screen.getByTestId('no-rights-view')).toBeInTheDocument();
      expect(request).not.toHaveBeenCalled();
    },
  );

  it('keeps the settings and an unknown address as they are, and never offers another login', async () => {
    await inside('no-rights');
    const view = render(AppRouter, { pathname: '/settings/appearance', onnavigate: () => {} });
    expect(screen.queryByTestId('no-rights-view')).toBeNull();
    view.unmount();
    render(AppRouter, { pathname: '/nowhere', onnavigate: () => {} });
    expect(screen.queryByTestId('no-rights-view')).toBeNull();
    expect(screen.queryByTestId('login-view')).toBeNull();
  });

  it('is no empty state for a session that has rights, or still has its first login to complete', async () => {
    await inside('workshop');
    render(AppRouter, { pathname: '/', onnavigate: () => {} });
    expect(await screen.findByTestId('due-view')).toBeInTheDocument();
    expect(screen.queryByTestId('no-rights-view')).toBeNull();
    render(AccessNotices);
    expect(screen.queryByText('Your organisation has not granted you access yet')).toBeNull();
  });

  it('writes the empty state in German', () => {
    currentLocale.set('de');
    messagesStore.set(loadMessages('de'));
    render(NoRightsView, { titleKey: 'lens.samm' });
    expect(screen.getByText('Ohne Zugriff gibt es hier nichts zu zeigen')).toBeInTheDocument();
  });
});

describe('the notice of local test accounts', () => {
  it('stays on every shell page with local users, and is absent with the identity provider', async () => {
    await inside('local');
    const view = render(AccessNotices);
    const notice = within(view.container).getByTestId('notice');
    expect(notice).toHaveTextContent('This installation uses local test accounts');
    expect(notice).toHaveTextContent('not for production');
    view.unmount();
    await inside('workshop');
    const other = render(AccessNotices);
    expect(within(other.container).queryByTestId('notice')).toBeNull();
  });
});

describe('the router outside the shell', () => {
  it('routes the three addresses to their pages', async () => {
    await outside('local');
    const login = render(AppRouter, {
      pathname: '/login',
      search: '?return=%2F',
      onnavigate: () => {},
    });
    expect(screen.getByTestId('login-view')).toBeInTheDocument();
    login.unmount();
    const out = render(AppRouter, { pathname: '/signed-out', onnavigate: () => {} });
    expect(screen.getByTestId('signed-out-view')).toBeInTheDocument();
    out.unmount();
    render(AppRouter, {
      pathname: '/login-problem',
      search: '?reason=too-many-logins',
      onnavigate: () => {},
    });
    expect(screen.getByTestId('login-problem-view')).toBeInTheDocument();
  });
});
