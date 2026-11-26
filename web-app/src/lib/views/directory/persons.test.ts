import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it } from 'vitest';
import { hold, resetKit, useProfile, type Kit } from '../documents/testkit';
import PersonsView from './PersonsView.svelte';

/**
 * The person directory (UC-CAT-4, UC-CAT-5, `/directory/persons`) against the `catalog-admin`, `workshop`, `read-only`
 * and `empty` profiles of the scenario mock (AUN-TEST-1): the table with its search, the entry of several persons at once,
 * the erasure behind its confirmation, `MANAGED_BY_SOURCE` and the other refusals, and a user without the right.
 */
afterEach(() => {
  cleanup();
  resetKit();
});

/** Opens the page and waits for the table. */
async function open(
  profile = 'catalog-admin',
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit> {
  const kit = await useProfile(profile, lang, answers);
  render(PersonsView);
  await screen.findByTestId('persons-table');
  return kit;
}

const sentTo = (kit: Kit, request: string) =>
  kit.bodies.filter((body) => body.request === request).map((body) => body.body);

/** Fills row `index` of the entry with a name and, when given, one team and one role. */
async function fill(index: number, name: string, team?: string, role?: string, at = 0) {
  await fireEvent.input(screen.getByTestId(`person-row-${index}-name`), {
    target: { value: name },
  });
  if (team) {
    await fireEvent.change(screen.getByTestId(`person-row-${index}-membership-${at}-team`), {
      target: { value: team },
    });
  }
  if (role) {
    await fireEvent.change(screen.getByTestId(`person-row-${index}-membership-${at}-role`), {
      target: { value: role },
    });
  }
}

describe('the table', () => {
  it('lists every person with the names of team and role, and the state in words', async () => {
    const kit = await open();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Persons');
    const rows = screen.getByTestId('persons-table').querySelectorAll('tbody tr');
    expect(rows).toHaveLength(8);
    const alex = screen.getByTestId('person-p-4c1a9e');
    expect(alex).toHaveTextContent('Alex Example');
    expect(alex).toHaveTextContent('Payments, Security Champion');
    expect(alex).toHaveTextContent('Bound to a login');
    const mira = screen.getByTestId('person-p-7d52e8');
    expect(mira).toHaveTextContent('Mira Haas');
    expect(mira).toHaveTextContent('Mobile Apps, Developer');
    expect(mira).toHaveTextContent('Not yet bound');
    // Nobody is shown by the pseudonym.
    expect(screen.getByTestId('persons-table')).not.toHaveTextContent('p-4c1a9e');
    expect(kit.requests).toContain('GET /api/v1/directory/persons');
  });

  it('narrows by the typed text at once and asks the server once the typing pauses', async () => {
    const kit = await open();
    await fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'WEB' } });
    expect(screen.getByTestId('persons-table').querySelectorAll('tbody tr')).toHaveLength(1);
    expect(screen.getByTestId('person-p-2b7f10')).toHaveTextContent('Jordan Weber');
    await waitFor(() => expect(kit.requests).toContain('GET /api/v1/directory/persons?q=WEB'));
    await fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No person matches')).toBeInTheDocument();
    await fireEvent.input(screen.getByLabelText('Search by name'), { target: { value: '' } });
    expect(await screen.findByTestId('persons-table')).toBeInTheDocument();
  });

  it('says that more matched than are listed', async () => {
    await open('catalog-admin', 'en', {
      'GET /api/v1/directory/persons': {
        persons: [
          {
            pseudonym: 'p-1',
            name: 'Alex',
            state: 'bound',
            memberships: [{ team: 'team:payments', role: 'role:developer' }],
          },
        ],
        truncated: true,
      },
    });
    expect(screen.getByTestId('persons-truncated')).toHaveTextContent(
      'Only the first 1 persons are listed. Narrow the search.',
    );
  });

  it('shows a former member by the word, and offers no erasure of someone erased already', async () => {
    await open('catalog-admin', 'en', {
      'GET /api/v1/directory/persons': {
        persons: [
          {
            pseudonym: 'p-9',
            name: null,
            state: 'former',
            memberships: [{ team: 'team:payments', role: 'role:developer' }],
          },
        ],
        truncated: false,
      },
    });
    const row = screen.getByTestId('person-p-9');
    expect(row).toHaveTextContent('Former member');
    expect(screen.getByTestId('erase-p-9')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('This person is erased already.')).toBeInTheDocument();
  });

  it('names a team or a role the catalog does not know by its id', async () => {
    await open('catalog-admin', 'en', {
      'GET /api/v1/directory/persons': {
        persons: [
          {
            pseudonym: 'p-9',
            name: 'Kim',
            state: 'unbound',
            memberships: [{ team: 'team:vanished', role: 'role:developer' }],
          },
        ],
        truncated: false,
      },
    });
    expect(screen.getByTestId('person-p-9')).toHaveTextContent('vanished, Developer');
  });

  it('invites the first entries when the directory is empty, to a person who may add them', async () => {
    await useProfile('empty');
    render(PersonsView);
    expect(await screen.findByText('No persons yet')).toBeInTheDocument();
    expect(screen.getByText('Add the first persons below.')).toBeInTheDocument();
    // The lede of the entry says what prefilling means; the page does not say it twice.
    expect(screen.getAllByText(/before they log in/)).toHaveLength(1);
    expect(screen.queryByLabelText('Search by name')).toBeNull();
    expect(screen.getByTestId('persons-add')).toBeInTheDocument();
  });

  it('says that nobody is entered yet to a person who may only read', async () => {
    await useProfile('read-only', 'en', {
      'GET /api/v1/directory/persons': { persons: [], truncated: false },
    });
    render(PersonsView);
    expect(
      await screen.findByText('Nobody has been entered in the directory yet.'),
    ).toBeInTheDocument();
  });

  it('says that the table cannot be read when the request fails', async () => {
    await useProfile('catalog-admin', 'en', {
      'GET /api/v1/directory/persons': new Response(JSON.stringify({ outcome: 'FORBIDDEN' }), {
        status: 403,
      }),
    });
    render(PersonsView);
    expect(await screen.findByText('You have no right for this action.')).toBeInTheDocument();
    expect(screen.queryByTestId('persons-table')).toBeNull();
  });
});

