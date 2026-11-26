import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import FilePicker from './FilePicker.svelte';
import GridTable from './GridTable.svelte';

/**
 * Two pieces of the directory pages: the pick of files from the device and the table of facts read row by row.
 */

/** @returns a file with a text */
function file(name: string, text: string): File {
  return new File([text], name, { type: 'text/yaml' });
}

/** Sets the files of a file input, as the dialog of the system does, and tells the input it changed. */
async function choose(input: HTMLElement, files: File[]) {
  Object.defineProperty(input, 'files', { value: files, configurable: true });
  await fireEvent.change(input);
}

describe('FilePicker', () => {
  it('opens the dialog of the system with its act and hands over the picked files in order', async () => {
    const onpick = vi.fn();
    render(FilePicker, {
      label: 'Choose files',
      accept: '.yaml',
      multiple: true,
      onpick,
      testId: 'pick',
    });
    const input = screen.getByTestId('pick-input') as HTMLInputElement;
    expect(input).toHaveAttribute('type', 'file');
    expect(input).toHaveAttribute('accept', '.yaml');
    expect(input.multiple).toBe(true);
    expect(input).toHaveAttribute('hidden');
    const click = vi.spyOn(input, 'click').mockImplementation(() => {});
    await fireEvent.click(screen.getByTestId('pick'));
    expect(click).toHaveBeenCalledOnce();
    const first = file('a.yaml', 'a');
    const second = file('b.yaml', 'b');
    await choose(input, [first, second]);
    expect(onpick).toHaveBeenCalledWith([first, second]);
  });

  it('says nothing when the dialog is closed without a file, and keeps an act that says why not', async () => {
    const onpick = vi.fn();
    render(FilePicker, {
      label: 'Choose files',
      onpick,
      disabledReason: 'Not now.',
      testId: 'pick',
    });
    await choose(screen.getByTestId('pick-input'), []);
    expect(onpick).not.toHaveBeenCalled();
    const act = screen.getByTestId('pick');
    expect(act).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Not now.')).toBeInTheDocument();
    const click = vi.spyOn(screen.getByTestId('pick-input'), 'click');
    await fireEvent.click(act);
    expect(click).not.toHaveBeenCalled();
  });

  it('has no test id on the input without one', () => {
    const { container } = render(FilePicker, { label: 'Choose', onpick: () => {} });
    expect(container.querySelector('input')).not.toHaveAttribute('data-testid');
  });
});

describe('GridTable', () => {
  it('names the table, heads its columns and holds the rows it is given', () => {
    render(GridTable, {
      caption: 'Created entries',
      heads: ['Name', 'Kind'],
      testId: 'grid',
      children: createRawSnippet(() => ({
        render: () => '<tr><th scope="row">Checkout UI</th><td data-label="Kind">Service</td></tr>',
      })),
    });
    const table = screen.getByTestId('grid');
    expect(table.tagName).toBe('TABLE');
    expect(within(table).getByText('Created entries')).toHaveClass('sr-only');
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((head) => head.textContent),
    ).toEqual(['Name', 'Kind']);
    expect(within(table).getByRole('rowheader')).toHaveTextContent('Checkout UI');
    expect(within(table).getByText('Service')).toHaveAttribute('data-label', 'Kind');
  });
});
