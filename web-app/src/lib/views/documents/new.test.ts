import { fireEvent, render, screen } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const navigation = vi.hoisted(() => ({
  callback: null as null | ((navigation: unknown) => void),
  goto: vi.fn(),
}));

vi.mock('$app/navigation', () => ({
  beforeNavigate: (callback: (navigation: unknown) => void) => {
    navigation.callback = callback;
  },
  afterNavigate: () => {},
  goto: navigation.goto,
}));

import DocumentsView from './DocumentsView.svelte';
import { REPOSITORY, resetKit, useProfile, type Kit } from './testkit';

/**
 * A new document of the generic lens against the `workshop` and `read-only` profiles (AUN-TEST-1): the form with its value
 * held in the page, the first save, its refusals, the question before the page is left, the choice of a document type.
 */
const ADDRESS = '/categories/test-note/01JZ9A3J5M7P9R1T3W5Y7B9D1F';

beforeEach(() => {
  navigation.callback = null;
  navigation.goto.mockClear();
});

afterEach(resetKit);

/** Opens the new-document address; the document type is the category's only one unless a query names one. */
async function open(
  profile = 'workshop',
  query: Record<string, string> = {},
  answers: Record<string, unknown> = {},
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, 'en', answers);
  const onnavigate = vi.fn();
  render(DocumentsView, {
    route: 'categories.new',
    params: { category: 'test-note' },
    query,
    onnavigate,
  });
  return { ...kit, onnavigate };
}

const title = () => screen.getByLabelText(/^Title/);

describe('the form of a new document', () => {
  it('shows the empty form of the only document type, and nothing to save yet', async () => {
    await open();
    expect(await screen.findByTestId('new-document-sheet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('New Note');
    expect(screen.getByText('Nothing is stored before the first save.')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Not saved yet. Nothing is kept until the first save.',
    );
    expect(screen.getByTestId('save-everyone')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText('Fill in the form first.')).toBeInTheDocument();
  });

  it('holds what is typed in the page and writes nothing before the first save', async () => {
    const kit = await open();
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    expect(screen.getByTestId('save-state')).toHaveTextContent('Your text stays on this page');
    expect(
      kit.requests.filter((request) => request.startsWith('PUT') || request.startsWith('POST')),
    ).toEqual([]);
  });

  it('creates the document with the first save and moves to its address in place of this one', async () => {
    const kit = await open();
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(kit.onnavigate).toHaveBeenCalledWith(ADDRESS, { replace: true }));
    expect(kit.bodies).toContainEqual({
      request: `POST /api/v1/documents/${REPOSITORY}`,
      body: { kind: 'note', parts: { data: { fields: { '/title': 'Phishing drill notes' } } } },
    });
  });

  it('does not ask before it leaves for the document it created', async () => {
    const kit = await open();
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    await vi.waitFor(() => expect(kit.onnavigate).toHaveBeenCalled());
    const leaving = { cancel: vi.fn(), willUnload: false, to: { url: new URL('http://x/y') } };
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
  });

  it('shows the errors of the server at the fields and keeps the text on the page', async () => {
    await open('workshop#note-invalid');
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Some entries are not valid. Correct the marked fields.',
    );
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Some entries need a correction. Your text stays on this page.',
    );
    expect(title()).toHaveValue('Phishing drill notes');
    expect(
      screen.getByText('This reference leads nowhere. Check it or choose another.'),
    ).toBeInTheDocument();
  });

  it.each([
    [
      'note-rejected',
      'The Git server refused the change. Your work is kept; ask an administrator.',
    ],
    [
      'note-git-unavailable',
      'The Git server cannot be reached. Your work is kept; save again later.',
    ],
  ])('says in words that nothing was created in %s, and keeps the text', async (state, text) => {
    const kit = await open(`workshop#${state}`);
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    await fireEvent.click(screen.getByTestId('save-everyone'));
    expect(await screen.findByRole('alert')).toHaveTextContent(text);
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'Not saved. Your text stays on this page.',
    );
    expect(title()).toHaveValue('Phishing drill notes');
    expect(kit.onnavigate).not.toHaveBeenCalled();
  });

  it('offers a person without the right edit nothing to create, and says why', async () => {
    await open('read-only');
    expect(
      await screen.findByText('Creating a document needs the edit right.'),
    ).toBeInTheDocument();
    expect(screen.queryByTestId('save-everyone')).toBeNull();
  });
});

describe('leaving the page', () => {
  it('asks before a move inside the app, stays or leaves as the person chooses', async () => {
    await open();
    await screen.findByTestId('new-document-sheet');
    await fireEvent.input(title(), { target: { value: 'Phishing drill notes' } });
    const leaving = {
      cancel: vi.fn(),
      willUnload: false,
      to: { url: new URL('http://x/categories') },
    };
    navigation.callback!(leaving);
    expect(leaving.cancel).toHaveBeenCalled();
    expect(await screen.findByText('Leave this page?')).toBeInTheDocument();
    await fireEvent.click(screen.getByTestId('leave-stay'));
    expect(navigation.goto).not.toHaveBeenCalled();

    navigation.callback!({ ...leaving, cancel: vi.fn() });
    await fireEvent.click(await screen.findByTestId('leave-confirm'));
    expect(navigation.goto).toHaveBeenCalledWith('/categories');
  });

  it('does not ask while the form is empty', async () => {
    await open();
    await screen.findByTestId('new-document-sheet');
    const leaving = {
      cancel: vi.fn(),
      willUnload: false,
      to: { url: new URL('http://x/categories') },
    };
    navigation.callback!(leaving);
    expect(leaving.cancel).not.toHaveBeenCalled();
  });
});

describe('several document types', () => {
  const TWO = {
    'GET /api/v1/categories': {
      categories: [
        {
          id: 'test-note',
          generic: true,
          kinds: [
            { id: 'note', repository: REPOSITORY },
            { id: 'memo', repository: REPOSITORY },
          ],
        },
      ],
    },
  };

  it('asks which one, with a link for each', async () => {
    await open('workshop', {}, TWO);
    expect(await screen.findByTestId('new-document-choice')).toBeInTheDocument();
    expect(screen.getByText('Which document type?')).toBeInTheDocument();
    expect(screen.getByTestId('choose-note')).toHaveAttribute(
      'href',
      '/categories/test-note/new?kind=note',
    );
    expect(screen.getByTestId('choose-memo')).toHaveTextContent('Memo');
  });

  it('opens the form of the one the address names', async () => {
    await open('workshop', { kind: 'note' }, TWO);
    expect(await screen.findByTestId('new-document-form')).toBeInTheDocument();
  });

  it('shows the not-found view for a type whose schema the server does not serve', async () => {
    await open('workshop', { kind: 'memo' }, TWO);
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });
});
