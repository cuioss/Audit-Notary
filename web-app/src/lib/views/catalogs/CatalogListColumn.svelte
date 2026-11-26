<script lang="ts">
  import ColumnHead from '../../components/ColumnHead.svelte';
  import RowLink from '../../components/RowLink.svelte';
  import { CATALOGS } from '../../api/types';
  import { catalogName } from '../../catalogs/catalogs';
  import { messagesStore, t } from '../../i18n';

  /**
   * The first column of the Catalogs lens: the five catalogs in their fixed order, `team`, `role`, `service`, `system`,
   * `external`, each with the sentence that says what it holds. It makes no request (rest-api.adoc, The Addresses).
   */
  interface Props {
    /** The selected catalog. */
    selected: string | null;
  }

  let { selected }: Props = $props();
</script>

<ColumnHead
  kind="catalog"
  kindLabel={$t('lens.catalogs')}
  title={$t('lens.catalogs')}
  href="/catalogs"
/>
<ul class="column__list" data-testid="catalog-list">
  {#each CATALOGS as catalog (catalog)}
    <li>
      <RowLink
        href="/catalogs/{catalog}"
        selected={catalog === selected}
        testId="catalog-{catalog}"
      >
        <span class="row__title">{catalogName($messagesStore, catalog)}</span>
        <span class="row__meta">{$t(`catalog.${catalog}.about`)}</span>
      </RowLink>
    </li>
  {/each}
</ul>

<style>
  .column__list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    list-style: none;
  }

  .row__title {
    font-weight: var(--weight-medium);
  }

  .row__meta {
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }
</style>
