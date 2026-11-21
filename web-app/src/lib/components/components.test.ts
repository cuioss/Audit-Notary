import { fireEvent, render, screen } from '@testing-library/svelte';
import { describe, expect, it, vi } from 'vitest';
import { textSnippet } from '../test/snippets';
import Button from './Button.svelte';
import ChoiceGroup from './ChoiceGroup.svelte';
import Dialog from './Dialog.svelte';
import EmptyState from './EmptyState.svelte';
import Icon from './Icon.svelte';
import IconButton from './IconButton.svelte';
import Link from './Link.svelte';
import Notice from './Notice.svelte';
import Select from './Select.svelte';
import TextField from './TextField.svelte';

describe('Button', () => {
  it('acts on click and names its variant', async () => {
    const onclick = vi.fn();
    render(Button, { variant: 'primary', onclick, children: textSnippet('Save') });
    const button = screen.getByRole('button', { name: 'Save' });
    expect(button).toHaveClass('btn--primary');
    await fireEvent.click(button);
    expect(onclick).toHaveBeenCalledTimes(1);
  });

  it('ignores clicks while busy and shows the icon otherwise', async () => {
    const onclick = vi.fn();
    const { container } = render(Button, { busy: true, onclick, children: textSnippet('Save') });
    const button = screen.getByRole('button');
    expect(button).toHaveAttribute('aria-busy', 'true');
    await fireEvent.click(button);
    expect(onclick).not.toHaveBeenCalled();
    expect(container.querySelector('.btn__spinner')).not.toBeNull();
  });

  it('renders the icon left of the label', () => {
    const { container } = render(Button, { icon: 'act.search', children: textSnippet('Find') });
    expect(container.querySelector('[data-icon="act.search"]')).not.toBeNull();
  });
});

describe('Icon', () => {
  it('paints a known icon, decorative or named', () => {
    const { container } = render(Icon, { name: 'lens.due', size: 16 });
    const icon = container.querySelector('.ui-icon') as HTMLElement;
    expect(icon).toHaveAttribute('aria-hidden', 'true');
    expect(icon.style.getPropertyValue('--ui-icon-size')).toBe('16px');
    render(Icon, { name: 'lens.due', label: 'Due' });
    expect(screen.getByRole('img', { name: 'Due' })).toBeInTheDocument();
  });

  it('draws nothing for an unknown name', () => {
    const { container } = render(Icon, { name: 'nope' });
    expect(container.querySelector('.ui-icon')).toBeNull();
  });
});

describe('IconButton', () => {
  it('carries its label as accessible name and its pressed state', () => {
    render(IconButton, { icon: 'act.back', label: 'Collapse', pressed: true });
    expect(screen.getByRole('button', { name: 'Collapse' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

describe('Link', () => {
  it('renders a link, quiet on request', () => {
    render(Link, { href: '/samm', quiet: true, children: textSnippet('SAMM') });
    const link = screen.getByRole('link', { name: 'SAMM' });
    expect(link).toHaveAttribute('href', '/samm');
    expect(link).toHaveClass('link--quiet');
  });
});

describe('EmptyState and Notice', () => {
  it('shows title, body and acts', () => {
    render(EmptyState, { title: 'Nothing', body: 'All done', actions: textSnippet('act') });
    expect(screen.getByRole('heading', { name: 'Nothing' })).toBeInTheDocument();
    expect(screen.getByText('All done')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
  });

  it('announces a live notice by its tone', () => {
    render(Notice, { tone: 'danger', title: 'Refused', body: 'Why', live: true });
    expect(screen.getByRole('alert')).toHaveTextContent('Refused');
    render(Notice, { tone: 'attention', title: 'Degraded', live: true, actions: textSnippet('x') });
    expect(screen.getByRole('status')).toHaveAttribute('data-tone', 'attention');
  });
});

describe('fields', () => {
  it('binds a text field to its label and shows the field error', () => {
    render(TextField, { label: 'Name', value: 'Alex', error: 'Fill in', testId: 'name' });
    const input = screen.getByLabelText('Name');
    expect(input).toHaveValue('Alex');
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Fill in')).toBeInTheDocument();
  });

  it('offers the options of a select with the empty choice first', () => {
    render(Select, {
      label: 'Team',
      placeholder: 'Choose',
      options: [{ value: 'a', label: 'Alpha' }],
      error: 'Pick one',
    });
    const select = screen.getByLabelText('Team') as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(['Choose', 'Alpha']);
    expect(screen.getByText('Pick one')).toBeInTheDocument();
  });

  it('reports the chosen value of a choice group', async () => {
    const onchange = vi.fn();
    render(ChoiceGroup, {
      legend: 'Theme',
      value: 'light',
      onchange,
      testId: 'theme',
      choices: [
        { value: 'light', label: 'Light' },
        { value: 'dark', label: 'Dark' },
      ],
    });
    expect(screen.getByRole('group', { name: 'Theme' })).toBeInTheDocument();
    await fireEvent.change(screen.getByTestId('theme-dark'));
    expect(onchange).toHaveBeenCalledWith('dark');
  });
});

describe('Dialog', () => {
  it('opens, closes with its button and reports the close', async () => {
    const onclose = vi.fn();
    const { container, rerender } = render(Dialog, {
      open: false,
      title: 'More',
      closeLabel: 'Close',
      onclose,
      children: textSnippet('content'),
    });
    const dialog = container.querySelector('dialog') as HTMLDialogElement;
    expect(dialog.hasAttribute('open')).toBe(false);
    await rerender({ open: true });
    expect(dialog.hasAttribute('open')).toBe(true);
    await fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onclose).toHaveBeenCalled();
    expect(dialog.hasAttribute('open')).toBe(false);
  });
});
