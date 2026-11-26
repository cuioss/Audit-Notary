import { cleanup, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { resetKit, useProfile } from '../views/documents/testkit';
import ConfirmationNotice from './ConfirmationNotice.svelte';

/**
 * The notice of a due confirmation of the own directory entry (UC-ACC-5) against the profiles of the scenario mock
 * (AUN-TEST-1): it links to `/settings/profile`, it is shown on every view but that one, and it is never a gate.
 */
afterEach(() => {
  cleanup();
  resetKit();
});

describe('the notice of a due confirmation', () => {
  it('names the question and links to the page of the entry', async () => {
    await useProfile('workshop#confirmation-due');
    render(ConfirmationNotice, { route: 'due' });
    const notice = screen.getByTestId('confirmation-notice');
    expect(notice).toHaveTextContent('Is your entry still right?');
    expect(notice).toHaveTextContent('nothing else is blocked');
    expect(screen.getByRole('link', { name: 'Check my entry' })).toHaveAttribute(
      'href',
      '/settings/profile',
    );
  });

  it.each(['due', 'samm.scope', 'catalogs.persons', 'settings', null])(
    'is shown on the view %s',
    async (route) => {
      await useProfile('workshop#confirmation-due');
      render(ConfirmationNotice, { route });
      expect(screen.getByTestId('confirmation-notice')).toBeInTheDocument();
    },
  );

  it('is not shown on the page of the entry, which asks the question itself', async () => {
    await useProfile('workshop#confirmation-due');
    render(ConfirmationNotice, { route: 'settings.profile' });
    expect(screen.queryByTestId('confirmation-notice')).toBeNull();
  });

  it('is not shown while nothing is due, and not before a session is read', async () => {
    await useProfile('workshop');
    render(ConfirmationNotice, { route: 'due' });
    expect(screen.queryByTestId('confirmation-notice')).toBeNull();
    cleanup();
    resetKit();
    render(ConfirmationNotice, { route: 'due' });
    expect(screen.queryByTestId('confirmation-notice')).toBeNull();
  });

  it('is not shown to a user who still has to do the first login', async () => {
    await useProfile('first-login');
    render(ConfirmationNotice, { route: 'welcome' });
    expect(screen.queryByTestId('confirmation-notice')).toBeNull();
  });

  it('speaks German', async () => {
    await useProfile('workshop#confirmation-due', 'de');
    render(ConfirmationNotice, { route: 'due' });
    expect(screen.getByTestId('confirmation-notice')).toHaveTextContent('Stimmt Ihr Eintrag noch?');
    expect(screen.getByRole('link', { name: 'Meinen Eintrag prüfen' })).toBeInTheDocument();
  });
});
