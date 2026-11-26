import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { textSnippet } from '../test/snippets';
import AnswerScale from './AnswerScale.svelte';
import Button from './Button.svelte';
import FieldFrame from './FieldFrame.svelte';
import Link from './Link.svelte';
import Select, { groupOptions } from './Select.svelte';
import SegmentedControl from './SegmentedControl.svelte';
import TextArea from './TextArea.svelte';
import TextField from './TextField.svelte';
import Toggle from './Toggle.svelte';

const OPTIONS = [
  { value: 0, text: 'No' },
  { value: 0.5, text: 'Some' },
  { value: 1, text: 'All' },
];

describe('AnswerScale', () => {
  it('reports the chosen answer and marks the current one', async () => {
    const onchange = vi.fn();
    render(AnswerScale, {
      labelledby: 'q',
      options: OPTIONS,
      value: 0,
      onchange,
      testId: 'answer',
    });
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-labelledby', 'q');
    expect(screen.getByTestId('answer-0')).toBeChecked();
    await fireEvent.click(screen.getByTestId('answer-2'));
    expect(onchange).toHaveBeenCalledWith(1);
  });

  it('shows the number keys with hints', () => {
    const { container } = render(AnswerScale, {
      labelledby: 'q',
      options: OPTIONS,
      value: null,
      onchange: () => {},
      hints: true,
    });
    expect([...container.querySelectorAll('kbd')].map((key) => key.textContent)).toEqual([
      '1',
      '2',
      '3',
    ]);
    expect(container.querySelector('input')).not.toHaveAttribute('data-testid');
  });

  it('keeps a read-only answer and hides the keys', async () => {
    const onchange = vi.fn();
    const { container } = render(AnswerScale, {
      labelledby: 'q',
      options: OPTIONS,
      value: 0.5,
      onchange,
      readonly: true,
      hints: true,
      testId: 'answer',
    });
    expect(screen.getByRole('radiogroup')).toHaveAttribute('aria-readonly', 'true');
    expect(screen.getByTestId('answer-0')).toBeDisabled();
    expect(screen.getByTestId('answer-1')).toBeEnabled();
    await fireEvent.change(screen.getByTestId('answer-1'));
    expect(onchange).not.toHaveBeenCalled();
    expect(container.querySelector('kbd')).toBeNull();
  });
});

describe('SegmentedControl', () => {
  const segments = [
    { value: 'seal', label: 'Seal', icon: 'state.seal' },
    { value: 'table', label: 'Table' },
  ];

  it('reports the chosen view and shows the icons', async () => {
    const onchange = vi.fn();
    const { container } = render(SegmentedControl, {
      label: 'View',
      options: segments,
      value: 'seal',
      onchange,
      testId: 'view',
    });
    expect(screen.getByRole('radiogroup', { name: 'View' })).toBeInTheDocument();
    expect(screen.getByTestId('view-seal')).toBeChecked();
    expect(container.querySelectorAll('.ui-icon')).toHaveLength(1);
    await fireEvent.click(screen.getByTestId('view-table'));
    expect(onchange).toHaveBeenCalledWith('table');
  });

  it('works without a test id', () => {
    const { container } = render(SegmentedControl, {
      label: 'View',
      options: segments,
      value: 'table',
      onchange: () => {},
    });
    expect(container.querySelector('[data-testid]')).toBeNull();
  });
});

describe('TextArea', () => {
  it('binds the text, says hint and error and reports every change', async () => {
    const oninput = vi.fn();
    render(TextArea, {
      label: 'Comment',
      hint: 'No personal details.',
      error: 'Too long.',
      rows: 5,
      oninput,
      testId: 'comment',
    });
    const area = screen.getByLabelText('Comment');
    expect(area).toHaveAttribute('rows', '5');
    expect(area).toHaveAttribute('aria-invalid', 'true');
    expect(area.getAttribute('aria-describedby')?.split(' ')).toHaveLength(2);
    expect(screen.getByText('No personal details.')).toBeInTheDocument();
    expect(screen.getByText('Too long.')).toBeInTheDocument();
    await fireEvent.input(area, { target: { value: 'Fine' } });
    expect(oninput).toHaveBeenCalledWith('Fine');
  });

  it('stays plain and read-only without hint or error', async () => {
    render(TextArea, { label: 'Comment', value: 'Given', readonly: true });
    const area = screen.getByLabelText('Comment');
    expect(area).toHaveValue('Given');
    expect(area).toHaveAttribute('readonly');
    expect(area).not.toHaveAttribute('aria-describedby');
    expect(area).not.toHaveAttribute('aria-invalid');
    await fireEvent.input(area, { target: { value: 'Other' } });
    expect(area).toHaveValue('Other');
  });
});

describe('Toggle', () => {
  it('is a switch that reports the opposite of its state', async () => {
    const onchange = vi.fn();
    render(Toggle, { label: 'Key hints', checked: true, onchange, testId: 'hints' });
    const toggle = screen.getByRole('switch', { name: 'Key hints' });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    await fireEvent.click(toggle);
    expect(onchange).toHaveBeenCalledWith(false);
  });
});

describe('Button with a reason', () => {
  it('stays focusable, ignores clicks and says why', async () => {
    const onclick = vi.fn();
    render(Button, {
      variant: 'primary',
      disabledReason: 'Answer every question first.',
      onclick,
      children: textSnippet('Submit'),
    });
    const button = screen.getByRole('button', { name: 'Submit' });
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute('aria-disabled', 'true');
    expect(button).toHaveClass('btn--unavailable');
    expect(button).toHaveAccessibleDescription('Answer every question first.');
    await fireEvent.click(button);
    expect(onclick).not.toHaveBeenCalled();
  });

  it('is natively disabled on request', () => {
    render(Button, { disabled: true, children: textSnippet('Submit') });
    expect(screen.getByRole('button')).toBeDisabled();
  });
});

