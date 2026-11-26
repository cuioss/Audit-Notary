<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import EmptyState from '../../components/EmptyState.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import type { Category } from '../../api/types';
  import { categoryName, kindName } from '../../documents/categories';
  import { messagesStore, t } from '../../i18n';

  /**
   * The first column of the documents lens: the categories whose documents it shows (UC-DOC-1). A row opens the
   * category's documents; its second line names the document types.
   */
  interface Props {
    /** The categories the lens shows, or `null` while loading. */
    categories: Category[] | null;
    /** The selected category. */
    selected: string | null;
  }

  let { categories, selected }: Props = $props();
</script>

<ColumnHead
  kind="category"
  kindLabel={$t('lens.categories')}
  title={$t('documents.categories.title')}
  href="/categories"
/>
{#if categories === null}
  <p class="column__loading">{$t('common.loading')}</p>
{:else if categories.length === 0}
  <EmptyState
    icon="state.na"
    title={$t('documents.categories.empty.title')}
    body={$t('documents.categories.empty.body')}
  />
{:else}
  <ul class="column__list" data-testid="category-list">
    {#each categories as category (category.id)}
      <li>
        <RowLink
          href="/categories/{category.id}"
          selected={category.id === selected}
          testId="category-{category.id}"
        >
          <span class="row__title">{categoryName($messagesStore, category.id)}</span>
          <span class="row__meta">
            {$t('documents.categories.types')}:
            {category.kinds
              .map((kind) => kindName($messagesStore, category.id, kind.id))
              .join(', ')}
          </span>
        </RowLink>
      </li>
    {/each}
  </ul>
{/if}

<style>
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

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
