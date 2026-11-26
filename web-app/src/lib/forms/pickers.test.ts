import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { field, last, open } from './formHarness';
import PickerHarness from './PickerHarness.svelte';
import SchemaForm from './SchemaForm.svelte';
import { createFormServices } from './services';
import { CLEAN_NOTE, MARKED_NOTE, useMessages, useProfile } from './testkit';
import type { JsonObject } from './schema';

afterEach(() => vi.unstubAllGlobals());

/** @returns the texts of the options of a select */
function options(select: HTMLElement): string[] {
  return [...(select as HTMLSelectElement).options].map((option) => option.textContent ?? '');
}

describe('CatalogPicker (AUN-WEB-4, The Pickers)', () => {
  it('offers the entries that are not retired, and stores the reference', async () => {
    const { onchange } = await open('test-note');
    const service = field('Service') as HTMLSelectElement;
    await waitFor(() => expect(options(service)).toContain('Payment API'));
    expect(options(service)).toEqual([
      'Choose…',
      'Payment API',
      'Customer Portal',
      'Identity Provider',
      'Customer database',
      'Reporting Service',
      'Report scheduler',
      'Notification service',
    ]);
    await fireEvent.change(service, { target: { value: 'service:payment-api' } });
    expect(last(onchange)).toEqual({ service: 'service:payment-api' });
    await fireEvent.change(service, { target: { value: '' } });
    expect(last(onchange)).toEqual({});
  });

  it('shows a held retired entry with its name and the mark retired, and lets it be kept or replaced', async () => {
    const { onchange } = await open('test-note', { ...MARKED_NOTE });
    const service = field('Service') as HTMLSelectElement;
    await waitFor(() => expect(service.selectedOptions[0].textContent).toBe('Ledger'));
    const frame = service.closest('.field') as HTMLElement;
    await within(frame).findByText('Retired');
    expect(options(service)).toContain('Payment API');
    await fireEvent.change(service, { target: { value: 'service:reporting' } });
    expect(last(onchange).service).toBe('service:reporting');
    await waitFor(() => expect(within(frame).queryByText('Retired')).toBeNull());
  });

  it('leaves nothing below the select for a held entry that has no mark', async () => {
    await open('test-note', { ...CLEAN_NOTE });
    const service = field('Service') as HTMLSelectElement;
    await waitFor(() => expect(service.selectedOptions[0].textContent).toBe('Payment API'));
    const frame = service.closest('.field') as HTMLElement;
    // No holder, no resolved value, so the field keeps no blank line (the whitespace of a hidden mark broke `:empty`).
    expect(frame.querySelector('.field__after')?.childElementCount ?? 0).toBe(0);
    expect(within(frame).queryByTestId('resolved-catalog')).toBeNull();
  });

  it('shows a held reference that names no entry as the reference, marked not found', async () => {
    await open('test-note', { service: 'service:unknown-service' });
    const service = field('Service') as HTMLSelectElement;
    expect(service.selectedOptions[0].textContent).toBe('service:unknown-service');
    await within(service.closest('.field') as HTMLElement).findByText('Not found');
  });

  it('marks a held reference that is malformed or names another catalog as not found', async () => {
    for (const held of ['no-colon', 'team:payments']) {
      await open('test-note', { service: held });
      const service = field('Service') as HTMLSelectElement;
      expect(service.selectedOptions[0].textContent).toBe(held);
      await within(service.closest('.field') as HTMLElement).findByText('Not found');
      cleanup();
    }
  });

  it('says that a list that could not be read could not be read, and keeps the held value', async () => {
    await open('test-note', { service: 'service:payment-api' }, {}, 'no-rights');
    const service = field('Service') as HTMLSelectElement;
    await within(service.closest('.field') as HTMLElement).findByText(
      'The list could not be loaded.',
    );
    expect(service.selectedOptions[0].textContent).toBe('service:payment-api');
  });

  it('picks entries of a catalog in a list of references, and the held ones in a row', async () => {
    await open('form-sections', {
      scope: { teams: ['team:payments'], services: ['service:ledger'] },
    });
    const teams = screen.getByTestId('table--scope-teams');
    expect(await within(teams).findByText('Payments')).toBeInTheDocument();
    const services = screen.getByTestId('table--scope-services');
    expect(await within(services).findByText('Ledger')).toBeInTheDocument();
    expect(await within(services).findByText('Retired')).toBeInTheDocument();
  });
});

