<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /**
   * The calm answer of a view that has nothing to show: a title, a sentence and an optional act.
   */
  interface Props {
    /** The title. */
    title: string;
    /** The sentence below the title. */
    body?: string;
    /** The icon above the title. */
    icon?: string;
    /** An optional act below. */
    actions?: Snippet;
  }

  let { title, body, icon = 'state.check', actions }: Props = $props();
</script>

<section class="empty" data-testid="empty-state">
  <span class="empty__icon"><Icon name={icon} size={24} /></span>
  <h2 class="empty__title">{title}</h2>
  {#if body}
    <p class="empty__body">{body}</p>
  {/if}
  {#if actions}
    <div class="empty__actions">{@render actions()}</div>
  {/if}
</section>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-12) var(--space-6);
    text-align: center;
    color: var(--color-text-secondary);
  }

  .empty__icon {
    color: var(--color-text-muted);
  }

  .empty__title {
    font-size: var(--text-md);
    line-height: var(--line-height-md);
    color: var(--color-text-primary);
  }

  .empty__body {
    max-inline-size: 40ch;
  }

  .empty__actions {
    margin-block-start: var(--space-4);
  }

  /* A link as the act of an empty state is a target like a button. */
  .empty__actions :global(a.link:not(.link--button)) {
    display: inline-flex;
    align-items: center;
    min-block-size: 44px;
  }
</style>
