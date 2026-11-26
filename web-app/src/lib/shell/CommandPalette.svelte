<script lang="ts">
  import Dialog from '../components/Dialog.svelte';
  import Icon from '../components/Icon.svelte';
  import Link from '../components/Link.svelte';
  import StatusLabel from '../components/StatusLabel.svelte';
  import { apiClient } from '../api/client';
  import { isApiError } from '../api/errors';
  import type { SearchResult } from '../api/types';
  import { categoryName, hasDocumentsLens } from '../documents/categories';
  import { messagesStore, t } from '../i18n';
  import { parseHref } from '../routes';
  import { stateTone } from '../views/samm/workflow';
  import { allItems, type NavItem } from './nav';

  /**
   * The search of the top bar: the views filter as you type, and from two characters the documents of every category
   * are searched through the index (`GET /api/v1/search`, UC-DOC-1), which also answers while the Git server cannot be
   * reached. Ctrl+K or Cmd+K opens it from anywhere. Enter opens the first match, views before documents; the arrow keys
   * move through the matches, each of which is an ordinary button or link, so Tab reaches them too. A document opens at
   * the address the server names. A search that cannot be made costs the documents only: the views stay.
   */
  interface Props {
    /** Whether the palette is open, bindable. */
    open?: boolean;
    /** Opens an address inside the app. */
    onnavigate: (href: string) => void;
  }

  let { open = $bindable(false), onnavigate }: Props = $props();

  /** The fewest characters, after trimming, that search the documents (rest-api.adoc, decided provisionally). */
  const MIN_LENGTH = 2;
  /** The pause after the last key before the documents are asked. */
  const DEBOUNCE_MS = 250;

  /** What the search of the documents has come to. */
  type Documents =
    | { state: 'idle' }
    | { state: 'loading' }
    | { state: 'found'; results: SearchResult[]; truncated: boolean }
    | { state: 'failed' };

  let query = $state('');
  let input: HTMLInputElement | undefined = $state();
  let documents = $state<Documents>({ state: 'idle' });

  let needle = $derived(query.trim());
  let searching = $derived(needle.length >= MIN_LENGTH);

  let matches: NavItem[] = $derived.by(() => {
    const lower = needle.toLowerCase();
    return allItems($hasDocumentsLens).filter((item) =>
      $t(item.labelKey).toLowerCase().includes(lower),
    );
  });
  let hits = $derived(documents.state === 'found' ? documents.results : []);

  /** The number of the latest search; the answer of an older one is dropped. */
  let latest = 0;

  $effect(() => {
    if (open) {
      query = '';
      queueMicrotask(() => input?.focus());
    }
  });

  // The documents are asked after a pause; typing on, closing the palette or an answer that comes late drops the question.
  $effect(() => {
    const text = needle;
    if (!open || text.length < MIN_LENGTH) {
      documents = { state: 'idle' };
      return;
    }
    documents = { state: 'loading' };
    const timer = setTimeout(() => void search(text), DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      latest += 1;
    };
  });

  async function search(text: string) {
    const read = ++latest;
    try {
      const answer = await apiClient.search(text);
      if (read !== latest) return;
      // An address the app has no view for is not offered.
      documents = {
        state: 'found',
        results: answer.results.filter((hit) => parseHref(hit.address) !== null),
        truncated: answer.truncated,
      };
    } catch (error) {
      if (read !== latest) return;
      // The server found the text too short or too long: the person is not told off, the documents just stay out.
      documents =
        isApiError(error) && error.outcome === 'VALIDATION'
          ? { state: 'idle' }
          : { state: 'failed' };
    }
  }

  function choose(item: NavItem) {
    open = false;
    onnavigate(item.href);
  }

  function openDocument(hit: SearchResult) {
    open = false;
    onnavigate(hit.address);
  }

  /** A click that opens the document in the page; with a modifier the browser opens it as the person asked. */
  function clicked(event: MouseEvent, hit: SearchResult) {
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    event.preventDefault();
    openDocument(hit);
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      if (matches.length > 0) {
        event.preventDefault();
        choose(matches[0]);
      } else if (hits.length > 0) {
        event.preventDefault();
        openDocument(hits[0]);
      }
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      items()[0]?.focus();
    }
  }

  /** @returns the matches in the order they stand: the views, then the documents */
  function items(): HTMLElement[] {
    return [...(list?.querySelectorAll<HTMLElement>('[data-palette-item]') ?? [])];
  }

  let list: HTMLElement | undefined = $state();

  /** Moves between the matches with the arrow keys; up from the first one returns to the input. */
  function handleListKeydown(event: KeyboardEvent) {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const all = items();
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    if (event.key === 'ArrowDown') all[Math.min(at + 1, all.length - 1)].focus();
    else if (at === 0) input?.focus();
    else all[at - 1].focus();
  }

  function handleGlobalKeydown(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      open = true;
    }
  }

  /** @returns the name of the category of a hit: its own text, or the name of the lens of a delivered category */
  function kindOf(category: string): string {
    if (Object.hasOwn($messagesStore, `category.${category}.name`)) {
      return categoryName($messagesStore, category);
    }
    return Object.hasOwn($messagesStore, `lens.${category}`)
      ? $t(`lens.${category}`)
      : categoryName($messagesStore, category);
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
  <div class="palette__results" role="presentation" bind:this={list} onkeydown={handleListKeydown}>
    {#if searching}
      <h3 class="palette__group" id="palette-views">{$t('shell.search.group.views')}</h3>
    {/if}
    {#if matches.length === 0}
      <p class="palette__empty">{$t('shell.search.empty')}</p>
    {:else}
      <ul class="palette__list" aria-labelledby={searching ? 'palette-views' : undefined}>
        {#each matches as item (item.lens)}
          <li>
            <button
              class="palette__item"
              type="button"
              onclick={() => choose(item)}
              data-palette-item
              data-testid="search-result-{item.lens}"
            >
              <Icon name={item.icon} size={20} />
              <span>{$t(item.labelKey)}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    {#if searching}
      <h3 class="palette__group" id="palette-documents">{$t('shell.search.group.documents')}</h3>
      {#if documents.state === 'found' && hits.length > 0}
        <ul
          class="palette__list"
          aria-labelledby="palette-documents"
          data-testid="search-documents"
        >
          {#each hits as hit (hit.repository + hit.id)}
            <li class="palette__document">
              <Link
                href={hit.address}
                quiet
                onclick={(event: MouseEvent) => clicked(event, hit)}
                data-palette-item
                data-testid="search-document-{hit.id}"
              >
                <span class="palette__title">{hit.title}</span>
                <span class="palette__meta">
                  <span>{kindOf(hit.category)}</span>
                  <StatusLabel tone={stateTone(hit.state)} label={$t(`workflow.${hit.state}`)} />
                </span>
              </Link>
            </li>
          {/each}
        </ul>
      {/if}
      <p class="palette__note" role="status" data-testid="search-status">
        {#if documents.state === 'loading'}
          {$t('shell.search.documents.loading')}
        {:else if documents.state === 'failed'}
          {$t('shell.search.documents.failed')}
        {:else if documents.state === 'found'}
          {#if hits.length === 0}
            {$t('shell.search.documents.none')}
          {:else if documents.truncated}
            {$t('shell.search.documents.truncated', { count: hits.length })}
          {:else}
            {$t('shell.search.documents.count', { count: hits.length })}
          {/if}
        {/if}
      </p>
    {:else if needle.length > 0}
      <p class="palette__note" data-testid="search-hint">{$t('shell.search.documents.hint')}</p>
    {/if}
  </div>
</Dialog>

<style>
  .palette__input {
    inline-size: 100%;
    min-block-size: 40px;
    padding: 0 var(--space-3);
    border: 1px solid var(--control-border);
    border-radius: var(--control-radius);
  }

  .palette__results {
    max-block-size: 60vh;
    overflow-y: auto;
  }

  .palette__group {
    margin-block-start: var(--space-4);
    font-size: var(--text-xs);
    line-height: var(--line-height-xs);
    font-weight: var(--weight-semibold);
    color: var(--color-text-secondary);
  }

  .palette__list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin-block-start: var(--space-3);
    list-style: none;
  }

  .palette__item,
  .palette__document :global(.link) {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    inline-size: 100%;
    min-block-size: 40px;
    padding-inline: var(--space-2);
    border-radius: var(--radius-sm);
    text-align: start;
  }

  .palette__item:hover,
  .palette__document :global(.link:hover) {
    background-color: var(--color-bg-subtle);
  }

  .palette__document :global(.link) {
    flex-direction: column;
    align-items: flex-start;
    justify-content: center;
    gap: 2px;
    padding-block: var(--space-2);
  }

  .palette__title {
    font-family: var(--font-serif);
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--color-text-primary);
    overflow-wrap: anywhere;
  }

  .palette__meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    font-size: var(--text-sm);
    color: var(--color-text-muted);
  }

  .palette__empty,
  .palette__note {
    margin-block-start: var(--space-3);
    color: var(--color-text-muted);
  }
</style>
