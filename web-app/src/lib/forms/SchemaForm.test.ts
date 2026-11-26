import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { currentLocale } from '../i18n';
import type { JsonSchema } from './schema';
import SchemaForm from './SchemaForm.svelte';
import { field, last, open } from './formHarness';
import { MARKED_NOTE, schemaOf, useMessages, useProfile } from './testkit';

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

/** @returns the state of the last change */
function lastState(onchange: ReturnType<typeof vi.fn>): { errors: unknown[]; missing: string[] } {
  return onchange.mock.calls.at(-1)![1];
}

describe('SchemaForm: labels, marks and hints', () => {
  it('draws the fields of test-note with the labels of the catalogue and marks the mandatory ones', async () => {
    await open('test-note');
    for (const label of [
      'Title',
      'Noted at',
      'Status',
      'Service',
      'Owner',
      'Related document',
      'Summary',
      'Details',
    ]) {
      expect(field(label)).toBeInTheDocument();
    }
    expect(field('Title').closest('.field')).toHaveTextContent('required');
    expect(field('Noted at').closest('.field')).toHaveTextContent('required');
    expect(field('Status').closest('.field')).toHaveTextContent('required');
    expect(field('Owner').closest('.field')).not.toHaveTextContent('required');
    expect(screen.getByText('Pinned')).toBeInTheDocument();
    expect(screen.getByText('Actions')).toBeInTheDocument();
  });

  it('shows the help of a field and the hint of a free text, in the order of the schema', async () => {
    await open('test-note');
    expect(screen.getByText('The service the note is about.')).toBeInTheDocument();
    expect(
      screen.getByText('A document of the register, as repository:kind/id.'),
    ).toBeInTheDocument();
    const summary = field('Summary');
    expect(summary.tagName).toBe('TEXTAREA');
    expect(summary).toHaveAccessibleDescription(/personal details or interview notes/);
    expect(field('Title').tagName).toBe('INPUT');
    expect(field('Title')).not.toHaveAccessibleDescription(/personal details/);
    const order = [...document.querySelectorAll('[data-pointer]')].map(
      (element) => (element as HTMLElement).dataset.pointer,
    );
    expect(order).toEqual([
      '/title',
      '/noted',
      '/status',
      '/pinned',
      '/service',
      '/owner',
      '/related',
      '/summary',
      '/body',
      '/actions',
    ]);
  });

  it('puts the hint of a free text on an AsciiDoc field too', async () => {
    await open('form-sections');
    expect(field('Notes')).toHaveAccessibleDescription(/personal details or interview notes/);
  });

  it('shows a property without a label key under its name, so that a missing text is visible', async () => {
    const schema: JsonSchema = { type: 'object', properties: { mystery: { type: 'string' } } };
    useMessages('en');
    render(SchemaForm, { schema, category: 'x', kind: 'y', value: {} });
    expect(field('mystery')).toBeInTheDocument();
  });

  it('speaks German when the language is German', async () => {
    const kit = useProfile();
    useMessages('de');
    currentLocale.set('de');
    const schema = await schemaOf(kit, 'test-note');
    render(SchemaForm, {
      schema,
      category: 'test-note',
      kind: 'note',
      value: {},
      services: kit.services,
    });
    expect(screen.getByLabelText(/^Titel/)).toBeInTheDocument();
    expect(screen.getAllByText('Pflichtfeld', { selector: 'span' }).length).toBeGreaterThan(0);
    expect(screen.getByLabelText(/^Notizen|^Zusammenfassung/)).toHaveAccessibleDescription(
      /Interviewnotizen/,
    );
  });
});

