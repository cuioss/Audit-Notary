<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import Link from '../components/Link.svelte';
  import Notice from '../components/Notice.svelte';
  import { apiClient } from '../api/client';
  import { errorMessageKey } from '../api/errors';
  import type { DueItem } from '../api/types';
  import { currentLocale, t } from '../i18n';
  import { parseAddress } from '../routes';
  import DashboardPage from '../templates/DashboardPage.svelte';

  /**
   * The start page (lens *Due*): deadlines, reviews and releases waiting for the user.
   */
  let items: DueItem[] | null = $state(null);
  let failure: string | null = $state(null);

  const KIND_ICONS: Record<DueItem['kind'], string> = {
    deadline: 'state.clock',
    review: 'kind.document',
    release: 'state.check',
  };

  async function load() {
    failure = null;
    try {
      const list = await apiClient.getDue();
      // An address the app has no view for is not offered.
      items = list.items.filter((item) => parseAddress(item.address) !== null);
    } catch (error) {
      failure = errorMessageKey(error);
    }
  }

  function formatDate(value: string, locale: string): string {
    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime())
      ? value
      : new Intl.DateTimeFormat(locale, { dateStyle: 'medium' }).format(date);
  }

  onMount(() => {
    void load();
  });
</script>

<DashboardPage title={$t('due.title')} intro={$t('due.intro')} testId="due-view">
  {#if failure}
    <Notice tone="danger" title={$t(failure)} live />
  {:else if items === null}
    <p class="due__loading">{$t('common.loading')}</p>
  {:else if items.length === 0}
    <EmptyState title={$t('due.empty')} />
  {:else}
    <ul class="due__list" data-testid="due-list">
      {#each items as item (item.address + item.kind)}
        <li class="due__item" data-kind={item.kind} data-lens={item.lens}>
          <span class="due__kind kind--{item.lens}">
            <Icon name={KIND_ICONS[item.kind]} size={16} />
            {$t(`due.kind.${item.kind}`)}
          </span>
          <Link href={item.address} aria-label={$t('due.open', { title: item.title })}>
            {item.title}
          </Link>
          <span class="due__date"
            >{$t('due.due-on', { date: formatDate(item.due, $currentLocale) })}</span
          >
        </li>
      {/each}
    </ul>
  {/if}
</DashboardPage>

<style>
  .due__list {
    display: flex;
    flex-direction: column;
    list-style: none;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background-color: var(--color-bg-surface);
  }

  .due__item {
    display: grid;
    grid-template-columns: 9rem 1fr auto;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-4);
  }

  .due__item + .due__item {
    border-block-start: 1px solid var(--color-border);
  }

  .due__kind {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--text-sm);
    font-weight: var(--weight-medium);
  }

  .kind--samm {
    color: var(--color-kind-samm);
  }

  .kind--threat-models {
    color: var(--color-kind-threat-model);
  }

  .kind--incidents {
    color: var(--color-kind-incident);
  }

  .kind--isms {
    color: var(--color-kind-isms);
  }

  .due__date {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .due__loading {
    color: var(--color-text-muted);
  }

  @media (max-width: 767px) {
    .due__item {
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }
  }
</style>
