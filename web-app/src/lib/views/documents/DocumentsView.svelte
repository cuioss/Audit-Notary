<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import type {
    Category,
    CategorySchema,
    DocumentRead,
    DocumentSummary,
    Revision,
  } from '../../api/types';
  import {
    actionsOn,
    categoryName,
    findDocument,
    isShown,
    loadCategories,
    repositoriesOf,
  } from '../../documents/categories';
  import { LIFECYCLE_EVENTS } from '../../api/types';
  import { messagesStore, t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import NotFoundView from '../NotFoundView.svelte';
  import CategoryListColumn from './CategoryListColumn.svelte';
  import DocumentListColumn from './DocumentListColumn.svelte';
  import DocumentSheet from './DocumentSheet.svelte';
  import NewDocumentSheet from './NewDocumentSheet.svelte';

  /**
   * The generic documents lens (UC-DOC-1 to UC-DOC-6): the categories without a lens of their own, as the chain
   * category › documents › document (`TriagePage`). The address names the category and the document, never the
   * repository; the view finds it among the repositories of the category's document types. A category that is not
   * `generic` is no address of this lens; a switched-off one that still holds documents stays readable and read-only.
   *
   * Data is read per address and again when the event stream names a document of the category, so a list and an open
   * sheet follow what others do within the 5 seconds of AUN-WEB-5.
   */
  interface Props {
    /** The route id: `categories`, `categories.category`, `categories.new` or `categories.document`. */
    route: string;
    /** The values of the address: `category`, `document`. */
    params: Record<string, string>;
    /** The admitted query of the address: `kind` of a new document, `at` of an earlier state. */
    query?: Record<string, string>;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { route, params, query = {}, onnavigate }: Props = $props();

  let categories = $state<Category[] | null>(null);
  let documents = $state<Record<string, { list: DocumentSummary[]; truncated: boolean }>>({});
  let loadedSchemas = $state<CategorySchema | null>(null);
  let doc = $state<DocumentRead | null>(null);
  let revisions = $state<{ list: Revision[]; truncated: boolean } | null>(null);
  let missing = $state(false);

  /** The loads of the view; each keeps its own failure, so one that succeeds never hides another that failed. */
  type Load = 'categories' | 'documents' | 'schema' | 'document';
  let failures = $state<Partial<Record<Load, string>>>({});
  let revisionsFailed = $state(false);
  let failure = $derived(Object.values(failures).find(Boolean) ?? null);

  function fail(load: Load, error: unknown) {
    failures = { ...failures, [load]: errorMessageKey(error) };
  }

  function succeed(load: Load) {
    if (!failures[load]) return;
    const rest = { ...failures };
    delete rest[load];
    failures = rest;
  }

  let shown = $derived((categories ?? []).filter(isShown));
  let category = $derived(categories?.find((entry) => entry.id === params.category) ?? null);
  /** The schemas of the category of the address: those read for another category are no schemas here. */
  let schemas = $derived(loadedSchemas?.category === category?.id ? loadedSchemas : null);
  /** The address names a category this lens does not show. */
  let unknownCategory = $derived(
    categories !== null && !!params.category && (!category || !category.generic),
  );
  let switchedOff = $derived(category?.enabled === false);
  let kind = $derived(
    query.kind ?? (category && category.kinds.length === 1 ? category.kinds[0].id : null),
  );
  let kindEntry = $derived(category?.kinds.find((entry) => entry.id === kind) ?? null);
  let newSchema = $derived(
    kindEntry ? (schemas?.kinds.find((entry) => entry.id === kindEntry.id)?.schema ?? null) : null,
  );
  /** `new` of a switched-off category, or of a document type the category does not have. */
  let badNew = $derived(
    route === 'categories.new' &&
      category !== null &&
      (switchedOff ||
        (query.kind !== undefined && kindEntry === null) ||
        // A document type whose schema the server does not serve has no form to show.
        (kindEntry !== null && schemas !== null && newSchema === null)),
  );
  let notFound = $derived(unknownCategory || badNew || missing);

  let ofCategory = $derived.by(() => {
    if (!category) return null;
    const repositories = repositoriesOf(category);
    if (!repositories.every((repository) => documents[repository])) return null;
    return repositories
      .flatMap((repository) => documents[repository].list)
      .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0));
  });
  let truncated = $derived(
    category
      ? repositoriesOf(category).some((repository) => documents[repository]?.truncated)
      : false,
  );

  onMount(() => {
    loadCategories()
      .then((list) => {
        categories = list.categories;
        succeed('categories');
        const only = list.categories.filter(isShown);
        // With one category the lens opens it.
        if (route === 'categories' && only.length === 1) {
          onnavigate(`/categories/${only[0].id}`, { replace: true });
        }
      })
      .catch((error) => fail('categories', error));
    // A document of the category that is created, saved or moved along its workflow is read again, also while its first
    // read is still under way: the reads are ordered, so the newer snapshot wins.
    const stop = apiClient.subscribeEvents((event, data) => {
      const named = data as { repository?: string; id?: string } | null;
      if (!(LIFECYCLE_EVENTS as readonly string[]).includes(event) || !named || !category) return;
      if (!repositoriesOf(category).includes(named.repository ?? '')) return;
      void readLists(category);
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  /** The number of the latest read of the lists; the answer of an older read is dropped. */
  let latestLists = 0;

  async function readLists(current: Category) {
    const read = ++latestLists;
    try {
      const answers = await Promise.all(
        repositoriesOf(current).map(async (repository) => {
          const answer = await apiClient.listDocuments(repository);
          return [repository, { list: answer.documents, truncated: answer.truncated }] as const;
        }),
      );
      if (read !== latestLists) return;
      documents = Object.fromEntries(answers);
      succeed('documents');
    } catch (error) {
      if (read === latestLists) fail('documents', error);
    }
  }

  // The lists of the category of the address; another category drops the lists of the last at once.
  $effect(() => {
    const current = category;
    if (!current) return;
    untrack(() => {
      documents = {};
      void readLists(current);
    });
  });

  // The schema of the category, for the form of a document or of a new one.
  $effect(() => {
    const current = category;
    if (!current || (route !== 'categories.document' && route !== 'categories.new')) return;
    if (untrack(() => loadedSchemas)?.category === current.id) return;
    let live = true;
    apiClient
      .getCategorySchema(current.id)
      .then((answer) => {
        if (!live) return;
        loadedSchemas = answer;
        succeed('schema');
      })
      .catch((error) => {
        if (live) fail('schema', error);
      });
    return () => {
      live = false;
    };
  });

  /** The number of the latest read of the document; the answer of an older read is dropped. */
  let latestRead = 0;

  async function readDocument(current: Category, id: string, at: string | undefined) {
    const read = ++latestRead;
    try {
      const loaded = await findDocument(apiClient, current, id, at);
      if (read !== latestRead) return;
      doc = loaded;
      succeed('document');
      void readRevisions(loaded);
    } catch (error) {
      if (read !== latestRead) return;
      if (isApiError(error) && (error.outcome === 'NOT_FOUND' || error.outcome === 'VALIDATION')) {
        missing = true;
      } else {
        fail('document', error);
      }
    }
  }

  let latestRevisions = 0;

  async function readRevisions(loaded: DocumentRead) {
    const read = ++latestRevisions;
    try {
      const answer = await apiClient.listRevisions(loaded.repository, loaded.id);
      if (read !== latestRevisions) return;
      revisions = { list: answer.revisions, truncated: answer.truncated };
      revisionsFailed = false;
    } catch {
      if (read === latestRevisions) revisionsFailed = true;
    }
  }

  // The document of the address (and its earlier state); another one drops the last at once, so its data never shows
  // under the new address.
  $effect(() => {
    const id = params.document;
    const at = query.at;
    const current = category;
    if (route !== 'categories.document' || !id || !current) {
      doc = null;
      revisions = null;
      missing = false;
      // The failure of a read belongs to the document asked: it does not stay over the list or the new document.
      untrack(() => succeed('document'));
      return;
    }
    untrack(() => {
      doc = null;
      revisions = null;
      revisionsFailed = false;
      missing = false;
      void readDocument(current, id, at);
    });
  });

  function reloadDocument() {
    if (route !== 'categories.document' || !params.document || !category) return;
    void readDocument(category, params.document, query.at);
  }

  let schema = $derived(
    doc ? (schemas?.kinds.find((entry) => entry.id === doc!.kind)?.schema ?? null) : null,
  );

  const loading = $derived($t('common.loading'));

  let levels: Level[] = $derived.by(() => {
    const chain: Level[] = [];
    if (route === 'categories' || shown.length > 1 || categories === null) {
      chain.push({
        key: 'categories',
        kind: 'category',
        kindLabel: $t('lens.categories'),
        title: $t('documents.categories.title'),
        href: '/categories',
      });
    }
    if (params.category) {
      chain.push({
        key: `category:${params.category}`,
        kind: 'category',
        kindLabel: $t('kind.category'),
        title: category ? categoryName($messagesStore, category.id) : loading,
        href: `/categories/${params.category}`,
      });
    }
    if (route === 'categories.new') {
      chain.push({
        key: 'new',
        kind: 'document',
        kindLabel: $t('kind.document'),
        title: $t('documents.new'),
        href: `/categories/${params.category}/new`,
      });
    }
    if (params.document) {
      chain.push({
        key: `document:${params.document}`,
        kind: 'document',
        kindLabel: $t('kind.document'),
        title: doc?.title ?? loading,
        href: `/categories/${params.category}/${params.document}`,
      });
    }
    return chain;
  });

  $effect(() => {
    // An address that leads nowhere has no chain: the crumb must not stay at "Loading…".
    breadcrumb.set(
      notFound
        ? []
        : levels
            .filter((level) => level.key !== 'categories')
            .map((level) => ({ label: level.title, href: level.href })),
    );
  });

  let objectMin = $derived(
    route === 'categories.document' || route === 'categories.new' ? 780 : undefined,
  );
  /** The key of a sheet: another document or another earlier state is another sheet, never an edited one. */
  let sheetKey = $derived(`${params.document}@${query.at ?? ''}`);
</script>

{#if notFound}
  <NotFoundView />
{:else}
  {#if failure}
    <div class="documents__failure">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  <TriagePage
    {levels}
    {objectMin}
    stripLabel={$t('triage.strip')}
    returnLabel={$t('triage.return')}
    upLabel={(parent) => $t('triage.up', { title: parent.title })}
    announce={(object) => $t('triage.announce', { kind: object.kindLabel, title: object.title })}
    testId="documents-view"
  >
    {#snippet column(level, { object })}
      {#if level.key === 'categories'}
        <CategoryListColumn
          categories={categories === null ? null : shown}
          selected={params.category ?? null}
        />
      {:else if level.key === 'new'}
        {#if category}
          <!-- Another category or document type is another form, never the typed one. -->
          {#key `${category.id}:${kindEntry?.id ?? ''}`}
            <NewDocumentSheet
              {category}
              kind={kindEntry?.id ?? null}
              schema={newSchema}
              repository={kindEntry?.repository ?? ''}
              canCreate={kindEntry
                ? actionsOn($session, kindEntry.repository).includes('edit')
                : category.kinds.some((entry) =>
                    actionsOn($session, entry.repository).includes('edit'),
                  )}
              {onnavigate}
            />
          {/key}
        {:else}
          <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
        {/if}
      {:else if level.key.startsWith('document:')}
        {#if category && doc && schema}
          {#key sheetKey}
            <DocumentSheet
              document={doc}
              {category}
              {schema}
              revisions={revisions?.list ?? null}
              revisionsTruncated={revisions?.truncated ?? false}
              {revisionsFailed}
              onrefresh={reloadDocument}
              {onnavigate}
            />
          {/key}
        {:else}
          <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
        {/if}
      {:else if category}
        <DocumentListColumn
          {category}
          documents={ofCategory}
          {truncated}
          selected={params.document ?? null}
          {object}
        />
      {:else}
        <p class="muted">{$t('common.loading')}</p>
      {/if}
    {/snippet}
  </TriagePage>
{/if}

<style>
  .documents__failure {
    padding: var(--space-4) var(--space-6) 0;
  }

  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
</style>
