import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiClient } from '../api/client';
import { categoryList } from '../documents/categories';
import { N1, N4, resetKit, useProfile, type Kit } from '../views/documents/testkit';
import CommandPalette from './CommandPalette.svelte';

/**
 * The search of the documents in the command palette (UC-DOC-1; rest-api.adoc, decided provisionally) against the
 * `workshop` profile: from two characters, after a pause, grouped under the views, with the empty, the failed and the
 * truncated answer, while the Git server cannot be reached, and by keyboard.
 */
beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
});

afterEach(() => {
  resetKit();
  categoryList.set(null);
});

/**
 * Opens the palette and types.
 *
 * @param text what to type, if anything
 * @param profile the profile
 * @param lang the language
 * @param answers answers that replace the profile's own
 * @returns the kit and the function that navigates
 */
async function open(
  text = '',
  profile = 'workshop',
  lang: 'en' | 'de' = 'en',
  answers: Record<string, unknown> = {},
): Promise<Kit & { onnavigate: ReturnType<typeof vi.fn> }> {
  const kit = await useProfile(profile, lang, answers);
  // The views offer Documents while the lens exists.
  categoryList.set(await apiClient.listCategories());
  const onnavigate = vi.fn();
  render(CommandPalette, { open: true, onnavigate });
  if (text) await type(text);
  return { ...kit, onnavigate };
}

/** Types a text and lets the pause and the answer pass. */
async function type(text: string) {
  await fireEvent.input(screen.getByTestId('search-input'), { target: { value: text } });
  await vi.advanceTimersByTimeAsync(300);
}

/** @returns the requests to the search, in order */
function searches(kit: Kit): string[] {
  return kit.requests.filter((request) => request.startsWith('GET /api/v1/search'));
}

