<script lang="ts">
  import Button from '../../components/Button.svelte';
  import ColumnHead from '../../components/ColumnHead.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextField from '../../components/TextField.svelte';
  import type { CatalogEntry } from '../../api/types';
  import { catalogKind, catalogName, entryAddress } from '../../catalogs/catalogs';
  import { messagesStore, t } from '../../i18n';

  /**
   * The entries of one catalog as a list column (UC-CAT-1): the name and the id of each, the retired ones marked with a
   * dot (information, not a box: nobody has to act), a filter by name, and the action *New* for a person who may
   * administer the catalogs (an act that says why not for one who may not).
   */
  interface Props {
    /** The catalog. */
    catalog: string;
    /** Its entries, `null` while loading. */
    entries: CatalogEntry[] | null;
    /** The selected entry. */
    selected: string | null;
    /** Whether the user holds the right `administer-catalogs`. */
    canAdminister: boolean;
    /** Whether the list is the page's object, with no entry beside it: it has room. */
    object?: boolean;
  }

  let { catalog, entries, selected, canAdminister, object = false }: Props = $props();

  let name = $state('');
  let title = $derived(catalogName($messagesStore, catalog));
  let kind = $derived(catalogKind($messagesStore, catalog));
  let shown = $derived(
    (entries ?? []).filter((entry) =>
      `${entry.name} ${entry.id}`.toLowerCase().includes(name.trim().toLowerCase()),
    ),
  );
</script>

<div class="column" class:column--object={object}>
  <ColumnHead kind="catalog" kindLabel={$t('lens.catalogs')} {title} href="/catalogs/{catalog}">
    {#snippet meta()}
      {#if entries !== null}{$t('catalogs.list.count', { count: entries.length })}{/if}
    {/snippet}
  </ColumnHead>

  <div class="column__acts" data-testid="catalog-new">
    {#if canAdminister}
      <Link href="/catalogs/{catalog}/new" look="primary" data-testid="new-entry">
        {$t('catalogs.new', { kind })}
      </Link>
    {:else}
      <Button icon="act.next" disabledReason={$t('catalogs.no-right')} data-testid="new-entry">
        {$t('catalogs.new', { kind })}
      </Button>
    {/if}
  </div>

  {#if entries === null}
    <p class="column__loading">{$t('common.loading')}</p>
  {:else if entries.length === 0}
    <EmptyState
      icon="state.na"
      title={$t('catalogs.list.empty.title')}
      body={canAdminister ? $t('catalogs.list.empty.body') : $t('catalogs.list.empty.read-only')}
    />
  {:else}
    <div class="column__filter">
      <TextField label={$t('catalogs.list.filter')} bind:value={name} testId="filter-name" />
    </div>
    {#if shown.length === 0}
      <EmptyState
        icon="state.na"
        title={$t('catalogs.list.none-match.title')}
        body={$t('catalogs.list.none-match.body')}
      />
    {:else}
      <ul class="column__list" data-testid="entry-list">
        {#each shown as entry (entry.id)}
          <li>
            <RowLink
              href={entryAddress(catalog, entry.id)}
              selected={entry.id === selected}
              testId="entry-{entry.id}"
            >
              <span class="row__title">{entry.name}</span>
              <span class="row__line">
                <span class="row__meta">{entry.id}</span>
                {#if entry.retired}
                  <StatusLabel tone="neutral" label={$t('form.mark.retired')} />
                {/if}
              </span>
            </RowLink>
          </li>
        {/each}
      </ul>
    {/if}
  {/if}
</div>

<style>
  .column--object {
    max-inline-size: 44rem;
  }

  .column__acts {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    padding-block: var(--space-3);
  }

  /* The act stands at the start of the column: the reason that it is not available reads from the start too. */
  .column__acts :global(.btn-with-reason) {
    align-items: flex-start;
  }

  .column__acts :global(.btn__reason) {
    text-align: start;
  }

  .column__filter {
    padding-block-end: var(--space-3);
  }

  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .column__loading {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .row__title {
    font-weight: var(--weight-medium);
  }

  .row__line {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
  }

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
