import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../../api/client';
import type { DocumentDiff, Status } from '../../api/types';
import { clearModels } from '../../samm/store';
import { session, status } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { bodyOf, scenarioFetch } from '../../test/scenarioFetch';
import SammReleaseView from './SammReleaseView.svelte';

/**
 * The release of a SAMM assessment (UC-SAMM-4) against the `release` profile of `web-mock`.
 */
const PARAMS = { scope: 'payments', assessment: '2026-q4' };

/**
 * Stubs fetch with a scenario, reads its session and status into the stores, as the shell does.
 *
 * @param reference the scenario, `name#state`
 * @param override answers that replace the scenario's for a path
 * @returns the scenario's fetch
 */
async function prepare(
  reference: string,
  override: (path: string, method: string) => Response | null = () => null,
) {
  const scenario = scenarioFetch(reference);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost');
    return (
      override(url.pathname, (init?.method ?? 'GET').toUpperCase()) ?? scenario.fetch(input, init)
    );
  });
  vi.stubGlobal('fetch', fetchMock);
  session.set(await apiClient.getSession());
  status.set(await apiClient.getStatus());
  return { ...scenario, fetchMock };
}

/** @returns the release act, once the view has loaded */
async function act(): Promise<HTMLElement> {
  return screen.findByTestId('release-act');
}

beforeEach(() => clearModels());

afterEach(() => {
  vi.unstubAllGlobals();
  session.set(null);
  status.set(null);
});

