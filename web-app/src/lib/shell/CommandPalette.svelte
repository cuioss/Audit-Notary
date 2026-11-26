<script lang="ts">
  import Dialog from '../components/Dialog.svelte';
  import Icon from '../components/Icon.svelte';
  import { t } from '../i18n';
  import { hasDocumentsLens } from '../documents/categories';
  import { allItems, type NavItem } from './nav';

  /**
   * The search of the top bar: filter-as-you-type over the views; Enter opens the first match.
   * Ctrl+K or Cmd+K opens it from anywhere. Document search joins it with the index (AUN-GEN-2, `search`).
   */
  interface Props {
    /** Whether the palette is open, bindable. */
    open?: boolean;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
  }

  let { open = $bindable(false), onnavigate }: Props = $props();

  let query = $state('');
  let input: HTMLInputElement | undefined = $state();

  let matches: NavItem[] = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    return allItems($hasDocumentsLens).filter((item) =>
      $t(item.labelKey).toLowerCase().includes(needle),
    );
  });

  $effect(() => {
    if (open) {
      query = '';
      queueMicrotask(() => input?.focus());
    }
  });

  function choose(item: NavItem) {
    open = false;
    onnavigate(item.href);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && matches.length > 0) {
      event.preventDefault();
      choose(matches[0]);
    }
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open = true;
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />

<Dialog bind:open title={$t('shell.search.label')} closeLabel={$t('common.close')}>
  <input
    bind:this={input}
    bind:value={query}
    class="palette__input"
    type="search"
    aria-label={$t('shell.search.label')}
    placeholder={$t('shell.search.placeholder')}
    onkeydown={handleKeydown}
    data-testid="search-input"
  />
  {#if matches.length === 0}
    <p class="palette__empty">{$t('shell.search.empty')}</p>
  {:else}
    <ul class="palette__list">
      {#each matches as item (item.lens)}
        <li>
          <button
            class="palette__item"
            type="button"
            onclick={() => choose(item)}
            data-testid="search-result-{item.lens}"
          >
            <Icon name={item.icon} size={20} />
            <span>{$t(item.labelKey)}</span>
          </button>
        </li>
      {/each}
    </ul>
  {/if}
</Dialog>

<style>
  .palette__input {
    inline-size: 100%;
    min-block-size: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
  }

  .palette__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-block-start: var(--space-3);
    list-style: none;
  }

  .palette__item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    min-block-size: 40px;
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: start;
  }

  .palette__item:hover {
    background-color: var(--color-bg-subtle);
  }

  .palette__empty {
    margin-block-start: var(--space-3);
    color: var(--color-text-muted);
  }
</style>
