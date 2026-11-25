<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon from './Icon.svelte';

  /**
   * Content folded away behind its summary: the quality criteria of a question, a practice of the release record.
   * The native `<details>`, so keyboard and screen readers know it.
   */
  interface Props {
    /** The summary, always visible. */
    summary: Snippet;
    /** Whether it starts open. */
    open?: boolean;
    /** A test id. */
    testId?: string;
    /** The folded content. */
    children: Snippet;
  }

  let { summary, open = false, testId, children }: Props = $props();
</script>

<details class="disclosure" {open} data-testid={testId}>
  <summary class="disclosure__summary">
    <span class="disclosure__chevron"><Icon name="act.next" size={16} /></span>
    <span class="disclosure__label">{@render summary()}</span>
  </summary>
  <div class="disclosure__body">{@render children()}</div>
</details>

<style>
  .disclosure__summary {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-block-size: 32px;
    cursor: pointer;
    list-style: none;
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm);
  }

  .disclosure__summary::-webkit-details-marker {
    display: none;
  }

  .disclosure__summary:hover {
    color: var(--color-text-primary);
  }

  .disclosure__summary:focus-visible {
    outline: 2px solid transparent;
    box-shadow: var(--focus-ring);
  }

  .disclosure__label {
    flex: 1 1 auto;
    min-inline-size: 0;
  }

  .disclosure__chevron {
    display: inline-flex;
    transition: transform var(--duration-fast) var(--ease-standard);
  }

  .disclosure[open] > .disclosure__summary .disclosure__chevron {
    transform: rotate(90deg);
  }

  .disclosure__body {
    padding: var(--space-2) 0 var(--space-2) var(--space-6);
  }
</style>