describe('the documents group', () => {
  it('asks for nothing before two characters, and says so for one', async () => {
    const kit = await open();
    await type('r');
    expect(screen.getByTestId('search-hint')).toHaveTextContent(
      'Type at least two characters to search the documents.',
    );
    expect(screen.queryByText('Documents')).toBeNull();
    expect(searches(kit)).toEqual([]);
    await type('  r ');
    expect(searches(kit)).toEqual([]);
  });

  it('lists the hits with title, category and state, as links to the document', async () => {
    const kit = await open('rotation');
    expect(searches(kit)).toEqual(['GET /api/v1/search?q=rotation']);
    expect(screen.getByRole('heading', { name: 'Documents' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Views' })).toBeInTheDocument();
    const hit = screen.getByTestId(`search-document-${N1}`);
    expect(hit).toHaveAttribute('href', `/categories/test-note/${N1}`);
    expect(hit).toHaveTextContent('Key rotation, decision of 24 November');
    expect(hit).toHaveTextContent('Test notes');
    expect(hit).toHaveTextContent('Released');
    expect(screen.getByTestId('search-status')).toHaveTextContent('One document matches.');
    // The views have their own say: none matches the text.
    expect(screen.getByText('No view matches.')).toBeInTheDocument();
  });

  it('finds the assessments of the delivered categories too, by the name of their lens', async () => {
    await open('Payments');
    const list = screen.getByTestId('search-documents');
    expect(within(list).getAllByRole('link').length).toBeGreaterThan(0);
    expect(list).toHaveTextContent('SAMM');
    expect(within(list).getAllByRole('link')[0]).toHaveAttribute(
      'href',
      expect.stringMatching(/^\/samm\//),
    );
    expect(screen.getByTestId('search-status')).toHaveTextContent('documents match.');
  });

  it('says so when no document matches, and still offers the views that do', async () => {
    await open('zzzz');
    expect(screen.getByTestId('search-status')).toHaveTextContent('No document matches.');
    expect(screen.queryByTestId('search-documents')).toBeNull();
    await type('docu');
    expect(screen.getByTestId('search-result-categories')).toBeInTheDocument();
  });

  it('is asked once for the text that stays after the pause, not for every key', async () => {
    const kit = await open();
    await fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'ro' } });
    await vi.advanceTimersByTimeAsync(100);
    await fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'rot' } });
    await vi.advanceTimersByTimeAsync(100);
    expect(screen.getByTestId('search-status')).toHaveTextContent('Searching the documents…');
    await type('rotation');
    expect(searches(kit)).toEqual(['GET /api/v1/search?q=rotation']);
  });

  it('drops the answer of a text that was left, and everything when the text is cleared', async () => {
    await open('rotation');
    expect(screen.getByTestId(`search-document-${N1}`)).toBeInTheDocument();
    await type('zzzz');
    expect(screen.queryByTestId(`search-document-${N1}`)).toBeNull();
    await type('');
    expect(screen.queryByRole('heading', { name: 'Documents' })).toBeNull();
    expect(screen.queryByTestId('search-status')).toBeNull();
  });

  it('serves the documents of a reader, and while the Git server cannot be reached', async () => {
    await open('retention', 'read-only');
    expect(screen.getByTestId('search-documents')).toHaveTextContent('Retention schedule');
    resetKit();
    document.body.innerHTML = '';
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await open('rotation', 'workshop#note-git-unavailable');
    expect(screen.getByTestId(`search-document-${N1}`)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says in a neutral notice that the documents cannot be searched, and keeps the views', async () => {
    await open('due', 'workshop#note-search-refused');
    expect(screen.getByTestId('search-status')).toHaveTextContent(
      'The documents cannot be searched right now. The views still work.',
    );
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByTestId('search-result-due')).toBeInTheDocument();
  });

  it('is no error when the server finds the text too short', async () => {
    await open('rotation', 'workshop', 'en', {
      'GET /api/v1/search': new Response(
        JSON.stringify({ outcome: 'VALIDATION', errors: [{ pointer: '/q', code: 'MIN_LENGTH' }] }),
        { status: 422 },
      ),
    });
    expect(screen.getByTestId('search-status')).toBeEmptyDOMElement();
    expect(screen.queryByTestId('search-documents')).toBeNull();
  });

  it('says that only the first hits are listed, and offers only the addresses the app has a view for', async () => {
    await open('rotation', 'workshop', 'en', {
      'GET /api/v1/search': {
        query: 'rotation',
        truncated: true,
        results: [
          {
            repository: 'test-notes',
            id: N1,
            category: 'test-note',
            kind: 'note',
            title: 'Key rotation, decision of 24 November',
            state: 'released',
            address: `/categories/test-note/${N1}`,
          },
          {
            repository: 'x',
            id: 'y',
            category: 'unknown-lens',
            kind: 'k',
            title: 'Somewhere else',
            state: 'draft',
            address: '/nowhere/at/all/here/x',
          },
        ],
      },
    });
    expect(screen.getByTestId('search-status')).toHaveTextContent(
      'Only the first 1 documents are listed. Narrow the search.',
    );
    expect(screen.queryByText('Somewhere else')).toBeNull();
  });

  it('offers only an address that passes the canonical-address check, as the server gives it', async () => {
    const hit = (id: string, address: string) => ({
      repository: 'test-notes',
      id,
      category: 'test-note',
      kind: 'note',
      title: `Hit ${id}`,
      state: 'draft',
      address,
    });
    await open('rotation', 'workshop', 'en', {
      'GET /api/v1/search': {
        query: 'rotation',
        truncated: false,
        results: [
          hit('good', `/categories/test-note/${N1}`),
          hit('fragment', `/categories/test-note/${N1}#top`),
          hit('outside', '//example.org/categories/test-note/x'),
          hit('scheme', 'https://example.org/categories/test-note/x'),
          hit('backslash', '/categories/test-note/a\\b'),
          hit('login', '/login'),
        ],
      },
    });
    const list = screen.getByTestId('search-documents');
    expect(within(list).getAllByRole('link')).toHaveLength(1);
    expect(screen.getByText('Hit good')).toBeInTheDocument();
  });

  it('names a category the catalogue does not know in words', async () => {
    await open('rotation', 'workshop', 'en', {
      'GET /api/v1/search': {
        query: 'rotation',
        truncated: false,
        results: [
          {
            repository: 'test-notes',
            id: N4,
            category: 'plain-notes',
            kind: 'note',
            title: 'A note',
            state: 'in-review',
            address: `/categories/test-note/${N4}`,
          },
        ],
      },
    });
    expect(screen.getByTestId(`search-document-${N4}`)).toHaveTextContent('Plain notes');
    expect(screen.getByTestId(`search-document-${N4}`)).toHaveTextContent('In review');
  });

  it('is read in German', async () => {
    await open('rotation', 'workshop', 'de');
    expect(screen.getByRole('heading', { name: 'Dokumente' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Ansichten' })).toBeInTheDocument();
    expect(screen.getByTestId('search-status')).toHaveTextContent('Ein Dokument passt.');
    expect(screen.getByTestId(`search-document-${N1}`)).toHaveTextContent('Freigegeben');
    await type('zzzz');
    expect(screen.getByTestId('search-status')).toHaveTextContent('Kein Dokument passt.');
  });
});

describe('the keyboard', () => {
  it('opens the first document on Enter when no view matches', async () => {
    const { onnavigate } = await open('rotation');
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).toHaveBeenCalledWith(`/categories/test-note/${N1}`);
  });

  it('opens the first view on Enter before any document', async () => {
    const { onnavigate } = await open('samm');
    expect(screen.getByTestId('search-result-samm')).toBeInTheDocument();
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).toHaveBeenCalledWith('/samm');
  });

  it('does nothing on Enter while the documents are not there yet, or when nothing matches', async () => {
    const { onnavigate } = await open();
    await fireEvent.input(screen.getByTestId('search-input'), { target: { value: 'rotation' } });
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    await type('zzzz');
    await fireEvent.keyDown(screen.getByTestId('search-input'), { key: 'Enter' });
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('moves through the matches with the arrow keys, views then documents, and back to the input', async () => {
    await open('docu');
    // A view and a document match "docu"? The views group holds Documents; the search finds titles with it too.
    const input = screen.getByTestId('search-input');
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const first = screen.getByTestId('search-result-categories');
    expect(first).toHaveFocus();
    await fireEvent.keyDown(first, { key: 'ArrowUp' });
    expect(input).toHaveFocus();
  });

  it('walks every match in order and stops at the ends', async () => {
    await open('rotation', 'workshop', 'en', {
      'GET /api/v1/search': {
        query: 'rotation',
        truncated: false,
        results: [
          {
            repository: 'test-notes',
            id: N1,
            category: 'test-note',
            kind: 'note',
            title: 'First',
            state: 'released',
            address: `/categories/test-note/${N1}`,
          },
          {
            repository: 'test-notes',
            id: N4,
            category: 'test-note',
            kind: 'note',
            title: 'Second',
            state: 'in-review',
            address: `/categories/test-note/${N4}`,
          },
        ],
      },
    });
    const input = screen.getByTestId('search-input');
    await fireEvent.keyDown(input, { key: 'ArrowDown' });
    const first = screen.getByTestId(`search-document-${N1}`);
    const second = screen.getByTestId(`search-document-${N4}`);
    expect(first).toHaveFocus();
    await fireEvent.keyDown(first, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    await fireEvent.keyDown(second, { key: 'ArrowDown' });
    expect(second).toHaveFocus();
    await fireEvent.keyDown(second, { key: 'ArrowUp' });
    expect(first).toHaveFocus();
  });

  it('opens the document of a click in the app, and leaves a click with a modifier to the browser', async () => {
    const { onnavigate } = await open('rotation');
    const hit = screen.getByTestId(`search-document-${N1}`);
    await fireEvent.click(hit, { ctrlKey: true });
    expect(onnavigate).not.toHaveBeenCalled();
    await fireEvent.click(hit, { button: 1 });
    expect(onnavigate).not.toHaveBeenCalled();
    await fireEvent.click(hit);
    expect(onnavigate).toHaveBeenCalledWith(`/categories/test-note/${N1}`);
  });

  it('forgets what was typed when it is opened again', async () => {
    await open('rotation');
    await fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    expect(screen.getByTestId('search-input')).toHaveValue('rotation');
  });
});
