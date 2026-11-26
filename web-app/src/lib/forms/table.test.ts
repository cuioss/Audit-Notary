import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { field, last, open } from './formHarness';
import type { JsonObject } from './schema';
import { CLEAN_NOTE } from './testkit';

afterEach(() => vi.unstubAllGlobals());

/** @returns the rows of a table as the texts of their cells */
function cells(table: HTMLElement): string[][] {
  return [...table.querySelectorAll('tbody tr')].map((row) =>
    [...row.querySelectorAll('td:not(.table__actions)')].map(
      (cell) => cell.textContent?.trim() ?? '',
    ),
  );
}

/** @returns the table of a pointer */
function table(pointer: string): HTMLElement {
  return screen.getByTestId(`table-${pointer.replaceAll('/', '-')}`);
}

/** @returns the dialog of the row editor */
async function editor(name: RegExp | string): Promise<HTMLElement> {
  return screen.findByRole('dialog', { name });
}

describe('DataTable with a row editor (AUN-WEB-4, Choosing the Component, rule 12)', () => {
  it('shows the first four properties as columns, with the values as text', async () => {
    await open('test-note', { ...CLEAN_NOTE });
    const actions = table('/actions');
    expect(
      [...actions.querySelectorAll('thead th')].map((heading) => heading.textContent?.trim()),
    ).toEqual(['What', 'Who', 'Due on', 'Done', 'Actions for the row']);
    await waitFor(() =>
      expect(cells(actions)).toEqual([
        ['Write the rotation runbook', 'Jordan Weber', 'Dec 15, 2026', 'No'],
        ['Rotate the staging keys', 'Sam Okafor', 'Dec 1, 2026', 'Yes'],
      ]),
    );
  });

  it('says that there are no rows, and adds the first one in the editor', async () => {
    const { onchange } = await open('test-note');
    const actions = table('/actions');
    expect(actions).toHaveTextContent('No rows yet.');
    await fireEvent.click(within(actions).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Actions: new row');
    await fireEvent.input(within(dialog).getByLabelText(/^What/), {
      target: { value: 'Write it' },
    });
    await fireEvent.input(within(dialog).getByLabelText(/^Due on/), {
      target: { value: '2026-12-15' },
    });
    await fireEvent.click(within(dialog).getByRole('switch', { name: 'Done' }));
    // Nothing is in the form until the row is added to the list.
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange)).toEqual({
      actions: [{ what: 'Write it', due: '2026-12-15', done: true }],
    });
    await waitFor(() =>
      expect(cells(actions)).toEqual([['Write it', '–No value', 'Dec 15, 2026', 'Yes']]),
    );
  });

  it('marks the mandatory property of a row, and picks a person in the editor', async () => {
    const { onchange } = await open('test-note', { actions: [] });
    await fireEvent.click(within(table('/actions')).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Actions: new row');
    expect(within(dialog).getByLabelText(/^What/).closest('.field')).toHaveTextContent('required');
    const who = within(dialog).getByLabelText(/^Who/) as HTMLSelectElement;
    await waitFor(() => expect(who.options.length).toBeGreaterThan(1));
    await fireEvent.change(who, { target: { value: 'p-61c0d4' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange)).toEqual({ actions: [{ who: 'p-61c0d4' }] });
  });

  it('edits a copy of the row and changes the form only when the changes are applied', async () => {
    const { onchange } = await open('test-note', { ...CLEAN_NOTE });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await editor('Actions: row 2');
    const what = within(dialog).getByLabelText(/^What/) as HTMLInputElement;
    expect(what.value).toBe('Rotate the staging keys');
    await fireEvent.input(what, { target: { value: 'Rotate the production keys' } });
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(last(onchange).actions).toEqual([
      (CLEAN_NOTE.actions as JsonObject[])[0],
      {
        ...((CLEAN_NOTE.actions as JsonObject[])[1] as object),
        what: 'Rotate the production keys',
      },
    ]);
  });

  it('leaves the row as it was when the editor is cancelled', async () => {
    const { onchange } = await open('test-note', { ...CLEAN_NOTE });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const dialog = await editor('Actions: row 1');
    await fireEvent.input(within(dialog).getByLabelText(/^What/), { target: { value: 'Changed' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const again = await editor('Actions: row 1');
    expect((within(again).getByLabelText(/^What/) as HTMLInputElement).value).toBe(
      'Write the rotation runbook',
    );
  });

  it('moves a row up or down, and offers no move beyond the ends', async () => {
    const { onchange } = await open('test-note', { ...CLEAN_NOTE });
    expect(screen.queryByRole('button', { name: 'Move up, row 1' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Move down, row 2' })).toBeNull();
    await fireEvent.click(screen.getByRole('button', { name: 'Move down, row 1' }));
    expect((last(onchange).actions as { what: string }[]).map((row) => row.what)).toEqual([
      'Rotate the staging keys',
      'Write the rotation runbook',
    ]);
    // The focus followed the row to its place and stays on an act that exists there.
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move up, row 2' })).toHaveFocus(),
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Move up, row 2' }));
    expect((last(onchange).actions as { what: string }[]).map((row) => row.what)).toEqual([
      'Write the rotation runbook',
      'Rotate the staging keys',
    ]);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Move down, row 1' })).toHaveFocus(),
    );
  });

  it('asks before it removes a row, and removes it when told', async () => {
    const { onchange } = await open('test-note', { ...CLEAN_NOTE });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Remove row 1 of Actions?' });
    expect(dialog).toHaveTextContent('Versions already saved stay as they are.');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(onchange).not.toHaveBeenCalled();
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    const again = await screen.findByRole('dialog', { name: 'Remove row 1 of Actions?' });
    await fireEvent.click(within(again).getByRole('button', { name: 'Remove row' }));
    expect(last(onchange).actions).toEqual([(CLEAN_NOTE.actions as JsonObject[])[1]]);
    // The row the focus came from is gone: it moves on to the row that took its place.
    await waitFor(() => expect(screen.getByRole('button', { name: 'Edit row 1' })).toHaveFocus());
  });

  it('writes nothing when the row it was opened on is no longer where it was', async () => {
    const rows = (CLEAN_NOTE.actions as JsonObject[]).concat({ what: 'Third' });
    const { onchange, rerender } = await open('test-note', { ...CLEAN_NOTE, actions: rows });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await editor('Actions: row 2');
    await fireEvent.input(within(dialog).getByLabelText(/^What/), { target: { value: 'Edited' } });
    // Another change drops the first row while the editor is open: index 1 now holds the third row.
    await rerender({ value: { ...CLEAN_NOTE, actions: rows.slice(1) } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(onchange).not.toHaveBeenCalled();
    expect(cells(table('/actions')).map((row) => row[0])).toEqual([
      'Rotate the staging keys',
      'Third',
    ]);
  });

  it('adds no row to a list that became full while the editor was open', async () => {
    const rows = ['p-1', 'p-2', 'p-3', 'p-4'];
    const { onchange, rerender } = await open('form-sections', { scope: { reviewers: rows } });
    await fireEvent.click(
      within(table('/scope/reviewers')).getByRole('button', { name: 'Add row' }),
    );
    const dialog = await editor('Reviewers: new row');
    await waitFor(() =>
      expect(
        (within(dialog).getByLabelText(/^Reviewers/) as HTMLSelectElement).options.length,
      ).toBeGreaterThan(1),
    );
    await fireEvent.change(within(dialog).getByLabelText(/^Reviewers/), {
      target: { value: 'p-61c0d4' },
    });
    await rerender({ value: { scope: { reviewers: [...rows, 'p-5'] } } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(onchange).not.toHaveBeenCalled();
  });

  it('removes no row when the row asked about is gone or the list would fall below its minimum', async () => {
    const { onchange, rerender } = await open('form-validation', {
      checks: [{ name: 'a' }, { name: 'b' }],
    });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 2' }));
    const dialog = await screen.findByRole('dialog', { name: /Remove row 2/ });
    await rerender({ value: { checks: [{ name: 'b' }] } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Remove row' }));
    expect(onchange).not.toHaveBeenCalled();
    expect(cells(table('/checks'))).toEqual([['b', '–No value']]);
  });

  it('keeps a table of no rows as an empty list once the last row is removed', async () => {
    const { onchange } = await open('test-note', { actions: [{ what: 'one' }] });
    await fireEvent.click(screen.getByRole('button', { name: 'Remove row 1' }));
    await fireEvent.click(
      within(await screen.findByRole('dialog', { name: /Remove row 1/ })).getByRole('button', {
        name: 'Remove row',
      }),
    );
    expect(last(onchange)).toEqual({ actions: [] });
  });

  it('stays in view and says why when the list is full, and keeps the rows it must keep', async () => {
    await open('form-sections', { scope: { reviewers: ['p-1', 'p-2', 'p-3', 'p-4', 'p-5'] } });
    const add = within(table('/scope/reviewers')).getByRole('button', { name: 'Add row' });
    expect(add).toHaveAttribute('aria-disabled', 'true');
    expect(add).toHaveAccessibleDescription('At most 5 rows.');
    await fireEvent.click(add);
    expect(screen.queryByRole('dialog', { name: /Reviewers/ })).toBeNull();
  });

  it('offers no removal below minItems and says why', async () => {
    const { onchange } = await open('form-validation', { checks: [{ name: 'ok' }] });
    expect(screen.queryByRole('button', { name: 'Remove row 1' })).toBeNull();
    expect(table('/checks')).toHaveTextContent('At least one row must stay.');
    await fireEvent.click(within(table('/checks')).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Checks: new row');
    await fireEvent.input(within(dialog).getByLabelText(/^Name/), { target: { value: 'second' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange).checks).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Remove row 1' })).toBeInTheDocument();
  });

  it('edits a list of scalars as a table of one column', async () => {
    const { onchange } = await open('form-sections', { scope: { tags: ['alpha'] } });
    const tags = table('/scope/tags');
    expect(cells(tags)).toEqual([['alpha']]);
    await fireEvent.click(within(tags).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Tags: new row');
    await fireEvent.input(within(dialog).getByLabelText(/^Tags/), { target: { value: 'beta' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange)).toEqual({ scope: { tags: ['alpha', 'beta'] } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const editing = await editor('Tags: row 1');
    await fireEvent.input(within(editing).getByLabelText(/^Tags/), { target: { value: 'gamma' } });
    await fireEvent.click(within(editing).getByRole('button', { name: 'Apply changes' }));
    expect(last(onchange)).toEqual({ scope: { tags: ['gamma', 'beta'] } });
  });

  it('keeps the row of a list of scalars that is emptied in the editor', async () => {
    const { onchange } = await open('form-sections', { scope: { tags: ['alpha', 'beta'] } });
    await fireEvent.click(screen.getAllByRole('button', { name: 'Edit row 2' })[0]);
    const dialog = await editor('Tags: row 2');
    await fireEvent.input(within(dialog).getByLabelText(/^Tags/), { target: { value: '' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(onchange).not.toHaveBeenCalled();
  });

  it('adds nothing when the row of a list of scalars is left empty', async () => {
    const { onchange } = await open('form-sections', { scope: { tags: ['alpha'] } });
    await fireEvent.click(within(table('/scope/tags')).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Tags: new row');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(onchange).not.toHaveBeenCalled();
  });

  it('picks an entry of a closed list in the editor of a list of enum values', async () => {
    const { onchange } = await open('form-sections', {});
    await fireEvent.click(within(table('/scope/levels')).getByRole('button', { name: 'Add row' }));
    const dialog = await editor('Levels: new row');
    await fireEvent.change(within(dialog).getByLabelText(/^Levels/), { target: { value: '2' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Add to the list' }));
    expect(last(onchange)).toEqual({ scope: { levels: ['high'] } });
    expect(cells(table('/scope/levels'))).toEqual([['High']]);
  });

  it('keeps an array inside a row, which is plain data, unchanged on save', async () => {
    const rows = [{ label: 'one', weight: 3, attachments: ['a.pdf', 'b.pdf'] }];
    const { onchange } = await open('form-sections', { rows });
    expect(cells(table('/rows'))).toEqual([['one', '3']]);
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const dialog = await editor('Rows: row 1');
    expect(within(dialog).getByText('Attachments')).toBeInTheDocument();
    expect(dialog).toHaveTextContent('"a.pdf"');
    expect(within(dialog).queryByRole('button', { name: 'Add row' })).toBeNull();
    await fireEvent.input(within(dialog).getByLabelText(/^Label/), { target: { value: 'two' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    expect(last(onchange).rows).toEqual([
      { label: 'two', weight: 3, attachments: ['a.pdf', 'b.pdf'] },
    ]);
  });

  it('shows what no component edits as plain data and never changes it', async () => {
    const { onchange } = await open('form-sections', {
      name: 'x',
      variant: 7,
      matrix: [
        [1, 2],
        [3, 4],
      ],
    });
    const variant = screen.getByText('Variant').closest('.field') as HTMLElement;
    expect(variant).toHaveTextContent('7');
    expect(variant).toHaveTextContent('Shown as it is stored. This form does not change it.');
    expect(screen.getByText('Matrix').closest('.field')).toHaveTextContent('[');
    await fireEvent.input(field('Name'), { target: { value: 'y' } });
    expect(last(onchange)).toEqual({
      name: 'y',
      variant: 7,
      matrix: [
        [1, 2],
        [3, 4],
      ],
    });
  });
});
