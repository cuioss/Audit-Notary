import { fireEvent, screen, waitFor, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { field, last, open } from './formHarness';
import { BROKEN_VALIDATION, CLEAN_NOTE } from './testkit';

afterEach(() => vi.unstubAllGlobals());

/** The refusal of the server that the tests feed back (rest-api.adoc, Form Kit Requests). */
const REFUSAL = [
  { pointer: '/related', code: 'REFERENCE_NOT_FOUND' },
  { pointer: '/owner', code: 'PSEUDONYM_UNKNOWN' },
  { pointer: '/actions/1/what', code: 'MAX_LENGTH' },
];

/** @returns the whole field of a pointer: the control, a table with its list errors */
function holder(pointer: string): HTMLElement {
  return document.querySelector(`[data-pointer="${pointer}"]`) as HTMLElement;
}

/** @returns the error text under a field */
function errorOf(label: string): string {
  return (
    field(label).closest('.field')?.querySelector('.field__error, .area__error')?.textContent ?? ''
  );
}

describe('the errors of the browser', () => {
  it('shows every constraint broken once, at its field, in words', async () => {
    await open('form-validation', { ...BROKEN_VALIDATION });
    expect(errorOf('Code')).toBe('This does not have the expected form.');
    expect(errorOf('Title')).toBe('This text is too short.');
    expect(errorOf('Severity')).toBe('Choose one of the offered values.');
    expect(errorOf('Score')).toBe('This number is too large.');
    expect(errorOf('Weight')).toBe('This number is not below the upper limit.');
    expect(errorOf('Opened at')).toBe('The format may not be right. You can still save.');
    expect(errorOf('Closed on')).toBe('The format may not be right. You can still save.');
    expect(errorOf('Link')).toBe('The format may not be right. You can still save.');
    const acknowledged = screen.getByRole('switch', { name: 'Acknowledged' });
    expect(acknowledged).toHaveAttribute('aria-invalid', 'true');
    expect(acknowledged).toHaveAccessibleDescription('Only one value is allowed here.');
    expect(holder('/references')).toHaveTextContent(
      'There are too many entries. Every entry may appear only once.',
    );
    expect(holder('/checks')).toHaveTextContent('There are too few entries.');
  });

  it('checks a field again when it changes, and never stops the form for a format', async () => {
    const { onchange } = await open('form-validation', { ...BROKEN_VALIDATION });
    await fireEvent.input(field('Title'), { target: { value: 'A title' } });
    expect(errorOf('Title')).toBe('');
    await fireEvent.input(field('Title'), { target: { value: 'No' } });
    expect(errorOf('Title')).toBe('This text is too short.');
    // A bad format is advice: the value is stored all the same.
    await fireEvent.input(field('Link'), { target: { value: 'still not a link' } });
    expect(last(onchange).link).toBe('still not a link');
    expect(errorOf('Link')).toContain('The format may not be right');
    await fireEvent.input(field('Link'), { target: { value: 'service:payment-api' } });
    expect(errorOf('Link')).toBe('');
  });

  it('shows no error for a value the schema does not constrain', async () => {
    await open('test-note', { ...CLEAN_NOTE });
    expect(document.querySelector('.field__error, .area__error, .frame__error')).toBeNull();
  });
});

describe('the verdict of the server (AUN-WEB-4, Validation)', () => {
  it('shows the errors of a 422 at their fields and replaces those of the browser', async () => {
    await open('test-note', { ...CLEAN_NOTE, title: '' }, { errors: REFUSAL });
    expect(errorOf('Related document')).toBe(
      'This reference leads nowhere. Check it or choose another.',
    );
    expect(errorOf('Owner')).toBe('This person is not in the directory. Choose another.');
    // The row with the error is marked in the table.
    const actions = screen.getByTestId('table--actions');
    expect(within(actions).getByTestId('row-error-1')).toHaveTextContent('Check this row');
    expect(within(actions).queryByTestId('row-error-0')).toBeNull();
  });

  it('shows the error of the server inside the row editor, and takes it away when the field changes', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { errors: REFUSAL });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 2' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actions: row 2' });
    const what = within(dialog).getByLabelText(/^What/);
    expect(what.closest('.field')).toHaveTextContent('This text is too long.');
    await fireEvent.input(what, { target: { value: 'Shorter' } });
    expect(what.closest('.field')).not.toHaveTextContent('This text is too long.');
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(screen.queryByTestId('row-error-1')).toBeNull());
    // The errors of other fields stand.
    expect(errorOf('Owner')).toContain('not in the directory');
  });

  it('takes the error of a field away when the field changes, and checks it again', async () => {
    await open('test-note', { ...CLEAN_NOTE }, { errors: REFUSAL });
    await fireEvent.input(field('Related document'), { target: { value: 'not a link' } });
    expect(errorOf('Related document')).toBe('The format may not be right. You can still save.');
    await fireEvent.input(field('Related document'), { target: { value: 'service:ledger' } });
    expect(errorOf('Related document')).toBe('');
  });

  it('drops the errors of the browser that the server did not repeat', async () => {
    await open(
      'form-validation',
      { ...BROKEN_VALIDATION },
      { errors: [{ pointer: '/code', code: 'PATTERN' }] },
    );
    expect(errorOf('Code')).toBe('This does not have the expected form.');
    expect(errorOf('Title')).toBe('');
    expect(errorOf('Score')).toBe('');
    expect(holder('/references')).not.toHaveTextContent('too many');
  });

  it('keeps the errors of the other rows when one row is applied', async () => {
    await open(
      'test-note',
      { actions: [{ what: 'a' }, { what: 'b' }, { what: 'c' }] },
      {
        errors: [
          { pointer: '/actions/0/what', code: 'MAX_LENGTH' },
          { pointer: '/actions/2/what', code: 'MAX_LENGTH' },
        ],
      },
    );
    expect(screen.getByTestId('row-error-0')).toBeInTheDocument();
    expect(screen.getByTestId('row-error-2')).toBeInTheDocument();
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actions: row 1' });
    await fireEvent.input(within(dialog).getByLabelText(/^What/), { target: { value: 'fixed' } });
    await fireEvent.click(within(dialog).getByRole('button', { name: 'Apply changes' }));
    await waitFor(() => expect(screen.queryByTestId('row-error-0')).toBeNull());
    expect(screen.getByTestId('row-error-2')).toBeInTheDocument();
  });

  it('lists an error that names no field of the form under the form', async () => {
    await open(
      'test-note',
      { ...CLEAN_NOTE },
      {
        errors: [
          { pointer: '/unknown/place', code: 'TYPE' },
          { pointer: '', code: 'SOMETHING_NEW' },
        ],
      },
    );
    const other = screen.getByTestId('form-other-errors');
    expect(other).toHaveTextContent('Problems that belong to no field above');
    expect(
      within(other)
        .getAllByRole('listitem')
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim()),
    ).toEqual([
      '/unknown/place This is not the kind of value the field takes.',
      'This value is not valid.',
    ]);
  });

  it('shows the error of a section at the section, and not under the form', async () => {
    await open(
      'form-sections',
      { scope: { tags: ['a'] } },
      { errors: [{ pointer: '/scope', code: 'TYPE' }] },
    );
    expect(holder('/scope')).toHaveTextContent('This is not the kind of value the field takes.');
    expect(screen.queryByTestId('form-other-errors')).toBeNull();
  });

  it('shows the error of a row of scalars in the row editor, where its one control stands', async () => {
    await open('form-sections', { scope: { tags: ['a'] } });
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Tags: row 1' });
    await fireEvent.input(within(dialog).getByLabelText(/^Tags/), {
      target: { value: 'x'.repeat(31) },
    });
    expect(dialog).toHaveTextContent('This text is too long.');
    expect(within(dialog).queryByTestId('row-other-errors')).toBeNull();
  });

  it('lists the error of a whole row of fields in the row editor, with the errors of no field', async () => {
    await open(
      'test-note',
      { ...CLEAN_NOTE },
      { errors: [{ pointer: '/actions/0', code: 'TYPE' }] },
    );
    await fireEvent.click(screen.getByRole('button', { name: 'Edit row 1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Actions: row 1' });
    const other = within(dialog).getByTestId('row-other-errors');
    expect(other).toHaveTextContent('This is not the kind of value the field takes.');
  });

  it('shows an error that names a row that is no longer there at the table', async () => {
    await open(
      'test-note',
      { ...CLEAN_NOTE },
      { errors: [{ pointer: '/actions/7/what', code: 'MAX_LENGTH' }] },
    );
    expect(screen.queryByTestId('form-other-errors')).toBeNull();
    expect(holder('/actions')).toHaveTextContent('This text is too long.');
  });

  it('shows an error at the nearest field when it names a place inside plain data', async () => {
    await open(
      'form-sections',
      { rows: [{ label: 'x', attachments: ['a'] }] },
      { errors: [{ pointer: '/rows/0/attachments/0', code: 'TYPE' }] },
    );
    expect(screen.getByTestId('row-error-0')).toBeInTheDocument();
    expect(screen.queryByTestId('form-other-errors')).toBeNull();
  });

  it('shows an error of a mapped code with the text of its code in German too', async () => {
    const { default: i18n } = { default: await import('../i18n') };
    i18n.currentLocale.set('de');
    const { useMessages } = await import('./testkit');
    await open('test-note', { ...CLEAN_NOTE }, { errors: REFUSAL });
    useMessages('de');
    expect(
      await screen.findAllByText(
        'Dieser Verweis führt ins Leere. Prüfen Sie ihn oder wählen Sie einen anderen.',
      ),
    ).toHaveLength(1);
  });
});
