<script lang="ts" module>
  /** Whether a visit to the lens has been made in this page session: only the first one opens the first catalog. */
  let visited = false;

  /** Forgets that the lens was visited, for tests. */
  export function resetFirstVisit(): void {
    visited = false;
  }
</script>

<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import Notice from '../../components/Notice.svelte';
  import Sheet from '../../components/Sheet.svelte';
  import { apiClient } from '../../api/client';
  import { errorMessageKey, isApiError } from '../../api/errors';
  import {
    CATALOG_CHANGED_EVENT,
    CATALOGS,
    type CatalogChangedEvent,
    type CatalogEntry,
    type CatalogEntryRead,
    type CatalogSchema,
  } from '../../api/types';
  import { canAdminister, catalogKind, catalogName, isCatalog } from '../../catalogs/catalogs';
  import { messagesStore, t } from '../../i18n';
  import { session } from '../../stores/app';
  import { breadcrumb } from '../../stores/breadcrumb';
  import TriagePage, { type Level } from '../../templates/TriagePage.svelte';
  import NotFoundView from '../NotFoundView.svelte';
  import CatalogListColumn from './CatalogListColumn.svelte';
  import EntryListColumn from './EntryListColumn.svelte';
  import EntrySheet from './EntrySheet.svelte';

  /**
   * The Catalogs lens (UC-CAT-1 to UC-CAT-4): the chain catalog › entries › entry (`TriagePage`). The catalogs are the
   * five of the application and the first column needs no request; the entries of the catalog of the address and the
   * entry of the address are read per address, and again when the event stream names the catalog, so an open list and an
   * open sheet follow what others do within the 5 seconds of AUN-WEB-5.
   *
   * The pages of the directory (`/directory/import`, `/directory/persons`) belong to the lens too but are not drawn here.
   */
  interface Props {
    /** The route id: `catalogs`, `catalogs.catalog`, `catalogs.new` or `catalogs.entry`. */
    route: string;
    /** The values of the address: `catalog`, `id`. */
    params: Record<string, string>;
    /** Opens an address inside the app; `replace` takes the place of the current one in the history. */
    onnavigate: (href: string, options?: { replace?: boolean }) => void;
  }

  let { route, params, onnavigate }: Props = $props();

  let entries = $state<{ catalog: string; list: CatalogEntry[] } | null>(null);
  let loadedSchema = $state<CatalogSchema | null>(null);
  let entry = $state<CatalogEntryRead | null>(null);
  let missing = $state(false);

  /** The loads of the view; each keeps its own failure, so one that succeeds never hides another that failed. */
  type Load = 'entries' | 'schema' | 'entry';
  let failures = $state<Partial<Record<Load, string>>>({});
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

  let catalog = $derived(params.catalog && isCatalog(params.catalog) ? params.catalog : null);
  /** The address names a catalog the application does not have. */
  let unknownCatalog = $derived(!!params.catalog && catalog === null);
  let notFound = $derived(unknownCatalog || missing);
  let administer = $derived(canAdminister($session));
  /** The entries of the catalog of the address: those read for another catalog are no entries here. */
  let ofCatalog = $derived(entries?.catalog === catalog ? entries.list : null);
  let schema = $derived(loadedSchema?.catalog === catalog ? loadedSchema.schema : null);
  let wantsEntry = $derived(route === 'catalogs.entry' || route === 'catalogs.new');

  onMount(() => {
    // The first visit opens the first catalog; a later visit to the address shows the catalogs.
    if (route === 'catalogs' && !visited) onnavigate(`/catalogs/${CATALOGS[0]}`, { replace: true });
    visited = true;
    // An entry of the catalog that someone saved, created or retired: the list and the open entry are read again.
    const stop = apiClient.subscribeEvents((event, data) => {
      if (event !== CATALOG_CHANGED_EVENT) return;
      const named = data as Partial<CatalogChangedEvent> | null;
      if (!named || named.catalog !== catalog) return;
      void readEntries(named.catalog);
      if (route === 'catalogs.entry' && named.id === params.id) reloadEntry();
    });
    return () => {
      stop();
      breadcrumb.set([]);
    };
  });

  /** The number of the latest read of the list; the answer of an older read is dropped. */
  let latestEntries = 0;

  async function readEntries(current: string) {
    const read = ++latestEntries;
    try {
      const answer = await apiClient.getCatalog(current);
      if (read !== latestEntries) return;
      entries = { catalog: current, list: answer.entries };
      succeed('entries');
    } catch (error) {
      if (read === latestEntries) fail('entries', error);
    }
  }

  // The list of the catalog of the address; another catalog drops the list of the last at once.
  $effect(() => {
    const current = catalog;
    if (!current) return;
    untrack(() => {
      void readEntries(current);
    });
  });

  // The schema of the catalog, for the form of an entry or of a new one.
  $effect(() => {
    const current = catalog;
    if (!current || !wantsEntry) {
      // The failure of the schema belongs to the address that needed it: the list does not show it.
      untrack(() => succeed('schema'));
      return;
    }
    if (untrack(() => loadedSchema)?.catalog === current) return;
    let live = true;
    apiClient
      .getCatalogSchema(current)
      .then((answer) => {
        if (!live) return;
        loadedSchema = answer;
        succeed('schema');
      })
      .catch((error) => {
        if (!live) return;
        if (isApiError(error) && error.outcome === 'NOT_FOUND') missing = true;
        else fail('schema', error);
      });
    return () => {
      live = false;
    };
  });

  /** The number of the latest read of the entry; the answer of an older read is dropped. */
  let latestRead = 0;

  async function readEntry(current: string, id: string) {
    const read = ++latestRead;
    try {
      const loaded = await apiClient.getCatalogEntry(current, id);
      if (read !== latestRead) return;
      entry = loaded;
      succeed('entry');
    } catch (error) {
      if (read !== latestRead) return;
      if (isApiError(error) && error.outcome === 'NOT_FOUND') missing = true;
      else fail('entry', error);
    }
  }

  // The entry of the address; another one drops the last at once, so its data never shows under the new address.
  $effect(() => {
    const id = params.id;
    const current = catalog;
    untrack(() => {
      latestRead += 1;
      entry = null;
      missing = false;
    });
    if (route !== 'catalogs.entry' || !id || !current) {
      // The failure of a read belongs to the entry asked: it does not stay over the list or the new entry.
      untrack(() => succeed('entry'));
      return;
    }
    untrack(() => void readEntry(current, id));
  });

  function reloadEntry() {
    if (route === 'catalogs.entry' && catalog && params.id) void readEntry(catalog, params.id);
  }

  /** A save, a creation or a retirement on the sheet: the list and the entry follow at once. */
  function changed() {
    if (catalog) void readEntries(catalog);
    reloadEntry();
  }

  const loading = $derived($t('common.loading'));

  let levels: Level[] = $derived.by(() => {
    const chain: Level[] = [
      {
        key: 'catalogs',
        kind: 'catalog',
        kindLabel: $t('lens.catalogs'),
        title: $t('lens.catalogs'),
        href: '/catalogs',
      },
    ];
    if (catalog) {
      chain.push({
        key: `catalog:${catalog}`,
        kind: 'catalog',
        kindLabel: $t('lens.catalogs'),
        title: catalogName($messagesStore, catalog),
        href: `/catalogs/${catalog}`,
      });
    }
    if (catalog && route === 'catalogs.new') {
      chain.push({
        key: 'new',
        kind: 'entry',
        kindLabel: catalogKind($messagesStore, catalog),
        title: $t('catalogs.new', { kind: catalogKind($messagesStore, catalog) }),
        href: `/catalogs/${catalog}/new`,
      });
    }
    if (catalog && route === 'catalogs.entry' && params.id) {
      chain.push({
        key: `entry:${params.id}`,
        kind: 'entry',
        kindLabel: catalogKind($messagesStore, catalog),
        title: entry?.name ?? loading,
        href: `/catalogs/${catalog}/${params.id}`,
      });
    }
    return chain;
  });

  $effect(() => {
    // An address that leads nowhere has no chain: the crumb must not stay at "Loading…".
    breadcrumb.set(
      notFound ? [] : levels.slice(1).map((level) => ({ label: level.title, href: level.href })),
    );
  });
