import { fireEvent, render, screen } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import { describe, expect, it, vi } from 'vitest';
import { textSnippet } from '../test/snippets';
import DashboardPage from './DashboardPage.svelte';
import ObjectPage from './ObjectPage.svelte';
import TriagePage, { type Level } from './TriagePage.svelte';
import WizardPage from './WizardPage.svelte';

describe('page templates', () => {
  it('give every page one h1', () => {
    render(DashboardPage, {
      props: { title: 'Due', intro: 'intro', testId: 'd', children: textSnippet('body') },
    });
    render(WizardPage, {
      props: {
        title: 'Welcome',
        intro: 'intro',
        children: textSnippet('step'),
        actions: textSnippet('act'),
      },
    });
    render(ObjectPage, {
      title: 'Practice',
      stateLabel: 'Draft',
      children: textSnippet('form'),
      actions: textSnippet('save'),
    });
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent),
    ).toEqual(['Due', 'Welcome', 'Practice']);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
  });
});

describe('TriagePage', () => {
  const level = (key: string): Level => ({
    key,
    kind: 'samm',
    kindLabel: 'Level',
    title: `Title ${key}`,
    href: `/${key}`,
  });
  const chain = (...keys: string[]): Level[] => keys.map(level);

  const column = createRawSnippet((current: () => Level, options: () => { object: boolean }) => ({
    render: () =>
      options().object
        ? `<div><h1>${current().title}</h1></div>`
        : `<div><p>${current().title}</p></div>`,
  }));

  const props = (levels: Level[], objectMin?: number) => ({
    levels,
    column,
    objectMin,
    stripLabel: 'Hidden levels',
    returnLabel: 'Back to the object',
    upLabel: (parent: Level) => `Up to ${parent.title}`,
    announce: (object: Level) => `Now showing ${object.title}`,
    testId: 'triage',
  });

  it('shows the last two levels at the fallback width and names the hidden ones in a strip', () => {
    render(TriagePage, props(chain('a', 'b', 'c', 'd', 'e')));
    const page = screen.getByTestId('triage');
    expect(page).toHaveAttribute('data-columns', '2');
    expect(page).toHaveAttribute('data-strip', 'names');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title e');
    expect(screen.getByRole('navigation', { name: 'Hidden levels' })).toBeInTheDocument();
    expect(screen.getByTestId('strip-a')).toHaveTextContent('Title a');
    expect(screen.getByTestId('strip-a')).not.toHaveAttribute('title');
    expect(screen.queryByTestId('triage-up')).toBeNull();
  });

  it('peeks at a hidden level and returns to the object', async () => {
    render(TriagePage, props(chain('a', 'b', 'c', 'd', 'e')));
    await fireEvent.click(screen.getByTestId('strip-a'));
    expect(screen.getByText('Title a')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
    expect(screen.queryByTestId('triage-strip-left')).toBeNull();
    await fireEvent.click(screen.getByTestId('strip-return'));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Title e');
    expect(screen.getByTestId('triage-strip-left')).toBeInTheDocument();
  });

  it('shows only the marks with their titles where room is short', () => {
    render(TriagePage, props(chain('a', 'b', 'c'), 700));
    expect(screen.getByTestId('triage')).toHaveAttribute('data-strip', 'marks');
    expect(screen.getByTestId('strip-a')).toHaveAttribute('title', 'Level: Title a');
  });

  it('offers an Up link to the parent with one column', () => {
    render(TriagePage, props(chain('a', 'b'), 800));
    expect(screen.getByTestId('triage')).toHaveAttribute('data-columns', '1');
    expect(screen.getByTestId('triage-up')).toHaveTextContent('Up to Title a');
    expect(screen.getByTestId('triage-up')).toHaveAttribute('href', '/a');
  });

  it('announces a new object and moves the focus to its heading', async () => {
    const { rerender } = render(TriagePage, props(chain('a', 'b')));
    expect(screen.getByRole('status')).toHaveTextContent('');
    await rerender({ levels: chain('a', 'c') });
    expect(screen.getByRole('status')).toHaveTextContent('Now showing Title c');
    await vi.waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
    );
  });

  it('draws nothing for an empty chain', () => {
    render(TriagePage, props([]));
    expect(screen.getByTestId('triage')).toHaveAttribute('data-columns', '0');
  });
});