describe('SammReleaseView', () => {
  it('shows what is released: the seal, the change since the last release and the record', async () => {
    await prepare('release');
    render(SammReleaseView, { params: PARAMS });
    expect(await act()).toHaveTextContent('Release');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Release Payments 2026 Q4');
    expect(screen.getByTestId('release-seal')).toBeInTheDocument();
    expect(await screen.findByText('Since Payments 2026 Q2')).toBeInTheDocument();
    expect(screen.getByText(/The first release: all 90 answers/)).toBeInTheDocument();
    expect(screen.getByTestId('record-sm')).toHaveTextContent('Strategy and Metrics');
    expect(screen.getByText('90 of 90 questions answered')).toBeInTheDocument();
    expect(screen.getByText(/Submitted for review by Alex Example/)).toBeInTheDocument();
    expect(screen.getByText('You confirm your identity once more before the release.')).toBeInTheDocument();
    // The tag is the server's to assign: it shows once the release is done.
    expect(screen.queryByTestId('release-tag')).toBeNull();
    expect(get(breadcrumb).map((crumb) => crumb.label)).toEqual([
      'Payments',
      'Payments 2026 Q4',
      'Release',
    ]);
  });

  it('steps up with the identity provider first and releases when back', async () => {
    const scenario = await prepare('release');
    const stepUp = vi.spyOn(apiClient, 'stepUp').mockImplementation(() => {});
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    await vi.waitFor(() => expect(stepUp).toHaveBeenCalledWith('/api/v1/auth/login?step-up=mfa'));
    expect(scenario.state()).toBe('stepped-up');
    expect(screen.queryByTestId('release-done')).toBeNull();
    await fireEvent.click(screen.getByTestId('release-act'));
    expect(await screen.findByTestId('release-done')).toHaveTextContent('Released as v1');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'Payments 2026 Q4 is released',
    );
    expect(screen.getByText('Released by Noor Haddad', { exact: false })).toBeInTheDocument();
    expect(screen.getByTestId('release-open')).toHaveAttribute('href', '/samm/payments/2026-q4');
    expect(scenario.state()).toBe('released');
  });

  it('asks for the password of a local user and refuses an empty one', async () => {
    const scenario = await prepare('release#password');
    render(SammReleaseView, { params: PARAMS });
    const button = await act();
    expect(button).toHaveTextContent('Release');
    expect(screen.getByText('You confirm your identity once more before the release.')).toBeInTheDocument();
    await fireEvent.click(button);
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    expect(dialog).toHaveAttribute('open');
    expect(within(dialog).getByText('Confirm your identity')).toBeInTheDocument();
    await fireEvent.click(within(dialog).getByTestId('release-confirm'));
    expect(within(dialog).getByText('Fill in this field.')).toBeInTheDocument();
    expect(scenario.state()).toBe('password');
    await fireEvent.input(within(dialog).getByTestId('release-password'), {
      target: { value: 'secret' },
    });
    await fireEvent.click(within(dialog).getByTestId('release-confirm'));
    expect(await screen.findByTestId('release-done')).toBeInTheDocument();
    expect(dialog).not.toHaveAttribute('open');
    expect(scenario.state()).toBe('released');
  });

  it('says when the password is not right and releases nothing', async () => {
    await prepare('release#wrong-password');
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    await fireEvent.input(within(dialog).getByTestId('release-password'), {
      target: { value: 'wrong' },
    });
    await fireEvent.click(within(dialog).getByTestId('release-confirm'));
    expect(
      await within(dialog).findByText('The password is not right. Nothing was released.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('release-done')).toBeNull();
  });

  it('closes the password dialog on cancel', async () => {
    await prepare('release#password');
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    const dialog = document.querySelector('dialog') as HTMLDialogElement;
    await fireEvent.click(within(dialog).getAllByRole('button', { name: 'Cancel' }).at(-1)!);
    expect(dialog).not.toHaveAttribute('open');
  });

  it('reads the record again when someone saved since the review', async () => {
    const scenario = await prepare('release#changed');
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    expect(
      await screen.findByText(
        'Someone saved after you opened the release. Check the changes again.',
      ),
    ).toBeInTheDocument();
    expect(scenario.state()).toBe('stepped-up');
    await vi.waitFor(() =>
      expect(
        scenario.fetchMock.mock.calls.filter((call) => String(call[0]).includes('/diff')),
      ).toHaveLength(2),
    );
  });

  it('offers the release only with the approve right', async () => {
    await prepare('workshop');
    render(SammReleaseView, { params: PARAMS });
    const button = await act();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Releasing needs the approve right.')).toBeInTheDocument();
    const release = vi.spyOn(apiClient, 'release');
    await fireEvent.click(button);
    expect(release).not.toHaveBeenCalled();
  });

  it('refuses an assessment that is no longer in review', async () => {
    await prepare('release#released');
    render(SammReleaseView, { params: PARAMS });
    await act();
    expect(screen.getByText('Only an assessment in review can be released.')).toBeInTheDocument();
  });

  it('refuses an incomplete assessment', async () => {
    const document = bodyOf({
      body_file: 'samm-assessment-payments-2026-q4-in-review.json',
    }) as { answers: Record<string, unknown> };
    delete document.answers.sm;
    await prepare('release', (path) =>
      path === '/api/v1/documents/samm-assessments/payments-2026-q4'
        ? new Response(JSON.stringify(document), { status: 200 })
        : null,
    );
    render(SammReleaseView, { params: PARAMS });
    await act();
    expect(
      screen.getByText('Every question must be answered before the release.'),
    ).toBeInTheDocument();
  });

  it('releases without step-up when it is off, and shows other refusals', async () => {
    await prepare('release#stepped-up');
    status.set({ ...(get(status) as Status), stepUp: 'off' });
    vi.spyOn(apiClient, 'release').mockRejectedValueOnce(new TypeError('boom'));
    render(SammReleaseView, { params: PARAMS });
    const button = await act();
    expect(button).toHaveTextContent(/^Release$/);
    expect(screen.queryByText(/You confirm your identity/)).toBeNull();
    await fireEvent.click(button);
    expect(await screen.findByText('Something went wrong. Try again.')).toBeInTheDocument();
  });

  it('asks a local user for the password when a step-up names no address', async () => {
    await prepare('release#password', (path, method) =>
      method === 'POST' && path.startsWith('/api/v1/releases/')
        ? new Response(JSON.stringify({ outcome: 'STEP_UP_REQUIRED' }), { status: 403 })
        : null,
    );
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    await fireEvent.input(await screen.findByTestId('release-password'), {
      target: { value: 'secret' },
    });
    await fireEvent.click(screen.getByTestId('release-confirm'));
    await vi.waitFor(() => expect(document.querySelector('dialog')).toHaveAttribute('open'));
  });

  it('asks a user of the identity provider for no password when a step-up names no address', async () => {
    await prepare('release', (path, method) =>
      method === 'POST' && path.startsWith('/api/v1/releases/')
        ? new Response(JSON.stringify({ outcome: 'STEP_UP_REQUIRED' }), { status: 403 })
        : null,
    );
    render(SammReleaseView, { params: PARAMS });
    await fireEvent.click(await act());
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong');
    expect(document.querySelector('dialog')).not.toHaveAttribute('open');
  });

  it('shows the changes since the last release with the earlier answer', async () => {
    const diff = bodyOf({ body_file: 'samm-diff-payments-2026-q4.json' }) as DocumentDiff;
    diff.from = 'assessments/payments-2026-q2/v1';
    diff.sections[0].changes[0].before = 0.25;
    diff.sections[0].changes[1].after = null;
    diff.sections[0].changes[2].pointer = '/answers/sm/unknown/answer';
    diff.sections[1].part = 'unknown-part';
    await prepare('release', (path) =>
      path.endsWith('/diff') ? new Response(JSON.stringify(diff), { status: 200 }) : null,
    );
    render(SammReleaseView, { params: PARAMS });
    await act();
    expect(screen.getByText('Changes since assessments/payments-2026-q2/v1.')).toBeInTheDocument();
    const record = screen.getByTestId('record-sm');
    expect(record.querySelectorAll('del')).toHaveLength(1);
    expect(within(record).getByText('Not answered')).toBeInTheDocument();
    expect(within(record).getByText('/answers/sm/unknown/answer')).toBeInTheDocument();
    expect(screen.getByTestId('record-unknown-part')).toHaveTextContent('unknown-part');
  });

  it('shows a failure to load and an unknown assessment', async () => {
    await prepare('release');
    render(SammReleaseView, { params: { scope: 'payments', assessment: 'nope' } });
    expect(await screen.findByRole('alert')).toHaveTextContent('Something went wrong. Try again.');
    expect(get(breadcrumb)).toEqual([]);
  });

  it('does without a comparison it cannot read', async () => {
    await prepare('release', (path) =>
      path.endsWith('/compare') ? new Response('{}', { status: 500 }) : null,
    );
    render(SammReleaseView, { params: PARAMS });
    await act();
    expect(screen.queryByText('Since Payments 2026 Q2')).toBeNull();
  });
});