describe('the teams and roles', () => {
  it('keeps the notice that they cannot be read, though the table is read after it', async () => {
    await open('catalog-admin', 'en', {
      'GET /api/v1/catalogs/team': new Response(JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }), {
        status: 503,
      }),
    });
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('persons-table')).toBeInTheDocument();
  });
});

describe('without the right', () => {
  it.each(['workshop', 'read-only'])('reads the table and offers no act in %s', async (profile) => {
    await open(profile);
    expect(screen.getByTestId('persons-read-only')).toHaveTextContent(
      'You can read the persons. Adding and erasing them needs the right to administer the catalogs.',
    );
    expect(screen.queryByTestId('persons-add')).toBeNull();
    expect(screen.queryByText('Erase')).toBeNull();
    expect(screen.getByTestId('persons-table').querySelectorAll('thead th')).toHaveLength(3);
    expect(screen.getByTestId('person-p-7d52e8')).toHaveTextContent('Mira Haas');
  });

  it('shows the notice only to a person without the right', async () => {
    await open('catalog-admin');
    expect(screen.queryByTestId('persons-read-only')).toBeNull();
    expect(screen.getByTestId('persons-table').querySelectorAll('thead th')).toHaveLength(4);
  });
});

describe('adding persons', () => {
  it('sends the filled rows in one request and shows the new persons in the table', async () => {
    const kit = await open();
    expect(screen.getByTestId('persons-submit')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Fill in a name, a team and a role first.')).toBeInTheDocument();
    await fill(0, ' Nadia Kovac ', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Omar Haddad', 'team:mobile', 'role:developer');
    expect(screen.getByTestId('persons-submit')).toHaveTextContent('Add 2 persons');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await waitFor(() =>
      expect(sentTo(kit, 'POST /api/v1/directory/persons')).toEqual([
        {
          persons: [
            {
              name: 'Nadia Kovac',
              memberships: [{ team: 'team:payments', role: 'role:developer' }],
            },
            { name: 'Omar Haddad', memberships: [{ team: 'team:mobile', role: 'role:developer' }] },
          ],
        },
      ]),
    );
    expect(await screen.findByText('2 persons were added.')).toHaveAttribute('role', 'status');
    await waitFor(() =>
      expect(screen.getByTestId('person-p-5c2d19')).toHaveTextContent('Nadia Kovac'),
    );
    expect(screen.getByTestId('person-p-a7e341')).toHaveTextContent('Not yet bound');
    // The entry starts again with one empty row.
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('');
    expect(screen.queryByTestId('person-row-1')).toBeNull();
  });

  it('leaves rows that nothing was typed in out of the request', async () => {
    const kit = await open();
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await screen.findByTestId('persons-done');
    expect(
      (sentTo(kit, 'POST /api/v1/directory/persons')[0] as { persons: unknown[] }).persons,
    ).toHaveLength(1);
  });

  it('asks for what is missing in a filled row before it sends anything', async () => {
    const kit = await open();
    await fill(0, 'Nadia Kovac', 'team:payments');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    expect(screen.getByText('Fill in this field.')).toBeInTheDocument();
    expect(sentTo(kit, 'POST /api/v1/directory/persons')).toEqual([]);
    await fill(0, '', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    expect(screen.getAllByText('Fill in this field.')).toHaveLength(1);
    expect(sentTo(kit, 'POST /api/v1/directory/persons')).toEqual([]);
  });

  it('warns about a name that is in the table already, and still allows it', async () => {
    await open();
    await fill(0, 'alex  example');
    expect(screen.getByTestId('person-row-0-same-name')).toHaveTextContent(
      'A person with this name is in the list already.',
    );
    await fill(0, 'Alex Examples');
    expect(screen.queryByTestId('person-row-0-same-name')).toBeNull();
  });

  it('shows the refusal of a team at the row and the field it belongs to', async () => {
    const kit = await open('catalog-admin#persons-invalid');
    await fill(0, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Omar Haddad', 'team:mobile', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    const team = await screen.findByTestId('person-row-1-membership-0-team');
    await waitFor(() =>
      expect(
        within(screen.getByTestId('person-row-1')).getByText(/This reference leads nowhere/),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId('person-row-0')).queryByText(/This reference leads nowhere/),
    ).toBeNull();
    expect(team).toHaveAccessibleDescription(/This reference leads nowhere/);
    expect(sentTo(kit, 'POST /api/v1/directory/persons')).toHaveLength(1);
    // What was typed stays.
    expect(screen.getByTestId('person-row-1-name')).toHaveValue('Omar Haddad');
  });

  it('puts the refusal at the row that was sent, whatever empty rows stand before it', async () => {
    await open('catalog-admin#persons-invalid');
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fill(2, 'Omar Haddad', 'team:mobile', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await waitFor(() =>
      expect(
        within(screen.getByTestId('person-row-2')).getByText(/This reference leads nowhere/),
      ).toBeInTheDocument(),
    );
    expect(
      within(screen.getByTestId('person-row-1')).queryByText(/This reference leads nowhere/),
    ).toBeNull();
  });

  it('keeps the refusal at the person it was said of when a row before it is removed', async () => {
    await open('catalog-admin#persons-invalid');
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fill(2, 'Omar Haddad', 'team:mobile', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await within(screen.getByTestId('person-row-2')).findByText(/This reference leads nowhere/);
    await fireEvent.click(screen.getByTestId('person-row-1-remove'));
    // Omar Haddad is the second row now, and the refusal went with him.
    expect(screen.getByTestId('person-row-1-name')).toHaveValue('Omar Haddad');
    expect(
      within(screen.getByTestId('person-row-1')).getByText(/This reference leads nowhere/),
    ).toBeInTheDocument();
    expect(
      within(screen.getByTestId('person-row-0')).queryByText(/This reference leads nowhere/),
    ).toBeNull();
  });

  it('keeps a person typed while the request waits, and clears only what was sent', async () => {
    await open();
    const release = hold('POST', '/api/v1/directory/persons');
    await fill(0, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(1, 'Omar Haddad');
    release();
    await screen.findByTestId('persons-done');
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('Omar Haddad');
    expect(screen.queryByTestId('person-row-1')).toBeNull();
  });

  it('says that the persons are kept elsewhere, and that nothing was changed', async () => {
    await open('catalog-admin#erase-managed-by-source');
    await fill(0, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    const notice = await screen.findByTestId('managed-notice');
    expect(notice).toHaveTextContent("Persons are kept in your organisation's own source");
    expect(notice).toHaveTextContent('Nothing was changed here.');
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('Nadia Kovac');
  });

  it('says that the Git server cannot be reached, and keeps what was typed', async () => {
    await open('catalog-admin#git-unavailable');
    await fill(0, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('persons-submit'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('Nadia Kovac');
  });

  it('removes a row, and empties the only one once something is typed in it', async () => {
    await open();
    // The only row with nothing in it has nothing to remove: the act is not offered.
    expect(screen.queryByTestId('person-row-0-remove')).toBeNull();
    await fireEvent.click(screen.getByTestId('persons-add-row'));
    await fill(0, 'One');
    await fill(1, 'Two');
    await fireEvent.click(screen.getByTestId('person-row-0-remove'));
    expect(screen.queryByTestId('person-row-1')).toBeNull();
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('Two');
    await fireEvent.click(screen.getByTestId('person-row-0-remove'));
    expect(screen.getByTestId('person-row-0-name')).toHaveValue('');
    expect(screen.queryByTestId('person-row-0-remove')).toBeNull();
  });

  it('takes at most 100 persons at once, and says so at the act that would add more', async () => {
    await open();
    for (let n = 1; n < 100; n += 1) await fireEvent.click(screen.getByTestId('persons-add-row'));
    expect(screen.getByTestId('persons-add-row')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('At most 100 persons can be added at once.')).toBeInTheDocument();
  });
});

describe('the teams and roles of a person', () => {
  it('offers the active entries only, and keeps at most five', async () => {
    await open();
    const team = screen.getByTestId('person-row-0-membership-0-team') as HTMLSelectElement;
    const names = [...team.options].map((option) => option.textContent);
    expect(names).toContain('Payments');
    expect(names).not.toContain('Legacy Billing');
    const role = screen.getByTestId('person-row-0-membership-0-role') as HTMLSelectElement;
    expect([...role.options].map((option) => option.textContent)).not.toContain('Release Manager');
    // One team and role cannot be removed: the act is not offered.
    expect(screen.queryByTestId('person-row-0-membership-0-remove')).toBeNull();
    for (let n = 1; n < 5; n += 1) {
      await fireEvent.click(screen.getByTestId('person-row-0-membership-add'));
    }
    expect(screen.getByTestId('person-row-0-membership-add')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('A person can have at most 5 teams and roles.')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('person-row-0-membership-4-remove'));
    expect(screen.queryByTestId('person-row-0-membership-4')).toBeNull();
  });

  it('sends a second membership with the first', async () => {
    const kit = await open();
    await fill(0, 'Nadia Kovac', 'team:payments', 'role:developer');
    await fireEvent.click(screen.getByTestId('person-row-0-membership-add'));
    await fill(0, 'Nadia Kovac', 'team:mobile', 'role:product-owner', 1);
    await fireEvent.click(screen.getByTestId('persons-submit'));
    await screen.findByTestId('persons-done');
    expect(sentTo(kit, 'POST /api/v1/directory/persons')[0]).toEqual({
      persons: [
        {
          name: 'Nadia Kovac',
          memberships: [
            { team: 'team:payments', role: 'role:developer' },
            { team: 'team:mobile', role: 'role:product-owner' },
          ],
        },
      ],
    });
  });
});

describe('erasing a person', () => {
  /** Opens the confirmation for Jordan Weber. */
  async function ask() {
    await fireEvent.click(screen.getByTestId('erase-p-2b7f10'));
    return screen.findByRole('dialog');
  }

  it('asks first, says that it cannot be undone, and names the person by the name the table shows', async () => {
    const kit = await open();
    expect(screen.getByTestId('erase-p-2b7f10')).toHaveAccessibleName('Erase Jordan Weber');
    const dialog = await ask();
    expect(dialog).toHaveAccessibleName('Erase Jordan Weber?');
    expect(dialog).toHaveTextContent('cannot be brought back');
    expect(dialog).not.toHaveTextContent('p-2b7f10');
    expect(sentTo(kit, 'POST /api/v1/directory/erasures')).toEqual([]);
  });

  it('erases nothing when the person cancels', async () => {
    const kit = await open();
    await ask();
    await fireEvent.click(screen.getByTestId('erase-cancel'));
    expect(sentTo(kit, 'POST /api/v1/directory/erasures')).toEqual([]);
    expect(screen.getByTestId('person-p-2b7f10')).toBeInTheDocument();
  });

  it('erases at once, without a step-up, and the table no longer lists the person', async () => {
    const kit = await open();
    await ask();
    await fireEvent.click(screen.getByTestId('erase-confirm'));
    expect(await screen.findByText('Jordan Weber is erased.')).toHaveAttribute('role', 'status');
    expect(sentTo(kit, 'POST /api/v1/directory/erasures')).toEqual([{ pseudonym: 'p-2b7f10' }]);
    await waitFor(() => expect(screen.queryByTestId('person-p-2b7f10')).toBeNull());
    expect(kit.scenario.state()).toBe('person-erased');
    expect(kit.requests.filter((request) => request.includes('stepup'))).toEqual([]);
  });

  it('says that the person is erased in the organisation’s own source, and changes nothing here', async () => {
    await open('catalog-admin#erase-managed-by-source');
    await ask();
    await fireEvent.click(screen.getByTestId('erase-confirm'));
    const notice = await screen.findByTestId('managed-notice');
    expect(notice).toHaveTextContent('Add and erase persons there. Nothing was changed here.');
    expect(screen.getByTestId('person-p-2b7f10')).toBeInTheDocument();
    expect(screen.queryByText('Jordan Weber is erased.')).toBeNull();
  });

  it('says that the Git server cannot be reached', async () => {
    await open('catalog-admin#git-unavailable', 'en', {
      'POST /api/v1/directory/erasures': new Response(
        JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }),
        { status: 503 },
      ),
    });
    await ask();
    await fireEvent.click(screen.getByTestId('erase-confirm'));
    expect(await screen.findByText(/The Git server cannot be reached/)).toBeInTheDocument();
    expect(screen.getByTestId('person-p-2b7f10')).toBeInTheDocument();
  });

  it('reads the table again when the person was erased by someone else meanwhile', async () => {
    const kit = await open('catalog-admin', 'en', {
      'POST /api/v1/directory/erasures': new Response(JSON.stringify({ outcome: 'NOT_FOUND' }), {
        status: 404,
      }),
    });
    await ask();
    const reads = () =>
      kit.requests.filter((request) => request === 'GET /api/v1/directory/persons').length;
    const before = reads();
    await fireEvent.click(screen.getByTestId('erase-confirm'));
    expect(
      await screen.findByText('This entry is gone already. The list is up to date.'),
    ).toBeInTheDocument();
    expect(reads()).toBe(before + 1);
    // The read that follows does not wipe the notice: give it time to finish.
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(
      screen.getByText('This entry is gone already. The list is up to date.'),
    ).toBeInTheDocument();
  });
});

describe('in German', () => {
  it('speaks German in the table, the entry and the confirmation', async () => {
    await open('catalog-admin', 'de');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Personen');
    expect(screen.getByTestId('person-p-7d52e8')).toHaveTextContent('Noch nicht verknüpft');
    expect(screen.getByTestId('person-p-4c1a9e')).toHaveTextContent(
      'Mit einer Anmeldung verknüpft',
    );
    expect(screen.getByTestId('persons-submit')).toHaveTextContent('Personen anlegen');
    await fireEvent.click(screen.getByTestId('erase-p-2b7f10'));
    expect(await screen.findByRole('dialog')).toHaveAccessibleName('Jordan Weber löschen?');
  });
});
