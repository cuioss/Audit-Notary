import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { session } from '../stores/app';
import { resetKit, useProfile, type Kit } from './documents/testkit';
import WelcomeView from './WelcomeView.svelte';

/**
 * The first login (UC-ACC-4) against the `first-login` profile of the scenario mock (AUN-TEST-1): the candidates a save
 * is refused with (`BINDING_CANDIDATES`), taking one over or creating a new entry, and the refusal of the choice
 * (`NOT_BINDABLE`).
 */
afterEach(() => {
  cleanup();
  resetKit();
});

/** Opens the form, picks a role and waits for the candidates after the first save. */
async function open(profile: string, lang: 'en' | 'de' = 'en') {
  const kit = await useProfile(profile, lang);
  const onnavigate = vi.fn();
  render(WelcomeView, { onnavigate });
  await screen.findByTestId('welcome-name');
  const role = screen.getByTestId('welcome-role') as HTMLSelectElement;
  await fireEvent.change(role, { target: { value: 'developer' } });
  return { kit, onnavigate };
}

/** Saves the form. */
const saveEntry = () => fireEvent.click(screen.getByTestId('welcome-save'));
const sentTo = (kit: Kit) =>
  kit.bodies.filter((body) => body.request === 'PUT /api/v1/directory/me').map((body) => body.body);

describe('without candidates', () => {
  it('saves the entry as typed, with no choice in the request', async () => {
    const { kit, onnavigate } = await open('first-login');
    await saveEntry();
    await waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(sentTo(kit)).toEqual([{ name: 'Robin Newcomer', team: 'payments', role: 'developer' }]);
    expect(screen.queryByTestId('welcome-candidates')).toBeNull();
    expect(get(session)?.firstLoginRequired).toBe(false);
  });
});

