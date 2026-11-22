import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddress } from '../routes';
import { loadScenario, primaryScenarios, scenarioFetch } from '../test/scenarioFetch';
import DueView from './DueView.svelte';
import WelcomeView from './WelcomeView.svelte';

/**
 * The views against the profiles of `web-mock` (AUN-TEST-1): the same data as the end-to-end suite.
 */
afterEach(() => vi.unstubAllGlobals());

describe('the profiles', () => {
  it('are the five of AUN-TEST-1', () => {
    expect(primaryScenarios().sort()).toEqual([
      'degraded',
      'empty',
      'first-login',
      'read-only',
      'workshop',
    ]);
  });

  it.each(primaryScenarios())('%s names only canonical addresses in its due list', (name) => {
    const scenario = loadScenario(name);
    const bodies = [
      scenario.routes['GET /api/v1/due']?.body,
      ...Object.values(scenario.states).map((state) => state.routes?.['GET /api/v1/due']?.body),
    ].filter(Boolean) as { items?: { address: string }[] }[];
    for (const body of bodies) {
      for (const item of body.items ?? []) {
        expect(parseAddress(item.address), item.address).not.toBeNull();
      }
    }
  });
});

describe('DueView against the profiles', () => {
  it('lists the workshop entries', async () => {
    vi.stubGlobal('fetch', scenarioFetch('workshop').fetch);
    render(DueView);
    const list = await screen.findByTestId('due-list');
    expect(list.querySelectorAll('li').length).toBeGreaterThan(2);
  });

  it('shows the empty installation calmly', async () => {
    vi.stubGlobal('fetch', scenarioFetch('empty').fetch);
    render(DueView);
    expect(await screen.findByText('Nothing is due for you.')).toBeInTheDocument();
  });

  it('shows the refusal of workshop#forbidden', async () => {
    vi.stubGlobal('fetch', scenarioFetch('workshop#forbidden').fetch);
    render(DueView);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'You have no right for this action.',
    );
  });
});

describe('WelcomeView against first-login', () => {
  it('saves the entry and moves the profile to registered', async () => {
    const scenario = scenarioFetch('first-login');
    vi.stubGlobal('fetch', scenario.fetch);
    const onnavigate = vi.fn();
    render(WelcomeView, { onnavigate });
    expect(await screen.findByTestId('welcome-name')).toHaveValue('Robin Newcomer');
    const role = screen.getByTestId('welcome-role') as HTMLSelectElement;
    await fireEvent.change(role, { target: { value: role.options[1].value } });
    await fireEvent.click(screen.getByTestId('welcome-save'));
    await vi.waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(scenario.state()).toBe('registered');
  });

  it('shows the field error of first-login#invalid-team', async () => {
    vi.stubGlobal('fetch', scenarioFetch('first-login#invalid-team').fetch);
    render(WelcomeView, { onnavigate: () => {} });
    await fireEvent.click(await screen.findByTestId('welcome-save'));
    expect(await screen.findByText('Pick an entry from the list.')).toBeInTheDocument();
  });
});
