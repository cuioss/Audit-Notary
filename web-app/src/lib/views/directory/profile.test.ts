import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  callback: null as null | ((navigation: unknown) => void),
  goto: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  beforeNavigate: (callback: (navigation: unknown) => void) => {
    navigation.callback = callback;
  },
  afterNavigate: () => {},
  goto: navigation.goto,
}));

import { session } from '../../stores/app';
import { breadcrumb } from '../../stores/breadcrumb';
import { hold, resetKit, useProfile, type Kit } from '../documents/testkit';
import ProfileView from './ProfileView.svelte';

/**
 * The own directory entry (UC-ACC-5, `/settings/profile`) against the `workshop`, `read-only`, `empty` and `first-login`
 * profiles of the scenario mock (AUN-TEST-1): reading and changing the entry, "Is this still right?" once the
 * confirmation is due, a saved change as a confirmation, the refusals, and the page left with unsaved changes.
 */
beforeEach(() => {
  navigation.callback = null;
  navigation.goto.mockClear();
});
afterEach(() => {
  cleanup();
  resetKit();
});

/** Opens the page and waits for the form. */
async function open(
  profile = 'workshop',
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit> {
  const kit = await useProfile(profile, lang, answers);
  render(ProfileView);
  await screen.findByTestId('profile-name');
  return kit;
}

const sentTo = (kit: Kit, request: string) =>
  kit.bodies.filter((body) => body.request === request).map((body) => body.body);
const save = () => screen.getByTestId('profile-save');
const team = () => screen.getByTestId('profile-membership-0-team') as HTMLSelectElement;
const role = () => screen.getByTestId('profile-membership-0-role') as HTMLSelectElement;

describe('the entry', () => {
  it('shows the name and the memberships as they are, and says when they were confirmed', async () => {
    await open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Your entry');
    expect(screen.getByTestId('profile-name')).toHaveValue('Alex Example');
    expect(team()).toHaveValue('team:payments');
    expect(role()).toHaveValue('role:security-champion');
    expect(screen.getByTestId('profile-information')).toHaveTextContent('Art. 13 GDPR');
    expect(screen.getByTestId('profile-last-confirmed')).toHaveTextContent(
      /Last confirmed on .*2026/,
    );
    expect(screen.queryByTestId('profile-confirm')).toBeNull();
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Nothing changed since the last save.')).toBeInTheDocument();
    expect(get(breadcrumb)).toEqual([{ label: 'Your entry', href: '/settings/profile' }]);
  });

  it('saves a changed name and a changed membership, and counts the save as the confirmation', async () => {
    const kit = await open('workshop#confirmation-due');
    expect(get(session)?.directoryConfirmationDue).toBe(true);
    await fireEvent.input(screen.getByTestId('profile-name'), {
      target: { value: 'Alex Q. Example' },
    });
    await fireEvent.change(team(), { target: { value: 'team:identity' } });
    await fireEvent.change(role(), { target: { value: 'role:developer' } });
    await fireEvent.click(save());
    await waitFor(() =>
      expect(sentTo(kit, 'PUT /api/v1/directory/me')).toEqual([
        {
          name: 'Alex Q. Example',
          memberships: [{ team: 'team:identity', role: 'role:developer' }],
        },
      ]),
    );
    await waitFor(() =>
      expect(screen.getByTestId('profile-done')).toHaveTextContent(
        /Saved\. Your entry counts as confirmed as of .*2026/,
      ),
    );
    // The page asks no more, and the shell's notice goes: the session was read again.
    expect(screen.queryByTestId('profile-confirm')).toBeNull();
    await waitFor(() => expect(get(session)?.directoryConfirmationDue).toBe(false));
    expect(
      kit.requests.filter((request) => request === 'GET /api/v1/session').length,
    ).toBeGreaterThan(1);
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(kit.requests.filter((request) => request.includes('stepup'))).toEqual([]);
  });

  it('keeps a name typed while the save waits as an unsaved change', async () => {
    await open();
    const release = hold('PUT', '/api/v1/directory/me');
    await fireEvent.input(screen.getByTestId('profile-name'), {
      target: { value: 'Alex Q. Example' },
    });
    await fireEvent.click(save());
    await fireEvent.input(screen.getByTestId('profile-name'), {
      target: { value: 'Alex Z. Later' },
    });
    release();
    await screen.findByTestId('profile-done');
    // The save ends after the session is read again: give it time to finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(screen.getByTestId('profile-name')).toHaveValue('Alex Z. Later');
    expect(save()).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.queryByText('Nothing changed since the last save.')).toBeNull();
  });

  it('saves a second membership with the first', async () => {
    const kit = await open();
    await fireEvent.click(screen.getByTestId('profile-membership-add'));
    await fireEvent.change(screen.getByTestId('profile-membership-1-team'), {
      target: { value: 'team:mobile' },
    });
    await fireEvent.change(screen.getByTestId('profile-membership-1-role'), {
      target: { value: 'role:developer' },
    });
    await fireEvent.click(save());
    await waitFor(() => expect(sentTo(kit, 'PUT /api/v1/directory/me')).toHaveLength(1));
    expect(
      (sentTo(kit, 'PUT /api/v1/directory/me')[0] as { memberships: unknown[] }).memberships,
    ).toEqual([
      { team: 'team:payments', role: 'role:security-champion' },
      { team: 'team:mobile', role: 'role:developer' },
    ]);
  });

  it('asks for a name and for both of a membership before it sends anything', async () => {
    const kit = await open();
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: '  ' } });
    await fireEvent.click(save());
    expect(screen.getAllByText('Fill in this field.')).toHaveLength(1);
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: 'Alex' } });
    await fireEvent.change(role(), { target: { value: '' } });
    await fireEvent.click(save());
    expect(role()).toHaveAccessibleDescription('Fill in this field.');
    expect(sentTo(kit, 'PUT /api/v1/directory/me')).toEqual([]);
  });

  it('shows the refusal of a team at its field and keeps what was typed', async () => {
    await open('workshop#entry-invalid');
    await fireEvent.change(team(), { target: { value: 'team:mobile' } });
    await fireEvent.click(save());
    await waitFor(() => expect(team()).toHaveAccessibleDescription(/This reference leads nowhere/));
    expect(
      screen.getByText('Some entries are not valid. Correct the marked fields.'),
    ).toBeInTheDocument();
    expect(team()).toHaveValue('team:mobile');
  });

  it('says that the Git server cannot be reached, for a save and for a confirmation', async () => {
    await open('workshop#confirmation-due');
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: 'Alex Q.' } });
    await useProfile('workshop', 'en', {
      'PUT /api/v1/directory/me': new Response(JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }), {
        status: 503,
      }),
    });
    await fireEvent.click(save());
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(save()).not.toHaveAttribute('aria-disabled');
  });

  it('is refused for a user who may not write, and says so', async () => {
    await open('read-only');
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: 'Kim L.' } });
    await fireEvent.click(save());
    expect(await screen.findByText('You have no right for this action.')).toBeInTheDocument();
  });

  it('invites the first login when the user has no entry', async () => {
    await useProfile('first-login');
    render(ProfileView);
    expect(await screen.findByText('You have no entry yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Create my entry' })).toHaveAttribute(
      'href',
      '/welcome',
    );
  });

  it('says that the entry cannot be read when the request fails', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/directory/me': new Response(JSON.stringify({ outcome: 'FORBIDDEN' }), {
        status: 403,
      }),
    });
    render(ProfileView);
    expect(await screen.findByText('You have no right for this action.')).toBeInTheDocument();
    expect(screen.queryByText('You have no entry yet')).toBeNull();
  });
});

