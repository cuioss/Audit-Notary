import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConflictField, DocumentTransition, Revision, RevisionAt } from '../../api/types';
import { messagesStore } from '../../i18n';
import { mockMessages } from '../../test/scenarioFetch';
import CategoryListColumn from './CategoryListColumn.svelte';
import ConflictPanel from './ConflictPanel.svelte';
import DocumentListColumn from './DocumentListColumn.svelte';
import RevisionPicker from './RevisionPicker.svelte';
import TransitionBar from './TransitionBar.svelte';
import { resetKit } from './testkit';

/**
 * The parts of the documents lens on their own, with the category's own texts of the scenario mock behind the catalogue.
 */
beforeEach(() => messagesStore.set(mockMessages('en')));

afterEach(resetKit);

const SUBMIT: DocumentTransition = {
  id: 'test-note.submit',
  to: 'in-review',
  right: 'edit',
  stepUp: false,
};
const RELEASE: DocumentTransition = {
  id: 'test-note.release',
  to: 'released',
  right: 'approve',
  stepUp: true,
  release: true,
};

const bar = (props: Partial<Parameters<typeof render<typeof TransitionBar>>[1]> = {}) => ({
  category: 'test-note',
  transitions: [SUBMIT],
  rights: ['read', 'edit', 'approve'] as ('read' | 'edit' | 'approve')[],
  releaseHref: '/categories/test-note/X/release',
  busy: null,
  primary: true,
  askSave: null,
  missing: [],
  onact: vi.fn(),
  onsavefirst: vi.fn(),
  ongo: vi.fn(),
  onback: vi.fn(),
  ...props,
});

describe('TransitionBar', () => {
  it('shows nothing when there is nothing to do', () => {
    render(TransitionBar, bar({ transitions: [] }));
    expect(screen.queryByTestId('transition-bar')).toBeNull();
  });

  it('names a step with the category text and tells the act when it is pressed', async () => {
    const props = bar();
    render(TransitionBar, props);
    const act = screen.getByTestId('transition-test-note.submit');
    expect(act).toHaveTextContent('Submit for review');
    await fireEvent.click(act);
    expect(props.onact).toHaveBeenCalledWith(SUBMIT);
  });

  it('reads "Release" for the release and opens its address; without the right it says why', () => {
    const { unmount } = render(TransitionBar, bar({ transitions: [RELEASE] }));
    expect(screen.getByTestId('transition-test-note.release')).toHaveAttribute(
      'href',
      '/categories/test-note/X/release',
    );
    expect(screen.getByTestId('transition-test-note.release')).toHaveTextContent('Release');
    unmount();
    render(TransitionBar, bar({ transitions: [RELEASE], rights: ['read'] }));
    expect(screen.getByTestId('transition-test-note.release')).toHaveAttribute(
      'aria-disabled',
      'true',
    );
    expect(screen.getByText('This step needs the approve right.')).toBeInTheDocument();
  });

  it('shows the running step as busy and gives the primary look to one act only', () => {
    render(TransitionBar, bar({ busy: 'test-note.submit', primary: false }));
    expect(screen.getByTestId('transition-test-note.submit')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByTestId('transition-test-note.submit')).toHaveClass('btn--secondary');
  });

  it('asks to save first with the act of the step in the button', async () => {
    const props = bar({ askSave: SUBMIT });
    render(TransitionBar, props);
    expect(screen.getByText('Save your changes first')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('save-first'));
    expect(props.onsavefirst).toHaveBeenCalled();
    expect(screen.getByTestId('save-first')).toHaveTextContent(
      'Save for everyone, then Submit for review',
    );
  });

  it('lists the missing fields with a way to each, and a way back to editing', async () => {
    const props = bar({
      missing: [
        { pointer: '/noted', label: 'Noted at' },
        { pointer: '/status', label: 'Status' },
      ],
    });
    render(TransitionBar, props);
    const list = screen.getByTestId('missing-fields');
    await fireEvent.click(within(list).getByRole('button', { name: 'Go to Status' }));
    expect(props.ongo).toHaveBeenCalledWith('/status');
    await fireEvent.click(screen.getByTestId('back-to-editing'));
    expect(props.onback).toHaveBeenCalled();
  });
});