</script>

{#if notFound}
  <NotFoundView />
{:else}
  {#if failure}
    <div class="catalogs__failure">
      <Notice tone="danger" title={$t(failure)} live />
    </div>
  {/if}
  <TriagePage
    {levels}
    objectMin={wantsEntry ? 780 : undefined}
    stripLabel={$t('triage.strip')}
    returnLabel={$t('triage.return')}
    upLabel={(parent) => $t('triage.up', { title: parent.title })}
    announce={(object) => $t('triage.announce', { kind: object.kindLabel, title: object.title })}
    testId="catalogs-view"
  >
    {#snippet column(level, { object })}
      {#if level.key === 'catalogs'}
        <CatalogListColumn selected={catalog} />
      {:else if level.key === 'new'}
        {#if catalog && schema}
          <!-- Another catalog is another form, never the typed one. -->
          {#key catalog}
            <EntrySheet
              {catalog}
              {schema}
              entry={null}
              canAdminister={administer}
              onchanged={changed}
              {onnavigate}
            />
          {/key}
        {:else}
          <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
        {/if}
      {:else if level.key.startsWith('entry:')}
        {#if catalog && schema && entry}
          {#key `${catalog}/${entry.id}`}
            <EntrySheet
              {catalog}
              {schema}
              {entry}
              canAdminister={administer}
              onchanged={changed}
              {onnavigate}
            />
          {/key}
        {:else}
          <Sheet><p class="muted">{$t('common.loading')}</p></Sheet>
        {/if}
      {:else if catalog}
        <EntryListColumn
          {catalog}
          entries={ofCatalog}
          selected={params.id ?? null}
          canAdminister={administer}
          {object}
        />
      {/if}
    {/snippet}
  </TriagePage>
{/if}

<style>
  .catalogs__failure {
    padding: var(--space-4) var(--space-6) 0;
  }

  .muted {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }
</style>
