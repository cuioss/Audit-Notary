import { screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLocale } from '../i18n';
import { open } from './formHarness';
import { CLEAN_NOTE, MARKED_NOTE, schemaOf, useMessages, useProfile } from './testkit';

afterEach(() => vi.unstubAllGlobals());

/** @returns the text of a read field: its label and its value */
function read(label: string): { term: string; value: HTMLElement } {
  const term = screen.getByText(label, { selector: 'dt' });
  return { term: term.textContent ?? '', value: term.nextElementSibling as HTMLElement };
}

describe('the same form, read (AUN-WEB-4, Read-Only Rendering)', () => {
  it('shows every value as text with the labels of the form and no control', async () => {
    const { container } = await open('test-note', { ...CLEAN_NOTE }, { readonly: true });
    expect(container.querySelector('input, select, textarea')).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.queryByRole('button', { name: /Add row|Edit/ })).toBeNull();
    expect(read('Title').value).toHaveTextContent('Key rotation, decision of 24 November');
    expect(read('Status').value).toHaveTextContent('Agreed');
    expect(read('Pinned').value).toHaveTextContent('Yes');
    expect(read('Noted at').value.textContent).toMatch(/Nov 2[345], 2026/);
    // The mark of the mandatory field belongs to the editing.
    expect(screen.queryByText('required')).toBeNull();
  });

  it('shows the name of a catalog entry, a person, and the title of a reference with its link', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { readonly: true });
    expect(await within(read('Service').value).findByText('Payment API')).toBeInTheDocument();
    expect(await within(read('Owner').value).findByText('Alex Example')).toBeInTheDocument();
    const link = await within(read('Related document').value).findByRole('link', {
      name: 'Payments 2026 Q4',
    });
    expect(link).toHaveAttribute('href', '/samm/payments/2026-q4');
  });

  it('shows the marks: retired, not found, not yet bound, former and unknown', async () => {
    await open('test-note', { ...MARKED_NOTE, owner: 'p-7d52e8' }, { readonly: true });
    expect(await within(read('Service').value).findByText('Retired')).toBeInTheDocument();
    expect(within(read('Service').value).getByText('Ledger')).toBeInTheDocument();
    expect(
      await within(read('Related document').value).findByText('Not found'),
    ).toBeInTheDocument();
    expect(await within(read('Owner').value).findByText('Not yet bound')).toBeInTheDocument();
    expect(within(read('Owner').value).getByText('Mira Haas')).toBeInTheDocument();
    const table = screen.getByTestId('table--actions');
    expect(await within(table).findByText('Former member')).toBeInTheDocument();
    expect(await within(table).findByText('Team Payments, role Developer')).toBeInTheDocument();
    expect(await within(table).findByText('Unknown person')).toBeInTheDocument();
  });

  it('does not take a reference into another catalog for the entry of the same id', async () => {
    await open('test-note', { ...CLEAN_NOTE, service: 'team:payment-api' }, { readonly: true });
    expect(await within(read('Service').value).findByText('Not found')).toBeInTheDocument();
    expect(within(read('Service').value).queryByText('Payment API')).toBeNull();
    expect(read('Service').value).toHaveTextContent('team:payment-api');
  });

  it('shows the table without the row editor, and a dash for an empty value', async () => {
    await open('test-note', { ...MARKED_NOTE }, { readonly: true });
    const table = screen.getByTestId('table--actions');
    expect(within(table).queryByRole('button')).toBeNull();
    expect(within(table).getAllByRole('row')).toHaveLength(4);
    expect(read('Summary').value).toHaveTextContent('–');
    expect(read('Summary').value).toHaveTextContent('No value');
    expect(read('Pinned').value).toHaveTextContent('No');
  });

  it('shows the rendered source of an AsciiDoc field, and no preview heading', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { readonly: true });
    const body = read('Details').value;
    expect(await within(body).findByRole('heading', { name: 'Decision' })).toBeInTheDocument();
    expect(within(body).getByText('agree').tagName).toBe('STRONG');
    expect(screen.queryByRole('region', { name: 'Preview' })).toBeNull();
  });

  it('shows the source as preformatted text, with a note, when the renderer cannot run', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { readonly: true }, 'workshop#preview-unavailable');
    const body = read('Details').value;
    await within(body).findByText('Not formatted: the text is shown as it was written.');
    const source = body.querySelector('pre');
    expect(source?.textContent).toBe(CLEAN_NOTE.body);
  });

  it('shows the source as preformatted text, with a note, when it is over the limit', async () => {
    const long = 'é'.repeat(40_000);
    const { kit } = await open('test-note', { body: long }, { readonly: true });
    const body = read('Details').value;
    await within(body).findByText('Not formatted: the text is shown as it was written.');
    expect(body.querySelector('pre')?.textContent).toBe(long);
    expect(kit.requests.some((request) => request.startsWith('POST'))).toBe(false);
  });

  it('shows the hints and the hint of a free text in the reading too', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { readonly: true });
    expect(screen.getByText('The service the note is about.')).toBeInTheDocument();
    expect(screen.getAllByText(/personal details or interview notes/).length).toBeGreaterThan(0);
  });

  it('shows the sections, the numbers, the dates and the readOnly properties of form-sections', async () => {
    await open(
      'form-sections',
      {
        name: 'Sections',
        created: '2026-11-01T08:00:00Z',
        origin: 'import',
        scope: { teams: ['team:payments'], levels: ['high'], tags: ['a', 'b'] },
        metrics: { count: 1200, ratio: 0.5, window: { from: '2026-12-01', until: '2026-12-31' } },
        primary: { person: 'p-4c1a9e', channel: 'chat' },
        notes: '* one',
        variant: 'free',
        matrix: [[1]],
      },
      { readonly: true },
    );
    expect(screen.getByRole('heading', { name: 'Scope', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Measures', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Window', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Primary contact', level: 2 })).toBeInTheDocument();
    expect(read('Count').value).toHaveTextContent('1,200');
    expect(read('Ratio').value).toHaveTextContent('0.5');
    expect(read('From').value).toHaveTextContent('Dec 1, 2026');
    expect(read('Channel').value).toHaveTextContent('Chat');
    expect(read('Origin').value).toHaveTextContent('import');
    expect(read('Variant').value).toHaveTextContent('"free"');
    expect(await within(read('Person').value).findByText('Alex Example')).toBeInTheDocument();
    expect(read('Created').value.textContent).toMatch(/Nov \d, 2026/);
  });

  it('shows a readOnly property as text inside a form that is edited, and edits nothing of it', async () => {
    const { container } = await open('form-sections', {
      name: 'x',
      created: '2026-11-01T08:00:00Z',
      origin: 'import',
    });
    expect(read('Origin').value).toHaveTextContent('import');
    expect(read('Created').value.textContent).toMatch(/Nov \d, 2026/);
    expect(container.querySelector('[data-pointer="/origin"] input')).toBeNull();
    expect(container.querySelector('[data-pointer="/name"] input')).not.toBeNull();
  });

  it('reads every property of a section that is readOnly, tables included, and edits the rest', async () => {
    const schema = structuredClone(await schemaOf(useProfile(), 'form-sections'));
    (schema.properties as Record<string, Record<string, unknown>>).scope.readOnly = true;
    const { container } = await open(
      'form-sections',
      { name: 'x', scope: { teams: ['team:payments'], tags: ['a', 'b'] } },
      { schema },
    );
    const scope = container.querySelector('[data-pointer="/scope"]') as HTMLElement;
    expect(scope.querySelector('input, select, textarea')).toBeNull();
    expect(
      within(scope).queryByRole('button', { name: /Add row|Edit row|Remove row|Move/ }),
    ).toBeNull();
    expect(within(scope).getAllByRole('table').length).toBeGreaterThan(0);
    expect(container.querySelector('[data-pointer="/name"] input')).not.toBeNull();
  });

  it('shows the heading level the form was given', async () => {
    await open('form-sections', { scope: { tags: ['a'] } }, { readonly: true, headingLevel: 3 });
    expect(screen.getByRole('heading', { name: 'Scope', level: 3 })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Window', level: 4 })).toBeInTheDocument();
  });

  it('reads in German, with the labels of the catalogue and the marks in German', async () => {
    currentLocale.set('de');
    await open('test-note', { ...MARKED_NOTE, owner: 'p-7d52e8' }, { readonly: true });
    useMessages('de');
    expect(await screen.findByText('Titel', { selector: 'dt' })).toBeInTheDocument();
    expect(await screen.findByText('Nicht mehr in Gebrauch')).toBeInTheDocument();
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(await screen.findByText('Noch nicht verknüpft')).toBeInTheDocument();
    expect(await screen.findByText('Ehemaliges Mitglied')).toBeInTheDocument();
    expect(await screen.findByText('Team Payments, Rolle Developer')).toBeInTheDocument();
    expect(await screen.findByText('Unbekannte Person')).toBeInTheDocument();
    expect(screen.queryAllByText('Nein').length).toBeGreaterThan(0);
  });
});