describe('ConflictPanel', () => {
  const by = { pseudonym: 'p-2b7f10', name: 'Jordan Weber' };
  const conflicts: Record<string, ConflictField> = {
    '/status': { pointer: '/status', own: 'agreed', other: 'dropped', by },
    '/pinned': { pointer: '/pinned', own: true, other: false, by },
    '/actions': { pointer: '/actions', own: [{}], other: null, by },
  };

  it('shows nothing without a conflict', () => {
    render(ConflictPanel, {
      conflicts: {},
      category: 'test-note',
      kind: 'note',
      locked: false,
      onresolve: vi.fn(),
    });
    expect(screen.queryByTestId('conflict-panel')).toBeNull();
  });

  it('shows each field with both versions in words, and decides per field', async () => {
    const onresolve = vi.fn();
    render(ConflictPanel, {
      conflicts,
      category: 'test-note',
      kind: 'note',
      locked: false,
      onresolve,
    });
    expect(screen.getByTestId('conflict-/status')).toHaveTextContent('Agreed');
    expect(screen.getByTestId('conflict-/status')).toHaveTextContent('Dropped');
    expect(screen.getByTestId('conflict-/pinned')).toHaveTextContent('Yes');
    expect(screen.getByTestId('conflict-/pinned')).toHaveTextContent('No');
    expect(screen.getByTestId('conflict-/actions')).toHaveTextContent('one entry');
    expect(screen.getByTestId('conflict-/actions')).toHaveTextContent('No value');
    await fireEvent.click(screen.getByTestId('keep-own-/status'));
    await fireEvent.click(screen.getByTestId('take-other-/pinned'));
    expect(onresolve).toHaveBeenNthCalledWith(1, '/status', 'own');
    expect(onresolve).toHaveBeenNthCalledWith(2, '/pinned', 'other');
  });

  it('decides nothing while the sheet cannot be edited, and says so', async () => {
    const onresolve = vi.fn();
    render(ConflictPanel, {
      conflicts,
      category: 'test-note',
      kind: 'note',
      locked: true,
      onresolve,
    });
    await fireEvent.click(screen.getByTestId('keep-own-/status'));
    expect(onresolve).not.toHaveBeenCalled();
    expect(screen.getAllByText('Nothing can be decided now.')).toHaveLength(6);
  });
});

describe('the columns', () => {
  it('waits for the categories and the documents', () => {
    const categories = render(CategoryListColumn, { categories: null, selected: null });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
    categories.unmount();
    render(DocumentListColumn, {
      category: {
        id: 'test-note',
        generic: true,
        kinds: [{ id: 'note', repository: 'test-notes' }],
      },
      documents: null,
      selected: null,
    });
    expect(screen.getByText('Loading…')).toBeInTheDocument();
  });

  it('names a category by its own text and its document types', () => {
    render(CategoryListColumn, {
      categories: [
        { id: 'test-note', generic: true, kinds: [{ id: 'note', repository: 'test-notes' }] },
      ],
      selected: 'test-note',
    });
    expect(screen.getByTestId('category-test-note')).toHaveTextContent('Test notes');
  });
});

describe('RevisionPicker', () => {
  const by = { pseudonym: 'p', name: 'Noor Haddad' };
  const revisions: Revision[] = [
    {
      ref: 'v1',
      commit: 'c0ffee1',
      kind: 'release',
      tag: 'notes/X/v1',
      version: 1,
      at: '2026-11-05T09:40:00Z',
      by,
    },
  ];
  const reading: RevisionAt = {
    ref: 'v1',
    kind: 'release',
    commit: 'c0ffee1',
    tag: 'notes/X/v1',
    at: '2026-11-05T09:40:00Z',
    by,
  };

  it('shows nothing while the revisions are loading', () => {
    render(RevisionPicker, {
      category: 'test-note',
      document: 'X',
      revisions: null,
      reading: null,
      onnavigate: vi.fn(),
    });
    expect(screen.queryByTestId('revision-select')).toBeNull();
  });

  it('says when they could not be listed', () => {
    render(RevisionPicker, {
      category: 'test-note',
      document: 'X',
      revisions: null,
      failed: true,
      reading: null,
      onnavigate: vi.fn(),
    });
    expect(screen.getByText('The earlier states could not be listed.')).toBeInTheDocument();
  });

  it('opens a revision and goes back to the current state', async () => {
    const onnavigate = vi.fn();
    render(RevisionPicker, {
      category: 'test-note',
      document: 'X',
      revisions,
      reading,
      onnavigate,
    });
    const select = screen.getByTestId('revision-select');
    expect(select).toHaveValue('v1');
    await fireEvent.change(select, { target: { value: '' } });
    expect(onnavigate).toHaveBeenCalledWith('/categories/test-note/X');
    expect(screen.getByTestId('revision-back')).toHaveAttribute('href', '/categories/test-note/X');
  });
});
