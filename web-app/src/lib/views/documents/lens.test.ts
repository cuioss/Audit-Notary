import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { get } from 'svelte/store';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { breadcrumb } from '../../stores/breadcrumb';
import DocumentsView from './DocumentsView.svelte';
import { N1, N2, N6, REPOSITORY, resetKit, useProfile } from './testkit';

/**
 * The documents lens against the `workshop` and `read-only` profiles of the scenario mock (AUN-TEST-1): the categories,
 * the document list with its filters and states, the addresses that are no address of the lens, and the switched-off
 * category that stays readable.
 */
afterEach(resetKit);

const CATEGORY = { route: 'categories.category', params: { category: 'test-note' } } as const;

/** The category of the mock as `GET /api/v1/categories` lists it, with changes. */
function categories(...list: Record<string, unknown>[]) {
  return { categories: list };
}

const TEST_NOTE = {
  id: 'test-note',
  generic: true,
  kinds: [{ id: 'note', repository: REPOSITORY }],
};

describe('the categories', () => {
  it('opens the only category at once, in place of the address', async () => {
    await useProfile();
    const onnavigate = vi.fn();
    render(DocumentsView, { route: 'categories', params: {}, onnavigate });
    await vi.waitFor(() =>
      expect(onnavigate).toHaveBeenCalledWith('/categories/test-note', { replace: true }),
    );
  });

  it('lists the categories when there are several, with the names of their document types', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories': categories(
        TEST_NOTE,
        { id: 'form-sections', generic: true, kinds: [{ id: 'sections', repository: 'x' }] },
        { id: 'custom', generic: false, kinds: [] },
      ),
    });
    const onnavigate = vi.fn();
    render(DocumentsView, { route: 'categories', params: {}, onnavigate });
    const list = await screen.findByTestId('category-list');
    expect(within(list).getAllByRole('link')).toHaveLength(2);
    expect(screen.getByTestId('category-test-note')).toHaveTextContent('Test notes');
    expect(screen.getByTestId('category-test-note')).toHaveTextContent('Document types: Note');
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('says so when no category is shown', async () => {
    await useProfile('empty');
    render(DocumentsView, { route: 'categories', params: {}, onnavigate: vi.fn() });
    expect(await screen.findByText('No document categories')).toBeInTheDocument();
  });

  it('keeps the list of categories beside the documents when there are several', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories': categories(TEST_NOTE, {
        id: 'form-sections',
        generic: true,
        kinds: [{ id: 'sections', repository: 'x' }],
      }),
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByTestId('category-list')).toBeInTheDocument();
    expect(await screen.findByTestId('document-list')).toBeInTheDocument();
    expect(screen.getByTestId('category-test-note')).toHaveAttribute('aria-current', 'page');
  });
});