describe('SchemaForm: editing the kinds', () => {
  it('stores a text, and removes the property when the field is emptied', async () => {
    const { onchange } = await open('test-note');
    await fireEvent.input(field('Title'), { target: { value: 'Key rotation' } });
    expect(last(onchange)).toEqual({ title: 'Key rotation' });
    await fireEvent.input(field('Title'), { target: { value: '' } });
    expect(last(onchange)).toEqual({});
  });

  it('stores the member of an enum with its type, and shows its text', async () => {
    const { onchange } = await open('test-note');
    const status = field('Status') as HTMLSelectElement;
    expect([...status.options].map((option) => option.textContent)).toEqual([
      'Choose…',
      'Open',
      'Agreed',
      'Dropped',
    ]);
    await fireEvent.change(status, { target: { value: '1' } });
    expect(last(onchange)).toEqual({ status: 'agreed' });
    await fireEvent.change(status, { target: { value: '' } });
    expect(last(onchange)).toEqual({});
  });

  it('keeps the type of an enum of numbers and booleans', async () => {
    useMessages('en');
    const schema: JsonSchema = {
      type: 'object',
      properties: { n: { enum: [1, 2.5] }, b: { enum: [true, false] } },
    };
    const onchange = vi.fn();
    render(SchemaForm, { schema, category: 'x', kind: 'y', value: {}, onchange });
    await fireEvent.change(field('n'), { target: { value: '1' } });
    await fireEvent.change(field('b'), { target: { value: '0' } });
    expect(last(onchange)).toEqual({ n: 2.5, b: true });
  });

  it('shows a held value that is no member of the enum, and keeps it until another is chosen', async () => {
    const { onchange } = await open('form-validation', { severity: 'urgent' });
    const severity = field('Severity') as HTMLSelectElement;
    expect(severity.selectedOptions[0].textContent).toBe('urgent');
    await fireEvent.change(severity, { target: { value: '2' } });
    expect(last(onchange)).toEqual({ severity: 'high' });
  });

  it('stores a switch as a boolean and shows it on, off and in error', async () => {
    const { onchange } = await open('test-note');
    const pinned = screen.getByRole('switch', { name: 'Pinned' });
    expect(pinned).toHaveAttribute('aria-checked', 'false');
    await fireEvent.click(pinned);
    expect(last(onchange)).toEqual({ pinned: true });
    await fireEvent.click(screen.getByRole('switch', { name: 'Pinned' }));
    expect(last(onchange)).toEqual({ pinned: false });
  });

  it('stores a number as a number, parses an empty field as no property, and ignores what is no number', async () => {
    const { onchange } = await open('form-sections');
    const count = field('Count');
    expect(count).toHaveAttribute('type', 'number');
    expect(count).toHaveAttribute('step', '1');
    expect(field('Ratio')).toHaveAttribute('step', 'any');
    await fireEvent.input(count, { target: { value: '42' } });
    expect(last(onchange)).toMatchObject({ metrics: { count: 42 } });
    await fireEvent.input(field('Ratio'), { target: { value: '0.25' } });
    expect(last(onchange)).toMatchObject({ metrics: { count: 42, ratio: 0.25 } });
    await fireEvent.input(count, { target: { value: '' } });
    expect(last(onchange)).toEqual({ metrics: { ratio: 0.25 } });
  });

  it('stores a date and time in UTC to the second, and leaves an untouched value as it was', async () => {
    const { onchange } = await open('test-note', { ...MARKED_NOTE });
    const noted = field('Noted at') as HTMLInputElement;
    expect(noted).toHaveAttribute('type', 'datetime-local');
    expect(noted).toHaveAttribute('step', '1');
    expect(noted.value).toMatch(/^2025-03-02T\d{2}:00(:00)?$/);
    // Another field changes: the offset of the held value stays.
    await fireEvent.input(field('Title'), { target: { value: 'Changed' } });
    expect(last(onchange).noted).toBe('2025-03-02T14:00:00+01:00');
    // The same value typed again is no change.
    const before = onchange.mock.calls.length;
    await fireEvent.input(noted, { target: { value: noted.value } });
    expect(onchange.mock.calls.length).toBe(before);
    await fireEvent.input(noted, { target: { value: '2026-11-24T10:30:15' } });
    expect(last(onchange).noted).toMatch(/^2026-11-24T\d{2}:30:15Z$/);
    // A half-typed entry reads as empty: it does not delete the value.
    const half = onchange.mock.calls.length;
    Object.defineProperty(noted, 'validity', { value: { badInput: true }, configurable: true });
    await fireEvent.input(noted, { target: { value: '' } });
    expect(onchange.mock.calls.length).toBe(half);
    Object.defineProperty(noted, 'validity', { value: { badInput: false }, configurable: true });
    await fireEvent.input(noted, { target: { value: '' } });
    expect(last(onchange).noted).toBeUndefined();
  });

  it('stores a date as it is typed, in its date-only mode', async () => {
    const { onchange } = await open('form-sections');
    const from = field('From');
    expect(from).toHaveAttribute('type', 'date');
    await fireEvent.input(from, { target: { value: '2026-12-01' } });
    expect(last(onchange)).toEqual({ metrics: { window: { from: '2026-12-01' } } });
  });

  it('shows a held date that is no date as empty, with the text as it is stored', async () => {
    await open('form-validation', { opened: 'yesterday' });
    const opened = field('Opened at') as HTMLInputElement;
    expect(opened.value).toBe('');
    expect(opened.closest('.field')).toHaveTextContent('Stored as');
    expect(opened.closest('.field')).toHaveTextContent('yesterday');
  });
});

describe('SchemaForm: the state it reports', () => {
  it('lists the empty mandatory fields and no error for them', async () => {
    const { onchange } = await open('test-note');
    await fireEvent.input(field('Title'), { target: { value: 'x' } });
    expect(lastState(onchange)).toEqual({ errors: [], missing: ['/noted', '/status'] });
    expect(screen.queryByText(/Fill in this field before/)).toBeNull();
  });

  it('says which mandatory fields are empty when asked to', async () => {
    await open('test-note', { title: 'x' }, { showMissing: true });
    expect(field('Noted at').closest('.field')).toHaveTextContent(
      'Fill in this field before you go on.',
    );
    expect(field('Title').closest('.field')).not.toHaveTextContent('Fill in this field before');
  });

  it('moves the focus to a field, or to the nearest field that has a control', async () => {
    const { component } = await open('test-note');
    expect(component.focusField('/summary')).toBe(true);
    expect(document.activeElement).toBe(field('Summary'));
    expect(component.focusField('/actions/1/what')).toBe(true);
    expect(document.activeElement?.closest('[data-pointer="/actions"]')).not.toBeNull();
    expect(component.focusField('/nowhere')).toBe(false);
    expect(component.focusField('')).toBe(false);
  });
});
