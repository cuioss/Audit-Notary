import { render, screen } from '@testing-library/svelte';
import { describe, expect, it } from 'vitest';
import { textSnippet } from '../test/snippets';
import DashboardPage from './DashboardPage.svelte';
import ObjectPage from './ObjectPage.svelte';
import TriagePage from './TriagePage.svelte';
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
    render(TriagePage, { title: 'SAMM', columns: textSnippet('column') });
    expect(
      screen.getAllByRole('heading', { level: 1 }).map((heading) => heading.textContent),
    ).toEqual(['Due', 'Welcome', 'Practice', 'SAMM']);
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('column')).toBeInTheDocument();
    expect(screen.getByText('act')).toBeInTheDocument();
  });
});
