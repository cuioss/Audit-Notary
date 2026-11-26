<script lang="ts">
  import Button from '../../components/Button.svelte';
  import ColumnHead from '../../components/ColumnHead.svelte';
  import Disclosure from '../../components/Disclosure.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import Link from '../../components/Link.svelte';
  import ReasonBadge from '../../components/ReasonBadge.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import Select from '../../components/Select.svelte';
  import StatusLabel from '../../components/StatusLabel.svelte';
  import TextField from '../../components/TextField.svelte';
  import type { Category, DocumentSummary, WorkflowState } from '../../api/types';
  import { actionsOn, categoryName, kindName } from '../../documents/categories';
  import { formatDate } from '../../format';
  import { currentLocale, messagesStore, t } from '../../i18n';
  import { session } from '../../stores/app';
  import { stateTone } from '../samm/workflow';

  /**
   * The documents of a category as a list column (UC-DOC-1): title, state, version and the last change, newest first.
   * The state and the title filter the list in the browser (the list holds at most 500 documents, so a filter is complete
   * while it is not `truncated`). A document with a pending release request carries a box, because someone is waiting
   * for it; the action *New* creates a document of a document type of the category.
   */
  interface Props {
    /** The category. */
    category: Category;
    /** The documents of every document type of the category, newest change first; `null` while loading. */
    documents: DocumentSummary[] | null;
    /** Whether the server holds more documents than the list. */
    truncated?: boolean;
    /** The selected document. */
    selected: string | null;
    /** Whether the list is the page's object, with no document beside it: it has room, and its filters stand open. */
    object?: boolean;
  }

  let { category, documents, truncated = false, selected, object = false }: Props = $props();

  const STATES: WorkflowState[] = ['draft', 'in-review', 'released'];

  let stateFilter = $state('');
  let title = $state('');

  let switchedOff = $derived(category.enabled === false);
  let name = $derived(categoryName($messagesStore, category.id));
  let editable = $derived(
    category.kinds.filter((kind) => actionsOn($session, kind.repository).includes('edit')),
  );
  let shown = $derived(
    (documents ?? []).filter(
      (entry) =>
        (stateFilter === '' || entry.state === stateFilter) &&
        entry.title.toLowerCase().includes(title.trim().toLowerCase()),
    ),
  );
</script>

<div class="column" class:column--object={object}>
  <ColumnHead
    kind="category"
    kindLabel={$t('kind.category')}
    title={name}
    href="/categories/{category.id}"
  >
    {#snippet meta()}
      {#if documents !== null}{$t('documents.list.count', { count: documents.length })}{/if}
    {/snippet}
  </ColumnHead>

  {#if !switchedOff}
    <div class="column__acts" data-testid="document-new">
      {#if editable.length === 0}
        <Button icon="act.next" disabledReason={$t('documents.list.new.no-right')}>
          {$t('documents.new')}
        </Button>
      {:else if category.kinds.length === 1}
        <Link href="/categories/{category.id}/new" look="primary" data-testid="new-document">
          {$t('documents.new')}
        </Link>
      {:else}
        {#each editable as kind (kind.id)}
          <Link
            href="/categories/{category.id}/new?kind={kind.id}"
            look="secondary"
            data-testid="new-document-{kind.id}"
          >
            {$t('documents.new-kind', { kind: kindName($messagesStore, category.id, kind.id) })}
          </Link>
        {/each}
      {/if}
    </div>
  {/if}

  {#if documents === null}
    <p class="column__loading">{$t('common.loading')}</p>
  {:else if documents.length === 0}
    <EmptyState
      icon="state.na"
      title={$t('documents.list.empty.title')}
      body={editable.length > 0 && !switchedOff
        ? $t('documents.list.empty.body')
        : $t('documents.list.empty.read-only')}
    />
  {:else}
    <Disclosure open={object} testId="document-filters">
      {#snippet summary()}{$t('documents.list.filter')}{/snippet}
      <div class="column__filters">
        <Select
          label={$t('documents.list.filter.state')}
          placeholder={$t('documents.list.filter.all')}
          bind:value={stateFilter}
          options={STATES.map((value) => ({ value, label: $t(`workflow.${value}`) }))}
          testId="filter-state"
        />
        <TextField
          label={$t('documents.list.filter.title')}
          bind:value={title}
          testId="filter-title"
        />
      </div>
    </Disclosure>
    {#if shown.length === 0}
      <EmptyState
        icon="state.na"
        title={$t('documents.list.none-match.title')}
        body={$t('documents.list.none-match.body')}
      />
    {:else}
      <ul class="column__list" data-testid="document-list">
        {#each shown as entry (entry.id)}
          <li>
            <RowLink
              href={entry.address}
              selected={entry.id === selected}
              testId="document-{entry.id}"
            >
              <span class="row__title">{entry.title}</span>
              <span class="row__line">
                <StatusLabel tone={stateTone(entry.state)} label={$t(`workflow.${entry.state}`)} />
                {#if entry.requested}
                  <ReasonBadge label={$t('documents.list.requested')} />
                {/if}
              </span>
              <span class="row__line">
                <span class="row__meta">
                  {$t('documents.list.version', { version: entry.version })}
                </span>
                <span class="row__meta">
                  {$t('documents.list.changed', {
                    date: formatDate(entry.updatedAt, $currentLocale),
                    name: entry.updatedBy.name,
                  })}
                </span>
              </span>
            </RowLink>
          </li>
        {/each}
      </ul>
    {/if}
    {#if truncated}
      <p class="column__note">{$t('documents.list.truncated', { count: documents.length })}</p>
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

  .column__filters {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-block-end: var(--space-3);
  }

  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .column__loading,
  .column__note {
    padding: var(--space-4);
    color: var(--color-text-muted);
  }

  .column__note {
    font-size: var(--text-sm);
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
