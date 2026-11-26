import { fireEvent, render, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { field, last, open } from './formHarness';
import PickerHarness from './PickerHarness.svelte';
import { createFormServices } from './services';
import { CLEAN_NOTE, MARKED_NOTE, useMessages, useProfile } from './testkit';

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
      'Reporting Service',
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

  it('shows a held reference that names no entry as the reference, marked not found', async () => {
    await open('test-note', { service: 'service:unknown-service' });
    const service = field('Service') as HTMLSelectElement;
    expect(service.selectedOptions[0].textContent).toBe('service:unknown-service');
    await within(service.closest('.field') as HTMLElement).findByText('Not found');
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
