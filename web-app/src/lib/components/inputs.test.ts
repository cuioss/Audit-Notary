import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { textSnippet } from '../test/snippets';
import AnswerScale from './AnswerScale.svelte';
import Button from './Button.svelte';
import Link from './Link.svelte';
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