describe('Is this still right?', () => {
  it('asks once the confirmation is due, with the confirmation as the one act', async () => {
    await open('workshop#confirmation-due');
    const block = screen.getByTestId('profile-confirm');
    expect(block).toHaveTextContent('Is this still right?');
    expect(block).toHaveTextContent(/You last confirmed your name, team and role on .*2025/);
    expect(screen.queryByTestId('profile-last-confirmed')).toBeNull();
    const act = screen.getByTestId('profile-confirm-act');
    expect(act).toHaveTextContent('Yes, this is right');
    expect(act).toHaveClass('btn--primary');
    expect(save()).toHaveClass('btn--secondary');
  });

  it('confirms the entry as it is, without a step-up, and the notice of the shell goes', async () => {
    const kit = await open('workshop#confirmation-due');
    await fireEvent.click(screen.getByTestId('profile-confirm-act'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-done')).toHaveTextContent(
        /Thank you\. Your entry is confirmed as of .*2026/,
      ),
    );
    expect(kit.requests).toContain('POST /api/v1/directory/me/confirmation');
    expect(kit.requests.filter((request) => request.includes('stepup'))).toEqual([]);
    expect(screen.queryByTestId('profile-confirm')).toBeNull();
    await waitFor(() => expect(get(session)?.directoryConfirmationDue).toBe(false));
    expect(kit.scenario.state()).toBe('confirmation-done');
    expect(sentTo(kit, 'PUT /api/v1/directory/me')).toEqual([]);
  });

  it('does not confirm over changes only the person has: saving them confirms', async () => {
    await open('workshop#confirmation-due');
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: 'Alex Q.' } });
    const act = screen.getByTestId('profile-confirm-act');
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Save your changes first.')).toBeInTheDocument();
    // The notice says once that a saved change confirms; the reason of the disabled act does not say it again.
    expect(screen.getAllByText(/confirms the entry as well/)).toHaveLength(1);
    expect(act).not.toHaveClass('btn--primary');
    expect(save()).toHaveClass('btn--primary');
    await fireEvent.click(act);
    expect(screen.queryByTestId('profile-done')?.textContent ?? '').toBe('');
  });

  it('says that the Git server cannot be reached when it confirms', async () => {
    await open('workshop#confirmation-due', 'en', {
      'POST /api/v1/directory/me/confirmation': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503 },
      ),
    });
    await fireEvent.click(screen.getByTestId('profile-confirm-act'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('profile-confirm')).toBeInTheDocument();
  });
});

describe('leaving the page', () => {
  it('asks before the page is left with changes that are not saved', async () => {
    await open();
    const leaving = {
      cancel: vi.fn(),
      willUnload: false,
      to: { url: new URL('http://localhost/settings') },
      type: 'link',
    };
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
    await fireEvent.input(screen.getByTestId('profile-name'), { target: { value: 'Alex Q.' } });
    navigation.callback!(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
    await fireEvent.click(await screen.findByTestId('leave-confirm'));
    expect(navigation.goto).toHaveBeenCalledWith('/settings');
  });
});

describe('in German', () => {
  it('asks the question and answers in German', async () => {
    await open('workshop#confirmation-due', 'de');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ihr Eintrag');
    expect(screen.getByTestId('profile-confirm')).toHaveTextContent('Stimmt das noch?');
    expect(screen.getByTestId('profile-confirm-act')).toHaveTextContent('Ja, das stimmt');
    await fireEvent.click(screen.getByTestId('profile-confirm-act'));
    await waitFor(() =>
      expect(screen.getByTestId('profile-done')).toHaveTextContent(
        /Danke\. Ihr Eintrag gilt seit .* als bestätigt\./,
      ),
    );
  });
});