describe('Link with a look', () => {
  it('looks like a button and stays a link', () => {
    render(Link, { href: '/samm/release', look: 'primary', children: textSnippet('Review') });
    const link = screen.getByRole('link', { name: 'Review' });
    expect(link).toHaveClass('link--button', 'link--primary');
    expect(link).not.toHaveClass('link--quiet');
  });
});

describe('TextField of a password', () => {
  it('hides what is typed', () => {
    render(TextField, { label: 'Password', type: 'password', testId: 'password' });
    expect(screen.getByTestId('password')).toHaveAttribute('type', 'password');
  });

  it('is a text field by default', () => {
    render(TextField, { label: 'Name', testId: 'name' });
    expect(screen.getByTestId('name')).toHaveAttribute('type', 'text');
  });
});

describe('the fields of the form kit (AUN-WEB-4)', () => {
  it('lets a text field take a number or a date, a step, a mark, hints and content below', async () => {
    const oninput = vi.fn();
    render(TextField, {
      label: 'Count',
      type: 'number',
      step: '1',
      mark: 'required',
      hint: ['First line.', 'Second line.'],
      error: 'Too large.',
      oninput,
      after: textSnippet('below'),
      testId: 'count',
    });
    const input = screen.getByTestId('count');
    expect(input).toHaveAttribute('type', 'number');
    expect(input).toHaveAttribute('step', '1');
    expect(screen.getByLabelText(/^Count/)).toBe(input);
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(input).toHaveAccessibleDescription('First line. Second line. Too large.');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('below')).toBeInTheDocument();
    await fireEvent.input(input, { target: { value: '12' } });
    expect(oninput).toHaveBeenCalledWith('12', input);
  });

  it('keeps the bound value of a text field the text', async () => {
    render(TextField, { label: 'Name', value: 'Alex', testId: 'name' });
    const input = screen.getByTestId('name') as HTMLInputElement;
    expect(input.value).toBe('Alex');
    await fireEvent.input(input, { target: { value: 'Alexa' } });
    expect(input.value).toBe('Alexa');
  });

  it('gives a select a mark, hints, content below and a change callback', async () => {
    const onchange = vi.fn();
    render(Select, {
      label: 'Status',
      options: [{ value: '0', label: 'Open' }],
      placeholder: 'Choose…',
      mark: 'required',
      hint: 'Pick one.',
      onchange,
      after: textSnippet('below'),
      testId: 'status',
    });
    const select = screen.getByTestId('status');
    expect(select).toHaveAccessibleDescription('Pick one.');
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('below')).toBeInTheDocument();
    await fireEvent.change(select, { target: { value: '0' } });
    expect(onchange).toHaveBeenCalledWith('0');
  });

  it('draws the options of a group under its heading, and the others as they come', () => {
    render(Select, {
      label: 'Depends on',
      options: [
        { value: 'a:1', label: 'One', group: 'Services' },
        { value: 'x', label: 'Loose' },
        { value: 'b:1', label: 'Other', group: 'External' },
        { value: 'a:2', label: 'Two', group: 'Services' },
      ],
      placeholder: 'Choose…',
      testId: 'grouped',
    });
    const select = screen.getByTestId('grouped') as HTMLSelectElement;
    const groups = [...select.querySelectorAll('optgroup')].map((group) => [
      group.label,
      [...group.querySelectorAll('option')].map((option) => option.textContent),
    ]);
    expect(groups).toEqual([
      ['Services', ['One', 'Two']],
      ['External', ['Other']],
    ]);
    expect([...select.children].map((child) => child.tagName)).toEqual([
      'OPTION',
      'OPTGROUP',
      'OPTION',
      'OPTGROUP',
    ]);
    expect(groupOptions([])).toEqual([]);
  });

  it('gives a text area a mark, hints and content below', () => {
    render(TextArea, {
      label: 'Notes',
      mark: 'required',
      hint: ['One.', 'Two.'],
      after: textSnippet('below'),
      testId: 'notes',
    });
    expect(screen.getByTestId('notes')).toHaveAccessibleDescription('One. Two.');
    expect(screen.getByText('required')).toBeInTheDocument();
    expect(screen.getByText('below')).toBeInTheDocument();
  });

  it('names the help and the error of a switch for assistive technology', () => {
    const onchange = vi.fn();
    const { container } = render(FieldFrame, {
      hint: 'A hint.',
      error: 'An error.',
      children: createRawSnippet((described: () => string | undefined) => ({
        render: () => `<span data-described="${described()}">control</span>`,
      })),
    });
    const described = container.querySelector('[data-described]')!.getAttribute('data-described')!;
    const ids = described.split(' ');
    expect(ids).toHaveLength(2);
    expect(container.querySelector(`#${ids[0]}`)).toHaveTextContent('A hint.');
    expect(container.querySelector(`#${ids[1]}`)).toHaveTextContent('An error.');
    render(Toggle, { label: 'Pinned', checked: false, onchange, describedby: 'x', invalid: true });
    const toggle = screen.getByRole('switch', { name: 'Pinned' });
    expect(toggle).toHaveAttribute('aria-describedby', 'x');
    expect(toggle).toHaveAttribute('aria-invalid', 'true');
    expect(within(container).queryByRole('switch')).toBeNull();
  });

  it('draws no help and no error when it has none', () => {
    const { container } = render(FieldFrame, {
      children: createRawSnippet((described: () => string | undefined) => ({
        render: () => `<span data-described="${described() ?? 'none'}">control</span>`,
      })),
    });
    expect(container.querySelector('[data-described="none"]')).not.toBeNull();
    expect(container.querySelector('p')).toBeNull();
  });
});