describe('the document list', () => {
  it('lists every document of the category with its state, version and last change', async () => {
    await useProfile();
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    const list = await screen.findByTestId('document-list');
    expect(list.querySelectorAll('li')).toHaveLength(9);
    const row = screen.getByTestId(`document-${N1}`);
    expect(row).toHaveTextContent('Key rotation, decision of 24 November');
    expect(row).toHaveTextContent('Released');
    expect(row).toHaveTextContent('Version 1');
    expect(row).toHaveTextContent('Noor Haddad');
    expect(row).toHaveAttribute('href', `/categories/test-note/${N1}`);
    expect(screen.getByText('9 documents')).toBeInTheDocument();
  });

  it('marks a pending release request with a box and names no other mark', async () => {
    await useProfile();
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    await screen.findByTestId('document-list');
    expect(screen.getAllByText('Release requested')).toHaveLength(2);
    expect(screen.getByTestId(`document-${N1}`)).not.toHaveTextContent('Release requested');
  });

  it('filters by state and by title', async () => {
    await useProfile();
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    const list = await screen.findByTestId('document-list');
    await fireEvent.change(screen.getByTestId('filter-state'), { target: { value: 'released' } });
    expect(list.querySelectorAll('li')).toHaveLength(2);
    await fireEvent.input(screen.getByLabelText('Filter by title'), {
      target: { value: 'KEY ROT' },
    });
    expect(list.querySelectorAll('li')).toHaveLength(1);
    await fireEvent.input(screen.getByLabelText('Filter by title'), { target: { value: 'zzz' } });
    expect(await screen.findByText('No document matches')).toBeInTheDocument();
  });

  it('offers New as a link for a person who may edit, and as an act that says why not for one who may not', async () => {
    await useProfile();
    const edit = render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByTestId('new-document')).toHaveAttribute(
      'href',
      '/categories/test-note/new',
    );
    edit.unmount();
    resetKit();
    await useProfile('read-only');
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    await screen.findByTestId('document-list');
    expect(screen.queryByTestId('new-document')).toBeNull();
    expect(screen.getByText('Creating a document needs the edit right.')).toBeInTheDocument();
  });

  it('offers one New per document type when a category has several, by the type', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories': categories({
        ...TEST_NOTE,
        kinds: [
          { id: 'note', repository: REPOSITORY },
          { id: 'memo', repository: REPOSITORY },
        ],
      }),
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByTestId('new-document-note')).toHaveAttribute(
      'href',
      '/categories/test-note/new?kind=note',
    );
    expect(screen.getByTestId('new-document-memo')).toHaveTextContent('New Memo');
  });

  it('waits for the documents, then says there are none', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/documents/test-notes': {
        repository: REPOSITORY,
        documents: [],
        truncated: false,
      },
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByText('No documents yet')).toBeInTheDocument();
    expect(screen.getByText('Create the first one.')).toBeInTheDocument();
  });

  it('tells a reader that nothing has been written yet, without an invitation to create', async () => {
    await useProfile('read-only', 'en', {
      'GET /api/v1/documents/test-notes': {
        repository: REPOSITORY,
        documents: [],
        truncated: false,
      },
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(
      await screen.findByText('Nothing has been written in this category yet.'),
    ).toBeInTheDocument();
  });

  it('says that the filters work on the listed documents only when the list is cut', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/documents/test-notes': {
        repository: REPOSITORY,
        documents: [
          {
            id: N1,
            kind: 'note',
            title: 'One',
            state: 'draft',
            version: 1,
            updatedAt: '2026-11-24T10:05:00Z',
            updatedBy: { pseudonym: 'p-7d2e58', name: 'Noor Haddad' },
            release: null,
            requested: false,
            address: `/categories/test-note/${N1}`,
          },
        ],
        truncated: true,
      },
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(
      await screen.findByText('Only the newest 1 documents are listed. The filters work on these.'),
    ).toBeInTheDocument();
  });

  it('shows a refusal of the list as a notice', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/documents/test-notes': Response.json(
        { outcome: 'GIT_UNAVAILABLE' },
        { status: 503 },
      ),
    });
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached');
  });

  it('reads the list again when the event stream names a document of the category', async () => {
    const kit = await useProfile();
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    await screen.findByTestId('document-list');
    const reads = () => kit.requests.filter((r) => r === 'GET /api/v1/documents/test-notes').length;
    expect(reads()).toBe(1);
    kit.emit('document-created', { repository: REPOSITORY, id: 'x', kind: 'note' });
    await vi.waitFor(() => expect(reads()).toBe(2));
    kit.emit('document-created', { repository: 'elsewhere', id: 'x', kind: 'note' });
    kit.emit('status', {});
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(reads()).toBe(2);
  });

  it('names the category in the breadcrumb and drops it with the view', async () => {
    await useProfile();
    const view = render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    await screen.findByTestId('document-list');
    expect(get(breadcrumb)).toEqual([{ label: 'Test notes', href: '/categories/test-note' }]);
    view.unmount();
    expect(get(breadcrumb)).toEqual([]);
  });
});

