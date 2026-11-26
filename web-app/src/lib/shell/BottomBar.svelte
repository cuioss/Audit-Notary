<script lang="ts">
  import Dialog from '../components/Dialog.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../i18n';
  import type { Lens } from '../routes';
  import { bottomItems, moreItems } from './nav';

  /**
   * The phone's navigation below 768 px: four lenses and "More" with the rest.
   */
  interface Props {
    /** The lens of the current view, or `null`. */
    activeLens: Lens | null;
    /** Whether the generic documents lens exists; it stands behind "More". */
    documents?: boolean;
  }

  let { activeLens, documents = false }: Props = $props();

  let moreOpen = $state(false);
  let bottom = $derived(bottomItems(documents));
  let more = $derived(moreItems(documents));
  let moreActive = $derived(more.some((item) => item.lens === activeLens));
</script>

<nav class="bottom-bar" aria-label={$t('shell.bottom.label')}>
  {#each bottom as item (item.lens)}
    <a
      class="bottom-bar__item"
      class:bottom-bar__item--active={item.lens === activeLens}
      href={item.href}
      aria-current={item.lens === activeLens ? 'page' : undefined}
      data-testid="bottom-{item.testId}"
    >
      <Icon name={item.icon} size={20} />
      <span>{$t(item.labelKey)}</span>
    </a>
  {/each}
  <button
    class="bottom-bar__item"
    class:bottom-bar__item--active={moreActive}
    type="button"
    onclick={() => (moreOpen = true)}
    data-testid="bottom-more"
  >
    <Icon name="act.more" size={20} />
    <span>{$t('shell.more')}</span>
  </button>
</nav>

<Dialog bind:open={moreOpen} title={$t('shell.more')} closeLabel={$t('common.close')}>
  <ul class="more">
    {#each more as item (item.lens)}
      <li>
        <a
          class="more__item"
          href={item.href}
          aria-current={item.lens === activeLens ? 'page' : undefined}
          onclick={() => (moreOpen = false)}
        >
          <Icon name={item.icon} size={20} />
          <span>{$t(item.labelKey)}</span>
        </a>
      </li>
    {/each}
  </ul>
</Dialog>

<style>
  .bottom-bar {
    display: none;
  }

  @media (max-width: 767px) {
    .bottom-bar {
      position: sticky;
      inset-block-end: 0;
      z-index: var(--layer-bar);
      display: grid;
      grid-template-columns: repeat(5, 1fr);
      background-color: var(--color-bg-rail);
      border-block-start: 1px solid var(--color-rail-border);
    }
  }

  .bottom-bar__item {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    min-block-size: 56px;
    font-size: var(--text-xs);
    color: var(--color-rail-text);
    text-decoration: none;
  }

  .bottom-bar__item:focus-visible {
    box-shadow: var(--focus-ring-rail);
  }

  .bottom-bar__item--active {
    color: var(--color-rail-text-strong);
    font-weight: var(--weight-semibold);
    box-shadow: inset 0 3px 0 var(--color-rail-focus);
  }

  .more {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    list-style: none;
  }

  .more__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-block-size: 44px;
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .more__item:hover {
    background-color: var(--color-bg-subtle);
  }
</style>