describe('with candidates', () => {
  it('shows the entries an administrator prepared, by name and by team and role, and saves nothing yet', async () => {
    const { kit } = await open('first-login#candidates');
    await saveEntry();
    const form = await screen.findByTestId('welcome-candidates');
    expect(form).toHaveTextContent('Is one of these you?');
    expect(screen.getByLabelText('Robin Newcomer (Payments, Developer)')).toBeInTheDocument();
    expect(screen.getByLabelText('Rowan Newman (Payments, Developer)')).toBeInTheDocument();
    expect(screen.getByLabelText('None of these is me: create a new entry')).toBeInTheDocument();
    // Nobody is shown by the pseudonym.
    expect(form).not.toHaveTextContent('p-3d7a15');
    expect(sentTo(kit)).toHaveLength(1);
    expect(screen.queryByTestId('welcome-save')).toBeNull();
    const next = screen.getByTestId('welcome-continue');
    expect(next).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Choose one entry, or create a new one.')).toBeInTheDocument();
  });

  it('takes the chosen entry over, with its pseudonym as the binding', async () => {
    const { kit, onnavigate } = await open('first-login#candidates');
    await saveEntry();
    await fireEvent.click(await screen.findByLabelText('Robin Newcomer (Payments, Developer)'));
    await fireEvent.click(screen.getByTestId('welcome-continue'));
    await waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(sentTo(kit)).toEqual([
      { name: 'Robin Newcomer', team: 'payments', role: 'developer' },
      { name: 'Robin Newcomer', team: 'payments', role: 'developer', binding: 'p-3d7a15' },
    ]);
    expect(kit.scenario.state()).toBe('registered-bound');
    expect(get(session)?.user.pseudonym).toBe('p-3d7a15');
  });

  it('creates a new entry when none of them is the person', async () => {
    const { kit, onnavigate } = await open('first-login#candidates');
    await saveEntry();
    await fireEvent.click(await screen.findByLabelText('None of these is me: create a new entry'));
    await fireEvent.click(screen.getByTestId('welcome-continue'));
    await waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(sentTo(kit)[1]).toMatchObject({ binding: 'new' });
  });

  it('sends nothing when the choice is sent by the Enter key without one', async () => {
    const { kit } = await open('first-login#candidates');
    await saveEntry();
    const form = await screen.findByTestId('welcome-candidates');
    await fireEvent.submit(form);
    expect(sentTo(kit)).toHaveLength(1);
  });

  it('shows the candidates again with a notice when the choice cannot be taken over', async () => {
    const { kit, onnavigate } = await open('first-login#candidates-not-bindable');
    await saveEntry();
    await fireEvent.click(await screen.findByLabelText('Rowan Newman (Payments, Developer)'));
    await fireEvent.click(screen.getByTestId('welcome-continue'));
    expect(await screen.findByText('That entry cannot be taken over')).toBeInTheDocument();
    expect(screen.getByText(/Perhaps someone else took it over meanwhile/)).toBeInTheDocument();
    expect(screen.getByLabelText('Robin Newcomer (Payments, Developer)')).not.toBeChecked();
    expect(screen.getByLabelText('Rowan Newman (Payments, Developer)')).not.toBeChecked();
    expect(onnavigate).not.toHaveBeenCalled();
    expect(get(session)?.firstLoginRequired).toBe(true);
    // The person chooses again, and the notice goes with the next try.
    await fireEvent.click(screen.getByLabelText('None of these is me: create a new entry'));
    await fireEvent.click(screen.getByTestId('welcome-continue'));
    await waitFor(() => expect(onnavigate).toHaveBeenCalledWith('/'));
    expect(sentTo(kit).map((body) => (body as { binding?: string }).binding)).toEqual([
      undefined,
      'p-8e2b40',
      'new',
    ]);
  });

  it('goes back to the entry typed, and asks for the candidates again with the next save', async () => {
    const candidates = JSON.stringify({
      outcome: 'BINDING_CANDIDATES',
      candidates: [{ pseudonym: 'p-3d7a15', name: 'Robin Newcomer', memberships: [] }],
    });
    const kit = await useProfile('first-login', 'en', {
      'PUT /api/v1/directory/me': new Response(candidates, { status: 409 }),
    });
    render(WelcomeView, { onnavigate: vi.fn() });
    await screen.findByTestId('welcome-name');
    await fireEvent.change(screen.getByTestId('welcome-role'), { target: { value: 'developer' } });
    await saveEntry();
    await fireEvent.click(await screen.findByTestId('welcome-edit'));
    expect(screen.queryByTestId('welcome-candidates')).toBeNull();
    expect(screen.getByTestId('welcome-role')).toHaveValue('developer');
    await saveEntry();
    await screen.findByTestId('welcome-candidates');
    expect(sentTo(kit)).toHaveLength(2);
    expect(sentTo(kit).every((body) => !('binding' in (body as object)))).toBe(true);
  });

  it('names the refusal when nothing was offered to choose from', async () => {
    await useProfile('first-login', 'en', {
      'PUT /api/v1/directory/me': new Response(JSON.stringify({ outcome: 'NOT_BINDABLE' }), {
        status: 409,
      }),
    });
    render(WelcomeView, { onnavigate: vi.fn() });
    await screen.findByTestId('welcome-name');
    await saveEntry();
    expect(
      await screen.findByText('That entry cannot be taken over. Choose again.'),
    ).toBeInTheDocument();
    expect(screen.getByTestId('welcome-save')).toBeInTheDocument();
  });

  it('says that the Git server cannot be reached and keeps the candidates', async () => {
    await open('first-login#candidates');
    await saveEntry();
    await fireEvent.click(await screen.findByLabelText('Robin Newcomer (Payments, Developer)'));
    await useProfile('first-login#candidates-chosen', 'en', {
      'PUT /api/v1/directory/me': new Response(JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }), {
        status: 503,
      }),
    });
    await fireEvent.click(screen.getByTestId('welcome-continue'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('welcome-candidates')).toBeInTheDocument();
  });

  it('speaks German', async () => {
    await open('first-login#candidates', 'de');
    await saveEntry();
    const form = await screen.findByTestId('welcome-candidates');
    expect(form).toHaveTextContent('Ist einer davon Ihr Eintrag?');
    expect(screen.getByLabelText('Robin Newcomer (Payments, Developer)')).toBeInTheDocument();
    expect(screen.getByTestId('welcome-continue')).toHaveTextContent('Weiter');
  });
});