describe('CatalogPicker over several catalogs (x-catalog as an array, PROVISIONAL)', () => {
  /** Opens the form of the service catalog's own schema, whose `dependsOn` names two catalogs. */
  async function openService(value: JsonObject, profile = 'workshop') {
    const kit = useProfile(profile);
    useMessages('en');
    const { schema } = await kit.client.getCatalogSchema('service');
    const onchange = vi.fn();
    render(SchemaForm, {
      schema,
      category: 'catalog',
      kind: 'service',
      value,
      services: kit.services,
      onchange,
    });
    return { kit, onchange };
  }

  it('chooses the picker for a field that names several catalogs', async () => {
    const kit = useProfile('workshop');
    const { schema } = await kit.client.getCatalogSchema('service');
    const properties = schema.properties as Record<string, { items: Record<string, unknown> }>;
    expect(properties.dependsOn.items['x-catalog']).toEqual(['service', 'external']);
    await openService({ dependsOn: [] });
    expect(screen.getByTestId('table--dependsOn')).toBeInTheDocument();
  });

  it('lists the entries of every catalog under its name, and stores the reference with its prefix', async () => {
    const { onchange } = await openService({ dependsOn: [] });
    await fireEvent.click(
      within(screen.getByTestId('table--dependsOn')).getByRole('button', { name: 'Add row' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Depends on: new row' });
    const select = within(dialog).getByLabelText(/^Depends on/) as HTMLSelectElement;
    await waitFor(() => expect(select.querySelectorAll('optgroup')).toHaveLength(2));
    const groups = [...select.querySelectorAll('optgroup')].map((group) => [
      group.label,
      [...group.querySelectorAll('option')].map((option) => option.textContent),
    ]);
    expect(groups[0][0]).toBe('Services');
    expect(groups[1][0]).toBe('External parties');
    expect(groups[0][1]).toContain('Payment API');
    expect(groups[0][1]).not.toContain('Ledger');
    expect(groups[1][1]).toContain('Payment service provider');
    await fireEvent.change(select, { target: { value: 'external:psp-provider' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange)).toEqual({ dependsOn: ['external:psp-provider'] });
  });

  it('names a held reference of either catalog in the row, and marks a retired one', async () => {
    await openService({
      dependsOn: [
        'service:ledger',
        'external:psp-provider',
        'external:unknown-party',
        'team:payments',
      ],
    });
    const table = screen.getByTestId('table--dependsOn');
    expect(await within(table).findByText('Ledger')).toBeInTheDocument();
    expect(await within(table).findByText('Payment service provider')).toBeInTheDocument();
    expect(within(table).getByText('Retired')).toBeInTheDocument();
    // A reference into a catalog the field does not name, and one that names no entry, are not found.
    expect(within(table).getAllByText('Not found')).toHaveLength(2);
  });

  it('keeps the entries of the catalog that can be read when the other cannot', async () => {
    const { kit } = await openService({ dependsOn: [] });
    const real = (globalThis as { fetch: typeof fetch }).fetch;
    vi.stubGlobal('fetch', (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).endsWith('/catalogs/external')
        ? Promise.resolve(new Response('{}', { status: 503 }))
        : real(input, init),
    );
    const fresh = createFormServices(kit.client);
    const { schema } = await kit.client.getCatalogSchema('service');
    render(SchemaForm, {
      schema,
      category: 'catalog',
      kind: 'service',
      value: { dependsOn: [] },
      services: fresh,
    });
    const tables = screen.getAllByTestId('table--dependsOn');
    await fireEvent.click(
      within(tables[tables.length - 1]).getByRole('button', { name: 'Add row' }),
    );
    const dialogs = await screen.findAllByRole('dialog', { name: 'Depends on: new row' });
    const dialog = dialogs[dialogs.length - 1];
    expect(await within(dialog).findByText('The list could not be loaded.')).toBeInTheDocument();
    const select = within(dialog).getByLabelText(/^Depends on/) as HTMLSelectElement;
    expect(select.querySelector('optgroup[label="Services"]')).not.toBeNull();
    expect(select.querySelector('optgroup[label="External parties"]')).toBeNull();
  });
});

describe('PersonPicker (AUN-WEB-4, The Pickers)', () => {
  it('offers the bound and the not yet bound persons with their team, and stores the pseudonym', async () => {
    const { onchange } = await open('test-note');
    const owner = field('Owner') as HTMLSelectElement;
    await waitFor(() => expect(options(owner).length).toBeGreaterThan(1));
    await waitFor(() => expect(options(owner)).toContain('Alex Example, Payments'));
    expect(options(owner)).toEqual([
      'Choose…',
      'Alex Example, Payments',
      'Jordan Weber, Payments',
      'Lea Brandt, Identity Platform',
      'Mira Haas, Mobile Apps – Not yet bound',
      'Sam Okafor, Payments',
    ]);
    await fireEvent.change(owner, { target: { value: 'p-4c1a9e' } });
    expect(last(onchange)).toEqual({ owner: 'p-4c1a9e' });
    await fireEvent.change(owner, { target: { value: '' } });
    expect(last(onchange)).toEqual({});
  });

  it('marks a held person that no login has bound yet, and still offers them', async () => {
    await open('test-note', { owner: 'p-7d52e8' });
    const owner = field('Owner') as HTMLSelectElement;
    await waitFor(() => expect(owner.selectedOptions[0].textContent).toMatch(/^Mira Haas/));
    expect(
      await within(owner.closest('.field') as HTMLElement).findByText('Not yet bound'),
    ).toBeInTheDocument();
  });

  it('shows a former member with the team and the role the entry held, and never a name', async () => {
    await open('test-note', { owner: 'p-0f8a42' });
    const owner = field('Owner') as HTMLSelectElement;
    const frame = owner.closest('.field') as HTMLElement;
    await within(frame).findByText('Team Payments, role Developer');
    expect(within(frame).getAllByText('Former member').length).toBeGreaterThan(0);
    expect(owner.selectedOptions[0].textContent).toBe('Former member');
    expect(options(owner).join('|')).not.toContain('p-0f8a42');
    expect(frame.textContent).not.toMatch(/p-0f8a42/);
  });

  it('shows a pseudonym that resolves to nobody as an unknown person', async () => {
    await open('test-note', { owner: 'p-3b9d00' });
    const owner = field('Owner') as HTMLSelectElement;
    const frame = owner.closest('.field') as HTMLElement;
    await within(frame).findByText('Unknown person', { selector: 'span' });
    expect(frame.textContent).toContain('p-3b9d00');
  });

  it('narrows a long list by name and asks the server when the list is cut off', async () => {
    const kit = useProfile();
    useMessages('en');
    const persons = Array.from({ length: 9 }, (_, index) => ({
      pseudonym: `p-${index}`,
      name: `Person ${index}`,
      state: 'bound' as const,
      memberships: [],
    }));
    const listed = vi.spyOn(kit.client, 'listPersons').mockImplementation(async (query) => ({
      persons: query ? persons.filter((person) => person.name.endsWith(query)) : persons,
      truncated: query === undefined,
    }));
    render(PickerHarness, {
      services: createFormServices(kit.client),
      label: 'Reviewer',
      onchange: vi.fn(),
    });
    const narrow = await screen.findByLabelText('Narrow the list by name');
    expect(narrow).toHaveAccessibleDescription(/More people match/);
    await fireEvent.input(narrow, { target: { value: '7' } });
    await waitFor(() => expect(listed).toHaveBeenCalledWith('7'));
    const select = screen.getByLabelText('Reviewer') as HTMLSelectElement;
    await waitFor(() => expect(options(select)).toEqual(['Choose…', 'Person 7']));
    await fireEvent.input(narrow, { target: { value: '99' } });
    await screen.findByText('No person matches.');
  });

  it('says that the search failed, and not that nobody matches, when the server cannot narrow a cut-off list', async () => {
    const kit = useProfile();
    useMessages('en');
    const persons = Array.from({ length: 9 }, (_, index) => ({
      pseudonym: `p-${index}`,
      name: `Person ${index}`,
      state: 'bound' as const,
      memberships: [],
    }));
    vi.spyOn(kit.client, 'listPersons').mockImplementation(async (query) => {
      if (query) throw new ApiError('NETWORK', 0);
      return { persons, truncated: true };
    });
    render(PickerHarness, {
      services: createFormServices(kit.client),
      label: 'Reviewer',
      onchange: vi.fn(),
    });
    const narrow = await screen.findByLabelText('Narrow the list by name');
    // The cut-off list holds no "Zed": the local filter finds nobody, which is no answer.
    await fireEvent.input(narrow, { target: { value: 'Zed' } });
    await screen.findByText('The list could not be loaded.');
    expect(screen.queryByText('No person matches.')).toBeNull();
  });

  it('offers no field to narrow a short list that is whole', async () => {
    await open('test-note');
    await waitFor(() => expect(options(field('Owner')).length).toBeGreaterThan(1));
    expect(screen.queryByLabelText('Narrow the list by name')).toBeNull();
  });
});

describe('DocumentRefField (AUN-WEB-4, The Pickers)', () => {
  it('shows the title of the target as a link to its address', async () => {
    await open('test-note', { ...CLEAN_NOTE });
    const frame = field('Related document').closest('.field') as HTMLElement;
    const link = await within(frame).findByRole('link', { name: 'Payments 2026 Q4' });
    expect(link).toHaveAttribute('href', '/samm/payments/2026-q4');
  });

  it('shows the title without a link when the target has no canonical address', async () => {
    await open('test-note', {
      ...CLEAN_NOTE,
      related: 'test-notes:note/01JZ8Q4Y5N6V7X8B9C0D1E2F3G',
    });
    const frame = field('Related document').closest('.field') as HTMLElement;
    await within(frame).findByText('Key rotation, decision of 24 November');
    expect(within(frame).queryByRole('link')).toBeNull();
  });

  it('marks a reference that is not found, and one that is retired', async () => {
    await open('test-note', { ...MARKED_NOTE });
    const frame = field('Related document').closest('.field') as HTMLElement;
    await within(frame).findByText('Not found');
  });

  it('resolves what is typed after a pause, and stores the reference', async () => {
    const { onchange, kit } = await open('test-note');
    const related = field('Related document');
    await fireEvent.input(related, { target: { value: 'isms-register:risk/R-042' } });
    expect(last(onchange)).toEqual({ related: 'isms-register:risk/R-042' });
    const frame = related.closest('.field') as HTMLElement;
    await within(frame).findByRole('link', { name: 'Unpatched build agents' });
    expect(kit.requests.some((request) => request.includes('R-042'))).toBe(true);
    // Not a reference at all: nothing is asked.
    const before = kit.requests.length;
    await fireEvent.input(related, { target: { value: 'not a link' } });
    await new Promise((resolve) => setTimeout(resolve, 600));
    expect(kit.requests.length).toBe(before);
    expect(within(frame).queryByRole('link')).toBeNull();
    await fireEvent.input(related, { target: { value: '' } });
    expect(last(onchange)).toEqual({});
  });

  it('lists the references in a table, each with its title', async () => {
    await open('form-sections', {
      scope: { references: ['isms-register:risk/R-042', 'service:unknown-service'] },
    });
    const table = screen.getByTestId('table--scope-references');
    expect(
      await within(table).findByRole('link', { name: 'Unpatched build agents' }),
    ).toBeInTheDocument();
    expect(await within(table).findByText('Not found')).toBeInTheDocument();
  });
});
