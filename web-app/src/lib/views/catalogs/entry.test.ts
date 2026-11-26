import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
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

import { resetKit, useProfile, type Kit } from '../documents/testkit';
import CatalogsView, { resetFirstVisit } from './CatalogsView.svelte';

/**
 * The entry sheet of the Catalogs lens against the `workshop`, `catalog-admin` and `empty` profiles of the scenario mock
 * (AUN-TEST-1): reading, changing, creating and retiring an entry, the refusals the register names (`VALIDATION`,
 * `ID_TAKEN`, `RETIRED`, `FORBIDDEN`), a sheet that is read only, and an entry that someone else saved meanwhile.
 */
beforeEach(() => {
  resetFirstVisit();
  navigation.callback = null;
  navigation.goto.mockClear();
});
afterEach(() => {
  cleanup();
  resetKit();
});

/** Opens the address of an entry. */
async function openEntry(
  catalog: string,
  id: string,
  profile = 'catalog-admin',
  answers: Record<string, unknown> = {},
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, 'en', answers);
  const onnavigate = vi.fn();
  render(CatalogsView, { route: 'catalogs.entry', params: { catalog, id }, onnavigate });
  await screen.findByTestId('entry-form');
  return { ...kit, onnavigate };
}

/** Opens the address of a new entry. */
async function openNew(
  catalog: string,
  profile = 'catalog-admin',
  answers: Record<string, unknown> = {},
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, 'en', answers);
  const onnavigate = vi.fn();
  render(CatalogsView, { route: 'catalogs.new', params: { catalog }, onnavigate });
  return { ...kit, onnavigate };
}

const name = () => screen.getByLabelText(/^Name/);
const save = () => screen.getByTestId('save-entry');
const sent = (kit: Kit, request: string) =>
  kit.bodies.filter((body) => body.request === request).map((body) => body.body);