describe('addresses that are no address of the lens', () => {
  it('shows the not-found view for a category that is not generic and for one the server does not list', async () => {
    await useProfile('workshop', 'en', {
      'GET /api/v1/categories': categories(TEST_NOTE, {
        id: 'delivered',
        generic: false,
        kinds: [],
      }),
    });
    const first = render(DocumentsView, {
      route: 'categories.category',
      params: { category: 'delivered' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    first.unmount();
    render(DocumentsView, {
      route: 'categories.category',
      params: { category: 'nothing-like-it' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows the not-found view for a document the category does not hold', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/01JZ00000000000000000000XX`]: Response.json(
        { outcome: 'NOT_FOUND' },
        { status: 404 },
      ),
    });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: '01JZ00000000000000000000XX' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows the not-found view for a revision that does not exist, and for one of a wrong shape', async () => {
    await useProfile();
    const unknown = render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N6 },
      query: { at: 'deadbee' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
    unknown.unmount();
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N6 },
      query: { at: 'zzz' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows the not-found view for a new document of a type the category does not have', async () => {
    await useProfile();
    render(DocumentsView, {
      route: 'categories.new',
      params: { category: 'test-note' },
      query: { kind: 'unknown' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });
});

describe('a switched-off category that still holds documents', () => {
  const OFF = { categories: [{ ...TEST_NOTE, enabled: false }] };

  it('stays readable and offers nothing to create, and neither lens counts it', async () => {
    await useProfile('workshop', 'en', { 'GET /api/v1/categories': OFF });
    const onnavigate = vi.fn();
    render(DocumentsView, { ...CATEGORY, onnavigate });
    expect(await screen.findByTestId('document-list')).toBeInTheDocument();
    expect(screen.queryByTestId('document-new')).toBeNull();
    expect(screen.queryByTestId('category-list')).toBeNull();
  });

  it('does not offer the lens a list of it, and does not open it on its own', async () => {
    await useProfile('workshop', 'en', { 'GET /api/v1/categories': OFF });
    const onnavigate = vi.fn();
    render(DocumentsView, { route: 'categories', params: {}, onnavigate });
    expect(await screen.findByText('No document categories')).toBeInTheDocument();
    expect(onnavigate).not.toHaveBeenCalled();
  });

  it('has no new document', async () => {
    await useProfile('workshop', 'en', { 'GET /api/v1/categories': OFF });
    render(DocumentsView, {
      route: 'categories.new',
      params: { category: 'test-note' },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('not-found-view')).toBeInTheDocument();
  });

  it('shows its document as read-only, with the reason', async () => {
    await useProfile('workshop', 'en', { 'GET /api/v1/categories': OFF });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('document-sheet')).toBeInTheDocument();
    expect(screen.getByText('This category is switched off')).toBeInTheDocument();
    expect(screen.getByTestId('save-state')).toHaveTextContent(
      'This category is switched off. Its documents can be read only.',
    );
    expect(screen.queryByTestId('save-everyone')).toBeNull();
    expect(screen.queryByTestId('transition-bar')).toBeNull();
    expect(within(screen.getByTestId('document-form')).queryAllByRole('textbox')).toHaveLength(0);
    expect(screen.getByTestId('document-form')).toHaveTextContent('Retention schedule');
  });
});

describe('the document of an address', () => {
  it('opens its sheet beside the list, names it in the breadcrumb and selects its row', async () => {
    await useProfile();
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByTestId('document-sheet')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(get(breadcrumb).map((entry) => entry.label)).toEqual([
        'Test notes',
        'Retention schedule for audit evidence',
      ]),
    );
  });

  it('shows a refusal of the read as a notice', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N2}`]: Response.json(
        { outcome: 'GIT_UNAVAILABLE' },
        { status: 503 },
      ),
    });
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached');
  });

  it('reads the schema again for nothing: once per category', async () => {
    const kit = await useProfile();
    render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    expect(
      kit.requests.filter((request) => request === 'GET /api/v1/categories/test-note/schema'),
    ).toHaveLength(1);
  });
});

describe('moving between addresses without leaving the lens', () => {
  it('reads the schema of the category it moved to, never keeping the one of the last', async () => {
    const first = await useProfile();
    const schema = await (
      await first.scenario.fetch(new Request('http://localhost/api/v1/categories/test-note/schema'))
    ).json();
    const kit = await useProfile('workshop', 'en', {
      'GET /api/v1/categories': categories(TEST_NOTE, { ...TEST_NOTE, id: 'other-note' }),
      'GET /api/v1/categories/other-note/schema': { ...schema, category: 'other-note' },
    });
    const view = render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    await screen.findByTestId('document-sheet');
    await view.rerender({
      route: 'categories.document',
      params: { category: 'other-note', document: N2 },
    });
    await vi.waitFor(() =>
      expect(kit.requests).toContain('GET /api/v1/categories/other-note/schema'),
    );
    expect(await screen.findByTestId('document-sheet')).toBeInTheDocument();
  });

  it('drops the failure of a document read when the address moves to the list', async () => {
    await useProfile('workshop', 'en', {
      [`GET /api/v1/documents/${REPOSITORY}/${N2}`]: Response.json(
        { outcome: 'GIT_UNAVAILABLE' },
        { status: 503 },
      ),
    });
    const view = render(DocumentsView, {
      route: 'categories.document',
      params: { category: 'test-note', document: N2 },
      onnavigate: vi.fn(),
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('The Git server cannot be reached');
    await view.rerender({ ...CATEGORY });
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });
});

describe('in German', () => {
  it('shows the list, its filters and its marks with the German texts', async () => {
    await useProfile('workshop', 'de');
    render(DocumentsView, { ...CATEGORY, onnavigate: vi.fn() });
    expect(await screen.findByTestId('document-list')).toBeInTheDocument();
    expect(screen.getByText('9 Dokumente')).toBeInTheDocument();
    expect(screen.getByText('Testnotizen')).toBeInTheDocument();
    expect(screen.getByTestId('new-document')).toHaveTextContent('Neues Dokument');
    expect(screen.getByLabelText('Nach Titel filtern')).toBeInTheDocument();
    expect(screen.getAllByText('Freigabe angefragt')).toHaveLength(2);
    expect(screen.getByTestId(`document-${N1}`)).toHaveTextContent('Version 1');
    expect(screen.getByTestId(`document-${N1}`)).toHaveTextContent('Geändert am');
    expect(screen.getByTestId(`document-${N1}`)).toHaveTextContent('Freigegeben');
  });
});
