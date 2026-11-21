<script lang="ts">
  import type { Snippet } from 'svelte';

  /**
   * The template of one object (a practice, a threat model, an incident): its title, its state and its
   * content, at most 1440 px wide.
   */
  interface Props {
    /** The visible title, the page's `h1`. */
    title: string;
    /** The word of the object's state, shown beside the title. */
    stateLabel?: string;
    /** A test id of the page. */
    testId?: string;
    /** The content. */
    children: Snippet;
    /** The acts of the object. */
    actions?: Snippet;
  }

  let { title, stateLabel, testId, children, actions }: Props = $props();
</script>

<article class="object" data-testid={testId}>
  <header class="object__header">
    <div class="object__heading">
      <h1 class="object__title">{title}</h1>
      {#if stateLabel}
        <span class="object__state">{stateLabel}</span>
      {/if}
    </div>
    {#if actions}
      <div class="object__actions">{@render actions()}</div>
    {/if}
  </header>
  <div class="object__body">{@render children()}</div>
</article>

<style>
  .object {
    inline-size: 100%;
    max-inline-size: 1440px;
    padding: var(--space-6);
  }

  .object__header {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: var(--space-4);
    margin-block-end: var(--space-6);
  }

  .object__heading {
    display: flex;
    align-items: baseline;
    gap: var(--space-3);
  }

  .object__title {
    font-size: var(--text-xl);
    line-height: var(--line-height-xl);
  }

  .object__state {
    font-size: var(--text-sm);
    color: var(--color-text-secondary);
  }

  .object__actions {
    display: flex;
    gap: var(--space-2);
  }
</style>