describe('reading an entry', () => {
  it('shows the form with the values of the entry, its facts and its signed history', async () => {
    await openEntry('team', 'payments');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Payments');
    expect(name()).toHaveValue('Payments');
    expect(screen.getByTestId('entry-sheet')).toHaveTextContent('Last saved');
    const history = screen.getByTestId('entry-history');
    expect(history.querySelectorAll('li').length).toBeGreaterThan(0);
    expect(history).toHaveTextContent('Created the entry');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Everything is saved.');
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    // The reason is said once, beside the act, and in other words than the status.
    expect(screen.getByText('Nothing changed since the last save.')).toBeInTheDocument();
  });

  it('reads the id, never edits it: the address decides', async () => {
    await openEntry('team', 'payments');
    expect(screen.queryByLabelText(/^Id/)).toBeNull();
    expect(screen.getByTestId('entry-form')).toHaveTextContent('payments');
  });

  it('shows the not-found view for an entry that does not exist', async () => {
    await useProfile('catalog-admin');
    render(CatalogsView, {
      route: 'catalogs.entry',
      params: { catalog: 'team', id: 'nobody' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows the entry once someone else created it, after the not-found view for it', async () => {
    const kit = await useProfile('catalog-admin');
    const real = (globalThis as { fetch: typeof fetch }).fetch;
    let created = false;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      !created && String(input).endsWith('/catalogs/service/notification-gateway')
        ? Promise.resolve(new Response(JSON.stringify({ outcome: 'NOT_FOUND' }), { status: 404 }))
        : real(input, init),
    );
    try {
      render(CatalogsView, {
        route: 'catalogs.entry',
        params: { catalog: 'service', id: 'notification-gateway' },
        onnavigate: vi.fn(),
      });
      expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
      created = true;
      kit.emit('catalog-changed', { catalog: 'service', id: 'notification-gateway' });
      expect(await screen.findByTestId('entry-form')).toBeInTheDocument();
      expect(screen.queryByTestId('not-found-view')).toBeNull();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('reads a retired entry, says so and offers neither a change nor a retirement', async () => {
    await openEntry('service', 'ledger');
    expect(screen.getByTestId('entry-state')).toHaveTextContent('Retired');
    expect(screen.getByTestId('retired-notice')).toHaveTextContent('This entry is retired');
    expect(screen.queryByTestId('save-entry')).toBeNull();
    expect(screen.queryByTestId('retire-entry')).toBeNull();
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'This entry is retired. It can be read only.',
    );
    expect(screen.getByTestId('entry-history')).toHaveTextContent('Retired the entry');
  });

  it.each(['workshop', 'read-only'])(
    'reads without the right to administer the catalogs, in %s, and offers no act',
    async (profile) => {
      await openEntry('team', 'payments', profile);
      // The status says it once; no notice repeats it.
      expect(screen.getByTestId('save-state')).toHaveTextContent(
        'Changing it needs the right to administer the catalogs.',
      );
      expect(screen.queryByTestId('no-right-notice')).toBeNull();
      expect(screen.queryByTestId('save-entry')).toBeNull();
      expect(screen.queryByTestId('retire-entry')).toBeNull();
      expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
      expect(screen.queryByLabelText(/^Name/)).toBeNull();
    },
  );
});

describe('the sheet of a service', () => {
  it('shows the stored and the effective protection needs, and which dependency decides', async () => {
    await openEntry('service', 'payment-api');
    const needs = screen.getByTestId('needs-table');
    const confidentiality = within(within(needs).getByTestId('needs-confidentiality'));
    expect(confidentiality.getByText('Confidentiality')).toBeInTheDocument();
    expect(confidentiality.getByText('High')).toBeInTheDocument();
    expect(confidentiality.getByText('Very high')).toBeInTheDocument();
    expect(confidentiality.getByRole('link', { name: 'Customer database' })).toHaveAttribute(
      'href',
      '/catalogs/service/customer-db',
    );
    const integrity = within(screen.getByTestId('needs-integrity'));
    expect(integrity.getByRole('link', { name: 'Identity Provider' })).toHaveAttribute(
      'href',
      '/catalogs/service/identity-provider',
    );
    // The service itself decides what no dependency raises.
    const availability = within(screen.getByTestId('needs-availability'));
    expect(availability.getByText('This service')).toBeInTheDocument();
    expect(availability.queryByRole('link')).toBeNull();
  });

  it('reads the stored needs from the entry that supplies the effective ones, not from the form', async () => {
    const kit = await openEntry('service', 'payment-api');
    const stored = () =>
      within(screen.getByTestId('needs-availability')).getAllByRole('cell')[0].textContent;
    expect(stored()).toBe('High');
    // The answer of the entry read after the save is held back: the table keeps the entry it was read from.
    const real = (globalThis as { fetch: typeof fetch }).fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    let saved = false;
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      const request = String(input);
      if (init?.method === 'PUT') saved = true;
      else if (saved && request.endsWith('/catalogs/service/payment-api')) await gate;
      return real(input, init);
    });
    try {
      await fireEvent.change(screen.getByLabelText(/^Availability/), {
        target: { value: 'very-high' },
      });
      await fireEvent.click(save());
      await waitFor(() =>
        expect(kit.requests).toContain('PUT /api/v1/catalogs/service/payment-api'),
      );
      await waitFor(() => expect(save()).toHaveAttribute('aria-disabled', 'true'));
      expect(stored()).toBe('High');
    } finally {
      release();
      vi.unstubAllGlobals();
    }
  });

  it('lists the dependencies as a chain with the way they were reached and whether they count', async () => {
    await openEntry('service', 'payment-api');
    const rows = within(screen.getByTestId('depends-table')).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(4);
    const database = within(screen.getByTestId('depends-service:customer-db'));
    expect(database.getByRole('link', { name: 'Customer database' })).toBeInTheDocument();
    expect(database.getByText('This service')).toBeInTheDocument();
    expect(database.getByText('Counts')).toBeInTheDocument();
    expect(database.getByText('Very high')).toBeInTheDocument();
    const hosting = within(screen.getByTestId('depends-external:cloud-hosting'));
    expect(hosting.getByText('Customer database')).toBeInTheDocument();
    expect(hosting.getByText('No needs of its own, does not count')).toBeInTheDocument();
    expect(hosting.getByRole('link', { name: 'Cloud hosting' })).toHaveAttribute(
      'href',
      '/catalogs/external/cloud-hosting',
    );
    expect(screen.queryByTestId('cycle-notice')).toBeNull();
  });

  it('names the services on a cycle in a notice above the form, and marks a retired dependency', async () => {
    await openEntry('service', 'reporting');
    const notice = screen.getByTestId('cycle-notice');
    expect(notice).toHaveTextContent('Services depend on each other in a circle');
    expect(notice).toHaveTextContent('Reporting Service, Report scheduler');
    expect(
      within(screen.getByTestId('depends-service:ledger')).getByText('Retired, does not count'),
    ).toBeInTheDocument();
    // The notice stands above the form, never as a refusal of it.
    const form = screen.getByTestId('entry-form');
    expect(notice.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('says so for a service that depends on nothing, and shows no table of dependencies', async () => {
    await openEntry('service', 'ledger');
    expect(screen.getByTestId('depends-none')).toHaveTextContent('depends on nothing');
    expect(screen.queryByTestId('depends-table')).toBeNull();
    expect(
      within(screen.getByTestId('needs-integrity')).getByText('This service'),
    ).toBeInTheDocument();
  });

  it('shows what depends-on holds in the form, names of services and of external parties', async () => {
    await openEntry('service', 'payment-api');
    const table = screen.getByTestId('table--dependsOn');
    expect(await within(table).findByText('Customer database')).toBeInTheDocument();
    expect(within(table).getByText('Payment service provider')).toBeInTheDocument();
  });

  it('shows no protection needs for any other catalog', async () => {
    await openEntry('system', 'webshop');
    expect(screen.queryByTestId('service-needs')).toBeNull();
  });
});

describe('changing an entry', () => {
  it('saves the whole entry with PUT, says when, and reads the entry again', async () => {
    const kit = await openEntry('team', 'payments');
    await fireEvent.input(name(), { target: { value: 'Payments Platform' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Changed. Not saved yet.');
    expect(save()).not.toHaveAttribute('aria-disabled', 'true');
    await fireEvent.click(save());
    await waitFor(() => expect(screen.getByTestId('save-state')).toHaveTextContent('Saved at'));
    const [body] = sent(kit, 'PUT /api/v1/catalogs/team/payments') as {
      value: Record<string, unknown>;
    }[];
    expect(body.value).toMatchObject({ id: 'payments', name: 'Payments Platform' });
    // The entry and the list are read again after the save.
    const put = kit.requests.indexOf('PUT /api/v1/catalogs/team/payments');
    const after = kit.requests.slice(put + 1);
    expect(after).toContain('GET /api/v1/catalogs/team/payments');
    expect(after).toContain('GET /api/v1/catalogs/team');
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    expect(name()).toHaveValue('Payments Platform');
  });

  it('keeps the change on the page and shows the fields the server refused', async () => {
    await openEntry('service', 'payment-api', 'catalog-admin#catalog-invalid');
    await fireEvent.input(name(), { target: { value: '' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'Some entries are not valid',
    );
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
    expect(screen.getByTestId('save-state')).toHaveTextContent('Some entries need a correction.');
    expect(name()).toHaveValue('');
    expect(screen.getByTestId('entry-form')).toHaveTextContent('Fill in this field');
  });

  it('says that the entry was retired meanwhile and reads it again', async () => {
    const kit = await openEntry('service', 'payment-api', 'catalog-admin', {
      'PUT /api/v1/catalogs/service/payment-api': new Response(
        JSON.stringify({ outcome: 'RETIRED' }),
        { status: 409 },
      ),
    });
    await fireEvent.input(name(), { target: { value: 'Payments API' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'This entry is retired and cannot be changed.',
    );
    await waitFor(() =>
      expect(
        kit.requests.filter((request) => request === 'GET /api/v1/catalogs/service/payment-api'),
      ).toHaveLength(2),
    );
  });

  it.each([
    ['catalog-rejected', 'The Git server refused the change'],
    ['git-unavailable', 'The Git server cannot be reached'],
  ])('keeps the change and says what went wrong in %s', async (state, text) => {
    await openEntry('service', 'payment-api', `catalog-admin#${state}`);
    await fireEvent.input(name(), { target: { value: 'Payments API' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(text);
    expect(name()).toHaveValue('Payments API');
  });

  it('answers a refused right with a notice, and keeps the change', async () => {
    await openEntry('team', 'payments', 'catalog-admin', {
      'PUT /api/v1/catalogs/team/payments': new Response(JSON.stringify({ outcome: 'FORBIDDEN' }), {
        status: 403,
      }),
    });
    await fireEvent.input(name(), { target: { value: 'Payments Platform' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'You have no right for this action.',
    );
  });

  it('asks before the page is left with changes that are saved nowhere', async () => {
    await openEntry('team', 'payments');
    const leaving = {
      cancel: vi.fn(),
      willUnload: false,
      to: { url: new URL('http://localhost/catalogs/team') },
      type: 'link',
    };
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
    await fireEvent.input(name(), { target: { value: 'Payments Platform' } });
    navigation.callback!(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
    await fireEvent.click(await screen.findByTestId('leave-confirm'));
    expect(navigation.goto).toHaveBeenCalledWith('/catalogs/team');
  });
});

describe('a new entry', () => {
  it('shows the empty form with the id to choose, and nothing to save yet', async () => {
    await openNew('team');
    expect(await screen.findByTestId('entry-sheet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New Team');
    expect(screen.getByLabelText(/^Id/)).toBeInTheDocument();
    expect(screen.getByText('Nothing is stored before the first save.')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Not saved yet. Nothing is kept until the first save.',
    );
    expect(save()).toHaveAttribute('aria-disabled', 'true');
    // Nothing was saved before, so the reason is not "nothing changed since the last save".
    expect(screen.getByText('Fill in the form first.')).toBeInTheDocument();
    expect(screen.queryByText('Nothing changed since the last save.')).toBeNull();
    expect(screen.queryByTestId('retire-entry')).toBeNull();
  });

  it('creates the entry with POST and moves to its address in place of the form', async () => {
    const kit = await openNew('team');
    await fireEvent.input(await screen.findByLabelText(/^Id/), { target: { value: 'platform' } });
    await fireEvent.input(name(), { target: { value: 'Platform' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Not saved yet. Your text stays');
    await fireEvent.click(save());
    await waitFor(() =>
      expect(kit.onnavigate).toHaveBeenCalledWith('/catalogs/team/platform', { replace: true }),
    );
    const [body] = sent(kit, 'POST /api/v1/catalogs/team') as { value: Record<string, unknown> }[];
    expect(body.value).toEqual({ id: 'platform', name: 'Platform' });
  });

  it('does not ask before it leaves for the entry it created', async () => {
    const kit = await openNew('team');
    await fireEvent.input(await screen.findByLabelText(/^Id/), { target: { value: 'platform' } });
    await fireEvent.click(save());
    await waitFor(() => expect(kit.onnavigate).toHaveBeenCalled());
    const leaving = {
      cancel: vi.fn(),
      willUnload: false,
      to: { url: new URL('http://localhost/x') },
    };
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
  });

  it('says that the id is taken, also by a retired entry, and keeps what was typed', async () => {
    await openNew('service', 'catalog-admin#catalog-id-taken');
    await fireEvent.input(await screen.findByLabelText(/^Id/), { target: { value: 'ledger' } });
    await fireEvent.input(name(), { target: { value: 'Ledger again' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'An entry with this id exists already, perhaps a retired one.',
    );
    expect(name()).toHaveValue('Ledger again');
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'failed');
  });

  it('names the fields the server refused for a new entry', async () => {
    await openNew('service', 'catalog-admin#catalog-invalid');
    await fireEvent.input(await screen.findByLabelText(/^Id/), { target: { value: 'gateway' } });
    await fireEvent.click(save());
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'Some entries are not valid',
    );
    expect(screen.getByTestId('entry-form')).toHaveTextContent('Fill in this field');
  });

  it('offers nothing to a person without the right and links back to the list', async () => {
    await openNew('team', 'workshop');
    expect(await screen.findByTestId('entry-no-right')).toHaveTextContent(
      'Changing the catalogs needs the right to administer them.',
    );
    expect(screen.getByRole('link', { name: 'Back to the list' })).toHaveAttribute(
      'href',
      '/catalogs/team',
    );
    expect(screen.queryByTestId('save-entry')).toBeNull();
  });

  it('opens the form of a catalog with another schema', async () => {
    await openNew('external');
    expect(await screen.findByLabelText(/^Kind/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New External party');
  });
});

describe('retiring an entry', () => {
  it('asks first, says what retiring means, and retires with POST', async () => {
    const kit = await openEntry('service', 'customer-portal');
    await fireEvent.click(screen.getByTestId('retire-entry'));
    const dialog = await screen.findByRole('dialog');
    expect(dialog).toHaveTextContent('Retire Customer Portal?');
    expect(dialog).toHaveTextContent('keep their reference and show it as retired');
    expect(kit.requests.filter((request) => request.includes('retirement'))).toEqual([]);
    await fireEvent.click(screen.getByTestId('retire-confirm'));
    await waitFor(() =>
      expect(kit.requests).toContain('POST /api/v1/catalogs/service/customer-portal/retirement'),
    );
    expect(await screen.findByText('Customer Portal is retired.')).toBeInTheDocument();
  });

  it('changes nothing when the person cancels', async () => {
    const kit = await openEntry('service', 'customer-portal');
    await fireEvent.click(screen.getByTestId('retire-entry'));
    await fireEvent.click(await screen.findByTestId('retire-cancel'));
    expect(kit.requests.filter((request) => request.includes('retirement'))).toEqual([]);
  });

  it('warns that changes not saved are dropped', async () => {
    await openEntry('service', 'customer-portal');
    await fireEvent.input(name(), { target: { value: 'Portal Gate' } });
    await fireEvent.click(screen.getByTestId('retire-entry'));
    expect(await screen.findByTestId('retire-dirty')).toHaveTextContent(
      'Changes you have not saved',
    );
    await fireEvent.click(screen.getByTestId('retire-confirm'));
    // The entry reads only from here on, with the name it had.
    await waitFor(() =>
      expect(screen.getByTestId('entry-form')).toHaveTextContent('Customer Portal'),
    );
    expect(screen.getByTestId('entry-form')).not.toHaveTextContent('Portal Gate');
  });

  it('shows the entry retired once it is read again', async () => {
    const kit = await openEntry('service', 'customer-portal');
    kit.scenario.goto('service-retired');
    await fireEvent.click(screen.getByTestId('retire-entry'));
    await fireEvent.click(await screen.findByTestId('retire-confirm'));
    expect(await screen.findByTestId('retired-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('save-entry')).toBeNull();
  });

  it('reads as retired as soon as the retirement succeeded, before the entry is read again', async () => {
    const kit = await openEntry('service', 'customer-portal');
    const real = (globalThis as { fetch: typeof fetch }).fetch;
    let retired = false;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'POST') retired = true;
      return retired && String(input).endsWith('/catalogs/service/customer-portal')
        ? Promise.resolve(
            new Response(JSON.stringify({ outcome: 'GIT_UNAVAILABLE' }), { status: 503 }),
          )
        : real(input, init);
    });
    try {
      await fireEvent.click(screen.getByTestId('retire-entry'));
      await fireEvent.click(await screen.findByTestId('retire-confirm'));
      expect(await screen.findByTestId('retired-notice')).toBeInTheDocument();
      expect(screen.queryByTestId('retire-entry')).toBeNull();
      expect(screen.queryByTestId('save-entry')).toBeNull();
      expect(
        kit.requests.filter((request) => request.includes('customer-portal/retirement')),
      ).toHaveLength(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('sends no retirement when the entry was retired by someone else while the question was open', async () => {
    const kit = await openEntry('service', 'customer-portal');
    await fireEvent.click(screen.getByTestId('retire-entry'));
    const confirm = await screen.findByTestId('retire-confirm');
    kit.scenario.goto('service-retired');
    kit.emit('catalog-changed', { catalog: 'service', id: 'customer-portal' });
    expect(await screen.findByTestId('retired-notice')).toBeInTheDocument();
    await fireEvent.click(confirm);
    expect(kit.requests.filter((request) => request.includes('retirement'))).toEqual([]);
  });

  it('says what went wrong when the Git server refuses the retirement', async () => {
    await openEntry('service', 'customer-portal', 'catalog-admin#catalog-rejected');
    await fireEvent.click(screen.getByTestId('retire-entry'));
    await fireEvent.click(await screen.findByTestId('retire-confirm'));
    expect(await screen.findByTestId('failure-notice')).toHaveTextContent(
      'The Git server refused the change.',
    );
    expect(screen.queryByTestId('retired-notice')).toBeNull();
  });
});

describe('an entry that someone else saved', () => {
  it('shows the new state at once and says who saved it, when the person changed nothing', async () => {
    const kit = await openEntry('service', 'payment-api');
    expect(screen.getByLabelText(/^Description/)).toHaveValue(
      'Takes payments for the web shop and talks to the payment provider.',
    );
    kit.scenario.goto('catalog-changed-elsewhere');
    kit.emit('catalog-changed', { catalog: 'service', id: 'payment-api' });
    await waitFor(() =>
      expect(screen.getByLabelText(/^Description/)).not.toHaveValue(
        'Takes payments for the web shop and talks to the payment provider.',
      ),
    );
    expect(
      screen.getByText('Jordan Weber saved this entry. What you see is up to date.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('keeps what the person typed and warns that saving replaces what was saved', async () => {
    const kit = await openEntry('service', 'payment-api');
    await fireEvent.input(name(), { target: { value: 'Payments API' } });
    kit.scenario.goto('catalog-changed-elsewhere');
    kit.emit('catalog-changed', { catalog: 'service', id: 'payment-api' });
    const notice = await screen.findByTestId('stale-notice');
    expect(notice).toHaveTextContent('Jordan Weber saved this entry after you opened it.');
    expect(name()).toHaveValue('Payments API');
  });

  it('drops what the person typed when the entry was retired meanwhile, so nothing unsavable is left', async () => {
    const kit = await openEntry('service', 'customer-portal');
    await fireEvent.input(name(), { target: { value: 'Portal' } });
    kit.scenario.goto('service-retired');
    kit.emit('catalog-changed', { catalog: 'service', id: 'customer-portal' });
    expect(await screen.findByTestId('retired-notice')).toBeInTheDocument();
    expect(screen.queryByTestId('stale-notice')).toBeNull();
    await waitFor(() =>
      expect(screen.getByTestId('entry-form')).toHaveTextContent('Customer Portal'),
    );
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'read-only');
  });

  it('shows what someone else saved once the person takes their own changes back', async () => {
    const kit = await openEntry('service', 'payment-api');
    const description = 'Takes payments for the web shop and talks to the payment provider.';
    await fireEvent.input(name(), { target: { value: 'Payments API' } });
    kit.scenario.goto('catalog-changed-elsewhere');
    kit.emit('catalog-changed', { catalog: 'service', id: 'payment-api' });
    await screen.findByTestId('stale-notice');
    expect(screen.getByLabelText(/^Description/)).toHaveValue(description);
    await fireEvent.input(name(), { target: { value: 'Payment API' } });
    await waitFor(() => expect(screen.getByLabelText(/^Description/)).not.toHaveValue(description));
    expect(screen.queryByTestId('stale-notice')).toBeNull();
    expect(screen.getByTestId('save-state')).toHaveAttribute('data-state', 'clean');
  });

  it('shows what someone else saved while the own save was under way, once the save is done', async () => {
    const kit = await openEntry('service', 'payment-api');
    const description = 'Takes payments for the web shop and talks to the payment provider.';
    const real = (globalThis as { fetch: typeof fetch }).fetch;
    let release: () => void = () => {};
    const gate = new Promise<void>((resolve) => (release = resolve));
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
      if (init?.method === 'PUT') await gate;
      return real(input, init);
    });
    try {
      await fireEvent.input(name(), { target: { value: 'Payments API' } });
      await fireEvent.click(save());
      kit.scenario.goto('catalog-changed-elsewhere');
      kit.emit('catalog-changed', { catalog: 'service', id: 'payment-api' });
      await screen.findByTestId('stale-notice');
      release();
      await waitFor(() =>
        expect(screen.getByLabelText(/^Description/)).not.toHaveValue(description),
      );
      expect(screen.queryByTestId('stale-notice')).toBeNull();
    } finally {
      release();
      vi.unstubAllGlobals();
    }
  });

  it('drops the marks of a refused save when the entry was retired meanwhile', async () => {
    const kit = await openEntry('service', 'customer-portal', 'catalog-admin', {
      'PUT /api/v1/catalogs/service/customer-portal': new Response(
        JSON.stringify({ outcome: 'VALIDATION', errors: [{ pointer: '/name', code: 'REQUIRED' }] }),
        { status: 422 },
      ),
    });
    await fireEvent.input(name(), { target: { value: '' } });
    await fireEvent.click(save());
    await waitFor(() =>
      expect(screen.getByTestId('entry-form')).toHaveTextContent('Fill in this field'),
    );
    kit.scenario.goto('service-retired');
    kit.emit('catalog-changed', { catalog: 'service', id: 'customer-portal' });
    expect(await screen.findByTestId('retired-notice')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId('entry-form')).not.toHaveTextContent('Fill in this field'),
    );
  });

  it('reads nothing for an entry of another id', async () => {
    const kit = await openEntry('service', 'payment-api');
    const reads = () =>
      kit.requests.filter((request) => request === 'GET /api/v1/catalogs/service/payment-api')
        .length;
    kit.emit('catalog-changed', { catalog: 'service', id: 'reporting' });
    expect(reads()).toBe(1);
  });
});

describe('the German texts', () => {
  it('shows the sheet and the needs in German', async () => {
    await useProfile('catalog-admin', 'de');
    render(CatalogsView, {
      route: 'catalogs.entry',
      params: { catalog: 'service', id: 'payment-api' },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('entry-form');
    expect(screen.getByLabelText(/^Beschreibung/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Wirksamer Schutzbedarf' })).toBeInTheDocument();
    expect(screen.getByTestId('save-entry')).toHaveTextContent('Speichern');
    expect(screen.getByTestId('needs-confidentiality')).toHaveTextContent('Vertraulichkeit');
    expect(screen.getByTestId('needs-confidentiality')).toHaveTextContent('Sehr hoch');
  });
});
